# NEXU VoiceDesk MVP

A hands-free, voice-first task assistant designed specifically for field technicians working in noisy workshop environments while wearing gloves. Built as part of the NEXU Technologies Practical Technical Assessment.

---

## Features & Compliance Matrix

- **Voice & Text Input**: Features a hold-to-talk microphone button with live speech transcripts, alongside a fallback **Simulated Voice Box** text input that routes through the exact same command engine.
- **Pure Command Engine**: Custom-written parser operating purely on text and state without external AI APIs or cloud keys. Supports intents: `ADD`, `COMPLETE`, `RESCHEDULE`, `DELETE`, `LIST`, and `UNDO`.
- **Rule C1 (Defaults)**: Automatically assigns today's date, 9:00 AM time, and Normal priority when unstated.
- **Rule C2 (Past Time Validation)**: Intercepts past-time task creation against the demo clock and prompts: _"That time has passed. Move it to tomorrow?"_
- **Rule C3 (Contextual References)**: Fully supports pronouns like `"it"`, `"that"`, and `"the last task"` to reference recent items.
- **Rule C4 (Ambiguity Resolution)**: Triggers an interactive ambiguity check (_"Which one?"_) when multiple tasks match a search term.
- **Rule C5 (Delete Safety)**: Requires voice/tap confirmation (`"yes"`/`"no"`) backed by an 8-second inactivity auto-cancel timer.
- **Rule C6 (Confidence Filtering)**: Evaluates input confidence (`High`, `Medium`, `Low`); low-confidence inputs trigger immediate rejection with no state changes.
- **Rule C7 (Action Undo Stack)**: Maintains an undo stack tracking the last 5 operations (add, complete, reschedule, delete) with clear spoken feedback.
- **Demo Clock**: Fixed testing reference clock set to **Wednesday, 11 November 2026, 10:00 AM**.
- **Persistence**: Local storage via `AsyncStorage` ensuring tasks and command history persist across application restarts.
- **About Screen**: Permanently visible card displaying candidate details and task issuance timestamp.

---

## Tech Stack & Architecture

- **Framework**: React Native (with React Native for Web) & TypeScript
- **State Management**: React Hooks (`useState`, `useEffect`, `useRef`) managing local state and conversational pending flows
- **Persistence**: `@react-native-async-storage/async-storage` for robust client-side storage
- **Speech APIs**: Browser Web Speech API (`SpeechRecognition` & `SpeechSynthesis`) for real-time speech-to-text and text-to-speech feedback

---

## Prerequisites & Setup Instructions

1. **Clone the repository**:
   ```bash
   git clone [https://github.com/sakina-fathima/nexu-voicedesk.git](https://github.com/sakina-fathima/nexu-voicedesk.git)
   cd nexu-voicedesk
   ```
