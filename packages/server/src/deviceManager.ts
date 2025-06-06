import { createModuleLogger, ActiveDeviceManager, type ActiveDeviceManagerOptions, type ApiDevice, type RawSsdpMessagePayload } from 'dlna.js';
import type { RemoteInfo } from 'node:dgram';
// import type { ApiDevice } from './types'; // ApiDevice יגיע מ-dlna-core
import { DEFAULT_DISCOVERY_OPTIONS, MAX_RAW_MESSAGES } from './config';

const logger = createModuleLogger('DeviceManager');

// מאגר לאחסון הודעות SSDP גולמיות
interface RawMessagesBufferEntry {
  message: string; // ההודעה כטקסט
  remoteInfo: RemoteInfo; // מידע על השולח
  socketType: string; // סוג הסוקט (unicast/multicast)
}
const rawMessagesBuffer: RawMessagesBufferEntry[] = [];

// מפה לאחסון המכשירים הפעילים שנתגלו
// הטיפוס ApiDevice מיובא כעת מ-dlna-core
const activeDevices: Map<string, ApiDevice> = new Map();

// הגדרת האופציות עבור ActiveDeviceManager
// יש לוודא שהאופציות ב-DEFAULT_DISCOVERY_OPTIONS תואמות ל-ActiveDeviceManagerOptions
// או לבצע המרה/התאמה. בשלב זה נניח שהן תואמות ברובן.
const { networkInterfaces, ...restOfDefaultOptions } = DEFAULT_DISCOVERY_OPTIONS;

const activeDeviceManagerOptions: ActiveDeviceManagerOptions = {
  ...restOfDefaultOptions,
  // אם יש צורך להעביר את הקולבק להודעות גולמיות, נוסיף אותו כאן
  onRawSsdpMessage: (payload: RawSsdpMessagePayload) => { // תוקן ל-RawSsdpMessagePayload
    const messageString = payload.message.toString('utf-8');
    rawMessagesBuffer.push({
      message: messageString,
      remoteInfo: payload.remoteInfo, // תוקן ל-remoteInfo
      socketType: payload.socketType,
    });
    if (rawMessagesBuffer.length > MAX_RAW_MESSAGES) {
      rawMessagesBuffer.shift(); // הסרת ההודעה הישנה ביותר
    }
  },
  // networkInterfaces הוסר מכאן כדי למנוע שגיאת טיפוסים.
  // ActiveDeviceManager ישתמש בממשקים הזמינים כברירת מחדל.
};

let coreDeviceManager: ActiveDeviceManager | null = null;

function getCoreDeviceManager(): ActiveDeviceManager {
  if (!coreDeviceManager) {
    logger.info('Creating ActiveDeviceManager instance');
    coreDeviceManager = new ActiveDeviceManager(activeDeviceManagerOptions);
    initializeDeviceManagerEvents(coreDeviceManager);
  }
  return coreDeviceManager;
}

function initializeDeviceManagerEvents(manager: ActiveDeviceManager): void {
  manager.on('devicefound', (usn: string, device: ApiDevice) => {
    activeDevices.set(usn, device);
    logger.info(`Device found: ${device.friendlyName} (USN: ${usn}, UDN: ${device.UDN})`);
  });

  manager.on('deviceupdated', (usn: string, device: ApiDevice) => {
    activeDevices.set(usn, device);
    logger.info(`Device updated: ${device.friendlyName} (USN: ${usn}, UDN: ${device.UDN})`);
  });

  manager.on('devicelost', (usn: string, device: ApiDevice) => { // device כאן הוא האובייקט שנמחק
    activeDevices.delete(usn);
    logger.info(`Device lost: ${device.friendlyName} (USN: ${usn}, UDN: ${device.UDN})`);
  });

  manager.on('error', (err: Error) => {
    logger.error('ActiveDeviceManager error:', err);
  });

  manager.on('started', () => {
    logger.info('ActiveDeviceManager started successfully.');
  });

  manager.on('stopped', () => {
    logger.info('ActiveDeviceManager stopped.');
  });

  // אין צורך להאזין ל-'rawmessage' כאן אם onRawSsdpMessage מטופל באופציות
}


/**
 * @hebrew מתחיל את תהליך גילוי המכשירים הרציף.
 */
export async function startDiscovery(): Promise<void> {
  logger.info('Initializing UPnP device discovery process using ActiveDeviceManager...');
  const manager = getCoreDeviceManager();
  try {
    // אין צורך לבדוק isRunning, המתודה start אמורה לטפל בזה
    await manager.start();
  } catch (error) {
    logger.error('Failed to start ActiveDeviceManager:', error);
    // שקול אם לזרוק את השגיאה הלאה או לטפל בה כאן
  }
}

/**
 * @hebrew מפסיק את תהליך גילוי המכשירים הרציף.
 */
export async function stopDiscovery(): Promise<void> {
  logger.info('Stopping UPnP device discovery...');
  const manager = getCoreDeviceManager();
  try {
    // אין צורך לבדוק isRunning, המתודה stop אמורה לטפל בזה
    await manager.stop();
  } catch (error) {
    logger.error('Failed to stop ActiveDeviceManager:', error);
  }
}

/**
 * @hebrew מחזיר את רשימת המכשירים הפעילים הנוכחית.
 * @returns {Map<string, ApiDevice>} מפה של המכשירים הפעילים.
 */
export function getActiveDevices(): Map<string, ApiDevice> {
  // ActiveDeviceManager מחזיק את רשימת המכשירים העדכנית בעצמו
  // והאירועים שלו מעדכנים את המפה המקומית activeDevices
  return activeDevices;
  // לחלופין, אם רוצים תמיד את המידע הישיר מהמנהל:
  // const manager = getCoreDeviceManager();
  // return manager.getActiveDevices(); // ודא שהטיפוס המוחזר תואם
}

/**
 * @hebrew מחזיר את מאגר ההודעות הגולמיות.
 * @returns {RawMessagesBufferEntry[]} מערך של הודעות גולמיות.
 */
export function getRawMessagesBuffer(): RawMessagesBufferEntry[] {
  return rawMessagesBuffer;
}

// לוגיקת הניקוי התקופתי מוסרת מכיוון ש-ActiveDeviceManager מטפל בכך.