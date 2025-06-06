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
import { updateDeviceList } from './deviceManager'; // הוספת הייבוא החסר

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
  const handleRendererTask = async (): Promise<ApiDevice> => { // שונה להחזיר ApiDevice ולא ApiDevice | null
    let device = activeDevices.get(rendererPreset.udn);
    if (!device) {
      logger.info(`Renderer ${rendererPreset.udn} for preset '${presetName}' is not in active devices. Attempting WOL and revival.`);

      try {
        await wakeDeviceAndVerify(
          rendererPreset.macAddress,
          rendererPreset.ipAddress,
          rendererPreset.broadcastAddress,
          undefined, // wolPort - ישאר ברירת מחדל
          18, 2, 2 // timeouts
        );
        logger.info(`Device ${rendererPreset.ipAddress} (Renderer) for preset '${presetName}' responded after wakeDeviceAndVerify.`);
      } catch (wakeError: any) {
        logger.error(`wakeDeviceAndVerify failed for renderer ${rendererPreset.ipAddress} (MAC: ${rendererPreset.macAddress}) for preset '${presetName}': ${wakeError.message}`);
        throw new PlaybackError(`Renderer for preset '${presetName}' did not respond or WOL failed: ${wakeError.message}`, 503); // 503 Service Unavailable
      }

      logger.info(`Attempting to revive renderer ${rendererPreset.udn} from URL: ${rendererPreset.baseURL} after successful wake-up.`);
      const revivedDevice = await processUpnpDeviceFromUrl(rendererPreset.baseURL, DiscoveryDetailLevel.Services);
      if (!revivedDevice) {
        logger.error(`Failed to retrieve renderer details for ${rendererPreset.udn} (URL: ${rendererPreset.baseURL}) after WOL and ping for preset '${presetName}'.`);
        throw new PlaybackError(`Failed to retrieve renderer details for preset '${presetName}' after successful Wake on LAN.`, 500);
      }

      if ('friendlyName' in revivedDevice && 'modelName' in revivedDevice && 'UDN' in revivedDevice) {
        logger.info(`Successfully revived renderer ${revivedDevice.UDN} for preset '${presetName}'. Updating active devices.`);
        updateDeviceList(revivedDevice as DeviceDescription | DeviceWithServicesDescription | FullDeviceDescription); // הקריאה הזו כבר נכונה, בהנחה שהייבוא תקין
        device = activeDevices.get(rendererPreset.udn);
        if (!device) {
          logger.error(`Renderer ${rendererPreset.udn} still not found in active devices after revival for preset '${presetName}'. This should not happen.`);
          throw new PlaybackError(`Internal error: Renderer for preset '${presetName}' could not be fully processed after revival.`, 500);
        }
        return device;
      } else {
        logger.warn(`Revived renderer for preset '${presetName}' (UDN from USN if available: ${revivedDevice.usn}) does not have full details. Playback might fail.`);
        throw new PlaybackError(`Revived renderer for preset '${presetName}' is incomplete.`, 500);
      }
    } else {
      logger.info(`Renderer ${rendererPreset.udn} for preset '${presetName}' is already active.`);
      return device;
    }
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
  logger.info(`Both tasks completed for preset '${presetName}'. Attempting to play ${processedItems.length} items on renderer ${finalRendererDevice.udn}.`);

  try {
    const playbackResult = await playProcessedItemsOnRenderer(
      finalRendererDevice.udn,
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