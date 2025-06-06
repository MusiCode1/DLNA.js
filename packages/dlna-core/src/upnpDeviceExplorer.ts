// קובץ זה מכיל את המימוש של מודול לחקירת התקני UPnP, כולל גילוי ועיבוד תיאורים.

import * as os from 'os';
// import type { RemoteInfo } from 'node:dgram'; // הוסר, לא בשימוש ישיר יותר
// import { HTTPParser } from 'http-parser-js'; // הוסר, לא בשימוש ישיר יותר

// import { parseHttpPacket, ParsedHttpPacket } from './genericHttpParser'; // הוסר
import { createModuleLogger } from './logger';
// import { createSocketManager } from './ssdpSocketManager'; // הוסר
// import { processUpnpDevice } from './upnpDeviceProcessor'; // הוסר
import { ActiveDeviceManager } from './activeDeviceManager'; // ייבוא חדש
import {
  DiscoveryOptions,
  BasicSsdpDevice,
  DeviceDescription,
  ProcessedDevice, // נשאר בשימוש עבור הטיפוס הגנרי של ה-iterable
  DiscoveryDetailLevel,
  DeviceWithServicesDescription,
  FullDeviceDescription,
  // RawSsdpMessagePayload, // הוסר, onRawSsdpMessage יועבר ל-ActiveDeviceManager
  // RawSsdpMessageHandler, // הוסר
  ApiDevice, // ייבוא חדש
  ActiveDeviceManagerOptions, // ייבוא חדש
} from './types';


// ==========================================================================================
// Constants - קבועים
// ==========================================================================================
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_SEARCH_TARGET = "ssdp:all";
const DEFAULT_INCLUDE_IPV6 = false;
// const DEFAULT_M_SEARCH_INTERVAL_TIME = 10 * 1000; // הוסר, מנוהל ע"י ActiveDeviceManager

const logger = createModuleLogger('upnpDeviceExplorer');

// ==========================================================================================
// Helper Functions - פונקציות עזר
// ==========================================================================================

// הפונקציה _mapHttpPacketToBasicSsdpDevice הוסרה.
// הלוגיקה שלה ממומשת כעת בתוך ActiveDeviceManager._parseAndMapSsdpMessage

// ==========================================================================================
// Internal Discovery Orchestration Function
// ==========================================================================================

// הפונקציה _discoverDevicesOrchestrator הוסרה.
// הלוגיקה שלה מוחלפת על ידי ActiveDeviceManager.


// הפונקציות שהועברו (_fetchAndParseDeviceDescriptionXml, _populateServices, _fetchScpdAndUpdateService, _populateActionsAndStateVariables, _createInvokeFunctionForAction, _createQueryFunctionForStateVar, _fullyProcessSingleDevice) נמחקו מכאן
// והועברו לקובץ src/upnpDeviceProcessor.ts


// ==========================================================================================
// Exported Iterable Discovery Function with Overloads
// ==========================================================================================

/**
 * @hebrew מגלה התקני UPnP ברשת ומחזיר AsyncIterable של התקנים שנמצאו.
 * רמת הפירוט של המידע המוחזר עבור כל התקן נקבעת על ידי `options.detailLevel`.
 * מאחורי הקלעים, משתמש ב-`ActiveDeviceManager` לניהול הגילוי הרציף.
 *
 * @param options - אופציות לגילוי. כולל:
 *   - `timeoutMs` (מספר, אופציונלי): זמן קצוב כולל לגילוי במילישניות. לאחר זמן זה, הגילוי יפסיק. ברירת מחדל: 5000.
 *   - `searchTarget` (מחרוזת, אופציונלי): יעד החיפוש של SSDP. ברירת מחדל: "ssdp:all".
 *   - `includeIPv6` (בוליאני, אופציונלי): האם לכלול גילוי דרך IPv6. ברירת מחדל: false.
 *   - `detailLevel` (DiscoveryDetailLevel, אופציונלי): רמת הפירוט של המידע המוחזר. ברירת מחדל: 'full'.
 *     - 'basic': מניב {@link BasicSsdpDevice}.
 *     - 'description': מניב {@link DeviceDescription}.
 *     - 'services': מניב {@link DeviceWithServicesDescription}.
 *     - 'full': מניב {@link FullDeviceDescription} (או ליתר דיוק {@link ApiDevice} שהוא תת-טיפוס).
 *   - `abortSignal` (AbortSignal, אופציונלי): אות לביטול תהליך הגילוי.
 *   - `onRawSsdpMessage` (פונקציה, אופציונלי): קולבק לקבלת הודעות SSDP גולמיות.
 *   - `networkInterfaces` (אובייקט, אופציונלי): ממשקי רשת ספציפיים לשימוש.
 *   - `mSearchIntervalMs` (מספר, אופציונלי): מרווח זמן בין שליחות M-SEARCH. מועבר ל-`ActiveDeviceManager`.
 *   - `deviceCleanupIntervalMs` (מספר, אופציונלי): מרווח זמן לניקוי מכשירים לא פעילים. מועבר ל-`ActiveDeviceManager`.
 * @returns AsyncIterable המניב התקנים. טיפוס ההתקנים המנובים תלוי ב-`detailLevel`.
 */
