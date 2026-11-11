import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Switch,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseCommand, formatDate } from "./src/engine/commandEngine";
import { SpeechService } from "./src/services/speechService";
import {
  loadCommandHistory,
  saveCommandHistory,
} from "./src/storage/historyStorage";
import type {
  Task,
  ParsedCommand,
  CommandHistory,
  ActionRecord,
} from "./src/types";

const STORAGE_KEY_TASKS = "@nexu_voicedesk_tasks";
const DEMO_CLOCK = new Date(2026, 10, 11, 10, 0); // Wed, 11 Nov 2026, 10:00 AM

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [command, setCommand] = useState("");
  const [lastParsed, setLastParsed] = useState<ParsedCommand | null>(null);
  const [message, setMessage] = useState("Your assistant is ready.");
  const [history, setHistory] = useState<CommandHistory[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [lastTaskMentioned, setLastTaskMentioned] = useState<string | null>(
    null,
  );

  const [pendingState, setPendingState] = useState<{
    type: "PAST_TIME_CHECK" | "AMBIGUITY_CHECK" | "DELETE_CONFIRMATION";
    data: any;
  } | null>(null);

  const [actionStack, setActionStack] = useState<ActionRecord[]>([]);
  const speechServiceRef = useRef<SpeechService | null>(null);
  const deleteTimerRef = useRef<any>(null);

  useEffect(() => {
    loadStorageData();

    speechServiceRef.current = new SpeechService({
      onStart: () => {
        setIsListening(true);
        setMessage("Listening...");
      },
      onResult: (transcript: string) => {
        setCommand(transcript);
      },
      onError: (error: string) => {
        setIsListening(false);
        setMessage(`Speech error: ${error}`);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });
  }, []);

  const loadStorageData = async () => {
    try {
      const savedTasks = await AsyncStorage.getItem(STORAGE_KEY_TASKS);
      const savedHistory = await loadCommandHistory();
      if (savedTasks) setTasks(JSON.parse(savedTasks));
      setHistory(savedHistory);
    } catch (error) {
      console.error("Storage load error:", error);
    }
  };

  const persistTasks = async (updatedTasks: Task[]) => {
    setTasks(updatedTasks);
    await AsyncStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(updatedTasks));
  };

  const logHistory = async (cmdText: string) => {
    const newEntry: CommandHistory = {
      id: Date.now().toString(),
      commandText: cmdText,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    const updatedHistory = [newEntry, ...history].slice(0, 20);
    setHistory(updatedHistory);
    await saveCommandHistory(updatedHistory);
  };

  const speakText = (speech: string) => {
    if (isMuted) return;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(speech);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleVoiceToggle = () => {
    if (speechServiceRef.current && speechServiceRef.current.isSupported()) {
      if (isListening) {
        speechServiceRef.current.stop();
        setIsListening(false);
        if (command.trim()) {
          processCommand(command);
        }
      } else {
        setCommand("");
        speechServiceRef.current.start();
      }
    } else {
      Alert.alert(
        "Browser Notice",
        "Speech recognition requires Chrome or Edge on web. Please use the simulated input box.",
      );
    }
  };

  const pushAction = (action: ActionRecord) => {
    setActionStack((prev) => [action, ...prev].slice(0, 5));
  };

  const processCommand = (inputText: string) => {
    if (!inputText.trim()) return;

    if (isListening && speechServiceRef.current) {
      speechServiceRef.current.stop();
      setIsListening(false);
    }

    logHistory(inputText);

    if (pendingState) {
      handlePendingConversation(inputText);
      setCommand("");
      return;
    }

    const parsed = parseCommand(inputText, DEMO_CLOCK);
    setLastParsed(parsed);

    if (parsed.confidence === "Low") {
      const reply = "Confidence Low, no action, please rephrase.";
      setMessage(reply);
      speakText(reply);
      setCommand("");
      return;
    }

    switch (parsed.intent) {
      case "ADD": {
        const title = parsed.taskTitle || "New Task";
        const dueDate = parsed.date || formatDate(DEMO_CLOCK);
        const dueTime = parsed.time || "09:00";
        const priority = parsed.priority || "Normal";

        const [h, m] = dueTime.split(":").map(Number);
        const taskDateTime = new Date(dueDate + "T00:00:00");
        taskDateTime.setHours(h, m, 0, 0);

        if (dueDate === formatDate(DEMO_CLOCK) && taskDateTime < DEMO_CLOCK) {
          setPendingState({
            type: "PAST_TIME_CHECK",
            data: { title, dueTime, priority },
          });
          const reply = "That time has passed. Move it to tomorrow?";
          setMessage(reply);
          speakText(reply);
          break;
        }

        const newTask: Task = {
          id: Date.now().toString(),
          title,
          dueDate,
          dueTime,
          priority,
          completed: false,
        };

        const updatedTasks = [...tasks, newTask];
        persistTasks(updatedTasks);
        setLastTaskMentioned(title);
        pushAction({ type: "ADD", taskAfter: newTask });

        const reply = `Added "${title}", due ${dueDate} at ${dueTime}, ${priority} priority.`;
        setMessage(reply);
        speakText(reply);
        break;
      }

      case "COMPLETE": {
        let targetTitle = parsed.taskTitle;
        if (!targetTitle && /\b(it|that|last task)\b/i.test(inputText)) {
          targetTitle =
            lastTaskMentioned ||
            (tasks.length > 0 ? tasks[tasks.length - 1].title : undefined);
        }

        if (!targetTitle) {
          const reply = "Which task would you like to mark complete?";
          setMessage(reply);
          speakText(reply);
          break;
        }

        const matched = tasks.filter((t) => {
          const tTitle = t.title.toLowerCase().trim();
          const search = targetTitle!.toLowerCase().trim();
          return tTitle.includes(search) || search.includes(tTitle);
        });

        if (matched.length > 1) {
          setPendingState({
            type: "AMBIGUITY_CHECK",
            data: { intent: "COMPLETE", matchedTasks: matched },
          });
          const reply = "Which one?";
          setMessage(reply);
          speakText(reply);
          break;
        }

        if (matched.length === 1) {
          const taskToComplete = matched[0];
          const updated = tasks.map((t) =>
            t.id === taskToComplete.id ? { ...t, completed: true } : t,
          );
          persistTasks(updated);
          setLastTaskMentioned(taskToComplete.title);
          pushAction({
            type: "COMPLETE",
            taskBefore: taskToComplete,
            taskAfter: { ...taskToComplete, completed: true },
          });

          const reply = `Completed ${taskToComplete.title}.`;
          setMessage(reply);
          speakText(reply);
        } else {
          const reply = `No active task found matching "${targetTitle}".`;
          setMessage(reply);
          speakText(reply);
        }
        break;
      }

      case "DELETE": {
        let targetTitle = parsed.taskTitle;
        if (!targetTitle && /\b(it|that|last task)\b/i.test(inputText)) {
          targetTitle =
            lastTaskMentioned ||
            (tasks.length > 0 ? tasks[tasks.length - 1].title : undefined);
        }

        if (!targetTitle) {
          const reply = "Which task would you like to delete?";
          setMessage(reply);
          speakText(reply);
          break;
        }

        const matched = tasks.filter((t) => {
          const tTitle = t.title.toLowerCase().trim();
          const search = targetTitle!.toLowerCase().trim();
          return tTitle.includes(search) || search.includes(tTitle);
        });

        if (matched.length > 1) {
          setPendingState({
            type: "AMBIGUITY_CHECK",
            data: { intent: "DELETE", matchedTasks: matched },
          });
          const reply = "Which one?";
          setMessage(reply);
          speakText(reply);
          break;
        }

        if (matched.length === 1) {
          const taskToDelete = matched[0];
          setPendingState({
            type: "DELETE_CONFIRMATION",
            data: { taskToDelete },
          });

          if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
          deleteTimerRef.current = setTimeout(() => {
            setPendingState(null);
            const timeoutReply = "Delete cancelled due to inactivity.";
            setMessage(timeoutReply);
            speakText(timeoutReply);
          }, 8000);

          const reply = `Are you sure you want to delete ${taskToDelete.title}? Say yes or no.`;
          setMessage(reply);
          speakText(reply);
        } else {
          const reply = `No task found matching "${targetTitle}".`;
          setMessage(reply);
          speakText(reply);
        }
        break;
      }

      case "RESCHEDULE": {
        let targetTitle = parsed.taskTitle;
        if (!targetTitle && /\b(it|that|last task)\b/i.test(inputText)) {
          targetTitle = lastTaskMentioned || undefined;
        }
        if (!targetTitle && tasks.length > 0) {
          targetTitle = tasks[tasks.length - 1].title;
        }

        if (!targetTitle || tasks.length === 0) {
          const reply = "No task found to reschedule.";
          setMessage(reply);
          speakText(reply);
          break;
        }

        const newDate = parsed.date || formatDate(DEMO_CLOCK);
        const newTime = parsed.time || "10:00";

        let oldTask: Task | undefined;
        const updated = tasks.map((t) => {
          const tTitle = t.title.toLowerCase().trim();
          const search = targetTitle!.toLowerCase().trim();
          if (tTitle.includes(search) || search.includes(tTitle)) {
            oldTask = { ...t };
            return { ...t, dueDate: newDate, dueTime: newTime };
          }
          return t;
        });

        if (oldTask) {
          persistTasks(updated);
          pushAction({
            type: "RESCHEDULE",
            taskBefore: oldTask,
            taskAfter: { ...oldTask, dueDate: newDate, dueTime: newTime },
          });
          const reply = `Task rescheduled to ${newDate} at ${newTime}.`;
          setMessage(reply);
          speakText(reply);
        } else {
          const reply = "Could not find task to reschedule.";
          setMessage(reply);
          speakText(reply);
        }
        break;
      }

      case "LIST": {
        const activeTasks = tasks.filter((t) => !t.completed);
        const reply = `You have ${activeTasks.length} active tasks. ${activeTasks
          .map((t) => t.title)
          .join(", ")}`;
        setMessage(reply);
        speakText(reply);
        break;
      }

      case "UNDO": {
        if (actionStack.length === 0) {
          const reply = "Nothing to undo.";
          setMessage(reply);
          speakText(reply);
          break;
        }

        const lastAction = actionStack[0];
        setActionStack(actionStack.slice(1));

        if (lastAction.type === "ADD" && lastAction.taskAfter) {
          const filtered = tasks.filter(
            (t) => t.id !== lastAction.taskAfter!.id,
          );
          persistTasks(filtered);
          const reply = `Undid adding task "${lastAction.taskAfter.title}".`;
          setMessage(reply);
          speakText(reply);
        } else if (lastAction.type === "COMPLETE" && lastAction.taskBefore) {
          const restored = tasks.map((t) =>
            t.id === lastAction.taskBefore!.id ? lastAction.taskBefore! : t,
          );
          persistTasks(restored);
          const reply = `Undid completing task "${lastAction.taskBefore.title}".`;
          setMessage(reply);
          speakText(reply);
        } else if (lastAction.type === "DELETE" && lastAction.taskBefore) {
          const restored = [...tasks, lastAction.taskBefore];
          persistTasks(restored);
          const reply = `Restored deleted task "${lastAction.taskBefore.title}".`;
          setMessage(reply);
          speakText(reply);
        } else if (lastAction.type === "RESCHEDULE" && lastAction.taskBefore) {
          const restored = tasks.map((t) =>
            t.id === lastAction.taskBefore!.id ? lastAction.taskBefore! : t,
          );
          persistTasks(restored);
          const reply = `Reverted reschedule for "${lastAction.taskBefore.title}".`;
          setMessage(reply);
          speakText(reply);
        }
        break;
      }

      default: {
        const reply = "Confidence Low, no action, please rephrase.";
        setMessage(reply);
        speakText(reply);
        break;
      }
    }

    setCommand("");
  };

  const handlePendingConversation = (input: string) => {
    const lower = input.toLowerCase().trim();

    if (pendingState?.type === "PAST_TIME_CHECK") {
      if (lower.includes("yes") || lower.includes("move")) {
        const tomorrow = new Date(DEMO_CLOCK);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = formatDate(tomorrow);
        const { title, dueTime, priority } = pendingState.data;

        const newTask: Task = {
          id: Date.now().toString(),
          title,
          dueDate: tomorrowStr,
          dueTime,
          priority,
          completed: false,
        };

        persistTasks([...tasks, newTask]);
        setLastTaskMentioned(title);
        pushAction({ type: "ADD", taskAfter: newTask });

        const reply = `Moved task "${title}" to tomorrow (${tomorrowStr}) at ${dueTime}.`;
        setMessage(reply);
        speakText(reply);
      } else {
        const reply = "Task creation cancelled.";
        setMessage(reply);
        speakText(reply);
      }
      setPendingState(null);
    } else if (pendingState?.type === "AMBIGUITY_CHECK") {
      const matchedTasks = pendingState.data.matchedTasks;
      let selectedTask: Task | undefined;

      if (lower.includes("one") || lower.includes("first")) {
        selectedTask = matchedTasks[0];
      } else if (lower.includes("two") || lower.includes("second")) {
        selectedTask = matchedTasks[1];
      } else {
        selectedTask = matchedTasks.find((t: Task) =>
          t.title.toLowerCase().includes(lower),
        );
      }

      if (selectedTask) {
        if (pendingState.data.intent === "COMPLETE") {
          const updated = tasks.map((t) =>
            t.id === selectedTask!.id ? { ...t, completed: true } : t,
          );
          persistTasks(updated);
          pushAction({
            type: "COMPLETE",
            taskBefore: selectedTask,
            taskAfter: { ...selectedTask, completed: true },
          });
          const reply = `Completed ${selectedTask.title}.`;
          setMessage(reply);
          speakText(reply);
        } else if (pendingState.data.intent === "DELETE") {
          setPendingState({
            type: "DELETE_CONFIRMATION",
            data: { taskToDelete: selectedTask },
          });
          const reply = `Are you sure you want to delete ${selectedTask.title}? Say yes or no.`;
          setMessage(reply);
          speakText(reply);
          return;
        }
      } else {
        const reply = "Selection not recognized. Action cancelled.";
        setMessage(reply);
        speakText(reply);
      }
      setPendingState(null);
    } else if (pendingState?.type === "DELETE_CONFIRMATION") {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);

      if (lower.includes("yes") || lower.includes("sure")) {
        const taskToDelete = pendingState.data.taskToDelete;
        const filtered = tasks.filter((t) => t.id !== taskToDelete.id);
        persistTasks(filtered);
        pushAction({ type: "DELETE", taskBefore: taskToDelete });

        const reply = `Deleted task "${taskToDelete.title}".`;
        setMessage(reply);
        speakText(reply);
      } else {
        const reply = "Deletion cancelled.";
        setMessage(reply);
        speakText(reply);
      }
      setPendingState(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.headerTitle}>NEXU</Text>
          <Text style={styles.headerSub}>VOICE DESK</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.muteRow}>
            <Text style={styles.muteLabel}>Mute Audio</Text>
            <Switch
              value={isMuted}
              onValueChange={setIsMuted}
              trackColor={{ false: "#CBD5E1", true: "#6366F1" }}
            />
          </View>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>N</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Friendly Greeting Section */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingHello}>Hello! 👋</Text>
          <Text style={styles.greetingMain}>What can I help you with?</Text>
          <Text style={styles.greetingSub}>
            Manage your tasks using your voice or text.
          </Text>
        </View>

        {/* Demo Clock Banner */}
        <View style={styles.demoClockBanner}>
          <View>
            <Text style={styles.demoClockHeader}>DEMO CLOCK</Text>
            <Text style={styles.demoClockTime}>10:00 AM</Text>
            <Text style={styles.demoClockDate}>
              Wednesday, 11 November 2026
            </Text>
          </View>
          <View style={styles.clockIconCircle}>
            <Text style={{ fontSize: 22 }}>🕒</Text>
          </View>
        </View>

        {/* Voice Assistant Section */}
        <View style={styles.voiceSection}>
          <Text style={styles.voiceAssistantTitle}>Voice Assistant</Text>
          <Text style={styles.voiceAssistantSub}>
            {isListening
              ? "Listening to your voice..."
              : "Tap and hold the microphone to speak."}
          </Text>

          <TouchableOpacity
            style={[
              styles.micCircleButton,
              isListening && styles.micActivePulse,
            ]}
            onPress={handleVoiceToggle}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 32 }}>🎙️</Text>
          </TouchableOpacity>
          <Text style={styles.readyIndicatorText}>{message}</Text>
        </View>

        {/* Simulated Input Bar for Testing */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Simulated Voice Box (Type Command)
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={command}
              onChangeText={setCommand}
              placeholder='e.g. "add task buy cable tomorrow at 5pm"...'
              placeholderTextColor="#94A3B8"
            />
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={() => processCommand(command)}
              activeOpacity={0.8}
            >
              <Text style={styles.submitBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Understanding Panel */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Understanding Panel</Text>
          {lastParsed ? (
            <View style={styles.parsedBox}>
              <Text style={styles.parsedText}>
                • Intent: {lastParsed.intent}
              </Text>
              <Text style={styles.parsedText}>
                • Title: {lastParsed.taskTitle || "N/A"}
              </Text>
              <Text style={styles.parsedText}>
                • Date: {lastParsed.date || "N/A"}
              </Text>
              <Text style={styles.parsedText}>
                • Time: {lastParsed.time || "N/A"}
              </Text>
              <Text style={styles.parsedText}>
                • Priority: {lastParsed.priority || "Normal"}
              </Text>
              <Text style={[styles.parsedText, { fontWeight: "bold" }]}>
                • Confidence: {lastParsed.confidence}
              </Text>
            </View>
          ) : (
            <Text style={styles.placeholder}>No command parsed yet.</Text>
          )}
        </View>

        {/* Task List */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Task List ({tasks.length})</Text>
          {tasks.length === 0 ? (
            <Text style={styles.placeholder}>No tasks recorded.</Text>
          ) : (
            tasks.map((t) => (
              <View key={t.id} style={styles.taskRow}>
                <View>
                  <Text
                    style={[styles.taskTitle, t.completed && styles.taskDone]}
                  >
                    {t.completed ? "✓ " : "• "} {t.title}
                  </Text>
                  <Text style={styles.taskMeta}>
                    📅 {t.dueDate} @ {t.dueTime} | Priority: [{t.priority}]
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* About Card (Permanently Visible on Page) */}
        <View
          style={[
            styles.card,
            { borderColor: "#6366F1", backgroundColor: "#F8FAFC" },
          ]}
        >
          <Text style={[styles.cardTitle, { color: "#312E81" }]}>
            ℹ️ About NEXU VoiceDesk
          </Text>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Candidate Name:</Text>
            <Text style={styles.aboutValue}>Sakina Fathima</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Task Received Date & Time:</Text>
            <Text style={styles.aboutValue}>11 November 2026, 8:35 AM</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Position:</Text>
            <Text style={styles.aboutValue}>
              Mobile Application Developer (React Native)
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  logoContainer: { flexDirection: "column" },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#312E81",
    letterSpacing: 1,
  },
  headerSub: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 2,
  },

  headerRight: { flexDirection: "row", alignItems: "center" },
  muteRow: { flexDirection: "row", alignItems: "center", marginRight: 20 },
  muteLabel: {
    fontSize: 13,
    color: "#64748B",
    marginRight: 8,
    fontWeight: "500",
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#E0E7FF",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "bold", color: "#4F46E5" },

  scroll: { padding: 32, maxWidth: 900, alignSelf: "center", width: "100%" },

  greetingSection: { marginBottom: 24 },
  greetingHello: {
    fontSize: 18,
    color: "#334155",
    fontWeight: "600",
    marginBottom: 4,
  },
  greetingMain: {
    fontSize: 32,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
  },
  greetingSub: { fontSize: 15, color: "#64748B" },

  demoClockBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#4F46E5",
    borderRadius: 16,
    padding: 24,
    marginBottom: 32,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  demoClockHeader: {
    fontSize: 11,
    fontWeight: "800",
    color: "#C7D2FE",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  demoClockTime: {
    fontSize: 36,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  demoClockDate: { fontSize: 14, fontWeight: "500", color: "#E0E7FF" },
  clockIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },

  voiceSection: { alignItems: "center", marginBottom: 32 },
  voiceAssistantTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1E293B",
    marginBottom: 4,
  },
  voiceAssistantSub: { fontSize: 13, color: "#64748B", marginBottom: 18 },
  micCircleButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#4F46E5",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    marginBottom: 12,
  },
  micActivePulse: { backgroundColor: "#EF4444" },
  readyIndicatorText: {
    fontSize: 13,
    color: "#4F46E5",
    fontWeight: "600",
    fontStyle: "italic",
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#1E293B",
    marginBottom: 12,
  },

  inputRow: { flexDirection: "row" },
  textInput: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1E293B",
    marginRight: 10,
  },
  submitBtn: {
    backgroundColor: "#10B981",
    borderRadius: 10,
    paddingHorizontal: 22,
    justifyContent: "center",
  },
  submitBtnText: { color: "#FFFFFF", fontWeight: "bold", fontSize: 13 },

  parsedBox: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  parsedText: { fontSize: 12, color: "#475569", marginBottom: 3 },
  placeholder: { fontSize: 12, color: "#94A3B8", fontStyle: "italic" },

  taskRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  taskTitle: { fontSize: 14, fontWeight: "600", color: "#1E293B" },
  taskDone: { textDecorationLine: "line-through", color: "#94A3B8" },
  taskMeta: { fontSize: 11, color: "#64748B", marginTop: 3 },

  aboutRow: { marginBottom: 8 },
  aboutLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
  },
  aboutValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    marginTop: 2,
  },
});
