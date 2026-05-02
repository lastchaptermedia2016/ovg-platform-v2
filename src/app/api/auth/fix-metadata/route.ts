// Production Excellence: Fix missing reseller_slug metadata for current user
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { fixUserResellerMetadata } from "@/lib/auth/fix-user-metadata";

export async function POST() {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 }
      );
    }
    
    // Check if user already has reseller_slug
    if (user.user_metadata?.reseller_slug) {
      return NextResponse.json(
        { message: "User already has reseller_slug metadata", slug: user.user_metadata.reseller_slug },
        { status: 200 }
      );
    }
    
    // Fix the metadata (server-side tenant creation)
    const result = await fixUserResellerMetadata(user.id, user.email || '');
    
    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to fix metadata", details: result.error },
        { status: 500 }
      );
    }
    
    // Create admin client with service role for metadata update
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Update user metadata with admin client
    const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: {
          reseller_slug: result.slug,
          role: 'reseller'
        }
      }
    );

    if (metaError) {
      console.error("OVG-PLATFORM-V2: Failed to update user metadata:", metaError);
      return NextResponse.json(
        { error: "Failed to update user metadata", details: metaError },
        { status: 500 }
      );
    }

    console.log("OVG-PLATFORM-V2: Successfully updated user metadata with slug:", result.slug);
    
    return NextResponse.json(
      { 
        message: "Metadata fixed successfully", 
        slug: result.slug
      },
      { status: 200 }
    );
    
  } catch (error) {
    console.error("OVG-PLATFORM-V2: Error in fix-metadata API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
