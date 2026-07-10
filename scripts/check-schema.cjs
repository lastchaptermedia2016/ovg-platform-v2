require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });

(async () => {
  await client.connect();
  const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'resellers' ORDER BY ordinal_position");
  console.log('Resellers columns:');
  res.rows.forEach(r => console.log(' -', r.column_name, '(', r.data_type, ')'));
  await client.end();
})();
