import { env } from './envLoader';
import { DiscoveryDetailLevel } from 'dlna.js';
import type { ActiveDeviceManagerOptions } from 'dlna.js';

/**
 * אובייקט התצורה המרכזי של האפליקציה.
 * הוא מאחד את כל ההגדרות, ומאפשר דריסה של ערכי ברירת מחדל
 * באמצעות משתני סביבה.
 */

const defaultConfig = {
  server: {
    port: 3300,
  },
  rawMessages: {
    maxSize: 100,
  },
  discovery: {
    options: {
      // detailLevel מטופל בנפרד בגלל היותו enum
      includeIPv6: false,
      mSearchIntervalMs: 60 * 1000,
      deviceCleanupIntervalMs: 1.5 * 60 * 1000,
    },
  },
  deviceCleanup: {
    intervalMs: 10 * 60 * 1000,
    maxInactivityMs: 15 * 60 * 1000,
  },
  pingPolling: {
    initialIntervalMs: 250,
    maxIntervalMs: 1500,
    timeoutMs: 40 * 1000,
    intervalIncrementFactor: 1.5,
  },
};

// פונקציית עזר להמרת camelCase ל-SNAKE_CASE
const camelToSnakeCase = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase();

/**
 * פונקציה רקורסיבית שמאתחלת את התצורה.
 * היא עוברת על אובייקט ברירות המחדל, ומחפשת משתני סביבה תואמים
 * כדי לדרוס את הערכים.
 * @param defaultConfig - אובייקט עם ערכי ברירת המחדל.
 * @param path - הנתיב הנוכחי באובייקט (לשימוש רקורסיבי).
 * @returns אובייקט תצורה מאותחל.
 */
function initializeConfig<T extends object>(defaultConfig: T, path: string[] = []): T {
  const initializedConfig: any = {};

  for (const key in defaultConfig) {
    if (Object.prototype.hasOwnProperty.call(defaultConfig, key)) {
      const newPath = [...path, key];
      const value = (defaultConfig as any)[key];

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        initializedConfig[key] = initializeConfig(value, newPath);
      } else {
        const envVarName = newPath.map(camelToSnakeCase).join('_');
        initializedConfig[key] = env[envVarName] !== undefined ? env[envVarName] : value;
      }
    }
  }
  return initializedConfig as T;
}

// 1. הגדרת מבנה התצורה עם ערכי ברירת המחדל


// 2. יצירת תצורה זמנית עם הערכים הגנריים
const tempConfig = initializeConfig(defaultConfig);

// 3. הרכבת התצורה הסופית תוך טיפול במקרים מיוחדים
const finalConfig = {
    ...tempConfig,
    discovery: {
        options: {
            ...tempConfig.discovery.options,
            detailLevel: (env.DISCOVERY_OPTIONS_DETAIL_LEVEL as DiscoveryDetailLevel) || DiscoveryDetailLevel.Full,
        } as ActiveDeviceManagerOptions,
    },
};

export const config = finalConfig;
