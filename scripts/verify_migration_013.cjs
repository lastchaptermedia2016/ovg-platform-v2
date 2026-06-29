import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:Ilove$dona68@db.lfmrdaeuwfhguqghqrto.supabase.co:5432/postgres',
  });
  await client.connect();
  const res = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'resellers'
      AND column_name = 'slug'
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});