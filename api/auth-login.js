const {
  signSession,
  sessionCookie,
  ownerConfigured,
  verifyOwner,
  verifyPasswordHash
} = require("../lib/auth.cjs");
const { findActiveUserByEmail } = require("../lib/db.cjs");

const ALLOWED_NEXT = new Set(["/admin", "/orchestrateur", "/espace-client", "/onboarding"]);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const requestedNext = ALLOWED_NEXT.has(String(body.next || "")) ? String(body.next) : null;

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "EMAIL_PASSWORD_REQUIRED" });
  }

  if (ownerConfigured() && verifyOwner(email, password)) {
    const token = signSession({ role: "owner", email, name: "Administrateur M FactU" });
    res.setHeader("Set-Cookie", sessionCookie(token));
    return res.status(200).json({ ok: true, role: "owner", redirect: requestedNext || "/admin" });
  }

  if (process.env.DATABASE_URL) {
    try {
      const user = await findActiveUserByEmail(email);
      if (user && verifyPasswordHash(password, user.password_hash)) {
        const token = signSession({
          role: user.role,
          email: user.email,
          name: user.display_name || "",
          userId: user.id,
          organizationId: user.organization_id || null
        });
        res.setHeader("Set-Cookie", sessionCookie(token));
        const fallback = user.role === "owner" ? "/admin" : "/espace-client";
        const redirect = user.role === "client" && requestedNext && ["/admin", "/orchestrateur"].includes(requestedNext)
          ? fallback
          : (requestedNext || fallback);
        return res.status(200).json({ ok: true, role: user.role, redirect });
      }
    } catch (error) {
      console.error("M FactU login database error", error);
      return res.status(503).json({ ok: false, error: "DATABASE_UNAVAILABLE" });
    }
  }

  return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
};
