import type { LiveScanConfig } from "./instagramTypes";

export const DEFAULT_LIVE_SCAN_CONFIG: LiveScanConfig = {
  pageSize: 24,

  delayMinMs: 900,
  delayMaxMs: 1600,

  pauseEveryPages: 5,
  pauseMs: 7000,

  maxRetries: 3,

  maxPages: 250,
};