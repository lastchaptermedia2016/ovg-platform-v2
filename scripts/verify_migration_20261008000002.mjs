import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.lfmrdaeuwfhguqghqrto',
  password: 'Ilove$dona68',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();

// 1. Index exists with the expected definition.
const idx = await client.query(
  `SELECT indexdef FROM pg_indexes
   WHERE tablename = 'tenant_appointments'
     AND indexname = 'idx_unique_active_tenant_lead'`,
);
if (!idx.rows.length) {
  console.error('FAIL: idx_unique_active_tenant_lead missing');
  process.exit(1);
}
console.log('index:', idx.rows[0].indexdef);

// 2. Duplicate active LEAD insert must fail with 23505 — inside a
//    transaction that always rolls back, so live data is untouched.
await client.query('BEGIN');
try {
  await client.query(
    `INSERT INTO tenant_appointments (tenant_id, client_name, client_phone, status, start_time, end_time)
     VALUES ('93fa319e-18c2-40a8-8ba9-6eca663cccba', 'race-test', '1234567654', 'LEAD', now(), now())`,
  );
  console.error('FAIL: duplicate LEAD insert was accepted');
  await client.query('ROLLBACK');
  process.exit(1);
} catch (err) {
  if (err && err.code === '23505') {
    console.log('PASS: duplicate insert rejected with 23505 —', err.message);
  } else {
    console.error('FAIL: unexpected error:', err);
    await client.query('ROLLBACK');
    process.exit(1);
  }
}
await client.query('ROLLBACK');

// 3. Zero duplicate groups remain.
const dups = await client.query(
  `SELECT count(*) AS groups FROM (
     SELECT tenant_id, regexp_replace(client_phone, '\\D', '', 'g')
     FROM tenant_appointments
     WHERE status = 'LEAD' AND client_phone IS NOT NULL
     GROUP BY 1, 2 HAVING count(*) > 1
   ) t`,
);
const groups = Number(dups.rows[0].groups);
console.log(groups === 0 ? 'PASS: zero duplicate active-LEAD groups' : `FAIL: ${groups} duplicate groups remain`);
await client.end();
process.exit(groups === 0 ? 0 : 1);
