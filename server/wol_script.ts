// קובץ: drafts/wol_script.ts
// טעינת מודול dgram ליצירת הודעות UDP
import * as dgram from 'node:dgram';
import { Buffer } from 'buffer'; // ייבוא מפורש של Buffer
import * as ping from 'ping';


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
export type WolCallback = (error: Error | null) => void;

/**
 * שולח חבילת Wake-on-LAN (WoL) לכתובת MAC נתונה.
 * @param {string} macAddress - כתובת ה-MAC של המחשב להעיר.
 * @param {string} [broadcastAddress='255.255.255.255'] - כתובת ה-IP לשליחת החבילה (broadcast).
 * @param {number} [port=9] - יציאת היעד (בדרך כלל 7 או 9).
 * @returns {Promise<boolean>} - מחזיר true אם השליחה הצליחה, false אחרת.
 */
export async function sendWakeOnLan(
  macAddress: string,
  broadcastAddress: string = '255.255.255.255',
  port: number = 9
): Promise<boolean> {
  // הוספת לוג מפורט לפרמטרים המתקבלים
  console.log(`[sendWakeOnLan ENTRY] Received - MAC: ${macAddress}, Broadcast: ${broadcastAddress}, Port: ${port}`);
  // סוף הלוג הנוסף
  console.log(`[DEBUG] sendWakeOnLan called with MAC: ${macAddress}, IP: ${broadcastAddress}, Port: ${port}`); // DEBUG LOG
  return new Promise<boolean>((resolve) => {
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
        resolve(false); // השליחה נכשלה
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
            resolve(false); // השליחה נכשלה
          } else {
            console.log(`[DEBUG] Magic packet sent successfully to MAC ${macAddress} via ${broadcastAddress}:${port}`); // DEBUG LOG
            console.log(`Magic packet sent to MAC ${macAddress} via ${broadcastAddress}:${port}`);
            resolve(true); // השליחה הצליחה
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
      resolve(false); // השליחה נכשלה עקב שגיאה ביצירת החבילה
    }
  });
}


/**
 * בודק אם ניתן לבצע פינג לכתובת IP נתונה באמצעות ספריית 'ping'.
 * @param {string} ipAddress - כתובת ה-IP לבדיקה.
 * @param {number} [timeoutSeconds=5] - זמן קצוב בשניות להמתנה לתשובת פינג.
 * @returns {Promise<boolean>} - מחזיר true אם הפינג הצליח (ההתקן 'חי'), אחרת false.
 * @throws {Error} אם ספריית 'ping' אינה מותקנת או אם מתרחשת שגיאה בלתי צפויה.
 */
export async function checkPing(ipAddress: string, timeoutSeconds: number = 5): Promise<boolean> {
  // בדיקת תקינות בסיסית של כתובת ה-IP
  if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ipAddress)) {
    console.error(`[DEBUG] Invalid IP address format for ping: ${ipAddress}`);
    return false;
  }

  console.log(`[DEBUG] Attempting a single ping to ${ipAddress} with timeout ${timeoutSeconds}s using 'ping' library.`);

  try {
    const res = await ping.promise.probe(ipAddress, {
      timeout: timeoutSeconds,
    });
    console.log(`[DEBUG] Single ping result for ${ipAddress}: alive = ${res.alive}, output = ${res.output}`);
    return res.alive;
  } catch (error: any) {
    console.error(`[DEBUG] Error during single ping to ${ipAddress} using 'ping' library: ${error.message}`);
    if (error.message && (error.message.includes('Cannot find module \'ping\'') || error.message.includes('ping.promise is undefined'))) {
        console.error("ERROR: The 'ping' library might not be installed correctly or its typings are missing. Please run: npm install ping @types/ping (or bun install ping @types/ping)");
    }
    return false;
  }
}

/**
 * פונקציית עזר להשהיה.
 * @param {number} ms - זמן השהיה באלפיות שנייה.
 * @returns {Promise<void>}
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * בודק אם ניתן לבצע פינג לכתובת IP נתונה, עם ניסיונות חוזרים עד זמן קצוב כולל.
 * @param {string} ipAddress - כתובת ה-IP לבדיקה.
 * @param {number} [totalTimeoutSeconds=15] - זמן קצוב כולל (בשניות) לכל ניסיונות הפינג.
 * @param {number} [pingIntervalSeconds=1] - השהיה (בשניות) בין ניסיון פינג למשנהו.
 * @param {number} [singlePingTimeoutSeconds=2] - זמן קצוב (בשניות) לכל ניסיון פינג בודד.
 * @returns {Promise<boolean>} - מחזיר true אם הפינג הצליח באחד הניסיונות, אחרת false.
 */
export async function checkPingWithRetries(
  ipAddress: string,
  totalTimeoutSeconds: number = 15,
  pingIntervalSeconds: number = 1,
  singlePingTimeoutSeconds: number = 2
): Promise<boolean> {
  if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ipAddress)) {
    console.error(`[DEBUG] Invalid IP address format for ping with retries: ${ipAddress}`);
    return false;
  }

  const startTime = Date.now();
  const endTime = startTime + totalTimeoutSeconds * 1000;
  let attempt = 0;

  console.log(`[DEBUG] Starting ping attempts to ${ipAddress} for up to ${totalTimeoutSeconds}s.`);

  while (Date.now() < endTime) {
    attempt++;
    console.log(`[DEBUG] Ping attempt #${attempt} to ${ipAddress}.`);
    try {
      const isAlive = await checkPing(ipAddress, singlePingTimeoutSeconds);
      if (isAlive) {
        console.log(`[DEBUG] Ping to ${ipAddress} successful on attempt #${attempt}.`);
        return true;
      }
    } catch (error: any) {
      // שגיאות מ-checkPing כבר מטופלות שם, כאן רק נרשום שהניסיון נכשל.
      console.warn(`[DEBUG] Ping attempt #${attempt} to ${ipAddress} encountered an error: ${error.message}`);
    }

    // בדוק אם נותר מספיק זמן לניסיון נוסף + השהיה
    if (Date.now() + pingIntervalSeconds * 1000 < endTime) {
      console.log(`[DEBUG] Waiting ${pingIntervalSeconds}s before next ping attempt.`);
      await delay(pingIntervalSeconds * 1000);
    } else {
      // לא נותר מספיק זמן לניסיון נוסף מלא כולל השהיה, צא מהלולאה
      break;
    }
  }

  console.log(`[DEBUG] All ping attempts to ${ipAddress} failed within the total timeout of ${totalTimeoutSeconds}s.`);
  return false;
}

// הפונקציות והטיפוסים מיוצאים כעת וניתנים לשימוש במודולים אחרים.
// ניתן לייבא אותם כך:
// import { sendWakeOnLan, WolCallback, checkPing, checkPingWithRetries } from './wol_script';