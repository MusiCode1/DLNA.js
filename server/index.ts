import dotenv from 'dotenv'; // הוספת ייבוא עבור dotenv
dotenv.config(); // טעינת משתני סביבה מקובץ .env

import express, { Request, Response, NextFunction } from 'express';
import path from 'path'; // הוספת ייבוא עבור path
import { networkInterfaces } from "node:os";
import type { RemoteInfo } from 'node:dgram'; // הוספת ייבוא עבור RemoteInfo


import { ContinuousDeviceExplorer } from './continuousDeviceExplorer'; // ייבוא המחלקה החדשה
// ייבוא טיפוסים מהאינדקס, הוספת BrowseFlag
import { handleBrowseRequest } from './browseHandler'; // ייבוא ה-handler החדש
import { createRendererHandler, playFolderOnRenderer } from './rendererHandler'; // ייבוא ה-handler החדש עבור renderers ופונקציית העזר
import { loadPresets, savePresets } from './presetManager'; // ייבוא פונקציות לניהול פריסטים
import { AllPresetSettings, PresetSettings, RendererPreset, PresetEntry } from './types'; // ייבוא טיפוסי פריסטים, הוספת PresetEntry
import { sendWakeOnLan, checkPingWithRetries } from './wol_script'; // ייבוא פונקציה לשליחת WOL ובדיקת פינג

import {
  DiscoveryDetailLevel,
  createModuleLogger,
  processUpnpDeviceFromUrl, // הוספת ייבוא
} from '../src';

import type {
  DeviceWithServicesDescription,
  FullDeviceDescription,
  DeviceDescription,
  ProcessedDevice,
  RawSsdpMessagePayload
} from '../src';


import type { ApiDevice, ContinueDiscoveryOptions } from './types'; // ייבוא ישירות מ-types.ts

const logger = createModuleLogger('Server');

type RawMessagesBuffer = {
  message: string;
  remoteInfo: RemoteInfo;
  socketType: string;
}

const MAX_RAW_MESSAGES = 100; // קבוע לגודל המאגר
const rawMessagesBuffer: RawMessagesBuffer[] = []; // מאגר לאחסון ההודעות

const app = express();
const port = process.env.PORT || 3300;



// אפשרות להעביר אופציות מותאמות אישית ל-ContinuousDeviceExplorer
const discoveryOptions: ContinueDiscoveryOptions = {
  detailLevel: DiscoveryDetailLevel.Full, // בקש מספיק פרטים עבור ה-API
  includeIPv6: false,
  timeoutMs: 60 * 1000,
  continuousIntervalMs: 70 * 1000
};
const deviceExplorer = new ContinuousDeviceExplorer(discoveryOptions);

let activeDevices: Map<string, ApiDevice> = new Map(); // שימוש ב-Map לניהול קל יותר של מכשירים לפי UDN

// Middleware to parse JSON bodies
app.use(express.json());

// הגשת קבצים סטטיים מהתיקייה public
// ודא שהנתיב לתיקיית public נכון ביחס למיקום קובץ השרת
const publicPathDirectory = path.join('.', 'public'); // תיקון הנתיב בהנחה שהקוד המקומפל נמצא ב-dist/server
logger.info(`Serving static files from: ${publicPathDirectory}`);
app.use(express.static(publicPathDirectory)); // הסרת האובייקט הריק כאופציה שנייה, הוא מיותר

// Endpoint to get discovered devices
// ה-route הידני להגשת index.html הוסר מכיוון ש-express.static אמור לטפל בזה
app.get('/api/devices', (req, res) => {
  const devicesArray = Array.from(activeDevices.values());
  res.json(devicesArray);
});

// Endpoint for browsing ContentDirectory
app.post('/api/devices/:udn/browse', (req: Request, res: Response, next: NextFunction) => {
  // העברת activeDevices ל-handler
  handleBrowseRequest(req, res, next, activeDevices);
});

// Endpoint for controlling renderers
const rendererRouter = createRendererHandler(activeDevices);
app.use('/api/renderers', rendererRouter);

