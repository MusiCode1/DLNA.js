// server/types.ts
import type { ServiceDescription } from '../src'; // ApiDevice תלוי ב-ServiceDescription

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
}
