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

// 1. Does the partial unique index exist on the live instance?
const idx = await client.query(
  `SELECT indexname FROM pg_indexes
   WHERE tablename = 'tenant_appointments'
     AND indexname = 'idx_unique_active_tenant_lead'`,
);
console.log('--- idx_unique_active_tenant_lead ---');
console.log(idx.rows.length ? idx.rows : 'NOT FOUND');

// 2. The observed duplicate pair (clive / Visitor 4567654).
const pair = await client.query(
  `SELECT id, tenant_id, client_name, client_phone, status, created_at, initial_intent
   FROM tenant_appointments
   WHERE status = 'LEAD'
     AND (client_phone LIKE '%1234567654%' OR client_phone LIKE '%3424567856%')
   ORDER BY created_at DESC`,
);
console.log('--- observed twin rows ---');
console.table(pair.rows);

// 3. All active-LEAD duplicates by tenant + digit-normalized phone.
const dups = await client.query(
  `SELECT tenant_id,
          regexp_replace(client_phone, '\\D', '', 'g') AS phone_digits,
          count(*) AS rows,
          array_agg(client_name ORDER BY created_at) AS names,
          array_agg(client_phone ORDER BY created_at) AS phones,
          array_agg(id ORDER BY created_at) AS ids
   FROM tenant_appointments
   WHERE status = 'LEAD' AND client_phone IS NOT NULL
   GROUP BY tenant_id, regexp_replace(client_phone, '\\D', '', 'g')
   HAVING count(*) > 1
   ORDER BY count(*) DESC`,
);
console.log('--- duplicate groups (active LEAD, digits key) ---');
console.table(dups.rows);

// 4. Any stored phone carrying a leading '+' (index-key mismatch risk).
const plus = await client.query(
  `SELECT id, client_name, client_phone, status, created_at
   FROM tenant_appointments
   WHERE client_phone LIKE '+%'
   ORDER BY created_at DESC
   LIMIT 20`,
);
console.log('--- rows stored with leading + ---');
console.table(plus.rows);

await client.end();
process.exit(0);
