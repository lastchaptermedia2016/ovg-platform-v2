import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:Ilove$dona68@db.lfmrdaeuwfhguqghqrto.supabase.co:5432/postgres',
  });
  await client.connect();
  const res = await client.query(`
    SELECT COUNT(*)::int AS remaining_legacy_tenants
    FROM tenants
    WHERE widget_config IS NOT NULL
      AND widget_config ? 'widget_studio'
      AND widget_config->'widget_studio' ? 'aiPersona'
      AND (widget_config->'aiPersona' IS NULL)
  `);
  const remaining = res.rows[0]?.remaining_legacy_tenants ?? -1;
  console.log(JSON.stringify({ remaining_legacy_tenants: remaining }, null, 2));
  await client.end();
  if (remaining > 0) {
    console.error(`FAIL: ${remaining} tenant(s) still rely on legacy widget_studio.aiPersona`);
    process.exit(1);
  }
  console.log('PASS: no tenants remain on the legacy widget_studio.aiPersona path.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
