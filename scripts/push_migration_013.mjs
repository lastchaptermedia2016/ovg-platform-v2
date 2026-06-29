import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const sql = fs.readFileSync('supabase/migrations/013_add_slug_to_resellers.sql', 'utf8');

const client = new Client({
  connectionString: 'postgresql://postgres:Ilove$dona68@db.lfmrdaeuwfhguqghqrto.supabase.co:5432/postgres',
});

await client.connect();
await client.query(sql);
console.log('Migration 013 applied successfully');
await client.end();
process.exit(0);