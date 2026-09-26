const { clearSessionCookie } = require("../lib/auth.cjs");

module.exports = function handler(req, res) {
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.statusCode = 302;
  res.setHeader("Location", "/login");
  res.end();
};
