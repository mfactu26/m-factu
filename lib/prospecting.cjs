const TAXI_NAF = "49.32Z";
const SEARCH_URL = "https://recherche-entreprises.api.gouv.fr/search";

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
}

function safeText(value, max = 500) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

function normalizeTaxi(raw) {
  const siege = raw && raw.siege ? raw.siege : {};
  const name = safeText(raw.nom_complet || raw.nom_raison_sociale || raw.nom_commercial || raw.siren, 200);
  const siren = safeText(raw.siren, 20);
  const siret = safeText(siege.siret, 20);
  const city = safeText(siege.libelle_commune || siege.commune, 120);
  const postal = safeText(siege.code_postal, 10);
  const department = safeText(siege.departement || (postal ? postal.slice(0, postal.startsWith("97") ? 3 : 2) : null), 5);
  const naf = safeText(raw.activite_principale || siege.activite_principale, 12);
  const source = siren ? `annuaire-entreprises:siren:${siren}` : `annuaire-entreprises:${name || "unknown"}:${city || ""}`;
  let score = 70;
  if (/taxi/i.test(name || "")) score += 15;
  if (siret) score += 5;
  if (city) score += 5;
  if (naf === TAXI_NAF) score += 5;
  return {
    company_name: name || "Taxi",
    city,
    department,
    email: null,
    phone: null,
    status: "new",
    score: Math.min(100, score),
    source,
    siren,
    siret,
    notes: `Source officielle Annuaire des Entreprises • SIREN ${siren || "non renseigné"} • SIRET ${siret || "non renseigné"} • APE ${naf || TAXI_NAF}. Contact à enrichir avant envoi.`
  };
}

async function searchTaxiCompanies({ page = 1, perPage = 25, department = null } = {}) {
  const params = new URLSearchParams({
    activite_principale: TAXI_NAF,
    etat_administratif: "A",
    page: String(clampInt(page, 1, 500, 1)),
    per_page: String(clampInt(perPage, 1, 25, 25))
  });
  if (department && /^\d{2,3}$/.test(String(department))) params.set("departement", String(department));
  const r = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    headers: {
      accept: "application/json",
      "user-agent": "M-FactU/1.0 commercial-prospecting"
    }
  });
  if (!r.ok) {
    const e = new Error("PROSPECT_SOURCE_FAILED");
    e.status = r.status;
    e.body = (await r.text()).slice(0, 500);
    throw e;
  }
  const data = await r.json();
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    page: Number(data.page || page),
    perPage: Number(data.per_page || perPage),
    totalResults: Number(data.total_results || 0),
    totalPages: Number(data.total_pages || 0),
    results: results
      .filter(x => x && x.etat_administratif !== "C")
      .filter(x => x.diffusion_commerciale !== false)
      .map(normalizeTaxi)
  };
}

async function persistProspects(sql, prospects) {
  const saved = [];
  let created = 0;
  let existing = 0;
  for (const p of prospects) {
    const rows = await sql`
      select id,company_name,city,department,email,phone,status,score,opt_out,source,notes,created_at
      from mfactu_prospects
      where source=${p.source}
      limit 1
    `;
    if (rows[0]) {
      existing++;
      saved.push(rows[0]);
      continue;
    }
    const inserted = await sql`
      insert into mfactu_prospects(company_name,city,department,email,phone,status,score,opt_out,source,notes)
      values(${p.company_name},${p.city},${p.department},${p.email},${p.phone},'new',${p.score},false,${p.source},${p.notes})
      returning id,company_name,city,department,email,phone,status,score,opt_out,source,notes,created_at
    `;
    created++;
    saved.push(inserted[0]);
    await sql`
      insert into mfactu_commercial_events(event_type,prospect_id,metadata)
      values('prospect_found',${inserted[0].id},${JSON.stringify({source:p.source})}::jsonb)
    `;
  }
  return { saved, created, existing };
}

function mapProspectForUi(row) {
  const statusMap = {
    new: "Nouveau",
    contacted: "Contacté",
    followup: "À relancer",
    interested: "Intéressé",
    proposal_sent: "Proposition envoyée",
    client: "Client",
    opted_out: "Désinscrit"
  };
  return {
    id: row.id,
    company: row.company_name,
    city: row.city || "",
    department: row.department || "",
    email: row.email || "",
    phone: row.phone || "",
    status: statusMap[row.status] || row.status || "Nouveau",
    score: Number(row.score || 0),
    notes: row.notes || "",
    optOut: Boolean(row.opt_out)
  };
}

module.exports = {
  TAXI_NAF,
  clampInt,
  searchTaxiCompanies,
  persistProspects,
  mapProspectForUi
};