// נקודת קצה חדשה להחזרת הודעות גולמיות
app.get('/api/raw-messages', (req: Request, res: Response) => {
  res.json(rawMessagesBuffer);
});

// נקודות קצה לניהול הגדרות פריסט
app.get('/api/presets', async (req: Request, res: Response, next: NextFunction) => {
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
    logger.error('Error loading presets:', error);
    // העבר את השגיאה ל-middleware הכללי לטיפול בשגיאות
    next(error);
  }
});

app.post('/api/presets', async (req: Request, res: Response, next: NextFunction) => {
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
    logger.error('Error saving presets:', error);
    // העבר את השגיאה ל-middleware הכללי לטיפול בשגיאות
    next(error);
  }
});

// נקודת קצה למחיקת פריסט
app.delete('/api/presets', async (req: Request, res: Response, next: NextFunction) => {
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
    logger.error('Error deleting preset:', error);
    next(error); // העבר ל-middleware הכללי לטיפול בשגיאות
  }
});

// נקודת קצה חדשה להפעלת פריסט
app.get('/api/play-preset', async (req: Request, res: Response, next: NextFunction) => {
  logger.info('Received request for /api/play-preset');
  const presetName = req.query.presetName as string;

  if (!presetName) {
    logger.warn('Preset name not provided in query parameters for /api/play-preset.');
    res.status(400).json({ error: "Preset name is required as a query parameter (e.g., /api/play-preset?presetName=MyPreset)." });
    return;
  }
  logger.info(`Attempting to play preset: ${presetName}`);

  try {
    const allPresetsObject = await loadPresets();
    const presetSettings = allPresetsObject[presetName];

    if (!presetSettings) {
      logger.warn(`Preset with name '${presetName}' not found.`);
      res.status(404).json({ error: `Preset with name '${presetName}' not found.` });
      return;
    }
    // presetSettings הוא כבר מהסוג הנכון (PresetSettings)

    // בדיקת תקינות הגדרות הפריסט
    if (
      !presetSettings.renderer?.udn ||
      !presetSettings.renderer?.baseURL ||
      !presetSettings.renderer?.ipAddress ||
      !presetSettings.renderer?.macAddress ||
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

    // בדיקה אם ה-Renderer פעיל
    let rendererDevice = activeDevices.get(rendererPreset.udn);

    if (!rendererDevice) {
      logger.info(`Renderer ${rendererPreset.udn} for preset '${presetName}' is not in active devices. Attempting WOL and revival.`);

      try {
        await sendWakeOnLan(rendererPreset.macAddress);
        logger.info(`WOL packet sent to ${rendererPreset.macAddress} for preset '${presetName}'. Waiting for device to respond...`);
      } catch (wolError: any) {
        logger.warn(`Could not send WOL packet to ${rendererPreset.macAddress} for preset '${presetName}' (device might be on or error sending): ${wolError.message}`);
        // לא נחזיר שגיאה מיידית, ננסה פינג בכל מקרה
      }
      
      // המתנה של 5 שניות לפני בדיקת פינג ראשונית, כפי שמוצע בתוכנית
      await new Promise(resolve => setTimeout(resolve, 5000));

      // קריאה מתוקנת ל-checkPingWithRetries:
      // totalTimeoutSeconds: 18 (5 ניסיונות * 2 שניות לפינג + 4 מרווחים * 2 שניות למרווח)
      // pingIntervalSeconds: 2
      // singlePingTimeoutSeconds: 2
      const pingSuccess = await checkPingWithRetries(rendererPreset.ipAddress, 18, 2, 2);

      if (!pingSuccess) {
        logger.error(`Renderer ${rendererPreset.ipAddress} for preset '${presetName}' did not respond to ping after WOL attempt.`);
        res.status(503).json({ error: `Renderer for preset '${presetName}' did not respond after Wake on LAN and ping attempts.` });
        return;
      }
      logger.info(`Renderer ${rendererPreset.ipAddress} for preset '${presetName}' responded to ping.`);

      logger.info(`Attempting to revive renderer ${rendererPreset.udn} from URL: ${rendererPreset.baseURL}`);
      const revivedDevice = await processUpnpDeviceFromUrl(rendererPreset.baseURL, DiscoveryDetailLevel.Services);

      if (!revivedDevice) {
        logger.error(`Failed to retrieve renderer details for ${rendererPreset.udn} (URL: ${rendererPreset.baseURL}) after WOL and ping for preset '${presetName}'.`);
        res.status(503).json({ error: `Failed to retrieve renderer details for preset '${presetName}' after successful Wake on LAN.` });
        return;
      }

      // ProcessedDevice יכול להיות אחד מכמה טיפוסים. נבדוק אם יש לו את השדות הנדרשים.
      if ('friendlyName' in revivedDevice && 'modelName' in revivedDevice && 'UDN' in revivedDevice) {
        // העברת הלוג לתוך הבלוק הזה כדי להבטיח ש-revivedDevice.UDN קיים
        logger.info(`Successfully revived renderer ${revivedDevice.UDN} for preset '${presetName}'. Updating active devices.`);
        updateDeviceList(revivedDevice as DeviceDescription | DeviceWithServicesDescription | FullDeviceDescription);
        rendererDevice = activeDevices.get(rendererPreset.udn); // נסה לקבל אותו שוב מהרשימה המעודכנת
        if (!rendererDevice) {
            logger.error(`Renderer ${rendererPreset.udn} still not found in active devices after revival for preset '${presetName}'. This should not happen.`);
            res.status(500).json({ error: `Internal error: Renderer for preset '${presetName}' could not be fully processed after revival.` });
            return;
        }
      } else {
          logger.warn(`Revived device for preset '${presetName}' (UDN from USN if available: ${revivedDevice.usn}) does not have full details. Playback might fail.`);
          // נמשיך, playFolderOnRenderer יטפל אם המכשיר לא תקין.
      }
    } else {
      logger.info(`Renderer ${rendererPreset.udn} for preset '${presetName}' is already active.`);
    }
    
    // בדיקה שה-Media Server פעיל (למרות שלא מנסים להעיר אותו כרגע)
    const mediaServerDevice = activeDevices.get(mediaServerPreset.udn);
    if (!mediaServerDevice) {
        logger.warn(`Media Server ${mediaServerPreset.udn} for preset '${presetName}' is not in active devices. Playback might fail.`);
        res.status(404).json({ error: `Media Server for preset '${presetName}' is not currently available.` });
        return;
    }


    // הפעלת המדיה
    logger.info(`Attempting to play preset '${presetName}': Renderer UDN: ${rendererPreset.udn}, Media Server UDN: ${mediaServerPreset.udn}, Folder ID: ${folderObjectId}`);
    const result = await playFolderOnRenderer(
      rendererPreset.udn,
      mediaServerPreset.udn,
      folderObjectId,
      activeDevices,
      logger
    );

    if (result.success) {
      logger.info(`Preset '${presetName}' playback command successful: ${result.message}`);
      res.status(200).json({ success: true, message: result.message });
      return;
    } else {
      logger.error(`Preset '${presetName}' playback command failed: ${result.message}`, { statusCode: result.statusCode });
      res.status(result.statusCode || 500).json({ error: result.message });
      return;
    }

  } catch (error: any) {
    logger.error(`Unexpected error during /api/play-preset (preset: ${presetName || 'N/A'}) processing:`, error);
    if (!error.statusCode) {
      error.statusCode = 500;
    }
    next(error);
  }
});

// נקודת קצה לשליחת Wake on LAN לפריסט ספציפי
app.post('/api/wol/wake/:presetName', async (req: Request, res: Response, next: NextFunction) => {
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

    if (!rendererInfo || !rendererInfo.macAddress) {
      logger.warn(`Preset '${presetName}' does not have a renderer with a MAC address.`);
      res.status(400).json({ error: `Preset '${presetName}' is not configured with a Renderer MAC address for Wake on LAN.` });
      return;
    }

    const macAddress = rendererInfo.macAddress;

    // ולידציה בסיסית של כתובת ה-MAC (ניתן להרחיב לפי הצורך)
    // הפונקציה sendWakeOnLan כבר מבצעת ולידציה פנימית
    // const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    // if (!macRegex.test(macAddress)) {
    //   logger.error(`Invalid MAC address format for preset '${presetName}': ${macAddress}`);
    //   return res.status(400).json({ error: `Invalid MAC address format: ${macAddress}` });
    // }

    logger.info(`Attempting to send Wake on LAN to preset '${presetName}' (MAC: ${macAddress})`);

    // קריאה לפונקציה לשליחת חבילת WOL
    // הפונקציה sendWakeOnLan מחזירה true אם הצליחה לשלוח את החבילה,
    // או זורקת שגיאה במקרה של MAC לא תקין או כשל בשליחה.
    await sendWakeOnLan(macAddress);

    logger.info(`Successfully sent Wake on LAN packet to MAC address: ${macAddress} for preset '${presetName}'.`);
    res.status(200).json({ message: `Wake on LAN signal sent successfully to preset '${presetName}'.` });

  } catch (error: any) {
    logger.error(`Error sending Wake on LAN for preset '${presetName}': ${error.message}`, error);

    // טיפול בשגיאות ספציפיות מ-sendWakeOnLan
    if (error.message && error.message.toLowerCase().includes('invalid mac address')) {
      res.status(400).json({ error: `Invalid MAC address format for preset '${presetName}'. Details: ${error.message}` });
      return;
    }
    if (error.message && error.message.toLowerCase().includes('failed to send wol packet')) {
      res.status(500).json({ error: `Failed to send WoL packet for preset '${presetName}'. Details: ${error.message}` });
      return;
    }
    // שגיאות אחרות יועברו ל-middleware הכללי לטיפול בשגיאות
    next(error);
  }
});

