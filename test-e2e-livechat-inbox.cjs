/**
 * E2E verification for LiveChatInbox v1.
 *
 * Verifies:
 *  1. Per-conversation name resolution
 *  2. Unread badges in API response
 *  3. Mark-as-read persists
 *  4. Mute/resume via shared helper
 *  5. Agent send with auto-mute
 *  6. Mute state in widget messages response
 */

const SUPABASE_URL = 'https://lfmrdaeuwfhguqghqrto.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbXJkYWV1d2ZoZ3VxZ2hxcnRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjY0MjMzMSwiZXhwIjoyMDkyMjE4MzMxfQ.zj7bCfgAFCnEX6XlBWlH1aZdjXWUB2nkfArOtDgBnxk';

const { createClient } = require('@supabase/supabase-js');
const supabaseAuth = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const API_BASE = 'http://localhost:3001';

const TEST_EMAIL = 'e2e-livechat-test@example.com';
const TEST_PASSWORD = 'test-password-123';

let pass = 0;
let fail = 0;
  function assert(condition, label) {
    if (condition) {
      console.log(`  PASS: ${label}`);
      pass++;
    } else {
      console.error(`  FAIL: ${label}`);
      fail++;
    }
  }

async function ensureTestUser() {
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  const found = existing?.users?.find((u) => u.email === TEST_EMAIL);
  if (found) return found;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

async function loginAsTestUser() {
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) throw error;
  return data;
}

async function setupTenant() {
  const { data: existing, error } = await supabaseAdmin.from('tenants').select('id').limit(1).maybeSingle();
  console.log('setupTenant existing:', JSON.stringify(existing), 'error:', error?.message);
  if (existing?.id) return existing.id;
  throw new Error('No existing tenant found in database — create one manually before running E2E');
}

async function cleanup(tenantId, convA, convB) {
  for (const id of [convA, convB]) {
    await supabaseAdmin.from('chat_messages').delete().eq('conversation_id', id);
    await supabaseAdmin.from('conversation_mute_state').delete().eq('conversation_id', id);
    await supabaseAdmin.from('conversation_read_state').delete().eq('conversation_id', id);
  }
  await supabaseAdmin.from('visitor_memories').delete().eq('tenant_id', tenantId);
  await supabaseAdmin.from('tenant_appointments').delete().eq('tenant_id', tenantId);
}

