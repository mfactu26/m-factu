const { getSession } = require("../lib/auth.cjs");
const { getSql } = require("../lib/db.cjs");
const { clampInt, mapProspectForUi } = require("../lib/prospecting.cjs");

module.exports=async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({ok:false,error:"METHOD_NOT_ALLOWED"});
  const session=getSession(req);
  if(!session||session.role!=="owner") return res.status(403).json({ok:false,error:"OWNER_ONLY"});
  const sql=getSql();
  if(!sql) return res.status(503).json({ok:false,error:"DATABASE_NOT_CONFIGURED"});
  const limit=clampInt(req.query&&req.query.limit,1,200,100);
  const rows=await sql`
    select id,company_name,city,department,email,phone,status,score,opt_out,source,notes,created_at
    from mfactu_prospects
    order by created_at desc
    limit ${limit}
  `;
  return res.status(200).json({ok:true,prospects:rows.map(mapProspectForUi)});
};