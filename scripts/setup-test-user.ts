/**
 * Admin Script: Set Test User Reseller Metadata
 * 
 * This script uses Supabase Admin API to update a test user's app_metadata
 * with the reseller_id and role information.
 * 
 * Run with: npx tsx scripts/setup-test-user.ts
 * 
 * Environment variables required:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (required for admin operations)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing required environment variables:");
  console.error("   - SUPABASE_URL");
  console.error("   - SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Admin client with service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TEST_USER_EMAIL = "test-reseller@acme-corp.com";
const RESELLER_SLUG = "acme-corp";

async function setupTestUser() {
  console.log("🔧 Setting up test user reseller metadata...\n");

  try {
    // Step 1: Get the reseller ID
    console.log("📋 Fetching reseller record...");
    const { data: reseller, error: resellerError } = await supabase
      .from("resellers")
      .select("id, name, tenant_id")
      .eq("tenant_id", RESELLER_SLUG)
      .single();

    if (resellerError || !reseller) {
      console.error("❌ Failed to fetch reseller:", resellerError);
      console.log("💡 Make sure you've run the seed script: supabase/seeds/003_test_reseller.sql");
      process.exit(1);
    }

    console.log(`✅ Found reseller: ${reseller.name} (ID: ${reseller.id})\n`);

    // Step 2: Get the user by email
    console.log("👤 Fetching user from auth.users...");
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();

    if (userError) {
      console.error("❌ Failed to list users:", userError);
      process.exit(1);
    }

    const testUser = users.find((u) => u.email === TEST_USER_EMAIL);

    if (!testUser) {
      console.error(`❌ User not found: ${TEST_USER_EMAIL}`);
      console.log("💡 Create the user first via sign-up or Supabase dashboard");
      process.exit(1);
    }

    console.log(`✅ Found user: ${testUser.email} (ID: ${testUser.id})\n`);

    // Step 3: Update user metadata
    console.log("🔐 Updating user app_metadata...");
    const { error: updateError } = await supabase.auth.admin.updateUserById(testUser.id, {
      app_metadata: {
        reseller_id: reseller.id,
        reseller_slug: reseller.tenant_id,
        role: "reseller",
      },
    });

    if (updateError) {
      console.error("❌ Failed to update user metadata:", updateError);
      process.exit(1);
    }

    console.log("✅ User metadata updated successfully!\n");

    // Step 4: Verify the update
    console.log("🔍 Verifying metadata...");
    const { data: { users: updatedUsers } } = await supabase.auth.admin.listUsers();
    const updatedUser = updatedUsers.find((u) => u.id === testUser.id);

    console.log("📋 User metadata:");
    console.log(JSON.stringify(updatedUser?.user_metadata, null, 2));

    // Step 5: Link in user_resellers table
    console.log("\n🔗 Linking user to reseller in user_resellers table...");
    const { error: linkError } = await supabase
      .from("user_resellers")
      .upsert({
        user_id: testUser.id,
        reseller_id: reseller.id,
        role: "admin",
        is_primary: true,
      }, {
        onConflict: "user_id,reseller_id"
      });

    if (linkError) {
      console.error("❌ Failed to link user:", linkError);
      console.log("⚠️  User metadata is set, but table link failed. This may be acceptable.");
    } else {
      console.log("✅ User linked to reseller in user_resellers table");
    }

    console.log("\n✨ Setup complete!");
    console.log(`\n📝 Test credentials:`);
    console.log(`   Email: ${TEST_USER_EMAIL}`);
    console.log(`   Password: TestPass123!`);
    console.log(`   Reseller: ${reseller.name}`);
    console.log(`   Redirect: /dashboard/reseller/${reseller.tenant_id}`);

  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

setupTestUser();
