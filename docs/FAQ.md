# Frequently Asked Questions (FAQ)

## Voice Navigation & PTT

### Q: Why do I need to hold the button for at least 400ms?

**A:** This is an **accidental tap guard**. Very quick taps (under 400ms) are almost never intentional voice commands—they're usually accidental touches or false activations. By requiring a minimum hold time, the system avoids wasting server resources on processing noise or silence. This keeps the service fast and free from spurious API calls.

### Q: Why won't my voice command work if my recording is less than 1 KB?

**A:** The **audio codec header** (the container metadata for WebM or MP3 files) is 100–200 bytes by itself. If your entire recording is less than 1,024 bytes (1 KB), it means there's essentially no actual audio data—just silence or system noise. This guard prevents the STT (speech-to-text) service from trying to transcribe empty files, which wastes bandwidth and processing power.

### Q: What happens if my internet connection drops while I'm recording?

**A:** If your connection drops:
1. The recording **stops immediately** to prevent partial uploads
2. The system **cleans up local audio resources** gracefully
3. You'll see an error message on the screen
4. Simply **try again**—no data will be corrupted

### Q: Can the Reseller Admin hear my voice recordings?

**A:** **No.** Your voice data is:
- ✅ Private to your workspace (tenant isolation via RLS)
- ✅ Transcribed only on the server (raw audio is not stored)
- ✅ Never accessible to other clients or reseller staff
- ✅ Encrypted in transit over HTTPS

Reseller admins can see your **actions** (e.g., "user updated branding") but not your voice commands or audio.

### Q: Why does the system say "Ignoring short audio clip" sometimes?

**A:** This happens when either:
1. You held the button for **less than 400ms** (too quick), OR
2. The audio blob size is **less than 1,024 bytes** (too quiet/short)

This is **not an error**—it's the system doing its job by filtering out accidental activations. Just press and hold again for a proper command. You'll hear/see a confirmation when the system successfully processes your voice.

### Q: What if I start speaking and then realize I made a mistake?

**A:** Just **release the button**. The recording stops immediately. You can:
- Click the mic button again to try a new command
- The previous (incomplete) command will be discarded
- No side effects or partial actions will occur

### Q: Can I use voice to delete something important?

**A:** Destructive commands (like deleting clients or resellers) **require confirmation** from the UI. Voice commands cannot silently delete data—you'll always get a confirmation prompt or summary before any permanent action.

### Q: Is my voice recording transcribed on-device or sent to a server?

**A:** The **transcription happens on the server** (Groq Whisper AI), but:
- ✅ The server is **run by Omniverge Global**, not a third party
- ✅ Your audio is **never stored persistently**—only processed in-memory
- ✅ Your transcript is **deleted after the command is routed**
- ✅ All communication is **encrypted** over HTTPS

### Q: What languages does the voice system support?

**A:** Currently, the system supports:
- ✅ **English** (primary language)
- 📋 Additional languages planned for future releases

For now, please speak in English for best results.

### Q: Can I use voice on mobile devices?

**A:** **Yes!** The PTT system works on:
- ✅ iOS and Android (modern browsers)
- ✅ Desktop (Windows, Mac, Linux)
- ✅ Tablets

**Tip:** On mobile, use the `touch-action: none` behavior to hold the button without the browser interpreting it as a long-press gesture.

### Q: What if the AI didn't understand my command?

**A:** If the AI doesn't recognize your voice:
1. **Try again with simpler phrasing** — "Update branding" instead of "Perform a comprehensive branding refresh"
2. **Be specific** — Name the exact control (e.g., "Change the primary color")
3. **Ask for help** — Say "What can you do?" to see available commands
4. **Check the console** — Open browser DevTools (F12) to see the transcript and any errors

---

## Technical Issues

### Q: The mic button is stuck on "Listening..."

**A:** This occasionally happens if the browser's event loop gets delayed. Try:
1. **Click the mic button again** — This forces a stop
2. **Refresh the page** — Press F5 or Cmd+R
3. **Clear browser cache** — Some cached state might be stale

### Q: I'm seeing a "Whisper STT failed" error message

**A:** This means the transcription service temporarily failed. The system automatically:
1. ✅ Falls back to the **Web Speech API** (local device speech recognition)
2. ✅ Continues processing your command
3. ✅ Logs the error for debugging

**Note:** Web Speech is less accurate than Whisper but still functional.

### Q: The audio playback (AI speaking back) isn't working

**A:** Check:
- ✅ Your **device volume** is not muted
- ✅ Your **browser tab volume** is not muted (some browsers have per-tab controls)
- ✅ Your **speakers/headphones** are working
- ✅ Try **refreshing the page** and trying again

### Q: Why is there a delay before the AI speaks back?

**A:** The delay is normal and includes:
- **Transcription time:** ~0.5–2 seconds (Whisper processes audio)
- **Intent processing:** ~0.5–1 second (semantic routing)
- **TTS generation:** ~0.5–2 seconds (AI generates speech)

Total typical latency: **1–5 seconds**. This is expected for a high-fidelity pipeline.

---

## Branding & Customization

### Q: Can I change the voice of the AI?

**A:** Currently, the system uses **"Hannah"** (professional, calm tone) as the standard voice. Custom voices will be added in future releases.

### Q: How do I add a company logo to my widget?

**A:** Via voice: **"Upload a new logo"** or **"Add my company logo"**

Via UI:
1. Go to **Branding Studio** → **Logo & Assets**
2. Click **Upload** and select your image
3. Click **Save**

### Q: Can I customize the welcome greeting?

**A:** **Yes!** You can:
1. Use voice: **"Generate a new greeting"** → AI creates one → **"I love it"** to save
2. Use UI: Go to **Branding Studio** → **Greeting** → Edit or regenerate

---

## Billing & Accounts

### Q: Are voice commands included in my plan?

**A:** **Yes.** Voice navigation is included at no additional cost across all plan tiers (Standard, Premium, Enterprise).

### Q: How many voice commands can I use per day?

**A:** There are **no per-day limits** on voice commands. You're welcome to use the voice system as much as needed. Usage is metered server-side for monitoring, but not throttled for billing purposes.

### Q: If I cancel my account, what happens to my voice settings?

**A:** When you cancel:
- ✅ Your branding settings are archived for 30 days
- ✅ Your voice preferences (greeting, persona) are preserved in backup
- ✅ You can re-activate your account within 30 days to recover all settings
- ✅ After 30 days, data is permanently deleted per GDPR

---

## Need More Help?

If your question isn't answered here:

1. **Check the User Manual** → `docs/voice-navigation.md`
2. **Check the Project README** → `README.md` (Architecture section)
3. **Contact Support** → Email support@omniverge.global
4. **Open DevTools** → Press F12 and check the **Console** tab for detailed error messages

---

**Last Updated:** September 15, 2026  
**System Version:** OVG-Platform-V2 Production Ready  
**Maintained By:** Omniverge Global  
