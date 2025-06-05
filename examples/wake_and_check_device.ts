// קובץ: drafts/wake_and_check_device.ts
import { wakeDeviceAndVerify } from '@dlna-tv-play/wake-on-lan';

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
// הפונקציה המקומית הוסרה מכיוון שאנו מייבאים אותה מהחבילה

// --- דוגמת שימוש ---
// יש להחליף את הערכים הבאים בכתובת ה-MAC וכתובת ה-IP הרלוונטיות
const DEFAULT_MAC_ADDRESS = 'YOUR_MAC_ADDRESS_HERE'; // <--- החלף בכתובת ה-MAC שלך
const DEFAULT_IP_ADDRESS = 'YOUR_IP_ADDRESS_HERE';    // <--- החלף בכתובת ה-IP שלך

// כאן המשתמש יכול לשנות את הערכים במידת הצורך לפני הרצת הסקריפט
let targetMacAddress = 'AC:5A:F0:E5:8C:25';
let targetIpAddress = '192.168.1.41';
// הגדרת כתובת ה-broadcast הנכונה והספציפית לרשת שלך
let targetBroadcastAddress = '192.168.1.255';

// אם רוצים להשתמש בערכים ספציפיים לבדיקה, ניתן לשנות אותם כאן:
// targetMacAddress = '48:9E:9D:FB:F7:98';
// targetIpAddress = '192.168.1.100';
// targetBroadcastAddress = '192.168.1.255'; // ודא שזו הכתובת הנכונה לרשת שלך

// הרצת הפונקציה הראשית
async function main() {
  // בדיקה אם המשתמש עדיין משתמש בערכי ה-placeholder
  if (targetMacAddress === DEFAULT_MAC_ADDRESS || targetIpAddress === DEFAULT_IP_ADDRESS) {
    console.warn('Warning: Using default placeholder MAC and/or IP addresses. Please update them in the script or ensure they are correct.');
  }

  console.log(`[main] Initiating wake-up for MAC: ${targetMacAddress}, IP: ${targetIpAddress}, using Broadcast: ${targetBroadcastAddress}`);
  // העברת כתובת ה-broadcast הנכונה לפונקציה
  await wakeDeviceAndVerify(targetMacAddress, targetIpAddress, targetBroadcastAddress);
}

// קריאה לפונקציית main אם הקובץ מורץ ישירות
if (require.main === module) {
  main().catch(error => {
    console.error("An unexpected error occurred in main:", error);
  });
}

// הייצוא המקומי הוסר