// פונקציה לעדכון רשימת המכשירים הפעילים
const updateDeviceList = (deviceData: DeviceDescription | DeviceWithServicesDescription | FullDeviceDescription) => {
  // ודא שהשדות הנדרשים קיימים לפני הוספה/עדכון
  if (deviceData.friendlyName && deviceData.modelName && deviceData.UDN) {
    let iconUrl: string | undefined = undefined;
    // בדוק אם קיים iconList, baseURL, והרשימה אינה ריקה
    if (deviceData.iconList && deviceData.iconList.length > 0 && deviceData.baseURL) {
      const firstIcon = deviceData.iconList[0];
      if (firstIcon && firstIcon.url) {
        try {
          // הרכבת ה-URL המלא של האייקון
          // deviceData.baseURL הוא הבסיס, firstIcon.url הוא הנתיב היחסי
          iconUrl = new URL(firstIcon.url, deviceData.baseURL).href;
        } catch (e) {
          logger.warn(`Could not construct icon URL for device ${deviceData.UDN}: ${firstIcon.url}, base: ${deviceData.baseURL}`, e);
        }
      }
    }

    const supportedServices: string[] = deviceData.serviceList
      ? deviceData.serviceList.map(service => service.serviceType).filter(st => !!st) as string[]
      : [];

    const apiDevice: ApiDevice = {
      friendlyName: deviceData.friendlyName,
      modelName: deviceData.modelName,
      udn: deviceData.UDN,
      remoteAddress: deviceData.remoteAddress,
      lastSeen: Date.now(),
      iconUrl: iconUrl,
      baseURL: deviceData.baseURL, // שמירת baseURL
      serviceList: deviceData.serviceList, // שמירת serviceList המלא
      supportedServices: supportedServices,
    };
    activeDevices.set(apiDevice.udn, apiDevice);
    // עדכון הלוג כדי שיכלול את המידע החדש אם רוצים
    logger.info(`Device updated/added: ${apiDevice.friendlyName} (UDN: ${apiDevice.udn})${apiDevice.iconUrl ? ` Icon: ${apiDevice.iconUrl}` : ''}, BaseURL: ${apiDevice.baseURL}, Services: ${supportedServices.length > 0 ? supportedServices.join(', ') : 'N/A'}`);
  } else {
    logger.warn('Received device data without all required fields (friendlyName, modelName, UDN)', { udn: deviceData.UDN }); // תיקון ל-UDN
  }
};


