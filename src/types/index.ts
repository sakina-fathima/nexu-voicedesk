export type Intent =
  | "ADD"
  | "COMPLETE"
  | "DELETE"
  | "RESCHEDULE"
  | "LIST"
  | "UNDO"
  | "UNKNOWN";

export type Confidence = "High" | "Medium" | "Low";

export type TaskPriority = "High" | "Normal" | "Low";

export interface Task {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  dueTime: string; // HH:MM
  priority: TaskPriority;
  completed?: boolean;
}

export interface ParsedCommand {
  intent: Intent;
  taskTitle?: string;
  date?: string;
  time?: string;
  priority?: TaskPriority;
  confidence: Confidence;
  originalText: string;
}

export interface CommandHistory {
  id: string;
  commandText: string;
  timestamp: string;
}

export interface ActionRecord {
  type: "ADD" | "COMPLETE" | "DELETE" | "RESCHEDULE";
  taskBefore?: Task;
  taskAfter?: Task;
  taskId?: string;
}
