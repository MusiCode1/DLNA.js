
// טעינת משתני סביבה מקובץ .env דרך טוען מותאם אישית
// חשוב שזה יקרה כמה שיותר מוקדם בתהליך טעינת האפליקציה
import './envLoader'; // טוען את הקובץ החדש שיצרנו

import { DiscoveryDetailLevel } from 'dlna.js';
import type { ActiveDeviceManagerOptions } from 'dlna.js';
import type { ContinueDiscoveryOptions } from './types';




// קבועים הקשורים לשרת
export const PORT = process.env.PORT || 3300;

// קבועים הקשורים למאגר הודעות גולמיות
export const MAX_RAW_MESSAGES = 100; // קבוע לגודל המאגר

// הגדרות ברירת מחדל לגילוי מכשירים רציף
export const DEFAULT_DISCOVERY_OPTIONS: ActiveDeviceManagerOptions = {
  detailLevel: DiscoveryDetailLevel.Full, // בקש מספיק פרטים עבור ה-API
  includeIPv6: false, // בדרך כלל לא נחוץ ל-DLNA ביתי ועלול להאט
  mSearchIntervalMs:60 * 1000,
  deviceCleanupIntervalMs: 1.5 * 60 * 1000, // כל 1.5 דקות
};

// קבועים לניקוי מכשירים לא פעילים
export const DEVICE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // כל 10 דקות
export const MAX_DEVICE_INACTIVITY_MS = 15 * 60 * 1000; // מכשיר ייחשב לא פעיל אם לא נראה 15 דקות

// הגדרות עבור בדיקת זמינות מכשיר (Polling)
export const PING_POLLING_OPTIONS = {
  INITIAL_POLLING_INTERVAL_MS: 250,       // מרווח התחלתי
  MAX_POLLING_INTERVAL_MS: 1500,          // מרווח מקסימלי בין בדיקות
  POLLING_TIMEOUT_MS: 20 * 1000,          // זמן פולינג כולל
  POLLING_INTERVAL_INCREMENT_FACTOR: 1.5, // פקטור הגדלת המרווח
};