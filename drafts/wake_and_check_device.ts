// קובץ: drafts/wake_and_check_device.ts
import { sendWakeOnLan, WolCallback, checkPingWithRetries } from '../server/wol_script';

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
async function wakeDeviceAndVerify(
  macAddress: string,
  ipAddress: string,
  broadcastAddress: string = '255.255.255.255',
  wolPort: number = 9,
  pingTotalTimeoutSeconds: number = 60, // זמן המתנה ארוך יותר להתעוררות
  pingIntervalSeconds: number = 2,
  pingSingleTimeoutSeconds: number = 3
): Promise<void> {
  console.log(`Attempting to wake device with MAC: ${macAddress} and IP: ${ipAddress}`);

  // שלב 1: שליחת חבילת Wake-on-LAN
  // נשתמש בפרומיס כדי להמתין לסיום פעולת sendWakeOnLan
  console.log(`[wakeDeviceAndVerify] Calling sendWakeOnLan for MAC ${macAddress}`);
  try {
    const wolSuccess = await sendWakeOnLan(macAddress, broadcastAddress, wolPort);
    if (wolSuccess) {
      console.log(`[wakeDeviceAndVerify] WoL packet sent successfully to MAC ${macAddress}.`);
      console.log('WoL packet dispatch process completed. Now waiting for device to wake up...');
    } else {
      // sendWakeOnLan החזיר false, מה שמצביע על כישלון בשליחה
      console.error(`[wakeDeviceAndVerify] sendWakeOnLan reported failure for MAC ${macAddress}.`);
      throw new Error(`sendWakeOnLan failed for MAC ${macAddress}`);
    }
  } catch (error) {
    // אם שליחת ה-WoL נכשלה (בין אם sendWakeOnLan זרק שגיאה או החזיר false)
    console.error(`[wakeDeviceAndVerify] Could not send WoL packet or an error occurred during sendWakeOnLan. Aborting wake-up attempt. Error:`, error);
    // זרוק את השגיאה כדי שה-catch החיצוני יתפוס אותה
    if (error instanceof Error) {
        throw error;
    } else {
        throw new Error(String(error));
    }
  }

  // המתנה קצרה לפני התחלת בדיקות הפינג, כדי לתת להתקן זמן להתחיל לעלות
  console.log('Waiting a few seconds before starting ping checks...');
  await new Promise(resolve => setTimeout(resolve, 5000)); // המתנה של 5 שניות

  // שלב 2: בדיקת התעוררות באמצעות פינג עם ניסיונות חוזרים
  console.log(`Starting ping checks to ${ipAddress} for up to ${pingTotalTimeoutSeconds} seconds...`);
  const isAlive = await checkPingWithRetries(
    ipAddress,
    pingTotalTimeoutSeconds,
    pingIntervalSeconds,
    pingSingleTimeoutSeconds
  );

  // שלב 3: הדפסת תוצאה
  if (isAlive) {
    console.log(`SUCCESS: Device ${ipAddress} is now responding to ping.`);
  } else {
    console.error(`ERROR: Device ${ipAddress} did not respond to ping within ${pingTotalTimeoutSeconds} seconds.`);
  }
}

// --- דוגמת שימוש ---
// יש להחליף את הערכים הבאים בכתובת ה-MAC וכתובת ה-IP הרלוונטיות
const DEFAULT_MAC_ADDRESS = 'YOUR_MAC_ADDRESS_HERE'; // <--- החלף בכתובת ה-MAC שלך
const DEFAULT_IP_ADDRESS = 'YOUR_IP_ADDRESS_HERE';    // <--- החלף בכתובת ה-IP שלך

// כאן המשתמש יכול לשנות את הערכים במידת הצורך לפני הרצת הסקריפט
let targetMacAddress = '48:9E:9D:FB:F7:98';
let targetIpAddress = '192.168.1.122';

// אם רוצים להשתמש בערכים ספציפיים לבדיקה, ניתן לשנות אותם כאן:
// targetMacAddress = '48:9E:9D:FB:F7:98'; 
// targetIpAddress = '192.168.1.100';

// הרצת הפונקציה הראשית
async function main() {
  // בדיקה אם המשתמש עדיין משתמש בערכי ה-placeholder
  if (targetMacAddress === DEFAULT_MAC_ADDRESS || targetIpAddress === DEFAULT_IP_ADDRESS) {
    console.warn('Warning: Using default placeholder MAC and/or IP addresses. Please update them in the script or ensure they are correct.');
  }

  await wakeDeviceAndVerify(targetMacAddress, targetIpAddress);
}

// קריאה לפונקציית main אם הקובץ מורץ ישירות
if (require.main === module) {
  main().catch(error => {
    console.error("An unexpected error occurred in main:", error);
  });
}

// ייצוא הפונקציה לשימוש במודולים אחרים במידת הצורך
export { wakeDeviceAndVerify };