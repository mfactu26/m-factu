const { getSession } = require("../lib/auth.cjs");
const { getSql } = require("../lib/db.cjs");
const { clampInt, searchTaxiCompanies, persistProspects, mapProspectForUi } = require("../lib/prospecting.cjs");

module.exports = async function handler(req,res){
  if(!["GET","POST"].includes(req.method)) return res.status(405).json({ok:false,error:"METHOD_NOT_ALLOWED"});
  const session=getSession(req);
  if(!session||session.role!=="owner") return res.status(403).json({ok:false,error:"OWNER_ONLY"});
  const sql=getSql();
  if(!sql) return res.status(503).json({ok:false,error:"DATABASE_NOT_CONFIGURED"});

  if(req.method==="GET"){
    const limit=clampInt(req.query&&req.query.limit,1,200,100);
    const rows=await sql`
      select id,company_name,city,department,email,phone,status,score,opt_out,source,notes,created_at
      from mfactu_prospects
      order by created_at desc
      limit ${limit}
    `;
    const [activityRows,summaryRows]=await Promise.all([
      sql`
        select
          count(*) filter (where event_type='prospect_searched')::int as searched,
          count(*) filter (where event_type='prospect_qualified')::int as qualified,
          count(*) filter (where event_type='contact_sent')::int as contacted,
          count(*) filter (where event_type='reply_received')::int as replies,
          count(*) filter (where event_type='prospect_interested')::int as hot,
          count(*) filter (where event_type='proposal_sent')::int as proposals,
          count(*) filter (where event_type='contract_signed')::int as signed
        from mfactu_commercial_events
        where created_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')
          and created_at < ((date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris')
      `,
      sql`
        select
          (select count(*)::int from mfactu_prospects) as prospects,
          (select count(*)::int from mfactu_prospects where status='contacted') as contacted_total,
          (select count(*)::int from mfactu_organizations where status='active') as active_clients,
          (select count(*)::int from mfactu_proposals where status='sent') as contracts_pending,
          (select count(*)::int from mfactu_dossiers where status in ('to_process','to_transmit','rejected')) as dossiers_todo,
          (select coalesce(sum(fee_cents),0)::bigint from mfactu_billing_periods
             where period_start>=date_trunc('month',current_date)::date) as current_month_fee_cents
      `
    ]);
    const a=activityRows[0]||{};
    const s=summaryRows[0]||{};
    return res.status(200).json({
      ok:true,
      prospects:rows.map(mapProspectForUi),
      activity:{
        searched:Number(a.searched||0),
        qualified:Number(a.qualified||0),
        contacted:Number(a.contacted||0),
        replies:Number(a.replies||0),
        hot:Number(a.hot||0),
        proposals:Number(a.proposals||0),
        signed:Number(a.signed||0)
      },
      summary:{
        prospects:Number(s.prospects||0),
        contactedTotal:Number(s.contacted_total||0),
        activeClients:Number(s.active_clients||0),
        contractsPending:Number(s.contracts_pending||0),
        dossiersTodo:Number(s.dossiers_todo||0),
        currentMonthFeeCents:Number(s.current_month_fee_cents||0)
      }
    });
  }

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