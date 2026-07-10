require('dotenv').config({ path: '.env.local' });
const { createBrowserClient } = require('@supabase/ssr');
const http = require('http');

const cookies = new Map();
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    cookies: {
      getAll() { return Array.from(cookies.values()).map(c => ({ name: c.name, value: c.value, options: c.options })); },
      setAll(cookiesToSet) { cookiesToSet.forEach(c => cookies.set(c.name, c)); }
    }
  }
);

const TENANT_ID = '4c8944d2-2ea4-4fb7-852e-2af0e24738ff';

async function request(path, method, body) {
  const postData = body ? JSON.stringify(body) : null;
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: path,
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': Array.from(cookies.values()).map(c => c.name + '=' + c.value).join('; '),
      ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

(async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'lcmtest@gmail.com',
    password: 'TestPass123!'
  });
  if (error) { console.error('Sign in failed:', error.message); process.exit(1); }
  console.log('✅ Signed in as:', data.user.email);

  // Test 1: Process command
  console.log('\n--- Test: POST /api/client/process-command ---');
  const cmdRes = await request('/api/client/process-command', 'POST', { text: 'update branding' });
  console.log('Status:', cmdRes.status);
  console.log('Body:', cmdRes.body);

  // Test 2: Update studio config with branding (layer type 'none' should clear legacy fields)
  console.log('\n--- Test: POST /api/client/update-studio-config (branding with none layers) ---');
  const brandingPayload = {
    tenantId: TENANT_ID,
    studioConfig: {
      branding: {
        primaryColor: '#00FF00',
        logoUrl: 'https://example.com/new-logo.png',
        widgetPosition: 'bottom-left',
        header: { type: 'none', value: null, opacity: 1, backdropBlur: false },
        footer: { type: 'none', value: null, opacity: 1, backdropBlur: false },
        widgetBody: { type: 'none', value: null, opacity: 1, backdropBlur: false },
        headerConfig: { type: 'none' },
        footerConfig: { type: 'none' },
        widgetBodyOpacity: null,
        widgetBodyBackground: null
      }
    }
  };
  const studioRes = await request('/api/client/update-studio-config', 'POST', brandingPayload);
  console.log('Status:', studioRes.status);
  console.log('Body:', studioRes.body);

  // Test 3: Update studio config with persona
  console.log('\n--- Test: POST /api/client/update-studio-config (persona) ---');
  const personaPayload = {
    tenantId: TENANT_ID,
    studioConfig: {
      aiPersona: {
        personaMode: 'concierge',
        systemPrompt: 'You are a helpful concierge.',
        temperature: 0.7,
        voiceId: '21m00Tcm4TlvDq8ikWAM'
      }
    }
  };
  const personaRes = await request('/api/client/update-studio-config', 'POST', personaPayload);
  console.log('Status:', personaRes.status);
  console.log('Body:', personaRes.body);

  // Test 4: Page loads
  console.log('\n--- Test: GET /client/dashboard ---');
  const dashRes = await request('/client/dashboard', 'GET');
  console.log('Status:', dashRes.status);

  console.log('\n--- Test: GET /client/dashboard/studio/branding ---');
  const brandRes = await request('/client/dashboard/studio/branding', 'GET');
  console.log('Status:', brandRes.status);

  console.log('\n--- Test: GET /client/dashboard/studio/persona ---');
  const personaPageRes = await request('/client/dashboard/studio/persona', 'GET');
  console.log('Status:', personaPageRes.status);

  // Test 5: Verify database state after save
  console.log('\n--- Test: Verify database state ---');
  const admin = require('@supabase/supabase-js').createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: tenant } = await admin.from('tenants').select('widget_config').eq('id', TENANT_ID).single();
  console.log('widget_config exists:', !!tenant?.widget_config);
  if (tenant?.widget_config) {
    const wc = tenant.widget_config;
    console.log('branding.primaryColor:', wc.branding?.primaryColor);
    console.log('branding.headerConfig:', JSON.stringify(wc.branding?.headerConfig));
    console.log('branding.footerConfig:', JSON.stringify(wc.branding?.footerConfig));
    console.log('branding.widgetBodyOpacity:', wc.branding?.widgetBodyOpacity);
    console.log('branding.widgetBodyBackground:', wc.branding?.widgetBodyBackground);
    console.log('aiPersona.personaMode:', wc.aiPersona?.personaMode);
  }

  // Check reseller propagation
  const { data: tenantRow } = await admin.from('tenants').select('reseller_id').eq('id', TENANT_ID).single();
  if (tenantRow) {
    const { data: reseller } = await admin.from('resellers').select('branding_bag, branding_color, accent_color, logo_url').eq('id', tenantRow.reseller_id).single();
    console.log('\nReseller propagation:');
    console.log('branding_bag:', JSON.stringify(reseller?.branding_bag));
    console.log('branding_color:', reseller?.branding_color);
    console.log('accent_color:', reseller?.accent_color);
    console.log('logo_url:', reseller?.logo_url);
  }

  console.log('\n✅ All tests completed');
})();
