const { getSession } = require("../lib/auth.cjs");
const { getSql } = require("../lib/db.cjs");
const { clampInt, searchTaxiCompanies, persistProspects, enrichPublicContacts, enrichProspectById, mapProspectForUi } = require("../lib/prospecting.cjs");

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
    const [activityRows,summaryRows,clientRows,dossierRows]=await Promise.all([
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
          (select count(*)::int from mfactu_prospects where status='interested') as interested_total,
          (select count(*)::int from mfactu_organizations where status='active') as active_clients,
          (select count(*)::int from mfactu_proposals where status='sent') as contracts_pending,
          (select count(*)::int from mfactu_dossiers where status in ('to_process','to_transmit','rejected')) as dossiers_todo,
          (select coalesce(sum(fee_cents),0)::bigint from mfactu_billing_periods
             where period_start>=date_trunc('month',current_date)::date) as current_month_fee_cents
      `,
      sql`
        select id,name,city,status,created_at
        from mfactu_organizations
        order by created_at desc
        limit 50
      `,
      sql`
        select d.id,d.reference,d.trip_date,d.amount_cents,d.status,o.name as client_name
        from mfactu_dossiers d
        join mfactu_organizations o on o.id=d.organization_id
        order by d.created_at desc
        limit 50
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
        interestedTotal:Number(s.interested_total||0),
        activeClients:Number(s.active_clients||0),
        contractsPending:Number(s.contracts_pending||0),
        dossiersTodo:Number(s.dossiers_todo||0),
        currentMonthFeeCents:Number(s.current_month_fee_cents||0)
      },
      clients:clientRows.map(row=>({
        id:row.id,
        name:row.name,
        city:row.city||'',
        status:row.status||'active',
        createdAt:row.created_at
      })),
      dossiers:dossierRows.map(row=>({
        id:row.id,
        reference:row.reference,
        client:row.client_name||'',
        date:row.trip_date||null,
        amount:Number(row.amount_cents||0)/100,
        status:({
          to_process:'À traiter',
          to_transmit:'À télétransmettre',
          transmitted:'Télétransmis',
          rejected:'Rejet à corriger',
          paid:'Payé'
        })[row.status]||row.status||'À traiter'
      }))
    });
  }

  let body={};
  try{body=typeof req.body==="object"&&req.body?req.body:JSON.parse(req.body||"{}")}catch{}
  if(body.action==='add_manual'){
    const company=String(body.company||'').trim().slice(0,200);
    const city=String(body.city||'').trim().slice(0,120);
    const email=String(body.email||'').trim().toLowerCase().slice(0,160);
    if(!company||!email||!email.includes('@')) return res.status(400).json({ok:false,error:'INVALID_PROSPECT'});
    const source='manual:'+Date.now();
    const inserted=await sql`
      insert into mfactu_prospects(company_name,city,email,status,score,opt_out,source,notes)
      values(${company},${city||null},${email},'new',85,false,${source},'Ajout manuel propriétaire')
      returning id
    `;
    await sql`
      insert into mfactu_commercial_events(event_type,prospect_id,metadata)
      values('prospect_found',${inserted[0].id},'{"source":"manual"}'::jsonb)
    `;
    return res.status(200).json({ok:true,id:inserted[0].id});
  }

  if(body.action==='enrich_one'){
    const id=String(body.prospectId||'');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)){
      return res.status(400).json({ok:false,error:'INVALID_PROSPECT_ID'});
    }
    const enrichment=await enrichProspectById(sql,id);
    return res.status(200).json({ok:true,...enrichment});
  }

  if(body.action==='enrich_batch'){
    const enrichment=await enrichPublicContacts(sql,{limit:50});
    return res.status(200).json({ok:true,enrichment});
  }

  if(body.action==='set_status'){
    const id=String(body.prospectId||'');
    const status=String(body.status||'');
    if(!['followup','interested'].includes(status)) return res.status(400).json({ok:false,error:'INVALID_STATUS'});
    const rows=await sql`
      update mfactu_prospects
      set status=${status},updated_at=now()
      where id=${id}::uuid and opt_out=false
      returning id
    `;
    if(!rows[0]) return res.status(404).json({ok:false,error:'PROSPECT_NOT_FOUND'});
    await sql`
      insert into mfactu_commercial_events(event_type,prospect_id,metadata)
      values(${status==='interested'?'prospect_interested':'prospect_followup'},${id}::uuid,${JSON.stringify({source:"owner-ui"})}::jsonb)
    `;
    return res.status(200).json({ok:true});
  }

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

  const enrichment=await enrichPublicContacts(sql,{limit:50});

  return res.status(200).json({
    ok:true,
    searched:selected.length,
    created:persisted.created,
    existing:persisted.existing,
    sourceTotal,
    sourcePages,
    nextPage:page+1,
    enrichment,
    prospects:persisted.saved.map(mapProspectForUi)
  });
};