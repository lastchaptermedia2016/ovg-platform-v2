import { createClient } from "@supabase/supabase-js";
import type { PostgrestError } from "@supabase/supabase-js";

const supabase = createClient(
  "https://lfmrdaeuwfhguqghqrto.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbXJkYWV1d2ZoZ3VxZ2hxcnRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjY0MjMzMSwiZXhwIjoyMDkyMjE4MzMxfQ.zj7bCfgAFCnEX6XlBWlH1aZdjXWUB2nkfArOtDgBnxk"
);

async function main() {
  // 1. Test the RPC directly
  console.log("=== TEST 1: Direct RPC call with service_role ===");
  const { data, error } = await supabase.rpc("get_public_widget_config", {
    p_tenant_id: "test-tenant-1",
  });
  console.log("data:", JSON.stringify(data, null, 2));
  console.log(
    "error:",
    error
      ? JSON.stringify(
          error,
          Object.getOwnPropertyNames(error),
          2
        )
      : null
  );
  console.log("error keys:", error ? Object.keys(error) : null);
  console.log("error message:", (error as PostgrestError)?.message);
  console.log("error code:", (error as PostgrestError)?.code);
  console.log("error details:", (error as PostgrestError)?.details);
  console.log("error hint:", (error as PostgrestError)?.hint);

  // 2. Get function definition
  console.log("\n=== TEST 2: Function definition from pg_proc ===");
  const { data: _funcData, error: _funcErr } = await supabase.rpc(
    "get_public_widget_config",
    { p_tenant_id: "dummy" }
  );
  // Already captured above

  // 3. Try to find a real tenant
  console.log("\n=== TEST 3: Try a real-looking tenant ===");
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, tenant_id")
    .limit(1);
  console.log("first tenant:", JSON.stringify(tenants, null, 2));

  // 4. Try with that tenant
  if (tenants && tenants.length > 0) {
    const tid = tenants[0].tenant_id;
    console.log(`\n=== TEST 4: RPC call with actual tenant_id "${tid}" ===`);
    const { data: d2, error: e2 } = await supabase.rpc(
      "get_public_widget_config",
      { p_tenant_id: tid }
    );
    console.log("data:", JSON.stringify(d2, null, 2));
    console.log(
      "error:",
      e2
        ? JSON.stringify(e2, Object.getOwnPropertyNames(e2), 2)
        : null
    );
  }

  // 5. Check the function definition via sql endpoint
  console.log("\n=== TEST 5: Check function search_path ===");
  // We can check proconfig for search_path
  const { data: searchData, error: searchErr } = await supabase
    .from("pg_proc")
    .select("proname, proconfig, prolang")
    .eq("proname", "get_public_widget_config");
  console.log("pg_proc result:", JSON.stringify(searchData, null, 2));
  console.log("pg_proc error:", JSON.stringify(searchErr, null, 2));
}

main().catch(console.error);