export function discoverSsdpDevicesIterable(
  options: DiscoveryOptions & { detailLevel: DiscoveryDetailLevel.Basic } & Pick<ActiveDeviceManagerOptions, 'mSearchIntervalMs' | 'deviceCleanupIntervalMs'>
): AsyncIterable<BasicSsdpDevice>;
export function discoverSsdpDevicesIterable(
  options: DiscoveryOptions & { detailLevel: DiscoveryDetailLevel.Description } & Pick<ActiveDeviceManagerOptions, 'mSearchIntervalMs' | 'deviceCleanupIntervalMs'>
): AsyncIterable<DeviceDescription>;
export function discoverSsdpDevicesIterable(
  options: DiscoveryOptions & { detailLevel: DiscoveryDetailLevel.Services } & Pick<ActiveDeviceManagerOptions, 'mSearchIntervalMs' | 'deviceCleanupIntervalMs'>
): AsyncIterable<DeviceWithServicesDescription>;
export function discoverSsdpDevicesIterable(
  options: DiscoveryOptions & { detailLevel: DiscoveryDetailLevel.Full } & Pick<ActiveDeviceManagerOptions, 'mSearchIntervalMs' | 'deviceCleanupIntervalMs'>
): AsyncIterable<FullDeviceDescription>; // טכנית יוחזר ApiDevice
export function discoverSsdpDevicesIterable(
  options?: DiscoveryOptions & Pick<ActiveDeviceManagerOptions, 'mSearchIntervalMs' | 'deviceCleanupIntervalMs'>
): AsyncIterable<FullDeviceDescription>; // טכנית יוחזר ApiDevice

