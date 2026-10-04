const crypto=require("crypto");
const { getSession } = require("../lib/auth.cjs");
const { getSql } = require("../lib/db.cjs");
const { sendEmail } = require("../lib/email.cjs");
const { searchTaxiCompanies, persistProspects, enrichPublicContacts } = require("../lib/prospecting.cjs");

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

const DAILY_OUTREACH_CAP=25;

async function contactReadyProspects(sql,limit=DAILY_OUTREACH_CAP){
  if(!process.env.RESEND_API_KEY||!process.env.AUTH_SECRET) return {contacted:0,failed:0,skipped:"EMAIL_NOT_CONFIGURED",dailyCap:DAILY_OUTREACH_CAP};
  const countRows=await sql`
    select count(*)::int as sent_today
    from mfactu_commercial_events
    where event_type='contact_sent'
      and created_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')
      and created_at < ((date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris')
  `;
  const sentToday=Number(countRows[0]?.sent_today||0);
  const remaining=Math.max(0,DAILY_OUTREACH_CAP-sentToday);
  const allowed=Math.max(0,Math.min(Number(limit)||DAILY_OUTREACH_CAP,remaining));
  if(!allowed) return {contacted:0,failed:0,skipped:"DAILY_CAP_REACHED",sentToday,dailyCap:DAILY_OUTREACH_CAP,remaining:0};
  const rows=await sql`
    select id,company_name,city,email,status,opt_out,notes
    from mfactu_prospects
    where opt_out=false
      and status='new'
      and email is not null
      and length(trim(email))>3
    order by score desc, created_at asc
    limit ${allowed}
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
        headers:{"List-Unsubscribe":"<"+unsubscribe+">","List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}
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
  return {contacted,failed,sentToday:sentToday+contacted,dailyCap:DAILY_OUTREACH_CAP,remaining:Math.max(0,remaining-contacted)};
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

  const previousRuns=await sql`
    select metadata
    from mfactu_commercial_events
    where event_type='orchestrator_daily_run'
    order by created_at desc
    limit 1
  `;
  let startPage=Math.max(1,Number(previousRuns[0]&&previousRuns[0].metadata&&previousRuns[0].metadata.nextPage||1));
  let found=[];
  let pagesUsed=[];
  let totalPages=0;

  for(let i=0;i<2;i++){
    let page=startPage+i;
    if(totalPages&&page>totalPages) page=((page-1)%totalPages)+1;
    let batch=await searchTaxiCompanies({page,perPage:25});

    if(i===0&&startPage>1&&!batch.results.length){
      startPage=1;
      page=1;
      batch=await searchTaxiCompanies({page,perPage:25});
    }

    totalPages=Number(batch.totalPages||totalPages||0);
    if(totalPages&&page>totalPages) page=((page-1)%totalPages)+1;
    pagesUsed.push(page);
    found.push(...batch.results);
  }

  found=found.slice(0,50);
  const lastPage=pagesUsed.length?pagesUsed[pagesUsed.length-1]:startPage;
  const nextPage=totalPages?(lastPage>=totalPages?1:lastPage+1):lastPage+1;
  const backlogOutreach=await contactReadyProspects(sql,DAILY_OUTREACH_CAP);

  const persisted=await persistProspects(sql,found);
  if(found.length){
    await sql`
      insert into mfactu_commercial_events(event_type,metadata)
      select 'prospect_searched', ${JSON.stringify({source:"annuaire-entreprises",mode:"orchestrator"})}::jsonb
      from generate_series(1,${found.length})
    `;
  }
  const enrichment=await enrichPublicContacts(sql,{limit:12});
  const remainingAfterBacklog=Math.max(0,DAILY_OUTREACH_CAP-Number(backlogOutreach.contacted||0));
  const freshOutreach=remainingAfterBacklog>0
    ? await contactReadyProspects(sql,remainingAfterBacklog)
    : {contacted:0,failed:0,skipped:"DAILY_CAP_REACHED",sentToday:backlogOutreach.sentToday,dailyCap:DAILY_OUTREACH_CAP,remaining:0};
  const outreach={
    contacted:Number(backlogOutreach.contacted||0)+Number(freshOutreach.contacted||0),
    failed:Number(backlogOutreach.failed||0)+Number(freshOutreach.failed||0),
    skipped:freshOutreach.skipped||backlogOutreach.skipped||null,
    dailyCap:DAILY_OUTREACH_CAP,
    sentToday:Number(freshOutreach.sentToday ?? backlogOutreach.sentToday ?? 0),
    remaining:Number(freshOutreach.remaining ?? backlogOutreach.remaining ?? 0)
  };

  if(mode==="cron"){
    await sql`
      insert into mfactu_commercial_events(event_type,metadata)
      values('orchestrator_daily_run',${JSON.stringify({
        searched:found.length,
        created:persisted.created,
        existing:persisted.existing,
        pagesUsed,
        totalPages,
        nextPage,
        backlogContacted:backlogOutreach.contacted||0,
        enrichment,
        freshContacted:freshOutreach.contacted||0,
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
    pagesUsed,
    totalPages,
    nextPage,
    backlogOutreach,
    enrichment,
    freshOutreach,
    contacted:outreach.contacted||0,
    contactFailed:outreach.failed||0,
    contactSkipped:outreach.skipped||null,
    dailyOutreachCap:outreach.dailyCap||DAILY_OUTREACH_CAP,
    dailyOutreachRemaining:Number.isFinite(outreach.remaining)?outreach.remaining:null,
    note:"Les contacts sont envoyés uniquement aux prospects disposant d'une adresse professionnelle enregistrée et non désinscrite."
  });
};
