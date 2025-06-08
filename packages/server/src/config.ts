import { env } from './envLoader';
import { DiscoveryDetailLevel } from 'dlna.js';
import type { ActiveDeviceManagerOptions } from 'dlna.js';

/**
 * אובייקט התצורה המרכזי של האפליקציה.
 * הוא מאחד את כל ההגדרות, ומאפשר דריסה של ערכי ברירת מחדל
 * באמצעות משתני סביבה.
 */
export const config = {
  // הגדרות שרת
  server: {
    port: env.PORT || 3300,
  },

  // הגדרות מאגר הודעות
  rawMessages: {
    maxSize: env.MAX_RAW_MESSAGES || 100,
  },

  // הגדרות ברירת מחדל לגילוי מכשירים
  discovery: {
    options: {
      detailLevel: (env.DISCOVERY_DETAIL_LEVEL as DiscoveryDetailLevel) || DiscoveryDetailLevel.Full,
      includeIPv6: env.DISCOVERY_INCLUDE_IPV6 || false,
      mSearchIntervalMs: env.DISCOVERY_MSEARCH_INTERVAL_MS || 60 * 1000,
      deviceCleanupIntervalMs: env.DISCOVERY_DEVICE_CLEANUP_INTERVAL_MS || 1.5 * 60 * 1000,
    } as ActiveDeviceManagerOptions,
  },

  // הגדרות לניקוי מכשירים לא פעילים
  deviceCleanup: {
    intervalMs: env.DEVICE_CLEANUP_INTERVAL_MS || 10 * 60 * 1000,
    maxInactivityMs: env.MAX_DEVICE_INACTIVITY_MS || 15 * 60 * 1000,
  },

  // הגדרות לבדיקת זמינות מכשיר (Polling)
  pingPolling: {
    initialIntervalMs: env.PING_POLLING_INITIAL_INTERVAL_MS || 250,
    maxIntervalMs: env.PING_POLLING_MAX_INTERVAL_MS || 1500,
    timeoutMs: env.PING_POLLING_TIMEOUT_MS || 40 * 1000,
    intervalIncrementFactor: env.PING_POLLING_INTERVAL_INCREMENT_FACTOR || 1.5,
  },
};