/**
 * Centralised timing constants used across main and renderer processes.
 * Keeping them in one file makes tuning straightforward without hunting
 * through individual modules.
 */

// ── Session / feed ──
export const FEED_FLUSH_INTERVAL_MS = 200;

// ── Metrics ──
export const METRICS_COLLECTION_INTERVAL_MS = 2000;

// ── Auto-updater ──
export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ── Viz Engine ──
export const VIZ_SCROLL_INTERVAL_MS = 30;
export const VIZ_CMD_TIMEOUT_MS = 500;
export const VIZ_CONNECT_TIMEOUT_MS = 5_000;
export const VIZ_RECONNECT_DELAY_MS = 5_000;

// ── Soniox reconnection ──
export const SONIOX_BASE_DELAY_MS = 1000;

// ── IPC log batching ──
export const LOG_FLUSH_INTERVAL_MS = 200;

// ── Audio waveform ──
export const WAVEFORM_PUSH_INTERVAL_MS = 80;
