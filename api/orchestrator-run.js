const { getSession } = require("../lib/auth.cjs");
const { getSql } = require("../lib/db.cjs");
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
  if(mode==="cron"){
    await sql`
      insert into mfactu_commercial_events(event_type,metadata)
      values('orchestrator_daily_run',${JSON.stringify({searched:found.length,created:persisted.created,existing:persisted.existing})}::jsonb)
    `;
  }
  return res.status(200).json({
    ok:true,
    searched:found.length,
    created:persisted.created,
    existing:persisted.existing,
    note:"Les contacts sont envoyés uniquement aux prospects disposant d'une adresse professionnelle enregistrée et non désinscrite."
  });
};