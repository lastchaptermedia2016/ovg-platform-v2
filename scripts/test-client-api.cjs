require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const https = require('https');

(async () => {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'lcmtest@gmail.com',
    password: 'TestPass123!'
  });
  
  if (error) {
    console.error('Sign in failed:', error.message);
    process.exit(1);
  }
  
  console.log('Signed in!');
  console.log('User ID:', data.user.id);
  console.log('Access token:', data.session.access_token.substring(0, 30) + '...');
  
  const token = data.session.access_token;
  
  // Test endpoints
  const endpoints = [
    { path: '/api/client/update-studio-config', method: 'POST', body: { tenantId: 'test', studioConfig: {} } },
    { path: '/api/client/process-command', method: 'POST', body: { text: 'update branding' } },
  ];
  
  for (const ep of endpoints) {
    await new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: ep.path,
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        }
      };
      
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.log('\n[' + ep.method + '] ' + ep.path);
          console.log('Status:', res.statusCode);
          console.log('Response:', body);
          resolve();
        });
      });
      
      req.on('error', (e) => {
        console.error('Request error:', e.message);
        reject(e);
      });
      
      req.write(JSON.stringify(ep.body));
      req.end();
    });
  }
})();
