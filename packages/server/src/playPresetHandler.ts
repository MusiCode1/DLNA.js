// קובץ: packages/server/src/playPresetHandler.ts
// מכיל את לוגיקת הליבה להפעלת פריסט

import {
  createModuleLogger,
  DiscoveryDetailLevel,
  processUpnpDeviceFromUrl,
} from 'dlna.js';

import type {
  ApiDevice,
  PresetSettings,
} from './types';

import type {
  DeviceDescription, // ייבוא הטיפוסים מ-dlna.js
  DeviceWithServicesDescription, // ייבוא הטיפוסים מ-dlna.js
  FullDeviceDescription, // ייבוא הטיפוסים מ-dlna.js
} from 'dlna.js';

import { wakeDeviceAndVerify } from '@dlna-tv-play/wake-on-lan';
import { getFolderItemsFromMediaServer, playProcessedItemsOnRenderer, ProcessedPlaylistItem } from './rendererHandler';
import { getActiveDevices } from './deviceManager';

const logger = createModuleLogger('PlayPresetHandler');

/**
 * @hebrew שגיאה מותאמת אישית לתהליך הפעלת פריסט.
 */
export class PlaybackError extends Error {
  statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'PlaybackError';
    this.statusCode = statusCode;
    // שחזור הפרוטוטייפ כדי ש-instanceof יעבוד כראוי עם מחלקות מובנות
    Object.setPrototypeOf(this, PlaybackError.prototype);
  }
}

// Helper functions for handleRendererTask
async function wakeAndVerifyRenderer(
  rendererPreset: NonNullable<PresetSettings['renderer']>, // RendererPreset is now non-nullable
  presetName: string
): Promise<void> {
  logger.info(`Attempting WOL for renderer ${rendererPreset.ipAddress} (MAC: ${rendererPreset.macAddress}) for preset '${presetName}'.`);
  try {
    await wakeDeviceAndVerify(
      rendererPreset.macAddress,
      rendererPreset.ipAddress,
      rendererPreset.broadcastAddress,
      undefined, // wolPort - default
      18, 2, 2 // timeouts
    );
    logger.info(`Device ${rendererPreset.ipAddress} (Renderer) for preset '${presetName}' responded after wakeDeviceAndVerify.`);
  } catch (wakeError: any) {
    logger.error(`wakeDeviceAndVerify failed for renderer ${rendererPreset.ipAddress} (MAC: ${rendererPreset.macAddress}) for preset '${presetName}': ${wakeError.message}`);
    throw new PlaybackError(`Renderer for preset '${presetName}' did not respond or WOL failed: ${wakeError.message}`, 503);
  }
}

async function reviveRendererDetails(
  rendererPreset: NonNullable<PresetSettings['renderer']>,
  presetName: string
): Promise<DeviceDescription | DeviceWithServicesDescription | FullDeviceDescription | import('dlna.js').BasicSsdpDevice> { // Added import('dlna.js').BasicSsdpDevice for clarity
  logger.info(`Attempting to revive renderer ${rendererPreset.udn} from URL: ${rendererPreset.baseURL} after successful wake-up for preset '${presetName}'.`);
  const revivedDevice = await processUpnpDeviceFromUrl(rendererPreset.baseURL, DiscoveryDetailLevel.Services);
  if (!revivedDevice) {
    logger.error(`Failed to retrieve renderer details for ${rendererPreset.udn} (URL: ${rendererPreset.baseURL}) after WOL and ping for preset '${presetName}'.`);
    throw new PlaybackError(`Failed to retrieve renderer details for preset '${presetName}' after successful Wake on LAN.`, 500);
  }
  // Check for essential properties to ensure the device object is usable
  if (!('UDN' in revivedDevice && revivedDevice.UDN)) { // Ensure UDN is present and not empty
    logger.error(`Revived renderer for preset '${presetName}' is missing UDN. URL: ${rendererPreset.baseURL}`);
    throw new PlaybackError(`Revived renderer for preset '${presetName}' is incomplete (missing UDN).`, 500);
  }
  return revivedDevice;
}

