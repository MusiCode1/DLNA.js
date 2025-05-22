// קובץ: drafts/wol_script.js

// טעינת מודול dgram ליצירת הודעות UDP
import { createSocket } from 'dgram';

/**
 * יוצר את "חבילת הקסם" (Magic Packet) לשליחה.
 * @param {string} mac - כתובת ה-MAC של המחשב היעד, בפורמט כמו '00:1A:2B:3C:4D:5E' או '00-1A-2B-3C-4D-5E'.
 * @returns {Buffer} - חבילת הקסם כ-Buffer.
 * @throws {Error} אם פורמט כתובת ה-MAC אינו תקין.
 */
function createMagicPacket(mac) {
  // הסרת תווי הפרדה (נקודתיים או מקף) והמרת ה-MAC למחרוזת הקסדצימלית רציפה
  const cleanMac = mac.replace(/[:\-]/g, '');
  if (cleanMac.length !== 12 || !/^[0-9a-fA-F]+$/.test(cleanMac)) {
    throw new Error('פורמט כתובת MAC אינו תקין. הכתובת צריכה להכיל 12 תווים הקסדצימליים.');
  }

  // המרת מחרוזת ה-MAC ההקסדצימלית ל-Buffer
  const macBuffer = Buffer.from(cleanMac, 'hex');

  // החלק הראשון של חבילת הקסם: 6 בתים של 0xFF
  const header = Buffer.alloc(6, 0xff);
  
  // בניית חבילת הקסם: Header ואחריו 16 חזרות של כתובת ה-MAC
  let magicPacketParts = [header];
  for (let i = 0; i < 16; i++) {
    magicPacketParts.push(macBuffer);
  }
  
  return Buffer.concat(magicPacketParts);
}

/**
 * שולח חבילת Wake-on-LAN (WoL) לכתובת MAC נתונה.
 * @param {string} macAddress - כתובת ה-MAC של המחשב להעיר.
 * @param {string} [broadcastAddress='255.255.255.255'] - כתובת ה-IP לשליחת החבילה (broadcast).
 * @param {number} [port=9] - יציאת היעד (בדרך כלל 7 או 9).
 * @param {function} [callback] - פונקציית callback אופציונלית שתקרא בסיום (err).
 */
function sendWakeOnLan(macAddress, broadcastAddress = '255.255.255.255', port = 9, callback) {
  try {
    // יצירת חבילת הקסם
    const magicPacket = createMagicPacket(macAddress);
    
    // יצירת סוקט UDP
    const client = createSocket('udp4');

    client.on('listening', () => {
      // הגדרת הסוקט לאפשר שידור broadcast - חיוני!
      client.setBroadcast(true);
      
      // שליחת חבילת הקסם
      client.send(magicPacket, 0, magicPacket.length, port, broadcastAddress, (err) => {
        if (err) {
          console.error(`Failed to send magic packet: ${err}`);
          if (callback) callback(err);
        } else {
          console.log(`Magic packet sent to MAC ${macAddress} via ${broadcastAddress}:${port}`);
          if (callback) callback(null);
        }
        // סגירת הסוקט לאחר השליחה
        client.close();
      });
    });

    client.on('error', (err) => {
      console.error(`Socket error: ${err.stack}`);
      client.close();
      if (callback) callback(err);
    });
    
    // אין צורך ב-bind אם רק שולחים.
    // client.bind(); // אם יש צורך, ניתן להסיר את ההערה.

  } catch (error) {
    // טיפול בשגיאות שעלולות להתרחש במהלך יצירת החבילה
    console.error(`Error creating/sending WoL packet: ${error.message}`);
    if (callback) callback(error);
  }
}

// --- דוגמה לשימוש בסקריפט ---
// 1. החלף את 'XX:XX:XX:XX:XX:XX' בכתובת ה-MAC של המחשב שברצונך להעיר.
// 2. (אופציונלי) שנה את כתובת ה-broadcast אם הרשת שלך משתמשת בכתובת שונה.
// 3. (אופציונלי) שנה את מספר היציאה אם נדרש.

const targetMac = '48:9E:9D:FB:F7:98'; // <--- שנה לכתובת ה-MAC הרצויה!
const broadcastIp = '255.255.255.255'; // ברירת מחדל, שנה אם צריך
const wolPort = 9;                     // ברירת מחדל, שנה אם צריך

if (targetMac === 'XX:XX:XX:XX:XX:XX' || targetMac === '') {
  console.warn("אנא עדכן את משתנה targetMac בקובץ עם כתובת ה-MAC של מחשב היעד.");
  console.log("הסקריפט לא יישלח חבילת WoL עד שתוגדר כתובת MAC תקינה.");
} else {
  sendWakeOnLan(targetMac, broadcastIp, wolPort, (error) => {
    if (error) {
      console.log('WoL packet send failed.');
    } else {
      console.log('WoL packet sent successfully.');
    }
  });
}

// הוראות הרצה:
// 1. ודא ש-Node.js מותקן (ניתן להשתמש ב-fnm: fnm use <version>, לדוגמה: fnm use 18)
// 2. שמור קובץ זה (למשל, drafts/wol_script.js)
// 3. הרץ מהטרמינל בתיקיית השורש של הפרויקט: node drafts/wol_script.js