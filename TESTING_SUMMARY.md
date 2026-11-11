# Testing Summary - NEXU VoiceDesk MVP

## Testing Scope & Methodology

Testing was conducted locally across Web (Chrome/Edge) using both the real Web Speech API microphone trigger and the Simulated Voice Box text input to verify end-to-end command execution and state resilience.

### Test Cases & Results

| Test Case / Rule              | Utterance / Action                              | Expected Behavior                                                              | Actual Result                               | Status   |
| :---------------------------- | :---------------------------------------------- | :----------------------------------------------------------------------------- | :------------------------------------------ | :------- |
| **1. Standard Add (C1)**      | `"add task check hydraulic fluid"`              | Adds task with today's date (`11 Nov 2026`), 9:00 AM, Normal priority          | Successfully added and announced aloud      | **PASS** |
| **2. Past Time Check (C2)**   | `"add task review morning logs at 8am"`         | Detects past time against demo clock (`10:00 AM`), prompts to move to tomorrow | Paused and prompted user confirmation       | **PASS** |
| **3. Pronoun Reference (C3)** | `"mark it complete"`                            | Resolves pronoun `"it"` to the last mentioned task                             | Marked correct task complete                | **PASS** |
| **4. Ambiguity Check (C4)**   | `"delete report"` (when multiple reports exist) | Prompts `"Which one?"` and lists matches                                       | Intercepted and listed choices              | **PASS** |
| **5. Delete Safety (C5)**     | `"yes"` to delete confirmation                  | Deletes task; triggers 8s timeout if ignored                                   | Deleted successfully with auto-cancel timer | **PASS** |
| **6. Confidence Filter (C6)** | `"um do that thing maybe"`                      | Evaluates as Low confidence, rejects without changing state                    | Outputted low confidence rejection          | **PASS** |
| **7. Undo Stack (C7)**        | `"undo"`                                        | Reverses the last performed action                                             | Restored previous task state successfully   | **PASS** |

### Bugs Identified & Resolved during Testing

1. **Async State Timing**: Initial speech recognition result handlers occasionally raced with rapid keystrokes in the simulated box. _Resolution_: Consolidated command processing into a unified `processCommand` dispatcher with strict pending-state gating.
2. **Web Speech API Permissions**: Handled missing browser permission gracefully by displaying an alert and directing the user to the Simulated Voice Box.