/**
 * @hebrew מאשר שהתקן מגיב לבקשה דרך ה-URL שלו.
 * @description פונקציה זו מנסה לאחזר פרטים בסיסיים של ההתקן מה-URL שסופק
 * כדי לוודא שהוא פעיל ומגיב כצפוי.
 * @param deviceToConfirm - אובייקט ה-ApiDevice שיש לאשר (מתוך activeDevices).
 * @param deviceBaseURL - ה-baseURL של ההתקן לבדיקה.
 * @param presetName - שם הפריסט (לצורך לוגים).
 * @returns true אם ההתקן מגיב עם UDN תואם, false אחרת.
 */
async function confirmDeviceRespondsViaUrl(
  deviceToConfirm: ApiDevice,
  deviceBaseURL: string,
  presetName: string
): Promise<boolean> {
  logger.info(`Confirming renderer ${deviceToConfirm.UDN} responds via URL: ${deviceBaseURL} for preset '${presetName}'.`);
  try {
    // שימוש ב-DiscoveryDetailLevel.Basic מספיק לבדיקת תגובה מהירה.
    // הוא מאחזר את קובץ התיאור הראשי של ההתקן.
    const checkedDevice = await processUpnpDeviceFromUrl(deviceBaseURL, DiscoveryDetailLevel.Basic);

    if (checkedDevice && 'UDN' in checkedDevice && checkedDevice.UDN === deviceToConfirm.UDN) {
      logger.info(`Confirmation successful: Renderer ${deviceToConfirm.UDN} (preset '${presetName}') responded as expected.`);
      return true;
    } else {
      const receivedUdn = checkedDevice && 'UDN' in checkedDevice && checkedDevice.UDN ? checkedDevice.UDN : 'N/A or not present';
      logger.warn(`Confirmation failed for renderer ${deviceToConfirm.UDN} (preset '${presetName}'). Device from URL did not match or was incomplete. Expected UDN: ${deviceToConfirm.UDN}, Received UDN: ${receivedUdn}. URL: ${deviceBaseURL}`);
      return false;
    }
  } catch (error: any) {
    logger.warn(`Confirmation failed for renderer ${deviceToConfirm.UDN} (preset '${presetName}') with error: ${error.message}. URL: ${deviceBaseURL}`);
    return false;
  }
}

const INITIAL_POLLING_INTERVAL_MS = 250; // מרווח התחלתי
const MAX_POLLING_INTERVAL_MS = 1500;    // מרווח מקסימלי בין בדיקות
const POLLING_TIMEOUT_MS = 20 * 1000;         // זמן פולינג כולל
const POLLING_INTERVAL_INCREMENT_FACTOR = 1.5; // פקטור הגדלת המרווח

