const TAXI_NAF = "49.32Z";
const SEARCH_URL = "https://recherche-entreprises.api.gouv.fr/search";
const PUBLIC_SEARCH_URL = "https://html.duckduckgo.com/html/";
const MAX_HTML_BYTES = 350000;

const BLOCKED_HOST_SUFFIXES = [
  "annuaire-entreprises.data.gouv.fr",
  "annuaire-entreprises.api.gouv.fr",
  "societe.com",
  "pappers.fr",
  "infogreffe.fr",
  "verif.com",
  "manageo.fr",
  "kompass.com",
  "pagesjaunes.fr",
  "118000.fr",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "google.com",
  "google.fr",
  "bing.com",
  "duckduckgo.com"
];

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

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/");
}

function isPrivateHost(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) {
    const p = h.split(".").map(Number);
    if (p.some(n => n < 0 || n > 255)) return true;
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] >= 224) return true;
  }
  return false;
}

function isBlockedHost(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/^www\./, "");
  return BLOCKED_HOST_SUFFIXES.some(suffix => h === suffix || h.endsWith("." + suffix));
}

function publicHttpUrl(value, base) {
  try {
    const u = new URL(decodeHtml(value), base);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (u.username || u.password || isPrivateHost(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

function extractSearchLinks(html) {
  const links = [];
  for (const m of String(html || "").matchAll(/<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["']/gi)) {
    let u = publicHttpUrl(m[1], "https://duckduckgo.com");
    if (!u) continue;
    if (u.hostname.endsWith("duckduckgo.com")) {
      const redirected = u.searchParams.get("uddg");
      if (redirected) u = publicHttpUrl(redirected);
    }
    if (!u || isBlockedHost(u.hostname)) continue;
    u.hash = "";
    links.push(u.toString());
  }
  return [...new Set(links)].slice(0, 8);
}

function extractEmails(html) {
  const text = decodeHtml(String(html || "")).replace(/%40/gi, "@");
  const found = new Set();
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const email = m[0].replace(/[.,;:)\]>]+$/g, "").toLowerCase();
    if (email.length > 160) continue;
    if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(email)) continue;
    if (/^(?:no-?reply|noreply|donotreply|example)@/i.test(email)) continue;
    if (/@(?:example\.com|sentry\.io|wixpress\.com)$/i.test(email)) continue;
    found.add(email);
  }
  return [...found];
}

function extractFrenchPhone(html) {
  const text = decodeHtml(String(html || "")).replace(/<[^>]+>/g, " ");
  const matches = text.match(/(?:(?:\+33|0033)\s?[1-9]|0[1-9])(?:[\s.\-]?\d{2}){4}/g) || [];
  for (const raw of matches) {
    const digits = raw.replace(/\D/g, "");
    if (digits.startsWith("0033") && digits.length === 13) return "+33" + digits.slice(4);
    if (digits.startsWith("33") && digits.length === 11) return "+" + digits;
    if (digits.startsWith("0") && digits.length === 10) return digits;
  }
  return null;
}

function extractContactLinks(html, baseUrl) {
  const base = publicHttpUrl(baseUrl);
  if (!base) return [];
  const links = [];
  for (const m of String(html || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const raw = decodeHtml(m[1]);
    if (!/(contact|nous-contacter|contactez|mentions-legales|mentions_l[eé]gales)/i.test(raw)) continue;
    const u = publicHttpUrl(raw, base.toString());
    if (!u || u.origin !== base.origin) continue;
    u.hash = "";
    links.push(u.toString());
  }
  return [...new Set(links)].slice(0, 2);
}

function emailScore(email, websiteHost) {
  let score = 0;
  const local = email.split("@")[0] || "";
  const domain = email.split("@")[1] || "";
  if (/^(contact|accueil|info|bonjour|bureau|secretariat|facturation|direction|taxi)/i.test(local)) score += 30;
  const host = String(websiteHost || "").replace(/^www\./, "");
  if (host && (host === domain || host.endsWith("." + domain) || domain.endsWith("." + host))) score += 40;
  if (!/(gmail|outlook|hotmail|orange|wanadoo|yahoo|icloud)\./i.test(domain)) score += 10;
  return score;
}

async function fetchHtml(url, { timeoutMs = 5000 } = {}) {
  const u = publicHttpUrl(url);
  if (!u || isBlockedHost(u.hostname)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(u.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.5",
        "user-agent": "M-FactU/1.0 public-business-contact-discovery"
      }
    });
    if (!r.ok) return null;
    const type = String(r.headers.get("content-type") || "");
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) return null;
    const length = Number(r.headers.get("content-length") || 0);
    if (length > MAX_HTML_BYTES * 4) return null;
    const text = (await r.text()).slice(0, MAX_HTML_BYTES);
    return { html: text, url: r.url || u.toString() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sourceSiren(source) {
  const m = String(source || "").match(/siren:(\d{9})/);
  return m ? m[1] : "";
}

async function discoverPublicContact(prospect) {
  const terms = [
    prospect.company_name,
    prospect.city,
    "taxi",
    sourceSiren(prospect.source),
    "contact"
  ].filter(Boolean);
  const searchPage = await fetchHtml(`${PUBLIC_SEARCH_URL}?q=${encodeURIComponent(terms.join(" "))}`, { timeoutMs: 5500 });
  if (!searchPage) return null;
  const candidates = extractSearchLinks(searchPage.html);
  for (const candidate of candidates.slice(0, 3)) {
    const homepage = await fetchHtml(candidate);
    if (!homepage) continue;
    const homeUrl = publicHttpUrl(homepage.url || candidate);
    if (!homeUrl || isBlockedHost(homeUrl.hostname)) continue;

    const pages = [homepage];
    for (const contactUrl of extractContactLinks(homepage.html, homeUrl.toString())) {
      const contact = await fetchHtml(contactUrl, { timeoutMs: 4500 });
      if (contact) pages.push(contact);
    }

    const emailEntries = [];
    let phone = null;
    for (const page of pages) {
      if (!phone) phone = extractFrenchPhone(page.html);
      for (const email of extractEmails(page.html)) {
        emailEntries.push({
          email,
          sourceUrl: page.url || homeUrl.toString(),
          score: emailScore(email, homeUrl.hostname)
        });
      }
    }
    emailEntries.sort((a, b) => b.score - a.score || a.email.localeCompare(b.email));
    if (emailEntries[0] || phone) {
      return {
        email: emailEntries[0] ? emailEntries[0].email : null,
        phone,
        website: homeUrl.origin,
        sourceUrl: emailEntries[0] ? emailEntries[0].sourceUrl : homeUrl.toString()
      };
    }
  }
  return null;
}

async function enrichPublicContacts(sql, { limit = 12 } = {}) {
  const rows = await sql`
    select id,company_name,city,department,email,phone,status,score,opt_out,source,notes,created_at
    from mfactu_prospects
    where opt_out=false
      and status='new'
      and (email is null or length(trim(email))<4)
    order by score desc, created_at asc
    limit ${clampInt(limit,1,30,12)}
  `;
  let enriched = 0;
  let emailFound = 0;
  let phoneFound = 0;
  let misses = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += 3) {
    const chunk = rows.slice(i, i + 3);
    const discoveries = await Promise.all(chunk.map(async p => {
      try {
        return { p, result: await discoverPublicContact(p), error: null };
      } catch (error) {
        return { p, result: null, error };
      }
    }));

    for (const item of discoveries) {
      const { p, result, error } = item;
      if (error) {
        failed++;
        continue;
      }
      if (!result || (!result.email && !result.phone)) {
        misses++;
        continue;
      }

      const stamp = new Date().toISOString();
      const note = `${p.notes || ""} • Contact public enrichi ${stamp} • Source ${result.sourceUrl || result.website}`;
      const updated = await sql`
        update mfactu_prospects
        set email=coalesce(email,${result.email}),
            phone=coalesce(phone,${result.phone}),
            notes=${note},
            updated_at=now()
        where id=${p.id} and opt_out=false
        returning id,email,phone
      `;
      if (!updated[0]) continue;
      enriched++;
      if (result.email) emailFound++;
      if (result.phone) phoneFound++;
      await sql`
        insert into mfactu_commercial_events(event_type,prospect_id,metadata)
        values('prospect_enriched',${p.id},${JSON.stringify({
          method:"public-website",
          website:result.website,
          sourceUrl:result.sourceUrl,
          emailFound:Boolean(result.email),
          phoneFound:Boolean(result.phone)
        })}::jsonb)
      `;
    }
  }

  return { attempted: rows.length, enriched, emailFound, phoneFound, misses, failed };
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
  discoverPublicContact,
  enrichPublicContacts,
  extractSearchLinks,
  extractEmails,
  extractFrenchPhone,
  extractContactLinks,
  publicHttpUrl,
  mapProspectForUi
};
