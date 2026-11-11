import type { Intent, Confidence, ParsedCommand, TaskPriority } from "../types";

const pad = (value: number): string => String(value).padStart(2, "0");

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function getNextDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function extractDate(text: string, now: Date): string | undefined {
  const lower = text.toLowerCase();

  if (lower.includes("day after tomorrow")) {
    return formatDate(getNextDay(getNextDay(now)));
  }

  if (lower.includes("tomorrow")) {
    return formatDate(getNextDay(now));
  }

  if (lower.includes("today")) {
    return formatDate(now);
  }

  const isoDate = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoDate) return isoDate[1];

  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  for (const [dayName, dayNumber] of Object.entries(weekdays)) {
    if (lower.includes(dayName)) {
      const result = new Date(now);
      let difference = (dayNumber - now.getDay() + 7) % 7;
      if (difference === 0) difference = 7;
      result.setDate(result.getDate() + difference);
      return formatDate(result);
    }
  }

  return undefined;
}

function extractTime(text: string): string | undefined {
  const lower = text.toLowerCase();

  if (lower.includes("noon")) return "12:00";
  if (lower.includes("midnight")) return "00:00";

  const match = lower.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i,
  );

  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2] || "00");
    const period = match[3].replace(/\./g, "").toLowerCase();

    if (hour < 1 || hour > 12 || minute > 59) return undefined;

    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;

    return `${pad(hour)}:${pad(minute)}`;
  }

  const twentyFourHour = lower.match(
    /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/,
  );

  if (twentyFourHour) {
    return `${pad(Number(twentyFourHour[1]))}:${twentyFourHour[2]}`;
  }

  return undefined;
}

function extractPriority(text: string): TaskPriority | undefined {
  const lower = text.toLowerCase();
  if (
    lower.includes("high priority") ||
    lower.includes("urgent") ||
    lower.includes("important")
  ) {
    return "High";
  }
  if (lower.includes("low priority")) return "Low";
  if (lower.includes("normal priority")) return "Normal";
  return undefined;
}

function extractTaskTitle(text: string, intent: Intent): string | undefined {
  let title = text.trim();
  const cleanedForContext = title
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
    .trim();

  // Contextual reference check (Rule C3)
  if (/^(the\s+)?(last\s+task|it|that)\b/i.test(cleanedForContext)) {
    return undefined;
  }

  const prefixes: Record<string, RegExp[]> = {
    ADD: [
      /^(please\s+)?(add|create|make|remind me to|remember to|schedule)\s+/i,
      /^(please\s+)?(i need to|i have to|i must)\s+/i,
    ],
    COMPLETE: [
      /^(please\s+)?(mark|set)\s+/i,
      /^(please\s+)?(complete|finish|done with)\s+/i,
    ],
    DELETE: [
      /^(please\s+)?(delete|remove|cancel)\s+(the\s+)?(last\s+task|it|that)\b/i,
      /^(please\s+)?(delete|remove|cancel)\s+/i,
    ],
    RESCHEDULE: [
      /^(please\s+)?(reschedule|postpone|move)\s+(the\s+)?(last\s+task|it|that)\b/i,
      /^(please\s+)?(reschedule|postpone|move)\s+/i,
      /^(please\s+)?(change|update)\s+/i,
    ],
  };

  for (const pattern of prefixes[intent] || []) {
    title = title.replace(pattern, "");
  }

  // Strip trailing completion/done indicators
  if (intent === "COMPLETE") {
    title = title.replace(
      /\s+(as\s+)?(done|completed|finished|complete)$/i,
      "",
    );
  }

  title = title
    .replace(/\b(day after tomorrow|tomorrow|today)\b/gi, "")
    .replace(
      /\b(to|on|by|for|this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
      "",
    )
    .replace(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
      "",
    )
    .replace(/\b(on|at|by|to|for)\s+\d{4}-\d{2}-\d{2}\b/gi, "")
    .replace(/\b(at\s+)?\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)\b/gi, "")
    .replace(/\b\d{1,2}:\d{2}\b/g, "")
    .replace(/\b(with\s+)?(high|low|normal)\s+priority\b/gi, "")
    .replace(/\b(urgent|important)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^(to|the|a|an)\s+/i, "")
    .trim();

  if (
    !title ||
    /^(it|that|this|the task|last task|all tasks|done|to do)$/i.test(title)
  ) {
    return undefined;
  }

  return title;
}

function detectIntent(text: string): Intent {
  const lower = text.toLowerCase().trim();

  if (/\b(undo|reverse|go back|take back)\b/.test(lower)) return "UNDO";
  if (
    /\b(show|list|display|view|what is due)\b/.test(lower) &&
    /\b(task|tasks|schedule|todo|to-do|today)\b/.test(lower)
  ) {
    return "LIST";
  }
  if (/\b(delete|remove|cancel|drop)\b/.test(lower)) return "DELETE";
  if (
    /\b(reschedule|postpone|move|change the time|change the date)\b/.test(lower)
  ) {
    return "RESCHEDULE";
  }
  if (/\b(complete|finish|done|mark)\b/.test(lower)) return "COMPLETE";
  if (/\b(add|create|make|remind|remember|schedule)\b/.test(lower))
    return "ADD";

  if (/\b(delete|remove|cancel)\b/.test(lower)) return "DELETE";
  if (/\b(complete|finish|done)\b/.test(lower)) return "COMPLETE";

  return "UNKNOWN";
}

export function parseCommand(
  input: string,
  now: Date = new Date(),
): ParsedCommand {
  const originalText = input.trim();
  if (!originalText) {
    return { intent: "UNKNOWN", confidence: "Low", originalText };
  }

  const intent = detectIntent(originalText);
  const date = extractDate(originalText, now);
  const time = extractTime(originalText);
  const priority = extractPriority(originalText);

  const taskTitle =
    intent === "LIST" || intent === "UNDO" || intent === "UNKNOWN"
      ? undefined
      : extractTaskTitle(originalText, intent);

  let confidence: Confidence = "High";
  if (intent === "UNKNOWN") {
    confidence = "Low";
  } else if (!date && intent === "ADD") {
    confidence = "Medium";
  }

  return { intent, taskTitle, date, time, priority, confidence, originalText };
}
