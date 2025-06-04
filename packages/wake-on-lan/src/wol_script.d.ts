/**
 * פונקציית Callback לטיפול בתוצאת השליחה.
 * @param {Error | null} error - אובייקט שגיאה אם אירעה שגיאה, אחרת null.
 */
export type WolCallback = (error: Error | null) => void;
/**
 * שולח חבילת Wake-on-LAN (WoL) לכתובת MAC נתונה.
 * @param {string} macAddress - כתובת ה-MAC של המחשב להעיר.
 * @param {string} [broadcastAddress='255.255.255.255'] - כתובת ה-IP לשליחת החבילה (broadcast).
 * @param {number} [port=9] - יציאת היעד (בדרך כלל 7 או 9).
 * @returns {Promise<boolean>} - מחזיר true אם השליחה הצליחה, false אחרת.
 */
export declare function sendWakeOnLan(macAddress: string, broadcastAddress?: string, port?: number): Promise<boolean>;
/**
 * בודק אם ניתן לבצע פינג לכתובת IP נתונה באמצעות ספריית 'ping'.
 * @param {string} ipAddress - כתובת ה-IP לבדיקה.
 * @param {number} [timeoutSeconds=5] - זמן קצוב בשניות להמתנה לתשובת פינג.
 * @returns {Promise<boolean>} - מחזיר true אם הפינג הצליח (ההתקן 'חי'), אחרת false.
 * @throws {Error} אם ספריית 'ping' אינה מותקנת או אם מתרחשת שגיאה בלתי צפויה.
 */
export declare function checkPing(ipAddress: string, timeoutSeconds?: number): Promise<boolean>;
/**
 * בודק אם ניתן לבצע פינג לכתובת IP נתונה, עם ניסיונות חוזרים עד זמן קצוב כולל.
 * @param {string} ipAddress - כתובת ה-IP לבדיקה.
 * @param {number} [totalTimeoutSeconds=15] - זמן קצוב כולל (בשניות) לכל ניסיונות הפינג.
 * @param {number} [pingIntervalSeconds=1] - השהיה (בשניות) בין ניסיון פינג למשנהו.
 * @param {number} [singlePingTimeoutSeconds=2] - זמן קצוב (בשניות) לכל ניסיון פינג בודד.
 * @returns {Promise<boolean>} - מחזיר true אם הפינג הצליח באחד הניסיונות, אחרת false.
 */
export declare function checkPingWithRetries(ipAddress: string, totalTimeoutSeconds?: number, pingIntervalSeconds?: number, singlePingTimeoutSeconds?: number): Promise<boolean>;
