const crypto = require("crypto");
const { getSession } = require("../lib/auth.cjs");
const { getSql } = require("../lib/db.cjs");
const { sendEmail } = require("../lib/email.cjs");

const MAX_BYTES = 3 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanFilename(value) {
  const name = String(value || "contrat-signe.pdf")
    .replace(/[\\/\r\n\0]/g, "_")
    .trim()
    .slice(0, 180);
  return name.toLowerCase().endsWith(".pdf") ? name : "contrat-signe.pdf";
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const sql = getSql();
  if (!sql) return res.status(503).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });

  const token = String((req.query && req.query.token) || "");
  const tokenHash = token && /^[A-Za-z0-9_-]{40,80}$/.test(token)
    ? sha256(Buffer.from(token, "utf8"))
    : "";

  if (req.method === "GET" && tokenHash) {
    try {
      const rows = await sql`
        select coalesce(o.name, p.company_name) as company_name, t.expires_at
        from mfactu_contract_upload_tokens t
        left join mfactu_organizations o on o.id=t.organization_id
        left join mfactu_prospects p on p.id=t.prospect_id
        where t.token_hash=${tokenHash} and t.used_at is null and t.expires_at>now()
        limit 1
      `;
      if (!rows[0]) return res.status(410).json({ ok: false, error: "LINK_EXPIRED_OR_USED" });
      return res.status(200).json({
        ok: true,
        company: rows[0].company_name || "votre entreprise",
        expiresAt: rows[0].expires_at
      });
    } catch (error) {
      console.error("M FactU contract-link lookup failed", error);
      return res.status(500).json({ ok: false, error: "LOOKUP_FAILED" });
    }
  }

  if (req.method === "POST" && tokenHash) {
    const body = readBody(req);
    const base64 = String(body && body.fileBase64 || "");
    const filename = cleanFilename(body && body.filename);
    if (!body || !base64 || base64.length > Math.ceil(MAX_BYTES / 3) * 4 + 8 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
      return res.status(400).json({ ok: false, error: "INVALID_FILE" });
    }
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length < 8 || bytes.length > MAX_BYTES || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return res.status(400).json({ ok: false, error: "PDF_REQUIRED_OR_TOO_LARGE" });
    }
    try {
      const rows = await sql`
        with accepted as (
          update mfactu_contract_upload_tokens
          set used_at=now()
          where token_hash=${tokenHash} and used_at is null and expires_at>now()
          returning id, prospect_id, organization_id
        )
        insert into mfactu_contract_documents
          (prospect_id, organization_id, upload_token_id, filename, mime_type, size_bytes, sha256, file_data)
        select prospect_id, organization_id, id, ${filename}, 'application/pdf',
          ${bytes.length}, ${sha256(bytes)}, decode(${base64}, 'base64')
        from accepted
        returning id, prospect_id, organization_id
      `;
      if (!rows[0]) return res.status(410).json({ ok: false, error: "LINK_EXPIRED_OR_USED" });
      const uploadId = rows[0].id;
      try {
        await sql`insert into mfactu_commercial_events(event_type,prospect_id,metadata)
          values('contract_upload_received',${rows[0].prospect_id},${JSON.stringify({
            organizationId: rows[0].organization_id || null,
            uploadId
          })}::jsonb)`;
      } catch (eventError) {
        console.error("M FactU contract upload event logging failed", eventError);
      }
      if (process.env.REPORT_EMAIL && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
        try {
          await sendEmail({
            to: process.env.REPORT_EMAIL,
            subject: "M FactU — Contrat signé reçu",
            text: "Un contrat signé vient d’être déposé via le lien M FactU. Consultez le dossier dans votre espace propriétaire."
          });
          try {
            await sql`insert into mfactu_commercial_events(event_type,prospect_id,metadata)
              values('contract_upload_alert_sent',${rows[0].prospect_id},${JSON.stringify({uploadId})}::jsonb)`;
          } catch (eventError) {
            console.error("M FactU contract upload alert event logging failed", eventError);
          }
        } catch (alertError) {
          console.error("M FactU contract upload alert failed", alertError);
          try {
            await sql`insert into mfactu_commercial_events(event_type,prospect_id,metadata)
              values('contract_upload_alert_failed',${rows[0].prospect_id},${JSON.stringify({uploadId})}::jsonb)`;
          } catch (eventError) {
            console.error("M FactU contract upload alert failure logging failed", eventError);
          }
        }
      }
      return res.status(201).json({ ok: true });
    } catch (error) {
      console.error("M FactU contract upload failed", error);
      return res.status(500).json({ ok: false, error: "UPLOAD_FAILED" });
    }
  }

  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }
  const session = getSession(req);
  if (!session || session.role !== "owner") return res.status(403).json({ ok: false, error: "OWNER_ONLY" });

  if (req.method === "POST") {
    const body = readBody(req);
    if (!body) return res.status(400).json({ ok: false, error: "INVALID_ACTION" });
    if (body.action === "send_contract_email") {
      const prospectId = String(body.prospectId || "");
      const organizationId = String(body.organizationId || "");
      if (Boolean(prospectId) === Boolean(organizationId) ||
          (prospectId && !UUID.test(prospectId)) ||
          (organizationId && !UUID.test(organizationId))) {
        return res.status(400).json({ ok: false, error: "INVALID_CLIENT" });
      }
      const base64 = String(body.fileBase64 || "");
      const filename = cleanFilename(body.filename || "contrat-mfactu.pdf");
      if (!base64 || base64.length > Math.ceil(MAX_BYTES / 3) * 4 + 8 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
        return res.status(400).json({ ok: false, error: "INVALID_FILE" });
      }
      const pdf = Buffer.from(base64, "base64");
      if (pdf.length < 8 || pdf.length > MAX_BYTES || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return res.status(400).json({ ok: false, error: "PDF_REQUIRED_OR_TOO_LARGE" });
      }
      try {
        let companyName = "votre entreprise";
        let recipient = String(body.email || "").trim();
        if (prospectId) {
          const prospects = await sql`select id,company_name,email,opt_out from mfactu_prospects where id=${prospectId}::uuid limit 1`;
          if (!prospects[0]) return res.status(404).json({ ok: false, error: "PROSPECT_NOT_FOUND" });
          if (prospects[0].opt_out) return res.status(409).json({ ok: false, error: "PROSPECT_OPTED_OUT" });
          companyName = String(prospects[0].company_name || companyName).replace(/[\r\n]+/g, " ").trim();
          recipient = String(prospects[0].email || "").trim();
        } else {
          const organizations = await sql`select id,name from mfactu_organizations where id=${organizationId}::uuid limit 1`;
          if (!organizations[0]) return res.status(404).json({ ok: false, error: "CLIENT_NOT_FOUND" });
          companyName = String(organizations[0].name || companyName).replace(/[\r\n]+/g, " ").trim();
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
          return res.status(409).json({ ok: false, error: "EMAIL_MISSING_OR_INVALID" });
        }

        const rawToken = crypto.randomBytes(32).toString("base64url");
        const hash = sha256(Buffer.from(rawToken, "utf8"));
        const inserted = prospectId
          ? await sql`
              insert into mfactu_contract_upload_tokens(prospect_id,token_hash,created_by,expires_at)
              values(${prospectId}::uuid,${hash},null,now()+interval '21 days')
              returning expires_at
            `
          : await sql`
              insert into mfactu_contract_upload_tokens(organization_id,token_hash,created_by,expires_at)
              values(${organizationId}::uuid,${hash},null,now()+interval '21 days')
              returning expires_at
            `;
        const uploadUrl = (process.env.APP_URL || "https://m-factu.vercel.app") +
          "/depot-contrat?token=" + encodeURIComponent(rawToken);
        let sent;
        try {
          sent = await sendEmail({
            to: recipient,
            from: process.env.CONTRACT_EMAIL_FROM || process.env.PROSPECT_EMAIL_FROM || process.env.EMAIL_FROM,
            replyTo: [process.env.REPORT_EMAIL || process.env.OWNER_EMAIL].filter(Boolean),
            subject: "Contrat de prestation M FactU — " + companyName,
            text: `Bonjour,

Vous trouverez en pièce jointe votre contrat de prestation M FactU.
Après l’avoir imprimé, signé et scanné, déposez le PDF signé avec ce lien personnel :
${uploadUrl}

Le lien est à usage unique et expire dans 21 jours. Merci de déposer uniquement le contrat signé, sans document médical ni dossier patient.

M FactU`,
            attachments: [{ filename, content: base64, contentType: "application/pdf" }]
          });
        } catch (error) {
          await sql`delete from mfactu_contract_upload_tokens where token_hash=${hash} and used_at is null`;
          throw error;
        }
        try {
          await sql`
            insert into mfactu_commercial_events(event_type,prospect_id,organization_id,metadata)
            values('contract_email_sent',${prospectId || null}::uuid,${organizationId || null}::uuid,
              ${JSON.stringify({messageId:sent.id||null,recipient,filename,expiresAt:inserted[0].expires_at})}::jsonb)
          `;
        } catch (eventError) {
          console.error("M FactU contract email audit event failed", eventError);
        }
        return res.status(200).json({ ok: true, messageId: sent.id || null, expiresAt: inserted[0].expires_at });
      } catch (error) {
        console.error("M FactU contract email failed", error);
        return res.status(502).json({ ok: false, error: error.code || "CONTRACT_EMAIL_FAILED" });
      }
    }
    if (body.action !== "create_upload_link") return res.status(400).json({ ok: false, error: "INVALID_ACTION" });
    const prospectId = String(body.prospectId || "");
    const organizationId = String(body.organizationId || "");
    if (Boolean(prospectId) === Boolean(organizationId) ||
        (prospectId && !UUID.test(prospectId)) ||
        (organizationId && !UUID.test(organizationId))) {
      return res.status(400).json({ ok: false, error: "INVALID_CLIENT" });
    }
    try {
      const exists = prospectId
        ? await sql`select id from mfactu_prospects where id=${prospectId}::uuid limit 1`
        : await sql`select id from mfactu_organizations where id=${organizationId}::uuid limit 1`;
      if (!exists[0]) return res.status(404).json({ ok: false, error: "CLIENT_NOT_FOUND" });
      const rawToken = crypto.randomBytes(32).toString("base64url");
      const hash = sha256(Buffer.from(rawToken, "utf8"));
      const inserted = prospectId
        ? await sql`
            insert into mfactu_contract_upload_tokens(prospect_id,token_hash,created_by,expires_at)
            values(${prospectId}::uuid,${hash},null,now()+interval '21 days')
            returning expires_at
          `
        : await sql`
            insert into mfactu_contract_upload_tokens(organization_id,token_hash,created_by,expires_at)
            values(${organizationId}::uuid,${hash},null,now()+interval '21 days')
            returning expires_at
          `;
      return res.status(201).json({ ok: true, token: rawToken, expiresAt: inserted[0].expires_at });
    } catch (error) {
      console.error("M FactU contract-link creation failed", error);
      return res.status(500).json({ ok: false, error: "LINK_CREATE_FAILED" });
    }
  }

  if (req.query && req.query.documentId) {
    const documentId = String(req.query.documentId);
    if (!UUID.test(documentId)) return res.status(400).json({ ok: false, error: "INVALID_DOCUMENT_ID" });
    try {
      const rows = await sql`
        select filename, encode(file_data,'base64') as file_base64
        from mfactu_contract_documents
        where id=${documentId}::uuid
        limit 1
      `;
      if (!rows[0]) return res.status(404).json({ ok: false, error: "DOCUMENT_NOT_FOUND" });
      const pdf = Buffer.from(rows[0].file_base64, "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(rows[0].filename));
      res.setHeader("Content-Length", String(pdf.length));
      return res.status(200).send(pdf);
    } catch (error) {
      console.error("M FactU contract download failed", error);
      return res.status(500).json({ ok: false, error: "DOWNLOAD_FAILED" });
    }
  }

  if (req.method === "GET") {
    try {
      const documents = await sql`
        select d.id,d.prospect_id,d.organization_id,d.filename,d.size_bytes,d.uploaded_at,
          coalesce(o.name,p.company_name) as client_name
        from mfactu_contract_documents d
        left join mfactu_organizations o on o.id=d.organization_id
        left join mfactu_prospects p on p.id=d.prospect_id
        order by d.uploaded_at desc
        limit 100
      `;
      return res.status(200).json({ ok: true, documents: documents.map(d => ({
        id:d.id, prospectId:d.prospect_id, organizationId:d.organization_id,
        filename:d.filename, sizeBytes:Number(d.size_bytes), uploadedAt:d.uploaded_at,
        clientName:d.client_name || "Client"
      })) });
    } catch (error) {
      console.error("M FactU contract list failed", error);
      return res.status(500).json({ ok: false, error: "DOCUMENTS_LOOKUP_FAILED" });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
};
