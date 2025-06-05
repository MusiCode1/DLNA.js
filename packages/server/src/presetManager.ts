// קובץ זה מכיל פונקציות לניהול הגדרות הפריסטים
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Request, Response, NextFunction } from 'express'; // הוספת ייבואים נדרשים
import {
  createModuleLogger,
  DiscoveryDetailLevel, // הוספת ייבוא
  processUpnpDeviceFromUrl, // הוספת ייבוא
  type DeviceDescription, // הוספת ייבוא
  type DeviceWithServicesDescription, // הוספת ייבוא
  type FullDeviceDescription, // הוספת ייבוא
} from 'dlna.js'; // הוספת ייבוא ללוגר
import { AllPresetSettings, PresetSettings, PresetEntry, RendererPreset, ApiDevice } from './types'; // ייבוא הטיפוסים הרלוונטיים, כולל PresetEntry ו-RendererPreset
import { sendWakeOnLan, wakeDeviceAndVerify } from '@dlna-tv-play/wake-on-lan'; // שינוי: הוספת wakeDeviceAndVerify והסרת checkPingWithRetries
import { getFolderItemsFromMediaServer, playProcessedItemsOnRenderer, ProcessedPlaylistItem } from './rendererHandler'; // ייבוא הפונקציות החדשות

const logger = createModuleLogger('PresetManager'); // הגדרת לוגר למודול
const PRESETS_FILE_PATH = path.join(process.cwd(), '..','..', 'data', 'presets.json'); // process.cwd() הוא packages/server, לכן עולים שתי רמות (../../) לשורש הפרויקט, ואז נכנסים ל-data

/**
 * @hebrew טוען את הגדרות הפריסט מקובץ ה-JSON וממיר אותן למערך.
 * @returns {Promise<AllPresetSettings>} אובייקט של כל הפריסטים. אם הקובץ לא קיים או לא תקין, מחזיר אובייקט ריק.
 */
export async function loadPresets(): Promise<AllPresetSettings> {
    try {
        // בדיקה אם הקובץ קיים
        await fs.access(PRESETS_FILE_PATH);
        const data = await fs.readFile(PRESETS_FILE_PATH, 'utf-8');
        if (!data.trim()) {
            // אם הקובץ ריק, החזר אובייקט ריק
            return {};
        }
        // ניתוח ה-JSON
        const presetsObject = JSON.parse(data) as AllPresetSettings;
        return presetsObject;
    } catch (error: any) {
        // אם הקובץ לא קיים (ENOENT) או שיש שגיאה אחרת בקריאה/ניתוח, החזר אובייקט ריק
        if (error.code === 'ENOENT') {
            // אם הקובץ לא קיים, ניצור אותו עם אובייקט ריק בפעם הבאה שישמרו הגדרות
            // או שנחזיר אובייקט ריק כפי שנדרש
            return {};
        }
        logger.error('Error loading presets:', error); // שימוש בלוגר במקום console.error
        // במקרה של שגיאת JSON או שגיאה אחרת, החזר אובייקט ריק כדי למנוע קריסה
        return {};
    }
}

/**
 * @hebrew שומר את כלל הגדרות הפריסט הנתונות לקובץ ה-JSON.
 * @param {AllPresetSettings} settings - אובייקט כלל ההגדרות לשמירה.
 * @returns {Promise<void>}
 */
export async function savePresets(settings: AllPresetSettings): Promise<void> {
    try {
        const data = JSON.stringify(settings, null, 2); // עיצוב ה-JSON עם הזחה לקריאות
        const directoryPath = path.dirname(PRESETS_FILE_PATH); // קבלת הנתיב לתיקייה
        await fs.mkdir(directoryPath, { recursive: true }); // יצירת התיקייה אם היא לא קיימת
        await fs.writeFile(PRESETS_FILE_PATH, data, 'utf-8');
    } catch (error) {
        logger.error('Error saving presets:', error); // שימוש בלוגר במקום console.error
        // ניתן להוסיף כאן טיפול בשגיאות מתקדם יותר אם נדרש, כגון זריקת שגיאה מותאמת אישית
        throw error; // זרוק את השגיאה כדי שהקוד הקורא יוכל לטפל בה
    }
}

/**
 * @hebrew מטפל בבקשת GET לקבלת כל הפריסטים.
 */
export async function handleGetPresets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const presetsObject = await loadPresets();
    // המרה של אובייקט הפריסטים למערך של פריסטים עבור הלקוח
    const presetsArray: PresetEntry[] = Object.keys(presetsObject).map(presetName => {
      return {
        name: presetName,
        settings: presetsObject[presetName]
      };
    });
    res.json(presetsArray);
  } catch (error) {
    logger.error('Error in handleGetPresets:', error); // שימוש בלוגר המקומי
    // העבר את השגיאה ל-middleware הכללי לטיפול בשגיאות
    next(error);
  }
}

