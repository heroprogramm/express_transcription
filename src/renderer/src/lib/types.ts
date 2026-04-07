export interface AppConfig {
  soniox: {
    language: string;
    model: string;
    translate_to: string;
  };
  output: {
    feed_file: string;
    session_log_dir: string;
  };
}

export interface TranscriptEntry {
  id: number;
  timestamp: string;
  text: string;
  isPartial: boolean;
}

export interface TranslationEntry {
  id: number;
  timestamp: string;
  text: string;
}