// פונקציה לגילוי מכשירים באופן רציף
const startContinuousDeviceDiscovery = () => {
  logger.info('Initializing continuous UPnP device discovery process...');

  deviceExplorer.on('device', (device: ProcessedDevice) => {
    // ProcessedDevice יכול להיות אחד מכמה טיפוסים. נבדוק אם יש לו את השדות הנדרשים.
    // ContinuousDeviceExplorer כבר אמור לפלוט רק מכשירים עם הפרטים הנדרשים (לפחות DeviceDescription)
    if ('friendlyName' in device && 'modelName' in device && 'UDN' in device) { // תיקון: בדיקת UDN במקום udn
      updateDeviceList(device as DeviceDescription | DeviceWithServicesDescription | FullDeviceDescription);
    } else {
      logger.debug('Received basic device without full details, UDN from USN (if available):', device.usn);
    }
  });

  // הוספת האזנה לאירוע rawResponse
  deviceExplorer.on('rawResponse', (payload: RawSsdpMessagePayload) => {

    const messageString = payload.message.toString('utf-8');
    rawMessagesBuffer.push({
      ...payload,
      message: messageString,
    });
    if (rawMessagesBuffer.length > MAX_RAW_MESSAGES) {
      rawMessagesBuffer.shift();
    }
    // logger.debug(`Received raw SSDP message. Buffer size: ${rawMessagesBuffer.length}`); // הערה: ניתן להוסיף לוג אם רוצים
  });

  deviceExplorer.on('error', (err: Error) => {
    logger.error('Error during continuous device discovery:', err);
    // כאן אפשר להחליט אם לנסות להפעיל מחדש את הגילוי או לנקוט פעולה אחרת
  });

  deviceExplorer.on('stopped', () => {
    logger.info('Continuous device discovery process has stopped.');
  });

  deviceExplorer.startDiscovery(); // התחל את תהליך הגילוי הרציף
};