/**
 * @hebrew מטפל בבקשת DELETE למחיקת פריסט.
 */
export async function handleDeletePreset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name: presetNameToDelete } = req.body;

    if (!presetNameToDelete || typeof presetNameToDelete !== 'string') {
      logger.warn('Preset name not provided or invalid for deletion.');
      res.status(400).json({ error: 'Preset name (string) is required in the request body for deletion.' });
      return;
    }

    logger.info(`Received request to delete preset: ${presetNameToDelete}`);

    const allPresetsObject = await loadPresets();

    if (!allPresetsObject.hasOwnProperty(presetNameToDelete)) {
      logger.warn(`Preset with name '${presetNameToDelete}' not found for deletion.`);
      res.status(404).json({ error: `Preset with name '${presetNameToDelete}' not found.` });
      return;
    }

    delete allPresetsObject[presetNameToDelete];

    await savePresets(allPresetsObject);
    logger.info(`Preset '${presetNameToDelete}' deleted successfully.`);
    res.status(200).json({ message: `Preset '${presetNameToDelete}' deleted successfully.` });

  } catch (error) {
    logger.error('Error in handleDeletePreset:', error); // שימוש בלוגר המקומי
    next(error); // העבר ל-middleware הכללי לטיפול בשגיאות
  }
}

/**
 * @hebrew מטפל בבקשת POST לשליחת Wake on LAN לפריסט ספציפי.
 */
export async function handleWakePreset(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { presetName } = req.params;
  logger.info(`Received WOL request for preset: ${presetName}`);

  try {
    const allPresetsObject = await loadPresets(); // טעינת כל הפריסטים כאובייקט
    // חיפוש הפריסט הספציפי באובייקט
    const presetDetails: PresetSettings | undefined = allPresetsObject[presetName];

    if (!presetDetails) {
      logger.warn(`Preset with name '${presetName}' not found for WOL request.`);
      res.status(404).json({ error: `Preset with name '${presetName}' not found.` });
      return;
    }

    // בדיקה אם לפריסט יש הגדרות renderer וכתובת MAC
    const rendererInfo: RendererPreset | null | undefined = presetDetails.renderer;

    if (!rendererInfo || !rendererInfo.macAddress || !rendererInfo.broadcastAddress) {
      logger.warn(`Preset '${presetName}' does not have a renderer with a MAC address or broadcast address.`);
      res.status(400).json({ error: `Preset '${presetName}' is not configured with a Renderer MAC address and broadcast address for Wake on LAN.` });
      return;
    }

    const macAddress = rendererInfo.macAddress;
    const broadcastAddress = rendererInfo.broadcastAddress; // קבלת כתובת השידור

    logger.info(`Attempting to send Wake on LAN to preset '${presetName}' (MAC: ${macAddress}, Broadcast: ${broadcastAddress})`);

    await sendWakeOnLan(macAddress, broadcastAddress); // שימוש בכתובת השידור

    logger.info(`Successfully sent Wake on LAN packet to MAC address: ${macAddress} (Broadcast: ${broadcastAddress}) for preset '${presetName}'.`);
    res.status(200).json({ message: `Wake on LAN signal sent successfully to preset '${presetName}'.` });

  } catch (error: any) {
    logger.error(`Error sending Wake on LAN for preset '${presetName}': ${error.message}`, error);

    if (error.message && error.message.toLowerCase().includes('invalid mac address')) {
      res.status(400).json({ error: `Invalid MAC address format for preset '${presetName}'. Details: ${error.message}` });
      return;
    }
    if (error.message && error.message.toLowerCase().includes('failed to send wol packet')) {
      res.status(500).json({ error: `Failed to send WoL packet for preset '${presetName}'. Details: ${error.message}` });
      return;
    }
    next(error);
  }
}

/**
 * @hebrew מטפל בבקשת POST לשמירת פריסט חדש או עדכון פריסט קיים.
 */
export async function handlePostPreset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const newOrUpdatedPresetEntry = req.body as PresetEntry; // הלקוח שולח PresetEntry בודד

    if (!newOrUpdatedPresetEntry || !newOrUpdatedPresetEntry.name || !newOrUpdatedPresetEntry.settings) {
      logger.error('Invalid preset data received for saving.');
      res.status(400).json({ error: 'Invalid preset data. "name" and "settings" are required.' });
      return;
    }

    // 1. טען את כל הפריסטים הקיימים כאובייקט
    const allPresetsObject = await loadPresets();

    // 2. עדכן/הוסף את הפריסט החדש לאובייקט
    allPresetsObject[newOrUpdatedPresetEntry.name] = newOrUpdatedPresetEntry.settings;

    // 3. שמור את האובייקט המעודכן
    await savePresets(allPresetsObject);
    res.status(200).json({ message: `Preset '${newOrUpdatedPresetEntry.name}' saved successfully.` });
  } catch (error) {
    logger.error('Error in handlePostPreset:', error); // שימוש בלוגר המקומי
    // העבר את השגיאה ל-middleware הכללי לטיפול בשגיאות
    next(error);
  }
}

