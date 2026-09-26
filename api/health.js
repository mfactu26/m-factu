module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    authConfigured: Boolean(process.env.AUTH_SECRET && process.env.OWNER_EMAIL && (process.env.OWNER_PASSWORD || process.env.OWNER_PASSWORD_HASH)),
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    healthDataUploadsEnabled: false
  });
};