async function run() {
  console.log('\n=== LiveChatInbox v1 E2E ===');

  const user = await ensureTestUser();
  const session = await loginAsTestUser();
  const tenantId = await setupTenant();
  console.log(`Tenant: ${tenantId}, User: ${user.id}`);

    const convA = crypto.randomUUID();
    const convB = crypto.randomUUID();
    console.log(`convA=${convA}, convB=${convB}`);

  const authFetch = async (input, init = {}) => {
    const token = session?.session?.access_token;
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    };
    const res = await fetch(`${API_BASE}${input}`, {
      ...init,
      headers,
    });
    return res;
  };

  try {
    await supabaseAdmin.from('visitor_memories').insert({
      tenant_id: tenantId,
      identity_type: 'phone',
      identity_value: '+27123456789',
      memory_key: 'client_name',
      memory_value: 'Alice',
    });

    await supabaseAdmin.from('tenant_appointments').insert({
      tenant_id: tenantId,
      client_name: 'Bob',
      client_phone: '+27987654321',
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 3600000).toISOString(),
      status: 'LEAD',
    });

    await supabaseAdmin.from('chat_messages').insert([
      { tenant_id: tenantId, conversation_id: convA, role: 'visitor', message: 'Hi, my number is +27123456789' },
      { tenant_id: tenantId, conversation_id: convA, role: 'visitor', message: 'I need help' },
      { tenant_id: tenantId, conversation_id: convB, role: 'visitor', message: 'Hello from +27987654321' },
    ]);

    console.log('\n--- Step 1: Per-conversation name resolution ---');
    const convRes = await authFetch(`/api/chat/conversations?tenantId=${tenantId}`);
    const convData = await convRes.json();
    const list = convData.conversations || [];

    const convAitem = list.find((c) => c.id === convA);
    const convBitem = list.find((c) => c.id === convB);

    assert(!!convAitem, 'Conversation A exists in list');
    assert(!!convBitem, 'Conversation B exists in list');
    assert(convAitem?.label.includes('27123456789'), `Conv A label includes phone: ${convAitem?.label}`);
    assert(convBitem?.label.includes('Bob'), `Conv B label has Bob: ${convBitem?.label}`);
    assert(!convBitem?.label.includes('Alice'), `Conv B label does NOT include Alice: ${convBitem?.label}`);

    console.log('\n--- Step 2: Unread state ---');
    const unreadA = convAitem?.hasUnread;
    const unreadB = convBitem?.hasUnread;
    assert(unreadA === true || unreadB === true, 'At least one conversation has unread');

    console.log('\n--- Step 3: Mark as read persists ---');
    const { data: diagMsgs } = await supabaseAdmin
      .from('chat_messages')
      .select('conversation_id, tenant_id')
      .eq('conversation_id', convA);
    console.log('  diag:', JSON.stringify(diagMsgs));

    const patchRes = await authFetch(`/api/chat/conversations/read`, {
      method: 'PATCH',
      body: JSON.stringify({ tenantId: tenantId, conversationId: convA }),
    });
    const patchBody = await patchRes.text();
    console.log('  read status:', patchRes.status, 'body:', patchBody.slice(0, 200));
    assert(patchRes.ok, 'PATCH /read returns 200');

    const convRes2 = await authFetch(`/api/chat/conversations?tenantId=${tenantId}`);
    const convData2 = await convRes2.json();
    const list2 = convData2.conversations || [];
    const convAitem2 = list2.find((c) => c.id === convA);
    assert(convAitem2?.hasUnread === false, 'Conversation A is no longer unread after mark-as-read');

    console.log('\n--- Step 4: Mute/resume with shared helper ---');
    const muteRes = await authFetch(`/api/chat/mute`, {
      method: 'POST',
      body: JSON.stringify({ tenantId: tenantId, conversationId: convA, action: 'mute', minutes: 30 }),
    });
    const muteBody = await muteRes.text();
    console.log('  mute status:', muteRes.status, 'body:', muteBody.slice(0, 200));
    assert(muteRes.ok, 'POST /api/chat/mute mute returns 200');

    const { data: muteRow } = await supabaseAdmin
      .from('conversation_mute_state')
      .select('is_ai_muted, is_human_taking_over, scheduled_reenable_at')
      .eq('conversation_id', convA)
      .maybeSingle();

    assert(muteRow?.is_ai_muted === true, 'Mute state is_ai_muted is true');
    assert(muteRow?.is_human_taking_over === true, 'Mute state is_human_taking_over is true');
    assert(!!muteRow?.scheduled_reenable_at, 'Mute state has scheduled_reenable_at');

    const resumeRes = await authFetch(`/api/chat/mute`, {
      method: 'POST',
      body: JSON.stringify({ tenantId: tenantId, conversationId: convA, action: 'resume' }),
    });
    assert(resumeRes.ok, 'POST /api/chat/mute resume returns 200');

    const { data: resumedRow } = await supabaseAdmin
      .from('conversation_mute_state')
      .select('is_ai_muted, is_human_taking_over, scheduled_reenable_at')
      .eq('conversation_id', convA)
      .maybeSingle();

    assert(resumedRow?.is_ai_muted === false, 'Resume clears is_ai_muted');
    assert(resumedRow?.is_human_taking_over === false, 'Resume clears is_human_taking_over');
    assert(resumedRow?.scheduled_reenable_at === null, 'Resume clears scheduled_reenable_at');

    console.log('\n--- Step 5: Widget resume via shared helper ---');
    const widgetResumeRes = await authFetch(`/api/widget/chat/resume`, {
      method: 'POST',
      body: JSON.stringify({ tenantId: tenantId, conversationId: convA }),
    });
    const widgetResumeBody = await widgetResumeRes.text();
    console.log('  widget resume status:', widgetResumeRes.status, 'body:', widgetResumeBody.slice(0, 200));
    assert(widgetResumeRes.ok, 'Widget resume endpoint still works');

    const { data: finalRow } = await supabaseAdmin
      .from('conversation_mute_state')
      .select('is_ai_muted, is_human_taking_over')
      .eq('conversation_id', convA)
      .maybeSingle();

    assert(finalRow?.is_ai_muted === false, 'Widget resume leaves AI unmuted');
    assert(finalRow?.is_human_taking_over === false, 'Widget resume unmarks human taking over');

    console.log('\n--- Step 6: Agent send with auto-mute ---');
    const sendRes = await authFetch(`/api/chat/send`, {
      method: 'POST',
      body: JSON.stringify({ tenantId: tenantId, message: 'Hello from agent', conversationId: convB }),
    });
    const sendBody = await sendRes.text();
    console.log('  send status:', sendRes.status, 'body:', sendBody.slice(0, 200));
    assert(sendRes.ok, 'Agent send returns 200');

    const { data: sentMsg } = await supabaseAdmin
      .from('chat_messages')
      .select('role, conversation_id, message')
      .eq('conversation_id', convB)
      .eq('role', 'agent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    assert(sentMsg?.message === 'Hello from agent', 'Agent message persisted');
    assert(sentMsg?.conversation_id === convB, 'Agent message in correct conversation');

    const { data: muteAfterSend } = await supabaseAdmin
      .from('conversation_mute_state')
      .select('is_ai_muted, is_human_taking_over')
      .eq('conversation_id', convB)
      .maybeSingle();

    assert(muteAfterSend?.is_ai_muted === true, 'Send auto-mutes AI');
    assert(muteAfterSend?.is_human_taking_over === true, 'Send marks human taking over');

    console.log('\n--- Step 7: Name resolution in message endpoint ---');
    const msgRes = await authFetch(`/api/widget/chat/messages?tenantId=${tenantId}&conversationId=${convA}`);
    const msgData = await msgRes.json();
    assert(Array.isArray(msgData.messages), 'Messages endpoint returns array');
    assert(msgData.messages.length > 0, 'Messages exist for conversation A');
    assert(msgData.muteState !== undefined, 'Mute state present in messages response');

    console.log('\n=== RESULTS ===');
    console.log(`Passed: ${pass}`);
    console.log(`Failed: ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
  } finally {
    await cleanup(tenantId, convA, convB);
  }
}

run().catch((err) => {
  console.error('E2E failed:', err);
  process.exit(1);
});
