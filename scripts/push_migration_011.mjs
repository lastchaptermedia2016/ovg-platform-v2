import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const sql = fs.readFileSync('supabase/migrations/011_sync_reseller_branding_rpc.sql', 'utf8');

const client = new Client({
  connectionString: 'postgresql://postgres.lfmrdaeuwfhguqghqrto:Ilove$dona68@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
});

await client.connect();
await client.query(sql);
console.log('Migration 011 (sync_reseller_branding RPC) applied successfully');
await client.end();
process.exit(0);
