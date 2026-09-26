const { getSession } = require("../lib/auth.cjs");
const { getSql } = require("../lib/db.cjs");
const { clampInt, searchTaxiCompanies, persistProspects, mapProspectForUi } = require("../lib/prospecting.cjs");

module.exports = async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({ok:false,error:"METHOD_NOT_ALLOWED"});
  const session=getSession(req);
  if(!session||session.role!=="owner") return res.status(403).json({ok:false,error:"OWNER_ONLY"});
  const sql=getSql();
  if(!sql) return res.status(503).json({ok:false,error:"DATABASE_NOT_CONFIGURED"});

  let body={};
  try{body=typeof req.body==="object"&&req.body?req.body:JSON.parse(req.body||"{}")}catch{}
  const target=clampInt(body.target,1,50,50);
  const startPage=clampInt(body.page,1,500,1);
  const department=body.department&&/^\d{2,3}$/.test(String(body.department))?String(body.department):null;

  const found=[];
  let page=startPage;
  let sourceTotal=0;
  let sourcePages=0;
  while(found.length<target&&page<startPage+4){
    const batch=await searchTaxiCompanies({page,perPage:25,department});
    sourceTotal=batch.totalResults;
    sourcePages=batch.totalPages;
    found.push(...batch.results);
    if(!batch.results.length||page>=batch.totalPages) break;
    page++;
  }
  const selected=found.slice(0,target);
  const persisted=await persistProspects(sql,selected);

  if(selected.length){
    await sql`
      insert into mfactu_commercial_events(event_type,metadata)
      select 'prospect_searched', ${JSON.stringify({source:"annuaire-entreprises",department})}::jsonb
      from generate_series(1,${selected.length})
    `;
  }
  if(persisted.saved.length){
    await sql`
      insert into mfactu_commercial_events(event_type,metadata)
      select 'prospect_qualified', ${JSON.stringify({source:"annuaire-entreprises"})}::jsonb
      from generate_series(1,${persisted.saved.length})
    `;
  }

  return res.status(200).json({
    ok:true,
    searched:selected.length,
    created:persisted.created,
    existing:persisted.existing,
    sourceTotal,
    sourcePages,
    nextPage:page+1,
    prospects:persisted.saved.map(mapProspectForUi)
  });
};