const { getSession } = require("../lib/auth.cjs");
const { getSql } = require("../lib/db.cjs");
const { stripeRequest, feeCents } = require("../lib/stripe.cjs");

module.exports = async function handler(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({ok:false,error:"METHOD_NOT_ALLOWED"})}
  const session=getSession(req);
  if(!session || session.role!=="owner") return res.status(403).json({ok:false,error:"OWNER_ONLY"});
  const sql=getSql();
  if(!sql) return res.status(503).json({ok:false,error:"DATABASE_NOT_CONFIGURED"});
  if(!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ok:false,error:"STRIPE_NOT_CONFIGURED"});
  if(!process.env.STRIPE_TAX_RATE_ID) return res.status(503).json({ok:false,error:"VAT_NOT_CONFIGURED"});

  let body=req.body||{}; if(typeof body==="string"){try{body=JSON.parse(body)}catch{body={}}}
  const organizationId=String(body.organizationId||"");
  const periodStart=String(body.periodStart||"");
  const periodEnd=String(body.periodEnd||"");
  const turnoverCents=Number(body.turnoverCents);
  if(!organizationId||!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)||!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)||!Number.isSafeInteger(turnoverCents)||turnoverCents<0){
    return res.status(400).json({ok:false,error:"INVALID_BILLING_INPUT"});
  }

  const orgRows=await sql`select id,name,billing_email,stripe_customer_id,billing_collection_method from mfactu_organizations where id=${organizationId} and status='active' limit 1`;
  const org=orgRows[0]; if(!org) return res.status(404).json({ok:false,error:"ORGANIZATION_NOT_FOUND"});
  if(!org.billing_email) return res.status(400).json({ok:false,error:"BILLING_EMAIL_REQUIRED"});

  const existing=await sql`select * from mfactu_billing_periods where organization_id=${organizationId} and period_start=${periodStart} and period_end=${periodEnd} limit 1`;
  if(existing[0]?.stripe_invoice_id) return res.status(200).json({ok:true,alreadyExists:true,billing:existing[0]});

  let customerId=org.stripe_customer_id;
  if(!customerId){
    const customer=await stripeRequest("POST","/customers",{
      name:org.name,email:org.billing_email,
      metadata:{mfactu_organization_id:org.id,source:"m-factu"}
    },"mfactu-customer-"+org.id);
    customerId=customer.id;
    await sql`update mfactu_organizations set stripe_customer_id=${customerId},updated_at=now() where id=${org.id}`;
  }

  const fee=feeCents(turnoverCents);
  const productId=process.env.STRIPE_PRODUCT_ID||"prod_VKbd0WgHz8pmOt";
  const keyBase=`mfactu-${org.id}-${periodStart}-${periodEnd}`;

  await stripeRequest("POST","/invoiceitems",{
    customer:customerId,
    price_data:{currency:"eur",product:productId,unit_amount:fee,tax_behavior:"exclusive"},
    quantity:1,
    description:`Prestation M FactU — 3,5 % HT du CA télétransmis (${periodStart} au ${periodEnd})`,
    tax_rates:[process.env.STRIPE_TAX_RATE_ID],
    metadata:{mfactu_organization_id:org.id,period_start:periodStart,period_end:periodEnd,teletransmitted_turnover_cents:String(turnoverCents),fee_basis_points:"350"}
  },keyBase+"-item");

  const sendInvoice=org.billing_collection_method==="send_invoice";
  const invoice=await stripeRequest("POST","/invoices",{
    customer:customerId,
    auto_advance:true,
    collection_method:sendInvoice?"send_invoice":"charge_automatically",
    ...(sendInvoice?{days_until_due:7}:{}),
    pending_invoice_items_behavior:"include",
    description:`M FactU — facturation mensuelle à 3,5 % HT`,
    footer:"M FactU — 07 87 08 51 31",
    metadata:{mfactu_organization_id:org.id,period_start:periodStart,period_end:periodEnd,billing_model:"3.5_percent_ht"}
  },keyBase+"-invoice");

  const rows=await sql`
    insert into mfactu_billing_periods(organization_id,period_start,period_end,teletransmitted_turnover_cents,fee_basis_points,fee_cents,stripe_invoice_id,stripe_invoice_status,hosted_invoice_url)
    values(${org.id},${periodStart},${periodEnd},${turnoverCents},350,${fee},${invoice.id},${invoice.status},${invoice.hosted_invoice_url||null})
    on conflict (organization_id,period_start,period_end) do update set
      teletransmitted_turnover_cents=excluded.teletransmitted_turnover_cents,
      fee_cents=excluded.fee_cents,
      stripe_invoice_id=excluded.stripe_invoice_id,
      stripe_invoice_status=excluded.stripe_invoice_status,
      hosted_invoice_url=excluded.hosted_invoice_url,
      updated_at=now()
    returning *
  `;
  return res.status(200).json({ok:true,feeCents:fee,invoiceId:invoice.id,status:invoice.status,billing:rows[0]});
};
