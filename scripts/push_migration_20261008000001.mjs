import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const sql = fs.readFileSync('supabase/migrations/20261008000001_tenant_appointments_lead_lookup.sql', 'utf8');

const client = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.lfmrdaeuwfhguqghqrto',
  password: 'Ilove$dona68',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();
await client.query(sql);
console.log('Migration 20261008000001 (lead lookup index) applied successfully');
await client.end();
process.exit(0);