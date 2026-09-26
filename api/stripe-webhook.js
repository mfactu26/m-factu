const { getSql } = require("../lib/db.cjs");
const { stripeRequest } = require("../lib/stripe.cjs");

module.exports = async function handler(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).end()}
  if(!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ok:false});
  let body=req.body||{}; if(typeof body==="string"){try{body=JSON.parse(body)}catch{body={}}}
  const eventId=String(body.id||"");
  if(!/^evt_/.test(eventId)) return res.status(400).json({ok:false,error:"INVALID_EVENT"});
  let event;
  try{ event=await stripeRequest("GET","/events/"+encodeURIComponent(eventId)); }
  catch(e){ return res.status(400).json({ok:false,error:"UNVERIFIED_EVENT"}); }
  if(!event.livemode) return res.status(200).json({ok:true,ignored:"testmode"});
  const invoice=event.data?.object;
  if(!invoice || invoice.object!=="invoice") return res.status(200).json({ok:true,ignored:true});
  const sql=getSql(); if(!sql) return res.status(503).json({ok:false,error:"DATABASE_NOT_CONFIGURED"});

  const paid=event.type==="invoice.paid";
  const failed=event.type==="invoice.payment_failed";
  const voided=event.type==="invoice.voided";
  if(paid||failed||voided){
    const status=paid?"paid":failed?"payment_failed":"void";
    await sql`update mfactu_billing_periods set stripe_invoice_status=${status},hosted_invoice_url=${invoice.hosted_invoice_url||null},paid_at=${paid?new Date().toISOString():null},updated_at=now() where stripe_invoice_id=${invoice.id}`;
  }
  return res.status(200).json({ok:true});
};
