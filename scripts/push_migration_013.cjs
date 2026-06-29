import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const sql = fs.readFileSync('supabase/migrations/013_add_slug_to_resellers.sql', 'utf8');

const client = new Client({
  connectionString: 'postgresql://postgres:Ilove$dona68@db.lfmrdaeuwfhguqghqrto.supabase.co:5432/postgres',
});

client.connect()
  .then(() => client.query(sql))
  .then(() => {
    console.log('Migration 013 applied successfully');
    return client.end();
  })
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Migration failed:', e);
    return client.end().then(() => process.exit(1));
  });