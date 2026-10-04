module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    authConfigured: Boolean(process.env.AUTH_SECRET && process.env.OWNER_EMAIL && (process.env.OWNER_PASSWORD || process.env.OWNER_PASSWORD_HASH)),
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.REPORT_EMAIL && process.env.EMAIL_FROM),
    signingConfigured: Boolean(process.env.SIGNING_PROVIDER_KEY),
    contractUploadAlertConfigured: Boolean(process.env.RESEND_API_KEY && process.env.REPORT_EMAIL && process.env.EMAIL_FROM),
    ownerAlertConfigured: Boolean(process.env.RESEND_API_KEY && process.env.REPORT_EMAIL && process.env.EMAIL_FROM),
    healthDataUploadsEnabled: false
  });
};
