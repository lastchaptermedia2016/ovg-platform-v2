import { createClient } from "@supabase/supabase-js";

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
  console.log("data:", JSON.stringify(data));
  if (error) {
    const props = Object.getOwnPropertyNames(error);
    const errObj = {};
    for (const p of props) errObj[p] = error[p];
    console.log("error props:", JSON.stringify(errObj));
    console.log("error.message:", error.message);
    console.log("error.code:", error.code);
    console.log("error.details:", error.details);
    console.log("error.hint:", error.hint);
  } else {
    console.log("error: null");
  }

  // 2. Try to find a real tenant
  console.log("\n=== TEST 2: Find a real tenant ===");
  const { data: tenants, error: tErr } = await supabase
    .from("tenants")
    .select("id, tenant_id")
    .limit(1);
  if (tErr) {
    console.log("tenants query error:", tErr.message);
  } else {
    console.log("first tenant:", JSON.stringify(tenants));
    if (tenants && tenants.length > 0) {
      const tid = tenants[0].tenant_id;
      console.log(`\n=== TEST 3: RPC with real tenant_id "${tid}" ===`);
      const { data: d2, error: e2 } = await supabase.rpc(
        "get_public_widget_config",
        { p_tenant_id: tid }
      );
      console.log("data:", JSON.stringify(d2));
      if (e2) {
        const props = Object.getOwnPropertyNames(e2);
        const errObj = {};
        for (const p of props) errObj[p] = e2[p];
        console.log("error props:", JSON.stringify(errObj));
        console.log("error.message:", e2.message);
        console.log("error.code:", e2.code);
      } else {
        console.log("error: null");
      }
    }
  }
}

main().catch(console.error);