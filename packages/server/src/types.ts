// server/types.ts
import type {
    ServiceDescription,
    DiscoveryOptions
} from 'dlna.js'; // ApiDevice תלוי ב-ServiceDescription

/**
 * @hebrew מייצג את המידע על התקן כפי שהוא נשמר ומוצג ב-API של השרת.
 */
// הגדרת טיפוס עבור אובייקט אייקון, כפי שנשלח ללקוח
export interface ApiDeviceIcon {
    mimetype?: string; // הפך לאופציונלי
    width: number;
    height: number;
    depth: number;
    url?: string; // הפך לאופציונלי
}

export interface ApiDevice {
    friendlyName: string;
    modelName?: string; // הפך לאופציונלי כי לא תמיד קיים
    UDN: string;
    location?: string; // הוסף
    server?: string;   // הוסף
    st?: string;       // הוסף
    remoteAddress?: string;
    remotePort?: number; // הוסף
    baseURL?: string;
    manufacturer?: string; // הוסף
    deviceType?: string; // הוסף
    presentationURL?: string;
    iconList?: ApiDeviceIcon[]; // שונה מ-iconUrl למערך אובייקטי אייקונים
    serviceList?: Map<string, ServiceDescription>; // עודכן ל-Map כדי להתאים לטיפוס מהליבה
    lastSeen: number;
    expiresAt?: number; // הוסף
    detailLevelAchieved?: string; // הוסף
    // supportedServices הוסר כי הוא לא נשלח עוד
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