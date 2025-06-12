// קובץ: drafts/wol_script.ts
console.log('[DEBUG] Script execution started.'); // DEBUG LOG

// טעינת מודול dgram ליצירת הודעות UDP
import * as dgram from 'dgram';
import { Buffer } from 'buffer'; // ייבוא מפורש של Buffer

/**
 * יוצר את "חבילת הקסם" (Magic Packet) לשליחה.
 * @param {string} mac - כתובת ה-MAC של המחשב היעד, בפורמט כמו '00:1A:2B:3C:4D:5E' או '00-1A-2B-3C-4D-5E'.
 * @returns {Buffer} - חבילת הקסם כ-Buffer.
 * @throws {Error} אם פורמט כתובת ה-MAC אינו תקין.
 */
function createMagicPacket(mac: string): Buffer {
  console.log(`[DEBUG] createMagicPacket called with MAC: ${mac}`); // DEBUG LOG
  // הסרת תווי הפרדה (נקודתיים או מקף) והמרת ה-MAC למחרוזת הקסדצימלית רציפה
  const cleanMac = mac.replace(/[:\-]/g, '');
  if (cleanMac.length !== 12 || !/^[0-9a-fA-F]+$/.test(cleanMac)) {
    console.error('[DEBUG] Invalid MAC format in createMagicPacket.'); // DEBUG LOG
    throw new Error('פורמט כתובת MAC אינו תקין. הכתובת צריכה להכיל 12 תווים הקסדצימליים.');
  }
  console.log('[DEBUG] MAC format validated.'); // DEBUG LOG

  // המרת מחרוזת ה-MAC ההקסדצימלית ל-Buffer
  const macBuffer = Buffer.from(cleanMac, 'hex');
  console.log('[DEBUG] MAC address converted to buffer.'); // DEBUG LOG

  // החלק הראשון של חבילת הקסם: 6 בתים של 0xFF
  const header = Buffer.alloc(6, 0xff);
  
  // בניית חבילת הקסם: Header ואחריו 16 חזרות של כתובת ה-MAC
  let magicPacketParts: Buffer[] = [header];
  for (let i = 0; i < 16; i++) {
    magicPacketParts.push(macBuffer);
  }
  
  const finalPacket = Buffer.concat(magicPacketParts);
  console.log('[DEBUG] Magic packet created successfully.'); // DEBUG LOG
  return finalPacket;
}

/**
 * פונקציית Callback לטיפול בתוצאת השליחה.
 * @param {Error | null} error - אובייקט שגיאה אם אירעה שגיאה, אחרת null.
 */
type WolCallback = (error: Error | null) => void;

/**
 * שולח חבילת Wake-on-LAN (WoL) לכתובת MAC נתונה.
 * @param {string} macAddress - כתובת ה-MAC של המחשב להעיר.
 * @param {string} [broadcastAddress='255.255.255.255'] - כתובת ה-IP לשליחת החבילה (broadcast).
 * @param {number} [port=9] - יציאת היעד (בדרך כלל 7 או 9).
 * @param {WolCallback} [callback] - פונקציית callback אופציונלית שתקרא בסיום.
 */
