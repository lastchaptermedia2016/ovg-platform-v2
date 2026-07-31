import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const sql = fs.readFileSync('supabase/migrations/20260731_add_tenant_appointments_index.sql', 'utf8');

const client = new Client({
  connectionString: 'postgresql://postgres.lfmrdaeuwfhguqghqrto:Ilove$dona68@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
});

await client.connect();
await client.query(sql);
console.log('Migration 20260731 (tenant_appointments index) applied successfully');
await client.end();
process.exit(0);
