// Create reseller record with service role permissions
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { slug, name } = await request.json();
    
    if (!slug || !name) {
      return NextResponse.json(
        { error: "Missing required fields: slug and name" },
        { status: 400 }
      );
    }

    // Validation Check: Ensure slug meets format requirements
    const slugValidation = {
      length: slug.length,
      hasSpecialChars: /[^a-z0-9-]/.test(slug),
      startsWithNumber: /^\d/.test(slug),
      endsWithHyphen: /-$/.test(slug),
      hasConsecutiveHyphens: /--/.test(slug)
    };
    
    console.log('OVG-PLATFORM-V2: API creating reseller with validation:', { slug, name, validation: slugValidation });
    
    if (slugValidation.hasSpecialChars || slugValidation.startsWithNumber || slugValidation.endsWithHyphen || slugValidation.hasConsecutiveHyphens) {
      return NextResponse.json(
        { error: "Invalid slug format", validation: slugValidation },
        { status: 400 }
      );
    }

    // Create admin client with service role for bypassing RLS
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if reseller already exists
    const { data: existingReseller, error: checkError } = await supabaseAdmin
      .from('resellers')
      .select('id, slug')
      .eq('slug', slug)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('OVG-PLATFORM-V2: Error checking existing reseller:', checkError);
      return NextResponse.json(
        { error: "Database error checking existing reseller", details: checkError },
        { status: 500 }
      );
    }
    
    if (existingReseller) {
      console.log('OVG-PLATFORM-V2: Reseller already exists:', existingReseller);
      return NextResponse.json(
        { message: "Reseller already exists", reseller: existingReseller },
        { status: 200 }
      );
    }

    // Create the reseller record with service role - include potential required fields
    const payload = {
      slug: slug,
      name: name,
      created_at: new Date().toISOString(),
      // Add potential required fields that might be missing
      primary_contact: null,
      billing_email: null,
      phone: null,
      address: null,
      status: 'active',
      subscription_tier: 'basic'
    };
    
    console.log('OVG-PLATFORM-V2: Creating reseller with payload:', payload);
    
    const { data: newReseller, error: createError } = await supabaseAdmin
      .from('resellers')
      .insert(payload)
      .select('id, slug, name, created_at')
      .single();

    if (createError) {
      console.error('OVG-PLATFORM-V2: Failed to create reseller:', {
        error: createError,
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint,
        payload
      });
      
      // Check for specific error types
      if (createError.code === '42501') {
        return NextResponse.json(
          { error: "INSUFFICIENT PRIVILEGE - Service role key may be invalid", details: createError },
          { status: 500 }
        );
      } else if (createError.code === '23505') {
        return NextResponse.json(
          { error: "DUPLICATE KEY VIOLATION - Reseller already exists", details: createError },
          { status: 409 }
        );
      } else if (createError.code === '23514') {
        return NextResponse.json(
          { error: "CHECK CONSTRAINT VIOLATION - Invalid data format", details: createError },
          { status: 400 }
        );
      } else if (createError.code === '23503') {
        return NextResponse.json(
          { error: "FOREIGN KEY VIOLATION - Referenced record missing", details: createError },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { error: "Failed to create reseller", details: createError },
        { status: 500 }
      );
    }

    console.log('OVG-PLATFORM-V2: Successfully created reseller:', newReseller);
    
    return NextResponse.json(
      { 
        message: "Reseller created successfully", 
        reseller: newReseller
      },
      { status: 201 }
    );
    
  } catch (error) {
    console.error('OVG-PLATFORM-V2: Error in create reseller API:', error);
    return NextResponse.json(
      { error: "Internal server error", details: error },
      { status: 500 }
    );
  }
}
