import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// Request validation schema
const UpdateConfigSchema = z.object({
  tenantId: z.string().uuid(),
  configPatch: z.record(z.any()),
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = UpdateConfigSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request parameters', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tenantId, configPatch } = validationResult.data;

    // Transaction Logging
    console.log('=== UPDATE CONFIG REQUEST ===');
    console.log('tenantId:', tenantId);
    console.log('configPatch:', JSON.stringify(configPatch, null, 2));
    console.log('timestamp:', new Date().toISOString());

    // Initialize Supabase client
    const supabase = await createClient();

    // Update tenant configuration
    // Merge with existing widget_config
    const { data: existingTenant, error: fetchError } = await supabase
      .from('tenants')
      .select('widget_config')
      .eq('id', tenantId)
      .single();

    if (fetchError) {
      console.error('=== FETCH TENANT ERROR ===');
      console.error('Error object:', JSON.stringify(fetchError, null, 2));
      console.error('Error code:', fetchError.code);
      console.error('Error message:', fetchError.message);
      console.error('Error details:', fetchError.details);
      
      // Check for column not found error (42703)
      if (fetchError.message?.includes('widget_config')) {
        console.error('=== SCHEMA MISMATCH DETECTED ===');
        console.error('Column widget_config may not exist. Check tenants table schema.');
      }
      
      // Check if it's a "not found" error
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Tenant record not found in database.', 
            code: 'NOT_FOUND', 
            details: null 
          },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to fetch tenant configuration', 
          code: fetchError.code, 
          details: fetchError.message 
        },
        { status: 500 }
      );
    }

    // Safety Check: Verify tenant exists
    if (!existingTenant) {
      console.error('=== TENANT NOT FOUND ===');
      console.error('No tenant returned for tenantId:', tenantId);
      return NextResponse.json(
        { success: false, error: 'Tenant record not found in database.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    console.log('=== EXISTING TENANT FETCHED ===');
    console.log('Existing widget_config:', JSON.stringify(existingTenant.widget_config, null, 2));

    // Merge existing config with new patch
    const mergedConfig = {
      ...(existingTenant?.widget_config || {}),
      ...configPatch,
      // Deep merge for nested objects like theme, behavior, ui
      theme: {
        ...(existingTenant?.widget_config?.theme || {}),
        ...(configPatch.theme || {}),
      },
      behavior: {
        ...(existingTenant?.widget_config?.behavior || {}),
        ...(configPatch.behavior || {}),
      },
      ui: {
        ...(existingTenant?.widget_config?.ui || {}),
        ...(configPatch.ui || {}),
      },
      updatedAt: new Date().toISOString(),
      updatedBy: 'ai-intelligence',
    };

    // Apply the update
    console.log('=== APPLYING UPDATE ===');
    console.log('Merged config:', JSON.stringify(mergedConfig, null, 2));

    const { data: updateData, error: updateError, count } = await supabase
      .from('tenants')
      .update({
        widget_config: mergedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)
      .select();

    if (updateError) {
      console.error('=== UPDATE ERROR ===');
      console.error('Error object:', JSON.stringify(updateError, null, 2));
      console.error('Error code:', updateError.code);
      console.error('Error message:', updateError.message);
      console.error('Error details:', updateError.details);
      console.error('Error hint:', updateError.hint);
      
      // Check for column not found error (42703)
      if (updateError.code === '42703' || updateError.message?.includes('widget_config')) {
        console.error('=== SCHEMA MISMATCH DETECTED ===');
        console.error('Attempted to update column: widget_config');
        console.error('Available columns in tenants table may differ.');
        console.error('Full error:', updateError);
        
        return NextResponse.json(
          { 
            success: false,
            error: 'Database schema mismatch: widget_config column not found', 
            code: 'SCHEMA_ERROR',
            details: updateError.message,
            attemptedColumn: 'widget_config'
          },
          { status: 500 }
        );
      }
      
      // Determine appropriate status code
      let statusCode = 500;
      if (updateError.code === 'PGRST116') {
        statusCode = 404; // Not found
      } else if (updateError.code?.includes('auth') || updateError.code?.includes('JWT')) {
        statusCode = 401; // Unauthorized
      }
      
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to apply configuration update', 
          code: updateError.code,
          details: updateError.message 
        },
        { status: statusCode }
      );
    }

    // Check if any rows were affected
    if (!updateData || updateData.length === 0) {
      console.error('=== NO ROWS UPDATED ===');
      console.error('Update returned 0 rows affected for tenantId:', tenantId);
      return NextResponse.json(
        { success: false, error: 'Tenant record not found in database.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    console.log('=== UPDATE SUCCESS ===');
    console.log('Rows updated:', updateData.length);
    console.log('Updated data:', JSON.stringify(updateData, null, 2));

    return NextResponse.json({
      success: true,
      message: 'Configuration updated successfully',
      data: {
        tenantId,
        appliedAt: new Date().toISOString(),
        rowsAffected: updateData.length,
      }
    });

  } catch (error: any) {
    console.error('=== UNEXPECTED ERROR ===');
    console.error('Error:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
