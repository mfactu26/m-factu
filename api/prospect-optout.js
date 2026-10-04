const crypto=require("crypto");
const { getSql } = require("../lib/db.cjs");

function safeEqual(a,b){
  const da=crypto.createHash("sha256").update(String(a)).digest();
  const db=crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(da,db);
}

function page(message, formAction){
  const action=String(formAction||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;");
  const content=formAction
    ? '<form method="post" action="'+action+'"><button type="submit" style="background:#173d67;color:white;border:0;border-radius:8px;padding:14px 20px;font-size:16px;cursor:pointer">Confirmer la désinscription</button></form>'
    : "";
  return "<!doctype html><html lang='fr'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>M FactU — désinscription</title></head><body style='font-family:Arial,sans-serif;max-width:640px;margin:60px auto;padding:20px'><h1>Désinscription M FactU</h1><p>"+message+"</p>"+content+"</body></html>";
}

module.exports=async function handler(req,res){
  if(!["GET","POST"].includes(req.method)) return res.status(405).send("Method not allowed");
  const sql=getSql();
  if(!sql) return res.status(503).send("Service indisponible");
  try{
    const token=String((req.query&&req.query.token)||"");
    const [payload,sig]=token.split(".");
    if(!payload||!sig||!process.env.AUTH_SECRET) throw new Error("BAD_TOKEN");
    const expected=crypto.createHmac("sha256",process.env.AUTH_SECRET).update(payload).digest("base64url");
    if(!safeEqual(sig,expected)) throw new Error("BAD_TOKEN");
    const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    const rows=await sql`select id,email,opt_out from mfactu_prospects where id=${String(data.id||"")} limit 1`;
    const p=rows[0];
    if(!p||String(p.email||"").toLowerCase()!==String(data.email||"").toLowerCase()) throw new Error("BAD_TOKEN");

    res.setHeader("Content-Type","text/html; charset=utf-8");
    res.setHeader("Cache-Control","no-store");
    if(req.method==="GET"){
      const message=p.opt_out
        ? "Cette adresse est déjà désinscrite et ne recevra plus de prospection M FactU."
        : "Confirmez votre choix pour que cette adresse ne reçoive plus de prospection M FactU.";
      return res.status(200).send(page(message,p.opt_out?"":"/api/prospect-optout?token="+encodeURIComponent(token)));
    }

    const updated=await sql`update mfactu_prospects set opt_out=true,status='opted_out',updated_at=now() where id=${p.id} and opt_out is not true returning id`;
    if(updated.length){
      await sql`insert into mfactu_commercial_events(event_type,prospect_id) values('prospect_opted_out',${p.id})`;
    }
    return res.status(200).send(page("Cette adresse ne recevra plus de prospection M FactU.", ""));
  }catch{
    return res.status(400).send("Lien invalide ou expiré.");
  }
};
