// server/types.ts
import type {
    ServiceDescription,
    DiscoveryOptions,
    ApiDevice as CoreApiDevice,    // הוספנו ייבוא זה עם alias
    DeviceIcon as CoreDeviceIcon  // הוספנו ייבוא זה עם alias
} from 'dlna.js';

/**
 * @hebrew מייצג את המידע על התקן כפי שהוא נשמר ומוצג ב-API של השרת.
 */
// הגדרת טיפוס עבור אובייקט אייקון, כפי שנשלח ללקוח
export type ApiDeviceIcon = CoreDeviceIcon;

export type ApiDevice = CoreApiDevice;

export interface ContinueDiscoveryOptions extends DiscoveryOptions {
    continuousIntervalMs: number
}
// הוספת טיפוסים עבור הגדרות פריסט
export interface RendererPreset {
  udn: string;
  baseURL: string;
  ipAddress: string; // שדה חובה
  macAddress: string; // שדה חובה
  broadcastAddress: string; // כתובת השידור
}

export interface FolderPreset {
  objectId: string; // שדה חובה
  path?: string | null; // נתיב התיקייה, אופציונלי (לנוחות המשתמש, לא קריטי לפעולה)
}

export interface MediaServerPreset {
  udn: string;
  baseURL: string;
  folder: FolderPreset; // שדה חובה
}

export interface PresetSettings {
  renderer?: RendererPreset | null;
  mediaServer?: MediaServerPreset | null;
}

// טיפוס עבור כלל הפריסטים, כאשר המפתח הוא שם הפריסט
export interface AllPresetSettings {
  [presetName: string]: PresetSettings;
}

// טיפוס עבור רשומת פריסט בודדת במערך, כפי שמוחזר ללקוח
export interface PresetEntry {
  name: string;
  settings: PresetSettings;
}