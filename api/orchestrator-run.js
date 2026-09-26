const crypto=require("crypto");
const { getSession } = require("../lib/auth.cjs");
const { getSql } = require("../lib/db.cjs");
const { sendEmail } = require("../lib/email.cjs");
const { searchTaxiCompanies, persistProspects } = require("../lib/prospecting.cjs");

function accessMode(req){
  const s=getSession(req);
  if(s&&s.role==="owner") return "owner";
  const auth=String(req.headers.authorization||"");
  if(process.env.CRON_SECRET&&auth==="Bearer "+process.env.CRON_SECRET) return "cron";
  const ua=String(req.headers["user-agent"]||"");
  if(!process.env.CRON_SECRET&&/^vercel-cron\/1\.0/i.test(ua)) return "cron";
  return null;
}

function optoutToken(p){
  const secret=process.env.AUTH_SECRET;
  if(!secret) throw new Error("AUTH_NOT_CONFIGURED");
  const payload=Buffer.from(JSON.stringify({id:p.id,email:p.email})).toString("base64url");
  const sig=crypto.createHmac("sha256",secret).update(payload).digest("base64url");
  return payload+"."+sig;
}

async function contactReadyProspects(sql,limit=50){
  if(!process.env.RESEND_API_KEY||!process.env.AUTH_SECRET) return {contacted:0,failed:0,skipped:"EMAIL_NOT_CONFIGURED"};
  const rows=await sql`
    select id,company_name,city,email,status,opt_out,notes
    from mfactu_prospects
    where opt_out=false
      and status='new'
      and email is not null
      and length(trim(email))>3
    order by score desc, created_at asc
    limit ${limit}
  `;
  let contacted=0,failed=0;
  const appUrl=process.env.APP_URL||"https://m-factu.vercel.app";
  for(const p of rows){
    try{
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
        where id=${p.id} and status='new' and opt_out=false
      `;
      await sql`
        insert into mfactu_commercial_events(event_type,prospect_id,metadata)
        values('contact_sent',${p.id},${JSON.stringify({messageId:sent.id||null,mode:"orchestrator"})}::jsonb)
      `;
      contacted++;
    }catch(error){
      failed++;
      await sql`
        insert into mfactu_commercial_events(event_type,prospect_id,metadata)
        values('contact_failed',${p.id},${JSON.stringify({message:String(error&&error.message||"EMAIL_SEND_FAILED").slice(0,200),mode:"orchestrator"})}::jsonb)
      `;
    }
  }
  return {contacted,failed};
}

module.exports=async function handler(req,res){
  if(!["GET","POST"].includes(req.method)) return res.status(405).json({ok:false,error:"METHOD_NOT_ALLOWED"});
  const mode=accessMode(req);
  if(!mode) return res.status(403).json({ok:false,error:"OWNER_OR_CRON_ONLY"});
  const sql=getSql();
  if(!sql) return res.status(503).json({ok:false,error:"DATABASE_NOT_CONFIGURED"});

  if(mode==="cron"){
    const prior=await sql`
      select id from mfactu_commercial_events
      where event_type='orchestrator_daily_run'
        and created_at>=date_trunc('day',now())
      limit 1
    `;
    if(prior[0]) return res.status(200).json({ok:true,alreadyRun:true});
  }

  const pages=[1,2];
  let found=[];
  for(const page of pages){
    const batch=await searchTaxiCompanies({page,perPage:25});
    found.push(...batch.results);
  }
  found=found.slice(0,50);
  const persisted=await persistProspects(sql,found);
  if(found.length){
    await sql`
      insert into mfactu_commercial_events(event_type,metadata)
      select 'prospect_searched', '{"source":"annuaire-entreprises","mode":"orchestrator"}'::jsonb
      from generate_series(1,${found.length})
    `;
  }

  const outreach=await contactReadyProspects(sql,50);

  if(mode==="cron"){
    await sql`
      insert into mfactu_commercial_events(event_type,metadata)
      values('orchestrator_daily_run',${JSON.stringify({
        searched:found.length,
        created:persisted.created,
        existing:persisted.existing,
        contacted:outreach.contacted||0,
        failed:outreach.failed||0
      })}::jsonb)
    `;
  }
  return res.status(200).json({
    ok:true,
    searched:found.length,
    created:persisted.created,
    existing:persisted.existing,
    contacted:outreach.contacted||0,
    contactFailed:outreach.failed||0,
    contactSkipped:outreach.skipped||null,
    note:"Les contacts sont envoyés uniquement aux prospects disposant d'une adresse professionnelle enregistrée et non désinscrite."
  });
};
