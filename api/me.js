const { getSession } = require("../lib/auth.cjs");

module.exports = function handler(req, res) {
  const session = getSession(req);
  res.setHeader("Cache-Control", "no-store");
  if (!session) return res.status(401).json({ authenticated: false });
  return res.status(200).json({
    authenticated: true,
    role: session.role,
    email: session.email,
    name: session.name || "",
    organizationId: session.organizationId || null
  });
};
