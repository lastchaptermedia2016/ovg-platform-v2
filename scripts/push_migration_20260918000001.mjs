import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const sql = fs.readFileSync('supabase/migrations/20260918000001_add_missing_tenant_columns.sql', 'utf8');

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
console.log('Migration 20260918000001 (add missing tenant columns) applied successfully');
await client.end();
process.exit(0);