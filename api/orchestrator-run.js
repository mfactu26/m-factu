const { getSession } = require("../lib/auth.cjs");
const { getSql } = require("../lib/db.cjs");
const { searchTaxiCompanies, persistProspects } = require("../lib/prospecting.cjs");

function authorized(req){
  const s=getSession(req);
  if(s&&s.role==="owner") return true;
  const auth=String(req.headers.authorization||"");
  return Boolean(process.env.CRON_SECRET&&auth==="Bearer "+process.env.CRON_SECRET);
}

module.exports=async function handler(req,res){
  if(!["GET","POST"].includes(req.method)) return res.status(405).json({ok:false,error:"METHOD_NOT_ALLOWED"});
  if(!authorized(req)) return res.status(403).json({ok:false,error:"OWNER_OR_CRON_ONLY"});
  const sql=getSql();
  if(!sql) return res.status(503).json({ok:false,error:"DATABASE_NOT_CONFIGURED"});

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
  return res.status(200).json({
    ok:true,
    searched:found.length,
    created:persisted.created,
    existing:persisted.existing,
    note:"Les contacts sont envoyés uniquement aux prospects disposant d'une adresse professionnelle enregistrée et non désinscrite."
  });
};