export async function* discoverSsdpDevicesIterable(
  options?: DiscoveryOptions & Pick<ActiveDeviceManagerOptions, 'mSearchIntervalMs' | 'deviceCleanupIntervalMs'>
): AsyncIterable<ProcessedDevice> { // ProcessedDevice הוא הטיפוס הגנרי, בפועל יוחזר ApiDevice
  const effectiveTimeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deviceManagerOptions: ActiveDeviceManagerOptions = {
    searchTarget: options?.searchTarget ?? DEFAULT_SEARCH_TARGET,
    includeIPv6: options?.includeIPv6 ?? DEFAULT_INCLUDE_IPV6,
    detailLevel: options?.detailLevel ?? DiscoveryDetailLevel.Full,
    onRawSsdpMessage: options?.onRawSsdpMessage,
    networkInterfaces: options?.networkInterfaces as any, // TODO: Fix this type assertion if a better solution is found
    mSearchIntervalMs: options?.mSearchIntervalMs, // יכול להיות undefined
    deviceCleanupIntervalMs: options?.deviceCleanupIntervalMs, // יכול להיות undefined
  };

  const activeDeviceManager = new ActiveDeviceManager(deviceManagerOptions);

  const deviceBuffer: ApiDevice[] = [];
  let resolveDevicePromise: ((device: ApiDevice | undefined) => void) | null = null; // Allow undefined for timeout/abort
  let rejectDevicePromise: ((reason?: any) => void) | null = null;
  let discoveryEndedByTimeoutOrAbort = false;
  let managerStopped = false;
  let managerError: Error | null = null;

  const onDeviceFound = (_usn: string, device: ApiDevice) => {
    if (managerStopped || discoveryEndedByTimeoutOrAbort) return;

    // כאן ניתן להוסיף לוגיקה לוודא שה-device.detailLevelAchieved
    // תואם ל-options.detailLevel המקורי, או לבצע המרה אם נדרש.
    // כרגע, נניח ש-ActiveDeviceManager מחזיר מכשירים ברמה המבוקשת.
    if (resolveDevicePromise) {
      const resolve = resolveDevicePromise;
      resolveDevicePromise = null;
      rejectDevicePromise = null;
      resolve(device);
    } else {
      deviceBuffer.push(device);
    }
  };

  const onManagerError = (err: Error) => {
    if (managerStopped) return;
    logger.error('discoverSsdpDevicesIterable: ActiveDeviceManager emitted error:', err);
    managerError = err; // שמירת השגיאה
    discoveryEndedByTimeoutOrAbort = true; // סימון לסיום
    if (rejectDevicePromise) {
      const reject = rejectDevicePromise;
      resolveDevicePromise = null;
      rejectDevicePromise = null;
      reject(err);
    } else if (resolveDevicePromise) {
      // אם יש yield שממתין, נפתור אותו כדי שהלולאה תצא ותזרוק את השגיאה
      const resolve = resolveDevicePromise;
      resolveDevicePromise = null;
      rejectDevicePromise = null;
      resolve(undefined);
    }
  };
  
  const stopManagerAndCleanup = async () => {
    if (!managerStopped) {
        managerStopped = true;
        logger.debug('discoverSsdpDevicesIterable: Stopping ActiveDeviceManager...');
        activeDeviceManager.off('devicefound', onDeviceFound);
        activeDeviceManager.off('error', onManagerError);
        // activeDeviceManager.off('started'); // אין צורך להסיר started/stopped
        // activeDeviceManager.off('stopped');
        await activeDeviceManager.stop().catch(err => {
            logger.error('discoverSsdpDevicesIterable: Error stopping ActiveDeviceManager in cleanup:', err);
        });
        logger.debug('discoverSsdpDevicesIterable: ActiveDeviceManager stopped.');
        // אם יש Promise שממתין, נפתור אותו כדי שהלולאה תסתיים
        if (resolveDevicePromise) {
            const resolve = resolveDevicePromise;
            resolveDevicePromise = null;
            rejectDevicePromise = null;
            resolve(undefined);
        }
    }
  };

  activeDeviceManager.on('devicefound', onDeviceFound);
  activeDeviceManager.on('error', onManagerError);
  // אין צורך להאזין ל-'started' או 'stopped' כאן, כי מחזור החיים נשלט על ידי ה-iterable.

  let timeoutId: NodeJS.Timeout | null = null;
  const externalAbortHandler = () => {
    logger.debug('discoverSsdpDevicesIterable: External abortSignal triggered.');
    discoveryEndedByTimeoutOrAbort = true;
    // אין צורך לקרוא ל-stopManagerAndCleanup כאן, זה יקרה ב-finally
    // רק נוודא ש-Promise ממתין יתעורר
    if (resolveDevicePromise) {
        const resolve = resolveDevicePromise;
        resolveDevicePromise = null;
        rejectDevicePromise = null;
        resolve(undefined);
    }
  };

  try {
    logger.debug('discoverSsdpDevicesIterable: Starting ActiveDeviceManager...');
    await activeDeviceManager.start(); // ActiveDeviceManager פולט 'started'
    logger.debug('discoverSsdpDevicesIterable: ActiveDeviceManager started.');

    if (options?.abortSignal) {
      if (options.abortSignal.aborted) {
        externalAbortHandler(); // אם כבר בוטל
      } else {
        options.abortSignal.addEventListener('abort', externalAbortHandler, { once: true });
      }
    }

    if (effectiveTimeoutMs > 0 && effectiveTimeoutMs !== Infinity && !discoveryEndedByTimeoutOrAbort) {
      timeoutId = setTimeout(() => {
        logger.debug(`discoverSsdpDevicesIterable: Timeout of ${effectiveTimeoutMs}ms reached.`);
        discoveryEndedByTimeoutOrAbort = true;
        // אין צורך לקרוא ל-stopManagerAndCleanup כאן, זה יקרה ב-finally
        // רק נוודא ש-Promise ממתין יתעורר
        if (resolveDevicePromise) {
            const resolve = resolveDevicePromise;
            resolveDevicePromise = null;
            rejectDevicePromise = null;
            resolve(undefined);
        }
      }, effectiveTimeoutMs);
    }

    while (!discoveryEndedByTimeoutOrAbort) {
      if (managerError) {
        throw managerError; // אם הייתה שגיאה מהמנהל, זרוק אותה
      }
      if (deviceBuffer.length > 0) {
        yield deviceBuffer.shift()! as ProcessedDevice;
      } else {
        const nextDevicePromise = new Promise<ApiDevice | undefined>((resolve, reject) => {
          if (discoveryEndedByTimeoutOrAbort) { // בדיקה נוספת למקרה שהמצב השתנה בזמן יצירת ה-Promise
            resolve(undefined);
            return;
          }
          resolveDevicePromise = resolve;
          rejectDevicePromise = reject;
        });
        
        const yieldedDevice = await nextDevicePromise;
        if (yieldedDevice === undefined && discoveryEndedByTimeoutOrAbort) {
            break; 
        }
        if (yieldedDevice) {
             yield yieldedDevice as ProcessedDevice;
        }
      }
    }
  } catch (err) {
    logger.error('discoverSsdpDevicesIterable: Error during iteration:', err);
    // השגיאה תיזרק הלאה על ידי ה-caller של ה-generator
    throw err;
  } finally {
    logger.debug('discoverSsdpDevicesIterable: Finally block. Cleaning up...');
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (options?.abortSignal) {
      options.abortSignal.removeEventListener('abort', externalAbortHandler);
    }
    await stopManagerAndCleanup();
    logger.debug('discoverSsdpDevicesIterable: Cleanup complete.');
  }
}

// ==========================================================================================
// Exported Promise-based Discovery Function (Main Entry Point) - הוסרה
// ==========================================================================================

// הפונקציה discoverSsdpDevices (שמחזירה Promise) הוסרה.
// המשתמשים יכולים להשתמש ב-discoverSsdpDevicesIterable ו לאסוף את התוצאות למערך אם נדרש.
// לדוגמה:
// async function getAllDevices(options) {
//   const devices = [];
//   for await (const device of discoverSsdpDevicesIterable(options)) {
//     devices.push(device);
//   }
//   return devices;
// }
