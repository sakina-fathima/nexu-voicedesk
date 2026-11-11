import AsyncStorage from "@react-native-async-storage/async-storage";
import { CommandHistory } from "../types";

const HISTORY_KEY = "@nexu_voicedesk_history";

export async function saveCommandHistory(
  history: CommandHistory[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error("Error saving command history:", error);
  }
}

export async function loadCommandHistory(): Promise<CommandHistory[]> {
  try {
    const saved = await AsyncStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error("Error loading command history:", error);
    return [];
  }
}

export async function clearCommandHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch (error) {
    console.error("Error clearing command history:", error);
  }
}
