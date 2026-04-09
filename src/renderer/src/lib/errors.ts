import { showToast } from "../components/Toast";

export type ErrorCategory = "mic" | "api-key" | "session" | "config" | "network" | "unknown";

interface AppError {
  category: ErrorCategory;
  message: string;
  original?: unknown;
}

type ErrorHandler = (error: AppError) => void;

const listeners: ErrorHandler[] = [];

export function onAppError(handler: ErrorHandler): () => void {
  listeners.push(handler);
  return () => {
    const idx = listeners.indexOf(handler);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function reportError(category: ErrorCategory, message: string, original?: unknown): void {
  const error: AppError = { category, message, original };

  console.error(`[${category}]`, message, original ?? "");

  for (const handler of listeners) {
    handler(error);
  }

  const toastType = category === "config" ? "info" : "error";
  showToast(message, toastType);
}

export function capturePromise(
  category: ErrorCategory,
  promise: Promise<unknown>,
  fallbackMessage = "An unexpected error occurred",
): void {
  promise.catch((err) => {
    const message = err instanceof Error ? err.message : fallbackMessage;
    reportError(category, message, err);
  });
}
