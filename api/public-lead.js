const { getSql } = require("../lib/db.cjs");

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const sql = getSql();
  if (!sql) return res.status(503).json({ ok: false, error: "DATABASE_UNAVAILABLE" });

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body || "{}"); }
    catch { return res.status(400).json({ ok: false, error: "INVALID_JSON" }); }
  }

  const company = clean(body.company, 160);
  const name = clean(body.name, 160);
  const phone = clean(body.phone, 80);
  const email = clean(body.email, 240).toLowerCase();
  const turnover = clean(body.turnover, 120);
  const gateway = clean(body.gateway, 120);
  const message = clean(body.message, 1200);

  if (!company || !name || !phone || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
  }

  const notes = [
    "Demande entrante depuis le site",
    "Contact: " + name,
    turnover ? "CA estimé: " + turnover : "",
    gateway ? "Passerelle: " + gateway : "",
    message ? "Message: " + message : ""
  ].filter(Boolean).join(" • ");

  try {
    const existing = await sql`
      select id from mfactu_prospects
      where lower(email)=lower(${email})
      order by created_at desc
      limit 1
    `;

    let prospectId;
    if (existing[0]) {
      prospectId = existing[0].id;
      await sql`
        update mfactu_prospects
        set company_name=${company},
            phone=${phone},
            status='interested',
            source=coalesce(source,'website-contact'),
            notes=concat_ws(' • ', nullif(notes,''), ${notes}),
            updated_at=now()
        where id=${prospectId}
      `;
    } else {
      const inserted = await sql`
        insert into mfactu_prospects(company_name,email,phone,status,score,opt_out,source,notes)
        values(${company},${email},${phone},'interested',100,false,'website-contact',${notes})
        returning id
      `;
      prospectId = inserted[0].id;
    }

    await sql`
      insert into mfactu_commercial_events(event_type,prospect_id,metadata)
      values('prospect_interested',${prospectId},${JSON.stringify({source:"website-contact",turnover,gateway})}::jsonb)
    `;

    res.setHeader("Cache-Control","no-store");
    return res.status(201).json({ ok:true });
  } catch (error) {
    console.error("M FactU public lead error", error);
    return res.status(500).json({ ok:false, error:"LEAD_SAVE_FAILED" });
  }
};