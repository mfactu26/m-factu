const crypto = require("crypto");

const COOKIE_NAME = "mfactu_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}
function safeEqual(a, b) {
  return crypto.timingSafeEqual(digest(a), digest(b));
}
function b64url(value) {
  return Buffer.from(value).toString("base64url");
}
function signSession(payload) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_NOT_CONFIGURED");
  const body = b64url(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  }));
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + sig;
}
function verifySession(token) {
  try {
    if (!token || !process.env.AUTH_SECRET) return null;
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(body).digest("base64url");
    if (!safeEqual(sig, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!["owner", "client"].includes(payload.role)) return null;
    return payload;
  } catch {
    return null;
  }
}
function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf("=");
    return i === -1 ? [v, ""] : [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
  }));
}
function getSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return verifySession(cookies[COOKIE_NAME]);
}
function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}
function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
function ownerConfigured() {
  return Boolean(
    process.env.AUTH_SECRET &&
    process.env.AUTH_SECRET.length >= 32 &&
    process.env.OWNER_EMAIL &&
    (process.env.OWNER_PASSWORD || process.env.OWNER_PASSWORD_HASH)
  );
}
function hashPassword(password, iterations = 210000) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}
function verifyPasswordHash(password, encoded) {
  try {
    const [kind, iterationsText, salt, expected] = String(encoded).split("$");
    if (kind !== "pbkdf2" || !iterationsText || !salt || !expected) return false;
    const iterations = Number(iterationsText);
    if (!Number.isInteger(iterations) || iterations < 100000) return false;
    const actual = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("hex");
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}
function verifyOwner(email, password) {
  if (!ownerConfigured()) return false;
  if (!safeEqual(String(email).trim().toLowerCase(), String(process.env.OWNER_EMAIL).trim().toLowerCase())) return false;
  if (process.env.OWNER_PASSWORD_HASH) return verifyPasswordHash(password, process.env.OWNER_PASSWORD_HASH);
  return safeEqual(password, process.env.OWNER_PASSWORD);
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSession,
  verifySession,
  getSession,
  sessionCookie,
  clearSessionCookie,
  ownerConfigured,
  verifyOwner,
  hashPassword,
  verifyPasswordHash
};
