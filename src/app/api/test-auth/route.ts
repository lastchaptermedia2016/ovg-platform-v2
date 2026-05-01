import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('Testing authentication...');
    
    // Test user session client
    const userClient = await createClient();
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    
    console.log('User session:', { user, error: userError });
    
    // Test service client
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data: testData, error: testError } = await serviceClient
      .from('tenants')
      .select('count')
      .limit(1);
    
    console.log('Service client test:', { data: testData, error: testError });
    
    return NextResponse.json({
      userSession: {
        hasUser: !!user,
        error: userError?.message
      },
      serviceClient: {
        working: !testError,
        error: testError?.message,
        envVars: {
          hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
        }
      }
    });
    
  } catch (error: any) {
    console.error('Auth test error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
