let sqlClient;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sqlClient) {
    const { neon } = require("@neondatabase/serverless");
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}

async function findActiveUserByEmail(email) {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    select id, email, password_hash, role, organization_id, display_name
    from mfactu_users
    where lower(email) = lower(${email}) and active = true
    limit 1
  `;
  return rows[0] || null;
}

module.exports = { getSql, findActiveUserByEmail };
