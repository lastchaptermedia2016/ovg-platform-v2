// Run with: node --use-system-ca scripts/verify-rpc-fix.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://lfmrdaeuwfhguqghqrto.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbXJkYWV1d2ZoZ3VxZ2hxcnRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjY0MjMzMSwiZXhwIjoyMDkyMjE4MzMxfQ.zj7bCfgAFCnEX6XlBWlH1aZdjXWUB2nkfArOtDgBnxk"
);

// Disable SSL verification for this test
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

async function main() {
  // Test 1: RPC with anon role (simulating the public widget)
  console.log("=== TEST 1: Anon RPC call ===");
  const { data, error } = await supabase.rpc("get_public_widget_config", {
    p_tenant_id: "test-tenant-1",
  });
  if (error) {
    console.log("ERROR:", error.message, "code:", error.code);
  } else {
    console.log("Result (no 42501 = SUCCESS):", JSON.stringify(data));
  }

  // Test 2: Get a real tenant
  console.log("\n=== TEST 2: List tenants ===");
  const { data: tenants, error: tErr } = await supabase
    .from("tenants")
    .select("tenant_id, widget_config->branding, widget_config->features")
    .limit(3);
  if (tErr) {
    console.log("ERROR querying tenants:", tErr.message);
    return;
  }
  console.log("Tenants count:", tenants?.length || 0);
  for (const t of tenants || []) {
    console.log("  tenant_id:", t.tenant_id);
    console.log("  branding keys:", t.branding ? Object.keys(t.branding) : "none");
    console.log("  features:", JSON.stringify(t.features));
  }

  // Test 3: RPC with real tenant
  if (tenants && tenants.length > 0) {
    const tid = tenants[0].tenant_id;
    console.log(`\n=== TEST 3: RPC with real tenant "${tid}" ===`);
    const { data: d2, error: e2 } = await supabase.rpc(
      "get_public_widget_config",
      { p_tenant_id: tid }
    );
    if (e2) {
      console.log("ERROR:", e2.message, "code:", e2.code);
    } else {
      console.log("SUCCESS! Result:", JSON.stringify(d2, null, 2));
      // Check features is present
      if (d2 && d2.length > 0) {
        const cfg = d2[0].widget_config;
        console.log("Has branding:", !!cfg.branding);
        console.log("Has greeting:", !!cfg.greeting);
        console.log("Has suggestedActions:", !!cfg.suggestedActions);
        console.log("Has features:", !!cfg.features);
        console.log(
          "All allowlisted keys:",
          JSON.stringify(Object.keys(cfg))
        );
        // Verify no leak
        const leaked = Object.keys(cfg).filter(
          (k) =>
            !["branding", "greeting", "suggestedActions", "features"].includes(k)
        );
        if (leaked.length > 0) {
          console.log("⚠️  LEAKED KEYS:", leaked);
        } else {
          console.log("✅ No leaked keys — only allowlisted fields present");
        }
      }
    }
  }
}

main().catch(console.error);