/**
 * Live validation script for the public widget voice pipeline.
 * Tests each endpoint independently to confirm the full round-trip works.
 */

const fs = require('fs');
const path = require('path');

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const TENANT_ID = 'eca76a5b-de2a-41c9-b5e0-5ae7412ef835';

async function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateTestWav() {
  // Generate a minimal valid WAV file (16kHz mono 16-bit PCM, 1 second sine wave)
  const sampleRate = 16000;
  const duration = 1.0;
  const numSamples = Math.floor(sampleRate * duration);
  const frequency = 440; // A4 note
  const dataSize = numSamples * 2; // 16-bit
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45); // "WAVE"
  view.setUint8(12, 0x66); view.setUint8(13, 0x6D); view.setUint8(14, 0x74); view.setUint8(15, 0x20); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61); // "data"
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.5;
    const int16 = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    view.setInt16(44 + i * 2, int16, true);
  }

  const blob = Buffer.from(buffer);
  fs.writeFileSync(path.join(process.cwd(), 'test-tone.wav'), blob);
  return blob;
}

async function testSttEndpoint(audioBuffer) {
  console.log('\n🎯 Test 1: STT Endpoint (/api/ai/stt)');
  try {
    const formData = new FormData();
    const file = new File([audioBuffer], 'test.wav', { type: 'audio/wav' });
    formData.append('file', file);
    formData.append('tenantId', TENANT_ID);

    const response = await fetch(`${BASE}/api/ai/stt`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (response.ok) {
      console.log('✅ STT responded:', JSON.stringify(data).substring(0, 200));
      return data.text || null;
    } else {
      console.log('⚠️  STT returned error:', response.status, data);
      return null;
    }
  } catch (err) {
    console.log('❌ STT request failed:', err.message);
    return null;
  }
}

async function testProcessCommand(transcript) {
  console.log('\n🎯 Test 2: Process Command (/api/client/process-command)');
  try {
    const response = await fetch(`${BASE}/api/client/process-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: transcript || 'Hello',
        tenantId: TENANT_ID,
        context: { surface: 'chat-widget-embed' },
      }),
    });

    const data = await response.json();
    if (response.ok) {
      console.log('✅ Process-command responded:', JSON.stringify(data).substring(0, 200));
      return data;
    } else {
      console.log('⚠️  Process-command returned error:', response.status, data);
      return null;
    }
  } catch (err) {
    console.log('❌ Process-command request failed:', err.message);
    return null;
  }
}

async function testTtsEndpoint(text) {
  console.log('\n🎯 Test 3: TTS Endpoint (/api/ai/speech)');
  try {
    const response = await fetch(`${BASE}/api/ai/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text || 'Hello, this is a test.', voice: 'hannah' }),
    });

    if (response.ok) {
      const blob = await response.blob();
      console.log(`✅ TTS returned audio: ${blob.size} bytes, type: ${blob.type}`);
      return true;
    } else {
      const data = await response.json();
      console.log('⚠️  TTS returned error:', response.status, data);
      return false;
    }
  } catch (err) {
    console.log('❌ TTS request failed:', err.message);
    return false;
  }
}

async function testCorsHeaders() {
  console.log('\n🎯 Test 4: CORS Headers');
  try {
    const response = await fetch(`${BASE}/api/ai/speech`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3001',
        'Access-Control-Request-Method': 'POST',
      },
    });

    const corsHeader = response.headers.get('access-control-allow-origin');
    if (corsHeader === '*') {
      console.log('✅ CORS headers present:', corsHeader);
      return true;
    } else {
      console.log('❌ CORS header missing or incorrect:', corsHeader);
      return false;
    }
  } catch (err) {
    console.log('❌ CORS test failed:', err.message);
    return false;
  }
}

async function run() {
  console.log('🚀 Starting Live Voice Pipeline Validation');
  console.log('Base URL:', BASE);

  // Generate test audio
  const audioBuffer = await generateTestWav();
  console.log('📦 Generated test WAV:', audioBuffer.length, 'bytes');

  // Run tests
  const transcript = await testSttEndpoint(audioBuffer);
  const processResult = await testProcessCommand(transcript);
  const ttsOk = await testTtsEndpoint(processResult?.summary || processResult?.response);
  const corsOk = await testCorsHeaders();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log('STT Endpoint:           ', transcript ? '✅ PASS' : '⚠️  SKIP/FAIL');
  console.log('Process Command:        ', processResult ? '✅ PASS' : '⚠️  SKIP/FAIL');
  console.log('TTS Endpoint:           ', ttsOk ? '✅ PASS' : '❌ FAIL');
  console.log('CORS Headers:           ', corsOk ? '✅ PASS' : '❌ FAIL');
  console.log('='.repeat(60));

  if (transcript && processResult && ttsOk && corsOk) {
    console.log('\n🏆 Full pipeline validated successfully.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Partial validation. Review failures above.');
    process.exit(1);
  }
}

run();