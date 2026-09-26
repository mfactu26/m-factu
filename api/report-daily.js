const { getSession } = require("../lib/auth.cjs");
const { getSql } = require("../lib/db.cjs");
const { sendEmail } = require("../lib/email.cjs");

function accessMode(req){
  const s=getSession(req);
  if(s&&s.role==="owner") return "owner";
  const auth=String(req.headers.authorization||"");
  if(process.env.CRON_SECRET&&auth==="Bearer "+process.env.CRON_SECRET) return "cron";
  const ua=String(req.headers["user-agent"]||"");
  if(!process.env.CRON_SECRET&&/^vercel-cron\/1\.0/i.test(ua)) return "cron";
  return null;
}

module.exports=async function handler(req,res){
  if(!["GET","POST"].includes(req.method)) return res.status(405).end();
  const mode=accessMode(req);
  if(!mode) return res.status(403).json({ok:false,error:"OWNER_OR_CRON_ONLY"});
  const sql=getSql(); if(!sql) return res.status(503).json({ok:false,error:"DATABASE_NOT_CONFIGURED"});
  if(!process.env.REPORT_EMAIL||!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM) return res.status(503).json({ok:false,error:"EMAIL_NOT_CONFIGURED"});

  if(mode==="cron"){
    const prior=await sql`
      select id,provider_message_id from mfactu_report_runs
      where report_type='daily-commercial'
        and status='sent'
        and created_at>=date_trunc('day',now())
      limit 1
    `;
    if(prior[0]) return res.status(200).json({ok:true,alreadySent:true,messageId:prior[0].provider_message_id||null});
  }

  const end=new Date(); const start=new Date(end.getTime()-24*60*60*1000);
  const rows=await sql`
    select event_type,count(*)::int as count
    from mfactu_commercial_events
    where created_at>=${start.toISOString()} and created_at<${end.toISOString()}
    group by event_type
  `;
  const counts=Object.fromEntries(rows.map(r=>[r.event_type,Number(r.count)]));
  const clients=await sql`select count(*)::int as count from mfactu_organizations where status='active'`;
  const summary={
    searched:counts.prospect_searched||0,found:counts.prospect_found||0,qualified:counts.prospect_qualified||0,
    contacted:counts.contact_sent||0,replies:counts.reply_received||0,hot:counts.prospect_interested||0,
    proposals:counts.proposal_sent||0,signed:counts.contract_signed||0,clients:Number(clients[0]?.count||0)
  };
  const text=`M FactU — Rapport commercial quotidien

Prospects recherchés : ${summary.searched}
Prospects trouvés : ${summary.found}
Prospects qualifiés : ${summary.qualified}
Contacts envoyés : ${summary.contacted}
Réponses reçues : ${summary.replies}
Prospects intéressés : ${summary.hot}
Propositions envoyées : ${summary.proposals}
Contrats signés : ${summary.signed}
Clients actifs : ${summary.clients} / 50

Les cas nécessitant une intervention propriétaire apparaissent séparément dans le tableau de bord.`;
  const sent=await sendEmail({to:process.env.REPORT_EMAIL,subject:"M FactU — Rapport commercial quotidien",text});
  await sql`insert into mfactu_report_runs(period_start,period_end,recipient,provider_message_id,status,summary) values(${start.toISOString()},${end.toISOString()},${process.env.REPORT_EMAIL},${sent.id||null},'sent',${JSON.stringify(summary)}::jsonb)`;
  return res.status(200).json({ok:true,summary,messageId:sent.id||null});
};