function sendWakeOnLan(
  macAddress: string,
  broadcastAddress: string = '255.255.255.255',
  port: number = 9,
  callback?: WolCallback
): void {
  console.log(`[DEBUG] sendWakeOnLan called with MAC: ${macAddress}, IP: ${broadcastAddress}, Port: ${port}`); // DEBUG LOG
  try {
    console.log('[DEBUG] Attempting to create magic packet...'); // DEBUG LOG
    // יצירת חבילת הקסם
    const magicPacket: Buffer = createMagicPacket(macAddress);
    console.log('[DEBUG] Magic packet created. Attempting to create UDP socket...'); // DEBUG LOG
    
    // יצירת סוקט UDP
    const client: dgram.Socket = dgram.createSocket('udp4');
    console.log('[DEBUG] UDP socket created.'); // DEBUG LOG

    // הגדרת מאזינים לאירועים
    client.once('listening', () => { // שימוש ב-once כמו בספרייה החיצונית
      console.log('[DEBUG] Socket is listening. Setting broadcast to true.'); // DEBUG LOG
      client.setBroadcast(true); // חיוני לשליחת broadcast
    });

    client.on('error', (err: Error) => {
      console.error(`[DEBUG] Socket error: ${err.stack}`); // DEBUG LOG
      console.error(`Socket error: ${err.stack}`);
      client.close();
      if (callback) callback(err);
    });
    
    // אין צורך ב-bind אם רק שולחים.
    client.bind(() => { // ננסה להוסיף bind מפורש
      console.log('[DEBUG] Socket explicitly bound. Now attempting to send.');
      // שליחת חבילת הקסם מיד לאחר שהסוקט מאזין (או לפחות קשור)
      // בדומה לאופן שבו הספרייה החיצונית עושה זאת (לא מחכה ל-listening callback עבור ה-send)
      client.send(magicPacket, 0, magicPacket.length, port, broadcastAddress, (err: Error | null) => {
        if (err) {
          console.error(`[DEBUG] Failed to send magic packet: ${err}`); // DEBUG LOG
          console.error(`Failed to send magic packet: ${err}`);
          if (callback) callback(err);
        } else {
          console.log(`[DEBUG] Magic packet sent successfully to MAC ${macAddress} via ${broadcastAddress}:${port}`); // DEBUG LOG
          console.log(`Magic packet sent to MAC ${macAddress} via ${broadcastAddress}:${port}`);
          if (callback) callback(null);
        }
        // סגירת הסוקט לאחר השליחה
        console.log('[DEBUG] Closing socket after send.'); // DEBUG LOG
        client.close();
      });
    });
    // client.bind(); // אם יש צורך, ניתן להסיר את ההערה.
    console.log('[DEBUG] Event listeners for socket set up, and explicit bind with send in callback initiated.'); // DEBUG LOG

  } catch (error: any) { // any type for error to access message property
    // טיפול בשגיאות שעלולות להתרחש במהלך יצירת החבילה
    console.error(`[DEBUG] Error in sendWakeOnLan try-catch block: ${error.message}`); // DEBUG LOG
    console.error(`Error creating/sending WoL packet: ${error.message}`);
    if (callback) callback(error);
  }
}

// --- דוגמה לשימוש בסקריפט ---
// 1. החלף את 'XX:XX:XX:XX:XX:XX' בכתובת ה-MAC של המחשב שברצונך להעיר.
// 2. (אופציונלי) שנה את כתובת ה-broadcast אם הרשת שלך משתמשת בכתובת שונה.
// 3. (אופציונלי) שנה את מספר היציאה אם נדרש.

const targetMac: string = ['48:9E:9D:FB:F7:CC', '48:9E:9D:FB:F7:98', 'AC:5A:F0:E5:8C:25'][0]; // <--- שנה לכתובת ה-MAC הרצויה!
const broadcastIp: string = '192.168.1.255'; // ברירת מחדל, שנה אם צריך
const wolPort: number = 9;                     // ברירת מחדל, שנה אם צריך

console.log(`[DEBUG] targetMac: ${targetMac}, broadcastIp: ${broadcastIp}, wolPort: ${wolPort}`); // DEBUG LOG

if (targetMac === 'XX:XX:XX:XX:XX:XX' || targetMac === '') {
  console.warn("[DEBUG] targetMac is placeholder. WoL packet will not be sent."); // DEBUG LOG
  console.warn("אנא עדכן את משתנה targetMac בקובץ עם כתובת ה-MAC של מחשב היעד.");
  console.log("הסקריפט לא יישלח חבילת WoL עד שתוגדר כתובת MAC תקינה.");
} else {
  console.log("[DEBUG] targetMac is set. Calling sendWakeOnLan..."); // DEBUG LOG
  sendWakeOnLan(targetMac, broadcastIp, wolPort, (error: Error | null) => {
    if (error) {
      console.error('[DEBUG] WoL packet send failed (callback). Error:', error); // DEBUG LOG
      console.log('WoL packet send failed.');
    } else {
      console.log('[DEBUG] WoL packet sent successfully (callback).'); // DEBUG LOG
      console.log('WoL packet sent successfully.');
    }
  });
}
console.log('[DEBUG] Script execution finished.'); // DEBUG LOG

// הוראות הרצה:
// 1. ודא ש-Node.js ו-TypeScript מותקנים.
//    (ניתן להשתמש ב-fnm: fnm use <version>, לדוגמה: fnm use 18)
//    להתקנת TypeScript גלובלית: npm install -g typescript ts-node
// 2. שמור קובץ זה (למשל, drafts/wol_script.ts)
// 3. הרץ מהטרמינל בתיקיית השורש של הפרויקט באמצעות ts-node:
//    ts-node drafts/wol_script.ts
//    לחלופין, קמפל ל-JavaScript באמצעות tsc:
//    tsc drafts/wol_script.ts
//    ואז הרץ את קובץ ה-JS שנוצר:
//    node drafts/wol_script.js