// פונקציית עזר פנימית ללוגיקה המשותפת של הפעלת פריסט
async function executePlayPresetLogic(
  presetName: string,
  activeDevices: Map<string, ApiDevice>,
  updateDeviceListCallback: (deviceData: DeviceDescription | DeviceWithServicesDescription | FullDeviceDescription) => void,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info(`Attempting to play preset: ${presetName}`);

  try {
    const allPresetsObject = await loadPresets();
    const presetSettings = allPresetsObject[presetName];

    if (!presetSettings) {
      logger.warn(`Preset with name '${presetName}' not found.`);
      res.status(404).json({ error: `Preset with name '${presetName}' not found.` });
      return;
    }

    if (
      !presetSettings.renderer?.udn ||
      !presetSettings.renderer?.baseURL ||
      !presetSettings.renderer?.ipAddress ||
      !presetSettings.renderer?.macAddress ||
      !presetSettings.renderer?.broadcastAddress || // בדיקה עבור כתובת שידור
      !presetSettings.mediaServer?.udn ||
      !presetSettings.mediaServer?.baseURL ||
      !presetSettings.mediaServer?.folder?.objectId
    ) {
      logger.error(`Preset '${presetName}' is missing required settings.`);
      res.status(400).json({ error: `Preset '${presetName}' is incomplete. Please check its configuration.` });
      return;
    }

    const rendererPreset = presetSettings.renderer!;
    const mediaServerPreset = presetSettings.mediaServer!;
    const folderObjectId = mediaServerPreset.folder.objectId;

    logger.info(`Found preset '${presetName}'. Renderer: ${rendererPreset.udn}, IP: ${rendererPreset.ipAddress}, MAC: ${rendererPreset.macAddress}, Media Server: ${mediaServerPreset.udn}, Folder ID: ${folderObjectId}`);

    // משימה 1: טיפול ב-Renderer (הערה והחייאה במידת הצורך)
    const handleRendererTask = async (): Promise<ApiDevice | null> => {
      let device = activeDevices.get(rendererPreset.udn);
      if (!device) {
        logger.info(`Renderer ${rendererPreset.udn} for preset '${presetName}' is not in active devices. Attempting WOL and revival.`);
        try {
          await wakeDeviceAndVerify(
            rendererPreset.macAddress,
            rendererPreset.ipAddress,
            rendererPreset.broadcastAddress, // העברת כתובת השידור
            undefined, // wolPort - ישאר ברירת מחדל
            18, 2, 2
          );
          logger.info(`Device ${rendererPreset.ipAddress} (Renderer) for preset '${presetName}' responded after wakeDeviceAndVerify.`);
        } catch (wakeError: any) {
          logger.error(`wakeDeviceAndVerify failed for renderer ${rendererPreset.ipAddress} (MAC: ${rendererPreset.macAddress}) for preset '${presetName}': ${wakeError.message}`);
          throw new Error(`Renderer for preset '${presetName}' did not respond or WOL failed: ${wakeError.message}`); // זריקת שגיאה שתיתפס על ידי Promise.allSettled
        }

        logger.info(`Attempting to revive renderer ${rendererPreset.udn} from URL: ${rendererPreset.baseURL} after successful wake-up.`);
        const revivedDevice = await processUpnpDeviceFromUrl(rendererPreset.baseURL, DiscoveryDetailLevel.Services);
        if (!revivedDevice) {
          logger.error(`Failed to retrieve renderer details for ${rendererPreset.udn} (URL: ${rendererPreset.baseURL}) after WOL and ping for preset '${presetName}'.`);
          throw new Error(`Failed to retrieve renderer details for preset '${presetName}' after successful Wake on LAN.`);
        }

        if ('friendlyName' in revivedDevice && 'modelName' in revivedDevice && 'UDN' in revivedDevice) {
          logger.info(`Successfully revived renderer ${revivedDevice.UDN} for preset '${presetName}'. Updating active devices.`);
          updateDeviceListCallback(revivedDevice as DeviceDescription | DeviceWithServicesDescription | FullDeviceDescription);
          device = activeDevices.get(rendererPreset.udn);
          if (!device) {
            logger.error(`Renderer ${rendererPreset.udn} still not found in active devices after revival for preset '${presetName}'. This should not happen.`);
            throw new Error(`Internal error: Renderer for preset '${presetName}' could not be fully processed after revival.`);
          }
          return device;
        } else {
          logger.warn(`Revived renderer for preset '${presetName}' (UDN from USN if available: ${revivedDevice.usn}) does not have full details. Playback might fail.`);
          // במקרה זה, ייתכן שנרצה לזרוק שגיאה או להחזיר null כדי לציין שהמכשיר לא תקין לחלוטין
          throw new Error(`Revived renderer for preset '${presetName}' is incomplete.`);
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
        throw new Error(`Media Server for preset '${presetName}' is not currently available.`);
      }
      logger.info(`Attempting to get folder items for preset '${presetName}' from Media Server UDN: ${mediaServerPreset.udn}, Folder ID: ${folderObjectId}`);
      return getFolderItemsFromMediaServer(
        mediaServerPreset.udn,
        folderObjectId,
        activeDevices,
        logger // שימוש בלוגר של PresetManager
      );
    };

    // הרצת המשימות במקביל
    const results = await Promise.allSettled([handleRendererTask(), handleMediaServerTask()]);
    
    const rendererTaskResult = results[0];
    const mediaServerTaskResult = results[1];

    let finalRendererDevice: ApiDevice | null = null;
    let processedItems: ProcessedPlaylistItem[] | null = null;

    if (rendererTaskResult.status === 'rejected') {
      logger.error(`Renderer task failed for preset '${presetName}': ${rendererTaskResult.reason?.message || rendererTaskResult.reason}`);
      res.status(503).json({ error: rendererTaskResult.reason?.message || `Failed to prepare renderer for preset '${presetName}'.` });
      return;
    }
    finalRendererDevice = rendererTaskResult.value;
    if (!finalRendererDevice) { // בדיקה נוספת למקרה שההבטחה החזירה null למרות שהיא fulfilled
        logger.error(`Renderer device is null after successful task for preset '${presetName}'.`);
        res.status(500).json({ error: `Internal error: Renderer device not available after processing for preset '${presetName}'.` });
        return;
    }


    if (mediaServerTaskResult.status === 'rejected') {
      logger.error(`Media server task (get items) failed for preset '${presetName}': ${mediaServerTaskResult.reason?.message || mediaServerTaskResult.reason}`);
      res.status(mediaServerTaskResult.reason?.statusCode || 500).json({ error: mediaServerTaskResult.reason?.message || `Failed to get items from media server for preset '${presetName}'.` });
      return;
    }
    processedItems = mediaServerTaskResult.value;
     if (!processedItems || processedItems.length === 0) {
      logger.warn(`No items returned from media server for preset '${presetName}'.`);
      res.status(404).json({ error: `No items found on media server for preset '${presetName}'.` });
      return;
    }


    // אם שתי המשימות הצליחו, נגן את הפריטים
    logger.info(`Both tasks completed for preset '${presetName}'. Attempting to play ${processedItems.length} items on renderer ${finalRendererDevice.udn}.`);
    const playbackResult = await playProcessedItemsOnRenderer(
      finalRendererDevice.udn, // UDN של ה-renderer שהתקבל מהמשימה הראשונה
      processedItems,       // הפריטים שהתקבלו מהמשימה השנייה
      activeDevices,
      logger
    );

    if (playbackResult.success) {
      logger.info(`Preset '${presetName}' playback command successful: ${playbackResult.message}`);
      res.status(200).json({ success: true, message: playbackResult.message });
    } else {
      logger.error(`Preset '${presetName}' playback command failed: ${playbackResult.message}`, { statusCode: playbackResult.statusCode });
      res.status(playbackResult.statusCode || 500).json({ error: playbackResult.message });
    }

  } catch (error: any) {
    logger.error(`Unexpected error during play-preset (preset: ${presetName || 'N/A'}) processing:`, error);
    if (!error.statusCode) {
      error.statusCode = 500;
    }
    next(error);
  }
}

/**
 * @hebrew מטפל בבקשת GET להפעלת פריסט (באמצעות path parameter).
 */
export async function handlePlayPresetByParam(
  req: Request,
  res: Response,
  next: NextFunction,
  activeDevices: Map<string, ApiDevice>,
  updateDeviceListCallback: (deviceData: DeviceDescription | DeviceWithServicesDescription | FullDeviceDescription) => void
): Promise<void> {
  logger.info('Received request for /api/play-preset/:presetName (param)');
  const { presetName } = req.params;

  if (!presetName) {
    // למרות שב-path param זה פחות סביר, עדיין נבדוק למקרה של הגדרת route לא תקינה
    logger.warn('Preset name not provided in path parameters for /api/play-preset/:presetName.');
    res.status(400).json({ error: "Preset name is required as a path parameter." });
    return;
  }
  await executePlayPresetLogic(presetName, activeDevices, updateDeviceListCallback, res, next);
}