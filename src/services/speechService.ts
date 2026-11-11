import { Platform } from "react-native";

export interface SpeechRecognitionHandlers {
  onStart: () => void;
  onResult: (transcript: string) => void;
  onError: (error: string) => void;
  onEnd: () => void;
}

export class SpeechService {
  private recognition: any = null;
  private isManualStop: boolean = false;

  constructor(handlers: SpeechRecognitionHandlers) {
    if (Platform.OS === "web") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = "en-US";

        this.recognition.onstart = () => {
          this.isManualStop = false;
          handlers.onStart();
        };

        this.recognition.onresult = (event: any) => {
          let interimTranscript = "";
          let finalTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          const currentText = finalTranscript || interimTranscript;
          if (currentText) {
            handlers.onResult(currentText);
          }
        };

        this.recognition.onerror = (event: any) => {
          if (event.error !== "no-speech") {
            handlers.onError(event.error);
          }
        };

        this.recognition.onend = () => {
          handlers.onEnd();
        };
      }
    }
  }

  public isSupported(): boolean {
    return this.recognition !== null;
  }

  public start() {
    if (this.recognition) {
      try {
        this.isManualStop = false;
        this.recognition.start();
      } catch (e) {
        // Ignore if already started
      }
    }
  }

  public stop() {
    if (this.recognition) {
      this.isManualStop = true;
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignore
      }
    }
  }
}
