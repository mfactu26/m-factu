const crypto=require("crypto");
const { getSession } = require("../lib/auth.cjs");
const { getSql } = require("../lib/db.cjs");
const { sendEmail } = require("../lib/email.cjs");

function optoutToken(p){
  const secret=process.env.AUTH_SECRET;
  if(!secret) throw new Error("AUTH_NOT_CONFIGURED");
  const payload=Buffer.from(JSON.stringify({id:p.id,email:p.email})).toString("base64url");
  const sig=crypto.createHmac("sha256",secret).update(payload).digest("base64url");
  return payload+"."+sig;
}

module.exports=async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({ok:false,error:"METHOD_NOT_ALLOWED"});
  const session=getSession(req);
  if(!session||session.role!=="owner") return res.status(403).json({ok:false,error:"OWNER_ONLY"});
  const sql=getSql();
  if(!sql) return res.status(503).json({ok:false,error:"DATABASE_NOT_CONFIGURED"});
  let body={};try{body=typeof req.body==="object"&&req.body?req.body:JSON.parse(req.body||"{}")}catch{}
  const id=String(body.prospectId||"");
  const rows=await sql`
    select id,company_name,city,email,status,opt_out,notes
    from mfactu_prospects where id=${id} limit 1
  `;
  const p=rows[0];
  if(!p) return res.status(404).json({ok:false,error:"PROSPECT_NOT_FOUND"});
  if(p.opt_out) return res.status(409).json({ok:false,error:"PROSPECT_OPTED_OUT"});
  if(!p.email) return res.status(409).json({ok:false,error:"EMAIL_MISSING"});

  const appUrl=process.env.APP_URL||"https://m-factu.vercel.app";
  const unsubscribe=appUrl+"/api/prospect-optout?token="+encodeURIComponent(optoutToken(p));
  const subject="Taxis conventionnés — déléguer votre facturation";
  const text=`Bonjour,

Je vous contacte au nom de M FactU, un service de facturation destiné aux taxis conventionnés.

Notre fonctionnement est simple : M FactU prend en charge le suivi de la facturation et la prestation est facturée à 3,5 % HT du chiffre d'affaires télétransmis.

Si vous souhaitez en discuter, répondez simplement à cet email.

M FactU
07 87 08 51 31

Vous ne souhaitez plus recevoir de message de M FactU :
${unsubscribe}`;

  const sent=await sendEmail({
    to:p.email,
    from:process.env.PROSPECT_EMAIL_FROM||"M FactU <mfactu@glowbiz.fr>",
    replyTo:[process.env.REPORT_EMAIL||process.env.OWNER_EMAIL].filter(Boolean),
    subject,
    text,
    headers:{"List-Unsubscribe":"<"+unsubscribe+">"}
  });
  const stamp=new Date().toISOString();
  await sql`
    update mfactu_prospects
    set status='contacted',updated_at=now(),notes=${(p.notes||"")+" • Contact envoyé "+stamp}
    where id=${p.id}
  `;
  await sql`
    insert into mfactu_commercial_events(event_type,prospect_id,metadata)
    values('contact_sent',${p.id},${JSON.stringify({messageId:sent.id||null})}::jsonb)
  `;
  return res.status(200).json({ok:true,messageId:sent.id||null});
};