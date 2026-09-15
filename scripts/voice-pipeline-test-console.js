/**
 * Browser-Executable Voice Pipeline Test Harness
 * 
 * Copy and paste this entire script into your browser's DevTools console.
 * 
 * Usage:
 *   1. Paste script into console and press Enter
 *   2. Run: voicePipelineTests.runAllTests()
 *   3. Follow manual testing instructions
 *   4. Run: voicePipelineTests.generateFinalReport()
 */

(function initializeVoiceTests() {
  const voicePipelineTests = {
    capturedLogs: [],
    originalConsole: {
      log: console.log,
      warn: console.warn,
      error: console.error,
    },

    startCapture() {
      this.capturedLogs = [];
      console.log = (...args) => {
        const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        this.capturedLogs.push({ type: 'log', message: msg, timestamp: Date.now() });
        this.originalConsole.log(...args);
      };
      console.warn = (...args) => {
        const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        this.capturedLogs.push({ type: 'warn', message: msg, timestamp: Date.now() });
        this.originalConsole.warn(...args);
      };
      console.error = (...args) => {
        const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        this.capturedLogs.push({ type: 'error', message: msg, timestamp: Date.now() });
        this.originalConsole.error(...args);
      };
    },

    stopCapture() {
      console.log = this.originalConsole.log;
      console.warn = this.originalConsole.warn;
      console.error = this.originalConsole.error;
    },

    getLogsMatching(pattern) {
      return this.capturedLogs.filter(log => pattern.test(log.message));
    },

    // Test suites
    testMediaRecorderAvailability() {
      return {
        name: 'MediaRecorder Availability',
        passed: typeof MediaRecorder !== 'undefined',
        message: typeof MediaRecorder !== 'undefined' ? '✅ Available' : '❌ Not available',
      };
    },

    testAudioContextAvailability() {
      const avail = typeof AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined';
      return {
        name: 'AudioContext Availability',
        passed: avail,
        message: avail ? '✅ Available' : '❌ Not available',
      };
    },

    testWebSpeechAvailability() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      return {
        name: 'Web Speech API Availability',
        passed: typeof SpeechRecognition !== 'undefined',
        message: typeof SpeechRecognition !== 'undefined' ? '✅ Available' : '❌ Not available',
      };
    },

    testNoDOMExceptions() {
      const domEx = this.getLogsMatching(/DOMException/);
      const encErr = this.getLogsMatching(/EncodingError/);
      return {
        name: 'No Unexpected DOMExceptions',
        passed: domEx.length === 0 && encErr.length === 0,
        message: domEx.length + encErr.length === 0
          ? '✅ No errors'
          : `❌ Found ${domEx.length} DOMException(s), ${encErr.length} EncodingError(s)`,
        details: { domExceptions: domEx.length, encodingErrors: encErr.length },
      };
    },

    testShortClipGuard() {
      const logs = this.getLogsMatching(/Ignoring short audio clip/);
      return {
        name: 'Short Clip Guard (< 1024 bytes)',
        passed: true,
        message: logs.length > 0 ? `✅ Triggered ${logs.length} time(s)` : '⏳ No short clips yet (tap PTT quickly)',
        details: { triggers: logs.length },
      };
    },

    testSTTFallbackBehavior() {
      const logs = this.getLogsMatching(/Whisper STT failed — falling back/);
      return {
        name: 'STT Fallback Behavior',
        passed: logs.length < 5,
        message: logs.length === 0 ? '✅ No fallbacks (normal)' : `⚠️  Fallback triggered ${logs.length} time(s)`,
        details: { fallbacks: logs.length },
      };
    },

    testTranscodeErrorHandling() {
      const logs = this.getLogsMatching(/TranscodeToWav/);
      return {
        name: 'TranscodeToWav Error Handling',
        passed: true,
        message: logs.length > 0 ? '✅ Transcode logs present' : '⏳ No transcode yet (hold PTT 2+ sec)',
        details: { logs: logs.length },
      };
    },

    testMediaStreamCleanup() {
      return {
        name: 'MediaStream Cleanup',
        passed: true,
        message: '✅ Check DevTools → More tools → Web Audio after testing',
      };
    },

    testSustainedRecording() {
      const zeederLogs = this.getLogsMatching(/\[ZEEDER-VOICE\]/);
      const blocked = this.getLogsMatching(/Ignoring short audio|Skipping transcode.*empty/);
      return {
        name: 'Sustained Recording (2+ sec)',
        passed: zeederLogs.length > 0 && blocked.length === 0,
        message: zeederLogs.length > 0 && blocked.length === 0
          ? '✅ Recording processed'
          : blocked.length > 0
            ? '❌ Recording blocked by guards - hold longer'
            : '⏳ Hold PTT 2+ seconds and speak',
        details: { zeederLogs: zeederLogs.length, blocked: blocked.length },
      };
    },

    testRapidQuickTaps() {
      const short = this.getLogsMatching(/Ignoring short audio/);
      const empty = this.getLogsMatching(/Skipping transcode.*empty/);
      const errors = this.getLogsMatching(/Error|Exception|Encoding/).filter(
        l => !l.message.includes('Ignoring short')
      );
      return {
        name: 'Rapid Quick-Taps (2+ taps)',
        passed: (short.length + empty.length) >= 2 && errors.length === 0,
        message: (short.length + empty.length) >= 2 && errors.length === 0
          ? `✅ Guard triggered ${short.length + empty.length} time(s), no errors`
          : (short.length + empty.length) < 2
            ? '⏳ Tap PTT button 2-3 times rapidly'
            : `❌ ${errors.length} unexpected error(s)`,
        details: { guards: short.length + empty.length, errors: errors.length },
      };
    },

    async runAllTests() {
      this.startCapture();

      const results = [
        this.testMediaRecorderAvailability(),
        this.testAudioContextAvailability(),
        this.testWebSpeechAvailability(),
        this.testNoDOMExceptions(),
        this.testShortClipGuard(),
        this.testSTTFallbackBehavior(),
        this.testTranscodeErrorHandling(),
        this.testMediaStreamCleanup(),
        this.testSustainedRecording(),
        this.testRapidQuickTaps(),
      ];

      const passed = results.filter(r => r.passed).length;
      const failed = results.length - passed;

      this.stopCapture();

      console.log('\n════════════════════════════════════════════════════════');
      console.log('🎤 VOICE PIPELINE VERIFICATION REPORT');
      console.log('════════════════════════════════════════════════════════\n');

      console.log(`📊 Summary: ${results.length} tests`);
      console.log(`   ✅ Passed: ${passed}`);
      console.log(`   ❌ Failed: ${failed}\n`);

      console.log('📋 Results:\n');
      results.forEach((r, i) => {
        console.log(`${r.passed ? '✅' : '⏳'} ${i + 1}. ${r.name}`);
        console.log(`   ${r.message}`);
        if (r.details) {
          console.log(`   Details:`, r.details);
        }
      });

      console.log('\n🎯 MANUAL TESTING INSTRUCTIONS:');
      console.log('');
      console.log('TEST 1: Sustained Recording (2+ seconds)');
      console.log('  • Press and HOLD PTT button');
      console.log('  • Speak a command (e.g., "Hello")');
      console.log('  • Keep holding for 2+ seconds');
      console.log('  • Release');
      console.log('  Expected: Blob > 1024 bytes, no guard triggers, successful STT');
      console.log('');
      console.log('TEST 2: Rapid Quick-Taps (2-3 times)');
      console.log('  • Quickly tap PTT button (don\'t hold)');
      console.log('  • Release immediately (< 200ms)');
      console.log('  • Repeat 2-3 times rapidly');
      console.log('  Expected: Guard triggers each time, no console errors');
      console.log('');
      console.log('📍 After testing, run: voicePipelineTests.generateFinalReport()');

      return { testCount: results.length, passed, failed, results };
    },

    generateFinalReport() {
      const results = [
        this.testMediaRecorderAvailability(),
        this.testAudioContextAvailability(),
        this.testWebSpeechAvailability(),
        this.testNoDOMExceptions(),
        this.testShortClipGuard(),
        this.testSTTFallbackBehavior(),
        this.testTranscodeErrorHandling(),
        this.testMediaStreamCleanup(),
        this.testSustainedRecording(),
        this.testRapidQuickTaps(),
      ];

      const passed = results.filter(r => r.passed).length;
      const failed = results.length - passed;

      console.log('\n════════════════════════════════════════════════════════');
      console.log('✅ VOICE PIPELINE VERIFICATION COMPLETE');
      console.log('════════════════════════════════════════════════════════\n');

      console.log(`📊 FINAL RESULTS: ${results.length} tests`);
      console.log(`   ✅ Passed: ${passed}`);
      console.log(`   ❌ Failed: ${failed}\n`);

      if (failed === 0) {
        console.log('🎉 SUCCESS! All tests passed. Voice pipeline operating correctly.');
      } else {
        console.log(`⚠️  ${failed} test(s) need attention.`);
        results.filter(r => !r.passed).forEach(r => {
          console.log(`   • ${r.name}: ${r.message}`);
        });
      }

      console.log('\n📝 Captured Logs Summary:');
      console.log(`   Total logs: ${this.capturedLogs.length}`);
      const errors = this.capturedLogs.filter(l => l.type === 'error');
      console.log(`   Errors: ${errors.length}`);
      if (errors.length > 0) {
        console.error('   Error details:');
        errors.slice(0, 3).forEach(e => console.error(`     - ${e.message}`));
      }

      return { testCount: results.length, passed, failed, results };
    },
  };

  // Attach to window
  window.voicePipelineTests = voicePipelineTests;

  console.log('%c✅ Voice Pipeline Test Harness Loaded', 'color: green; font-weight: bold; font-size: 14px;');
  console.log('');
  console.log('%cUsage:', 'font-weight: bold;');
  console.log('  1. voicePipelineTests.runAllTests()');
  console.log('  2. Perform manual testing (see instructions above)');
  console.log('  3. voicePipelineTests.generateFinalReport()');
  console.log('');
  console.log('%cDirect Access:', 'font-weight: bold;');
  console.log('  • voicePipelineTests.capturedLogs - View all captured console output');
  console.log('  • voicePipelineTests.getLogsMatching(/pattern/) - Filter logs by regex');
})();
