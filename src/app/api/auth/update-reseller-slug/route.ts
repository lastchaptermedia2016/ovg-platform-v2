// Update user reseller_slug metadata for authorized reseller change
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { newSlug } = await request.json();
    
    if (!newSlug || typeof newSlug !== 'string') {
      return NextResponse.json(
        { error: "Invalid newSlug parameter" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 }
      );
    }

    // Verify the new slug exists in resellers table
    const { data: resellerData, error: resellerError } = await supabase
      .from('resellers')
      .select('id, tenant_id')
      .eq('tenant_id', newSlug)
      .single();
    
    if (resellerError || !resellerData) {
      return NextResponse.json(
        { error: "Target reseller slug not found in database" },
        { status: 404 }
      );
    }

    // Create admin client with service role for metadata update
    // supabaseAdmin is imported from @/lib/supabase/admin

    // Update user metadata with new reseller slug
    const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: {
          ...user.user_metadata,
          reseller_slug: newSlug,
          role: 'reseller'
        }
      }
    );

    if (metaError) {
      console.error("OVG-PLATFORM-V2: Failed to update user reseller_slug:", metaError);
      return NextResponse.json(
        { error: "Failed to update user metadata", details: metaError },
        { status: 500 }
      );
    }

    console.log("OVG-PLATFORM-V2: Successfully updated user reseller_slug from", 
      user.user_metadata?.reseller_slug, "to", newSlug, "for user", user.id);
    
    return NextResponse.json(
      { 
        message: "Reseller slug updated successfully", 
        oldSlug: user.user_metadata?.reseller_slug,
        newSlug: newSlug
      },
      { status: 200 }
    );
    
  } catch (error) {
    console.error("OVG-PLATFORM-V2: Error in update-reseller-slug API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
