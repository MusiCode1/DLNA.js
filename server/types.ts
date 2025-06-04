// server/types.ts
import type {
    ServiceDescription,
    DiscoveryOptions
} from '../src'; // ApiDevice תלוי ב-ServiceDescription

/**
 * @hebrew מייצג את המידע על התקן כפי שהוא נשמר ומוצג ב-API של השרת.
 */
export interface ApiDevice {
    friendlyName: string;
    modelName: string;
    udn: string;
    remoteAddress?: string;
    lastSeen: number; // חותמת זמן מתי המכשיר נראה לאחרונה
    iconUrl?: string; // הוספת שדה עבור URL הלוגו
    baseURL?: string; // חיוני להרכבת URL-ים אבסולוטיים לשירותים
    serviceList?: ServiceDescription[]; // רשימת השירותים המלאה
    supportedServices?: string[]; // שירותים נתמכים (יכול להיות נגזר מ-serviceList)
    presentationURL?: string; // הוספת שדה עבור כתובת ה-URL של דף ההצגה של ההתקן
    rootDoc: string;
}

export interface ContinueDiscoveryOptions extends DiscoveryOptions {
    continuousIntervalMs: number
}
// הוספת טיפוסים עבור הגדרות פריסט
export interface RendererPreset {
  udn: string;
  baseURL: string;
  ipAddress: string; // שדה חובה
  macAddress: string; // שדה חובה
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