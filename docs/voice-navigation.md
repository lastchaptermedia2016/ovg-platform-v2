# Zeeder Voice Navigation Guide

## User Manual: Push-To-Talk (PTT) Voice Control

### 🎤 Getting Started with Voice Commands

The Zeeder Client Surface includes a hands-free voice navigation system powered by AI. Use the gold microphone button to control your dashboard with natural language.

---

## 📱 How to Use Push-To-Talk (PTT)

### Basic Interaction

1. **Locate the Mic Button** — Look for the circular gold microphone button in the interface
2. **Press & Hold** — Click (or tap on mobile) and hold the button while speaking
3. **Speak Naturally** — Say your command in a clear, conversational tone
4. **Release** — Release the button when you're done speaking
5. **Listen for Confirmation** — The AI will speak back to confirm your action

### ⏱️ Hold Duration
- **Minimum Hold Time:** Hold for at least **400 milliseconds** (less than half a second) before the system will register your voice
- **Why?** This prevents accidental taps from triggering the voice engine

### 🔊 Audio Quality Tips
- Speak in a **clear, steady voice**
- Avoid loud background noise when possible
- You don't need to wait for the button to activate—just press and hold while speaking
- The system records until you release the button

---

## ✅ Valid Commands

### Branding & Design
```
"Update my branding"
"Change the primary color to blue"
"Upload a new logo"
"Make it more professional"
"Apply glassmorphism effects"
"Show me the branding studio"
```

### Persona & Content
```
"Switch to sales mode"
"Change to concierge mode"
"Generate a new greeting"
"Approve this greeting"
"Try a different greeting"
```

### General Help
```
"What can you do?"
"Show me the capabilities"
"Help me design my widget"
"How do I update branding?"
"What is smart booking?"
```

---

## ⚠️ Accidental Tap Guard

### What Happens If You Tap Too Quickly?

If you accidentally tap the button for less than **400 milliseconds** (a quick tap) or record less than **1 kilobyte (1 KB) of audio**, the system will:

1. ✅ **Automatically reject the recording** with an inline message
2. ✅ **Not send any data to the server** (no wasted API calls)
3. ✅ **Clean up audio resources** without any side effects
4. ✅ **Stay ready for the next command** (no reset needed)

**Console Message:**
```
[ZEEDER-VOICE] Ignoring short audio clip (${duration}ms, ${size} bytes). 
Minimum: 400ms duration and 1024 bytes. 
Hold the button longer for a valid command.
```

### Why This Protection Exists
- **WebM headers:** Audio container format headers alone occupy 100–200 bytes—below 1 KB indicates no actual speech data
- **Accidental activation:** Quick taps (< 400ms) are almost always unintentional
- **Resource efficiency:** By filtering these locally, we avoid unnecessary transcription API calls

---

## 📊 Visual Feedback States

### Button States

| State | Appearance | Meaning |
|-------|-----------|---------|
| **Idle** | Gold border, subtle glow | System ready; click to record |
| **Listening** | Solid gold background, "Listening..." label | Mic is actively recording |
| **Processing** | Pulse animation + spinner | AI is processing your command |
| **Speaking** | Blue glow + animated dots | AI response is being spoken |
| **Error** | Red border + red glow | Last command failed; try again |

---

## 🔧 Troubleshooting

### Mic Button Not Responding
- ✅ **Refresh the page** — Sometimes browser state gets stuck
- ✅ **Check browser permissions** — Ensure the site has microphone access
- ✅ **Try a different browser** — Test in Chrome, Firefox, or Safari

### Voice Not Being Recognized
- ✅ **Speak more clearly** — Avoid mumbling or background noise
- ✅ **Hold longer** — Make sure you're holding for at least 400ms
- ✅ **Try simpler phrasing** — Use common commands like "Update branding" instead of complex sentences

### Audio Playback Not Working
- ✅ **Check speaker volume** — Ensure your device volume is not muted
- ✅ **Check browser volume** — Some browsers have independent volume controls
- ✅ **Disable browser mute** — Some sites have a mute toggle in the top-left

### Getting Stuck in "Listening" State
- ✅ **Click the mic button again** — This will stop the current recording
- ✅ **Refresh the page** — If that doesn't work, reload the browser
- ✅ **Clear browser cache** — Try clearing cached data and reloading

---

## 🎯 Tips & Tricks

### 1. **Use Conversational Language**
Instead of: "Execute branding update with parameters primary color hash 0097b2"  
Try: "Make the primary color blue"

### 2. **Combine Commands**
Instead of saying "Update branding" then "Upload a logo"  
You can say: "Update my branding and add a logo"

### 3. **Use Context Clues**
If you're on the Branding Studio page and say "Update the logo," the AI knows exactly which control you mean.

### 4. **Ask Questions**
You don't need to use commands—ask natural questions like:
- "What's on this page?"
- "How do I change colors?"
- "What's smart booking?"

### 5. **Approve or Reject Results**
After the AI suggests something:
- "I love it" / "Save that" → Approve
- "Try again" / "Different color" → Reject and regenerate

---

## 🔐 Privacy & Security

### What Data Is Recorded?
- Only **audio you intentionally record** by holding the mic button
- Audio is **immediately transcribed** on the server (Groq Whisper AI)
- **Transcripts are processed** through the command intent engine
- **Original audio is NOT stored** — only the transcript text

### Who Can See My Commands?
- ✅ Your commands are **private** to your tenant workspace
- ✅ No cross-tenant access — other clients cannot see your voice data
- ✅ Reseller admins cannot monitor user voice sessions
- ✅ All voice processing is **end-to-end encrypted** in transit (HTTPS)

---

## 💬 Contact & Feedback

If you encounter any issues or have feature requests for voice navigation, contact the Omniverge Global support team.

---

**Last Updated:** September 15, 2026  
**System Version:** OVG-Platform-V2 Production Ready  
**Voice Engine:** Zeeder PTT Pipeline v1.0  
