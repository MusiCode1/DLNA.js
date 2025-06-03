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
  const sendWolPromise = new Promise<void>((resolve, reject) => {
    const callback: WolCallback = (error) => {
      if (error) {
        console.error(`Failed to send WoL packet: ${error.message}`);
        reject(error); // דחיית הפרומיס במקרה של שגיאה
      } else {
        console.log(`WoL packet sent successfully to MAC ${macAddress}.`);
        resolve(); // אישור הפרומיס בהצלחה
      }
    };
    sendWakeOnLan(macAddress, broadcastAddress, wolPort);
  });

  try {
    await sendWolPromise; // המתנה לסיום שליחת חבילת ה-WoL
    console.log('WoL packet dispatch process completed. Now waiting for device to wake up...');
  } catch (error) {
    // אם שליחת ה-WoL נכשלה, אין טעם להמשיך לבדיקות פינג
    console.error('Could not send WoL packet. Aborting wake-up attempt.');
    return; // יציאה מהפונקציה
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