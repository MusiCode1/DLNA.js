/**
 * מעיר התקן באמצעות Wake-on-LAN וממתין להתעוררותו באמצעות בדיקות פינג.
 * @param {string} macAddress - כתובת ה-MAC של ההתקן.
 * @param {string} ipAddress - כתובת ה-IP של ההתקן.
 * @param {string} [broadcastAddress='255.255.255.255'] - כתובת ה-broadcast לשליחת חבילת ה-WoL.
 * @param {number} [wolPort=9] - יציאת ה-WoL.
 * @param {number} [pingTotalTimeoutSeconds=60] - זמן קצוב כולל (בשניות) לבדיקות הפינג.
 * @param {number} [pingIntervalSeconds=2] - השהיה (בשניות) בין ניסיונות פינג.
 * @param {number} [pingSingleTimeoutSeconds=3] - זמן קצוב (בשניות) לכל ניסיון פינג בודד.
 * @returns {Promise<void>}
 */
declare function wakeDeviceAndVerify(macAddress: string, ipAddress: string, broadcastAddress?: string, // ברירת מחדל גלובלית
wolPort?: number, pingTotalTimeoutSeconds?: number, // זמן המתנה ארוך יותר להתעוררות
pingIntervalSeconds?: number, pingSingleTimeoutSeconds?: number): Promise<void>;
export { wakeDeviceAndVerify };
