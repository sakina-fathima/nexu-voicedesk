# Architectural & Design Decisions (`DECISIONS.md`)

This document outlines key technical trade-offs, ambiguous requirements, and rule interactions encountered during the development of the NEXU VoiceDesk MVP, along with the rationale for our solutions.

---

### Decision 1: Resolving Rule C2 (Past Time) vs. Instant Task Creation

- **The Ambiguity / Conflict**: Rule C1 specifies default time handling (`9:00 AM`), while Rule C2 mandates that if a resulting time has already passed on the demo clock (set to `11 Nov 2026, 10:00 AM`), the app must not save the task immediately, but instead ask _"That time has passed. Move it to tomorrow?"_ and wait for a conversational confirmation.
- **Our Choice**: We implemented an explicit conversational `pendingState` machine in our command handler. When an `ADD` command resolves to a past timestamp (e.g., `"add task call vendor"` defaulting to today at 9:00 AM), task creation is paused. The app prompts the user aloud, switches state to listen for `"yes"` or `"no"`, and shifts the due date to the following day only upon positive confirmation.
- **Why**: This strictly honors workshop safety and accuracy requirements, preventing technicians from accidentally scheduling ghost tasks in the past while maintaining an intuitive voice loop.

---

### Decision 2: Managing Pronoun Resolution (`C3`) Across Complex Multi-Turn Commands

- **The Ambiguity / Conflict**: Rule C3 states that pronouns like `"it"`, `"that"`, and `"the last task"` refer to the most recently added or mentioned task. However, in rapid workflows where tasks are completed, rescheduled, or deleted in succession, relying solely on array indices can lead to unintended target mutations.
- **Our Choice**: We introduced a dedicated `lastTaskMentioned` state variable coupled with a prioritized fallback chain:
  1. Check if the command explicitly names a task title.
  2. If a pronoun (`it`/`that`) is detected, evaluate against `lastTaskMentioned`.
  3. Fallback to the latest item in the task array. Additionally, any successful intent update refreshes the `lastTaskMentioned` pointer.
- **Why**: This ensures deterministic context tracking, preventing user frustration when referencing tasks mid-conversation in a noisy workshop environment.

---

### Decision 3: Balancing Delete Safety (`C5`) with Hands-Free Usability

- **The Ambiguity / Conflict**: Rule C5 requires that `DELETE` always needs confirmation via voice (`"yes"`/`"no"`) or tap, with an 8-second inactivity timeout that cancels the operation. In a hands-free workshop scenario with heavy machinery noise, waiting indefinitely for a confirmation response could leave the application stuck in a blocking state.
- **Our Choice**: We implemented a managed `setTimeout` hook (8,000ms duration) tied to the `DELETE_CONFIRMATION` pending state. If no matching voice/text confirmation is received within 8 seconds, the timer fires, clears the pending state automatically, and issues a spoken cancellation message ("Delete cancelled due to inactivity.").
- **Why**: This adheres strictly to the safety timeout rule while preventing UI deadlocks, ensuring the assistant automatically resets to a listening state if the technician is distracted.

---

### Decision 4: Fallback Strategy for Platform-Specific Speech Recognition

- **The Ambiguity / Conflict**: The assessment requires both real microphone input and a simulated voice box, but native speech-to-text plugins often encounter dependency hurdles or lack browser-side web support during rapid code evaluations.
- **Our Choice**: We integrated the browser's native `SpeechRecognition` API wrapped in a clean service abstraction (`SpeechService`), while concurrently implementing a fully featured **Simulated Voice Box** input component that routes typed strings through the exact same parsing engine.
- **Why**: This guarantees 100% testability for reviewers across web previews and emulators even if microphone permissions are restricted or unavailable on the reviewer's machine.
