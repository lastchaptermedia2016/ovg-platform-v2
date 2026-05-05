// Authentication diagnostics for troubleshooting login issues
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    console.log("OVG-PLATFORM-V2: Running authentication diagnostics...");
    
    // Check Environment Variables
    const envCheck = {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? "SET" : "MISSING",
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING",
      supabaseUrlLength: process.env.NEXT_PUBLIC_SUPABASE_URL?.length || 0,
      serviceRoleKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0
    };
    
    console.log("OVG-PLATFORM-V2: Environment check:", envCheck);
    
    // Test client connection
    let clientConnection = "FAILED";
    let adminConnection = "FAILED";
    
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.from('resellers').select('count').single();
      if (!error) {
        clientConnection = "SUCCESS";
      } else {
        clientConnection = `ERROR: ${error.message}`;
      }
    } catch (err) {
      clientConnection = `EXCEPTION: ${err}`;
    }
    
    // Test admin connection
    try {
      const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data, error } = await supabaseAdmin.from('resellers').select('count').single();
      if (!error) {
        adminConnection = "SUCCESS";
      } else {
        adminConnection = `ERROR: ${error.message}`;
      }
    } catch (err) {
      adminConnection = `EXCEPTION: ${err}`;
    }
    
    // Check specific user status
    const targetUserId = "ca8c0620-e2fc-420c-8d9a-bac06c24f28c";
    let userStatus = "NOT_FOUND";
    let userDetails = null;
    
    try {
      const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      
      if (!userError && userData.user) {
        userStatus = "FOUND";
        userDetails = {
          id: userData.user.id,
          email: userData.user.email,
          created_at: userData.user.created_at,
          last_sign_in_at: userData.user.last_sign_in_at,
          email_confirmed_at: userData.user.email_confirmed_at,
          phone_confirmed_at: userData.user.phone_confirmed_at,
          is_suspended: userData.user.banned_until !== null,
          user_metadata: userData.user.user_metadata,
          app_metadata: userData.user.app_metadata
        };
      } else if (userError) {
        userStatus = `ERROR: ${userError.message}`;
      }
    } catch (err) {
      userStatus = `EXCEPTION: ${err}`;
    }
    
    // Check reseller record
    let resellerStatus = "NOT_FOUND";
    try {
      const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      const { data: resellerData, error: resellerError } = await supabaseAdmin
        .from('resellers')
        .select('*')
        .eq('slug', 'lastchaptermedia2016')
        .single();
      
      if (!resellerError && resellerData) {
        resellerStatus = "FOUND";
      } else if (resellerError) {
        resellerStatus = `ERROR: ${resellerError.message}`;
      }
    } catch (err) {
      resellerStatus = `EXCEPTION: ${err}`;
    }
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: envCheck,
      connections: {
        client: clientConnection,
        admin: adminConnection
      },
      user: {
        targetId: targetUserId,
        status: userStatus,
        details: userDetails
      },
      reseller: {
        slug: 'lastchaptermedia2016',
        status: resellerStatus
      }
    };
    
    console.log("OVG-PLATFORM-V2: Diagnostics complete:", diagnostics);
    
    return NextResponse.json(diagnostics, { status: 200 });
    
  } catch (error) {
    console.error("OVG-PLATFORM-V2: Diagnostics error:", error);
    return NextResponse.json(
      { error: "Diagnostics failed", details: error },
      { status: 500 }
    );
  }
}