async function pollForRendererInActiveDevices(
  rendererUDN: string,
  presetName: string
): Promise<ApiDevice> {
  logger.info(`Polling for renderer UDN: ${rendererUDN} in active devices for preset '${presetName}' (total timeout: ${POLLING_TIMEOUT_MS}ms).`);

  // פונקציית עזר פנימית לבדיקת ההתקן ברשימה הנוכחית
  function findDeviceInCurrentList(udnToFind: string): ApiDevice | undefined {
    const currentActiveDevices = getActiveDevices();
    return currentActiveDevices.get(udnToFind);
  }

  let foundDevice: ApiDevice | undefined = undefined;
  const startTime = Date.now();
  let currentInterval = INITIAL_POLLING_INTERVAL_MS;
  let attempts = 0;

  while (Date.now() - startTime < POLLING_TIMEOUT_MS) {
    attempts++;
    foundDevice = findDeviceInCurrentList(rendererUDN);
    if (foundDevice) {
      logger.info(`Renderer ${rendererUDN} found in active devices after ${Date.now() - startTime}ms (${attempts} attempts) for preset '${presetName}'.`);
      break; // יציאה מהלולאה הראשית
    }

    // בדוק אם ההמתנה הבאה תחרוג מהזמן הכולל
    const timeElapsed = Date.now() - startTime;
    if (timeElapsed + currentInterval >= POLLING_TIMEOUT_MS) {
      // אם כן, בצע בדיקה אחרונה מיד לפני היציאה (אם נשאר זמן קטן מהאינטרוול הבא)
      const remainingTime = POLLING_TIMEOUT_MS - timeElapsed;
      if (remainingTime > 0) { // רק אם נשאר זמן כלשהו
        logger.debug(`Approaching timeout for ${rendererUDN}. Performing one last check within ${remainingTime}ms.`);
        // המתן את הזמן הנותר (או חלק ממנו אם הוא קטן מאוד) לפני הבדיקה האחרונה
        await new Promise(resolve => setTimeout(resolve, Math.max(0, remainingTime - 10))); // המתן כמעט את כל הזמן הנותר
        foundDevice = findDeviceInCurrentList(rendererUDN);
        if (foundDevice) {
          logger.info(`Renderer ${rendererUDN} found in active devices in final check before timeout (attempt ${attempts + 1}) for preset '${presetName}'.`);
        }
      }
      break; // צא מהלולאה, כי ההמתנה הבאה תחרוג או שהזמן נגמר
    }

    logger.debug(`Renderer ${rendererUDN} not found yet for preset '${presetName}' (attempt ${attempts}). Waiting ${currentInterval}ms... Time elapsed: ${timeElapsed}ms.`);
    await new Promise(resolve => setTimeout(resolve, currentInterval));

    // הגדלת המרווח לניסיון הבא
    currentInterval = Math.min(MAX_POLLING_INTERVAL_MS, Math.floor(currentInterval * POLLING_INTERVAL_INCREMENT_FACTOR));
  }

  // אם יצאנו מהלולאה ולא מצאנו, נבצע בדיקה אחרונה למקרה שההתקן הופיע ממש ברגע האחרון
  // (זה מכסה גם את המקרה שהלולאה לא רצה כלל כי הזמן הראשוני כבר עבר את ה-timeout, או שההתקן הופיע בזמן ההמתנה האחרונה)
  if (!foundDevice) {
    foundDevice = findDeviceInCurrentList(rendererUDN);
    if (foundDevice) {
      logger.info(`Renderer ${rendererUDN} found in active devices in post-loop final check for preset '${presetName}'.`);
    }
  }

  if (!foundDevice) {
    logger.error(`Renderer ${rendererUDN} still not found in active devices after polling for approx ${POLLING_TIMEOUT_MS}ms for preset '${presetName}'. Total attempts: ${attempts}.`);
    throw new PlaybackError(`Renderer for preset '${presetName}' (UDN: ${rendererUDN}) could not be confirmed in active devices after polling timeout.`, 500);
  }
  return foundDevice;
}

// הפונקציה executePlayPresetLogic תתווסף כאן בשלב הבא

