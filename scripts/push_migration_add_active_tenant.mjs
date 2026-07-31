import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const sql = fs.readFileSync('supabase/migrations/20260731000001_add_active_tenant_to_user_resellers.sql', 'utf8');

const client = new Client({
  connectionString: 'postgresql://postgres.lfmrdaeuwfhguqghqrto:Ilove$dona68@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
});

await client.connect();
await client.query(sql);
console.log('Migration 20260731000001 (active_tenant_id on user_resellers) applied successfully');
await client.end();
process.exit(0);