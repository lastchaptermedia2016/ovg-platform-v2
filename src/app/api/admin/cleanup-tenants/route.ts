// Admin API to clean up tenant entries for testing
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { resellerSlug, cleanupTestEntries } = await request.json();
    
    if (!resellerSlug) {
      return NextResponse.json(
        { error: "resellerSlug is required" },
        { status: 400 }
      );
    }

    // Create admin client with service role
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get reseller ID first
    const { data: reseller, error: resellerError } = await supabaseAdmin
      .from('resellers')
      .select('id')
      .eq('slug', resellerSlug)
      .single();
    
    if (resellerError || !reseller) {
      return NextResponse.json(
        { error: "Reseller not found", details: resellerError },
        { status: 404 }
      );
    }

    console.log('OVG-PLATFORM-V2: Cleaning up tenants for reseller:', {
      resellerSlug,
      resellerId: reseller.id,
      cleanupTestEntries
    });

    // Delete all tenants for this reseller
    const { data: deletedTenants, error: deleteError } = await supabaseAdmin
      .from('tenants')
      .delete()
      .eq('reseller_id', reseller.id)
      .select('id, name, reseller_id');

    if (deleteError) {
      console.error('OVG-PLATFORM-V2: Error deleting tenants:', deleteError);
      return NextResponse.json(
        { error: "Failed to delete tenants", details: deleteError },
        { status: 500 }
      );
    }

    console.log('OVG-PLATFORM-V2: Successfully deleted tenants:', deletedTenants);

    // Database Cleanup: Remove test entries that might cause conflicts
    let testEntriesDeleted = [];
    if (cleanupTestEntries) {
      const testPatterns = ['WhiteChapter', 'OVG test', 'test client', 'Test', 'lastchaptermedia2016'];
      for (const pattern of testPatterns) {
        const { data: testEntries, error: testError } = await supabaseAdmin
          .from('tenants')
          .delete()
          .ilike('name', `%${pattern}%`)
          .select('id, name');
        
        if (!testError && testEntries) {
          testEntriesDeleted.push(...testEntries);
          console.log(`OVG-PLATFORM-V2: Deleted test entries matching "${pattern}":`, testEntries);
        }
      }
      
      // Table Cleanup: Specifically delete lastchaptermedia2016 from tenants table
      const { data: lastchapterEntries, error: lastchapterError } = await supabaseAdmin
        .from('tenants')
        .delete()
        .ilike('name', '%lastchaptermedia2016%')
        .select('id, name, reseller_id');
      
      if (!lastchapterError && lastchapterEntries) {
        testEntriesDeleted.push(...lastchapterEntries);
        console.log('OVG-PLATFORM-V2: Deleted lastchaptermedia2016 from tenants table:', lastchapterEntries);
      }
    }

    return NextResponse.json({
      message: "Table cleanup completed",
      resellerSlug,
      resellerId: reseller.id,
      deletedCount: deletedTenants?.length || 0,
      deletedTenants,
      testEntriesDeleted: testEntriesDeleted.length
    }, { status: 200 });
    
  } catch (error) {
    console.error('OVG-PLATFORM-V2: Error in cleanup API:', error);
    return NextResponse.json(
      { error: "Internal server error", details: error },
      { status: 500 }
    );
  }
}
