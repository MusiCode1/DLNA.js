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
  }
  return coreDeviceManager;
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
  const manager = getCoreDeviceManager();
  return manager.getActiveDevices(); // כעת מחזיר Map<UDN, CoreApiDevice>
}

/**
 * @hebrew מחזיר את מאגר ההודעות הגולמיות.
 * @returns {RawMessagesBufferEntry[]} מערך של הודעות גולמיות.
 */
export function getRawMessagesBuffer(): RawMessagesBufferEntry[] {
  return rawMessagesBuffer;
}

// לוגיקת הניקוי התקופתי מוסרת מכיוון ש-ActiveDeviceManager מטפל בכך.