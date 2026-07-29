import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    "postgresql://postgres.lfmrdaeuwfhguqghqrto:Ilove$dona68@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false },
});

const sql = [
  'CREATE OR REPLACE FUNCTION get_public_widget_config(p_tenant_id TEXT)',
  'RETURNS TABLE ( widget_config JSONB )',
  'LANGUAGE sql',
  'SECURITY DEFINER',
  'SET search_path = public',
  'AS $$',
  '  SELECT',
  '    jsonb_build_object(',
  "      'branding',         COALESCE(widget_config->'branding', '{}'::jsonb),",
  "      'greeting',         COALESCE(widget_config->'greeting', '\"\"'::jsonb),",
  "      'suggestedActions', COALESCE(widget_config->'suggestedActions', '[]'::jsonb),",
  "      'features',         COALESCE(widget_config->'features', '{}'::jsonb)",
  '    ) AS widget_config',
  '  FROM tenants',
  '  WHERE tenant_id = p_tenant_id;',
  '$$;',
  '',
  "GRANT EXECUTE ON FUNCTION get_public_widget_config(TEXT) TO anon, authenticated;",
  '',
  "COMMENT ON FUNCTION get_public_widget_config IS",
  "  'Anonymous-safe widget config loader. Returns only branding and suggestedActions, completely isolating internal studio states (incl. widget_studio) and all secrets/prompts.';",
].join("\n");

async function main() {
  console.log("Deploying RPC fix...");

  // Preview the SQL for debugging
  console.log("--- SQL to execute ---");
  console.log(sql);
  console.log("--- end SQL ---");

  const res = await pool.query(sql);
  console.log("Deployment result:", res.command, res.rowCount);

  // Verify the function exists with SECURITY DEFINER
  const v = await pool.query(
    "SELECT proname, prosecdef FROM pg_proc WHERE proname = 'get_public_widget_config'"
  );
  console.log("Verification:", JSON.stringify(v.rows, null, 2));

  if (v.rows.length > 0) {
    const d = await pool.query(
      "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_public_widget_config'"
    );
    console.log("Full definition:\n" + d.rows[0]?.pg_get_functiondef);
  }

  await pool.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});