export async function executePlayPresetLogic(
  presetName: string,
  presetSettings: PresetSettings, // מקבלים את הפריסט הספציפי
  activeDevices: Map<string, ApiDevice>
  // updateDeviceListCallback הוסר
): Promise<{ success: true, message: string }> {
  logger.info(`Attempting to play preset: ${presetName}`);

  // הבדיקה על קיום presetSettings נעשית ע"י הקורא (presetManager)
  // הבדיקה על שלמות הפריסט:
  if (
    !presetSettings.renderer?.udn ||
    !presetSettings.renderer?.baseURL ||
    !presetSettings.renderer?.ipAddress ||
    !presetSettings.renderer?.macAddress ||
    !presetSettings.renderer?.broadcastAddress ||
    !presetSettings.mediaServer?.udn ||
    !presetSettings.mediaServer?.baseURL ||
    !presetSettings.mediaServer?.folder?.objectId
  ) {
    logger.error(`Preset '${presetName}' is missing required settings.`);
    throw new PlaybackError(`Preset '${presetName}' is incomplete. Please check its configuration.`, 400);
  }

  const rendererPreset = presetSettings.renderer!;
  const mediaServerPreset = presetSettings.mediaServer!;
  const folderObjectId = mediaServerPreset.folder.objectId;

  logger.info(`Found preset '${presetName}'. Renderer: ${rendererPreset.udn}, IP: ${rendererPreset.ipAddress}, MAC: ${rendererPreset.macAddress}, Media Server: ${mediaServerPreset.udn}, Folder ID: ${folderObjectId}`);

  // משימה 1: טיפול ב-Renderer (הערה והחייאה במידת הצורך)
  const handleRendererTask = async (): Promise<ApiDevice> => {
    let deviceFromActiveList = activeDevices.get(rendererPreset.udn); // Check initial active devices map

    if (deviceFromActiveList) {
      logger.info(`Renderer ${rendererPreset.udn} (preset '${presetName}') found in initial active devices. Confirming it responds via URL: ${rendererPreset.baseURL}...`);
      const respondsViaUrl = await confirmDeviceRespondsViaUrl(deviceFromActiveList, rendererPreset.baseURL, presetName);
      if (respondsViaUrl) {
        logger.info(`Renderer ${rendererPreset.udn} (preset '${presetName}') confirmed responsive. Using this device instance.`);
        return deviceFromActiveList;
      } else {
        logger.warn(`Renderer ${rendererPreset.udn} (preset '${presetName}') failed to respond as expected via URL. Will proceed as if not found in active list (requires WOL, revival, polling).`);
        // התקן נכשל באישור התגובה, נמשיך כאילו לא היה קיים ברשימה הפעילה.
        // אין צורך לשנות את deviceFromActiveList, פשוט נגיע לקוד הבא.
      }
    }

    // אם ההתקן לא היה ברשימה הפעילה, או שהיה ונכשל בבדיקת החיות:
    logger.info(`Renderer ${rendererPreset.udn} (preset '${presetName}') requires full processing: WOL, device details revival, and polling in active devices list.`);

    // שלב 1: הערה ואימות (WOL and ping)
    await wakeAndVerifyRenderer(rendererPreset, presetName);

    // שלב 2: החייאת פרטי ההתקן המלאים מה-URL שלו
    // פונקציה זו קוראת ל-processUpnpDeviceFromUrl עם DiscoveryDetailLevel.Services
    // ומבצעת ולידציה בסיסית על התוצאה (למשל, קיום UDN).
    const revivedDeviceDescription = await reviveRendererDetails(rendererPreset, presetName);
    // revivedDeviceDescription הוא אובייקט תיאור מהספרייה, לא ApiDevice.
    // ה-UDN שלו אמור להיות זהה ל-rendererPreset.udn.
    logger.info(`Successfully revived details for renderer UDN: ${revivedDeviceDescription.UDN} (preset '${presetName}'). Now polling for its managed instance in active devices list.`);

    // שלב 3: פולינג לאיתור ההתקן המנוהל (ApiDevice) ברשימה המרכזית (activeDevices)
    // זה חשוב כדי לקבל את האובייקט המלא שמנוהל על ידי המערכת, כולל שירותים שעובדו.
    // אנו משתמשים ב-rendererPreset.udn כי זה ה-UDN שאנו מצפים לו.
    const polledApiDevice = await pollForRendererInActiveDevices(rendererPreset.udn, presetName);

    return polledApiDevice;
  };

  // משימה 2: טיפול ב-Media Server (קבלת פריטים)
  const handleMediaServerTask = async (): Promise<ProcessedPlaylistItem[]> => {
    const device = activeDevices.get(mediaServerPreset.udn);
    if (!device) {
      logger.warn(`Media Server ${mediaServerPreset.udn} for preset '${presetName}' is not in active devices. Playback might fail.`);
      throw new PlaybackError(`Media Server for preset '${presetName}' is not currently available.`, 503); // 503 Service Unavailable
    }
    logger.info(`Attempting to get folder items for preset '${presetName}' from Media Server UDN: ${mediaServerPreset.udn}, Folder ID: ${folderObjectId}`);
    try {
      return await getFolderItemsFromMediaServer(
        mediaServerPreset.udn,
        folderObjectId,
        activeDevices,
        logger // שימוש בלוגר של PlayPresetHandler
      );
    } catch (error: any) {
      logger.error(`Error in getFolderItemsFromMediaServer for preset '${presetName}': ${error.message}`, error);
      // אם getFolderItemsFromMediaServer זורק שגיאה עם statusCode, נשתמש בו
      throw new PlaybackError(error.message || `Failed to get items from media server for preset '${presetName}'.`, error.statusCode || 500);
    }
  };

  // הרצת המשימות במקביל
  // עוטפים כל משימה ב-try-catch פנימי כדי ש-Promise.allSettled יוכל לתפוס את השגיאות המותאמות שלנו
  const handleRendererTaskWrapped = async () => {
    try {
      return await handleRendererTask();
    } catch (error) {
      if (error instanceof PlaybackError) throw error; // זרוק מחדש שגיאות PlaybackError
      throw new PlaybackError(error instanceof Error ? error.message : String(error), 500); // עטוף שגיאות אחרות
    }
  };

  const handleMediaServerTaskWrapped = async () => {
    try {
      return await handleMediaServerTask();
    } catch (error) {
      if (error instanceof PlaybackError) throw error;
      throw new PlaybackError(error instanceof Error ? error.message : String(error), 500);
    }
  };

  const results = await Promise.allSettled([handleRendererTaskWrapped(), handleMediaServerTaskWrapped()]);

  const rendererTaskResult = results[0];
  const mediaServerTaskResult = results[1];

  let finalRendererDevice: ApiDevice;
  let processedItems: ProcessedPlaylistItem[];

  if (rendererTaskResult.status === 'rejected') {
    logger.error(`Renderer task failed for preset '${presetName}': ${rendererTaskResult.reason?.message || rendererTaskResult.reason}`);
    // השגיאה כבר אמורה להיות PlaybackError
    throw rendererTaskResult.reason instanceof PlaybackError ? rendererTaskResult.reason : new PlaybackError(rendererTaskResult.reason?.message || `Failed to prepare renderer for preset '${presetName}'.`, rendererTaskResult.reason?.statusCode || 503);
  }
  finalRendererDevice = rendererTaskResult.value;
  // אין צורך לבדוק אם finalRendererDevice הוא null כי handleRendererTask אמור לזרוק שגיאה אם הוא לא מצליח להחזיר מכשיר תקין

  if (mediaServerTaskResult.status === 'rejected') {
    logger.error(`Media server task (get items) failed for preset '${presetName}': ${mediaServerTaskResult.reason?.message || mediaServerTaskResult.reason}`);
    throw mediaServerTaskResult.reason instanceof PlaybackError ? mediaServerTaskResult.reason : new PlaybackError(mediaServerTaskResult.reason?.message || `Failed to get items from media server for preset '${presetName}'.`, mediaServerTaskResult.reason?.statusCode || 500);
  }
  processedItems = mediaServerTaskResult.value;

  if (!processedItems || processedItems.length === 0) {
    logger.warn(`No items returned from media server for preset '${presetName}'.`);
    throw new PlaybackError(`No items found on media server for preset '${presetName}'.`, 404); // 404 Not Found
  }

  // אם שתי המשימות הצליחו, נגן את הפריטים
  logger.info(`Both tasks completed for preset '${presetName}'. Attempting to play ${processedItems.length} items on renderer ${finalRendererDevice.UDN}.`);

  try {
    const playbackResult = await playProcessedItemsOnRenderer(
      finalRendererDevice.UDN,
      processedItems,
      activeDevices,
      logger // שימוש בלוגר של PlayPresetHandler
    );

    if (playbackResult.success) {
      logger.info(`Preset '${presetName}' playback command successful: ${playbackResult.message}`);
      return { success: true, message: playbackResult.message };
    } else {
      // playProcessedItemsOnRenderer אמור לזרוק שגיאה במקרה של כשל, או להחזיר statusCode
      logger.error(`Preset '${presetName}' playback command failed: ${playbackResult.message}`);
      throw new PlaybackError(playbackResult.message, playbackResult.statusCode || 500);
    }
  } catch (error: any) {
    logger.error(`Error during playProcessedItemsOnRenderer for preset '${presetName}': ${error.message}`, error);
    if (error instanceof PlaybackError) throw error; // זרוק מחדש אם זו כבר שגיאת PlaybackError
    throw new PlaybackError(error.message || `Playback failed for preset '${presetName}'.`, error.statusCode || 500);
  }
}