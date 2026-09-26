const crypto=require("crypto");
const { getSql } = require("../lib/db.cjs");

function safeEqual(a,b){
  const da=crypto.createHash("sha256").update(String(a)).digest();
  const db=crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(da,db);
}

module.exports=async function handler(req,res){
  if(req.method!=="GET") return res.status(405).send("Method not allowed");
  const sql=getSql();
  if(!sql) return res.status(503).send("Service indisponible");
  try{
    const token=String((req.query&&req.query.token)||"");
    const [payload,sig]=token.split(".");
    if(!payload||!sig||!process.env.AUTH_SECRET) throw new Error("BAD_TOKEN");
    const expected=crypto.createHmac("sha256",process.env.AUTH_SECRET).update(payload).digest("base64url");
    if(!safeEqual(sig,expected)) throw new Error("BAD_TOKEN");
    const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    const rows=await sql`select id,email from mfactu_prospects where id=${String(data.id||"")} limit 1`;
    const p=rows[0];
    if(!p||String(p.email||"").toLowerCase()!==String(data.email||"").toLowerCase()) throw new Error("BAD_TOKEN");
    await sql`update mfactu_prospects set opt_out=true,status='opted_out',updated_at=now() where id=${p.id}`;
    await sql`insert into mfactu_commercial_events(event_type,prospect_id) values('prospect_opted_out',${p.id})`;
    res.setHeader("Content-Type","text/html; charset=utf-8");
    return res.status(200).send("<!doctype html><html lang='fr'><meta charset='utf-8'><title>M FactU</title><body style='font-family:Arial,sans-serif;max-width:640px;margin:60px auto;padding:20px'><h1>Désinscription confirmée</h1><p>Cette adresse ne recevra plus de prospection M FactU.</p></body></html>");
  }catch{
    return res.status(400).send("Lien invalide ou expiré.");
  }
};