// ניקוי תקופתי של מכשירים שלא נראו לאחרונה
const DEVICE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // כל 10 דקות
const MAX_DEVICE_INACTIVITY_MS = 15 * 60 * 1000; // מכשיר ייחשב לא פעיל אם לא נראה 15 דקות

setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  for (const [udn, device] of activeDevices.entries()) {
    if (now - device.lastSeen > MAX_DEVICE_INACTIVITY_MS) {
      activeDevices.delete(udn);
      cleanedCount++;
      logger.info(`Removed inactive device: ${device.friendlyName} (UDN: ${udn})`);
    }
  }
  if (cleanedCount > 0) {
    logger.info(`Cleaned up ${cleanedCount} inactive devices.`);
  }
}, DEVICE_CLEANUP_INTERVAL_MS);


// Error handling middleware - חייב להיות האחרון
// Middleware לטיפול בשגיאות
app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
  // רושמים את השגיאה ללוג
  logger.error('An error occurred:', err);

  // מחזירים תגובת שגיאה גנרית למשתמש
  // אין לחשוף פרטי שגיאה ספציפיים למשתמש מטעמי אבטחה
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
  logger.info('url: http://localhost:' + port + '/')
  startContinuousDeviceDiscovery();
});

// כיבוי חינני
process.on('SIGINT', () => {
  logger.info('SIGINT received. Stopping UPnP device discovery and server...');
  deviceExplorer.stopDiscovery();
  // תן זמן קצר לסגירת תהליכים לפני יציאה
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

export default app; // ייצוא לבדיקות פוטנציאליות או שימושים אחרים