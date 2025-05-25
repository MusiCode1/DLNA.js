import dotenv from 'dotenv'; // הוספת ייבוא עבור dotenv
dotenv.config(); // טעינת משתני סביבה מקובץ .env

import express, { Request, Response, NextFunction } from 'express';
import path from 'path'; // הוספת ייבוא עבור path
import { ContinuousDeviceExplorer } from './continuousDeviceExplorer'; // ייבוא המחלקה החדשה
import {
  DiscoveryDetailLevel,
  createModuleLogger,
} from '../src'; // ייבוא טיפוסים מהאינדקס, הוספת BrowseFlag
import { handleBrowseRequest } from './browseHandler'; // ייבוא ה-handler החדש
import { createRendererHandler, playFolderOnRenderer } from './rendererHandler'; // ייבוא ה-handler החדש עבור renderers ופונקציית העזר

import type {
  DeviceWithServicesDescription,
  FullDeviceDescription,
  DeviceDescription,
  ProcessedDevice

} from '../src';
import type { ApiDevice } from './types'; // ייבוא ישירות מ-types.ts

const logger = createModuleLogger('Server');

const app = express();
const port = process.env.PORT || 3000;

// אפשרות להעביר אופציות מותאמות אישית ל-ContinuousDeviceExplorer
const discoveryOptions = {
  detailLevel: DiscoveryDetailLevel.Full, // בקש מספיק פרטים עבור ה-API
  // ניתן להוסיף כאן timeoutMs או searchTarget אם רוצים לשנות את ברירות המחדל
};
const deviceExplorer = new ContinuousDeviceExplorer(discoveryOptions);

// רשימה של המכשירים שנתגלו, נשמור רק את המידע הרלוונטי ל-API
// export interface ApiDevice { // הגדרה זו הועברה ל-src/types.ts
//   friendlyName: string;
//   modelName: string;
//   udn: string;
//   remoteAddress?: string;
//   lastSeen: number; // חותמת זמן מתי המכשיר נראה לאחרונה
//   iconUrl?: string; // הוספת שדה עבור URL הלוגו
//   // שדות שנוספו כדי לתמוך בפעולת browse
//   baseURL?: string; // חיוני להרכבת URL-ים אבסולוטיים לשירותים
//   serviceList?: ServiceDescription[]; // רשימת השירותים המלאה
//   // supportedServices נשאר כדי לא לשבור API קיים, אך serviceList הוא המקור המלא
//   supportedServices?: string[];
// }
let activeDevices: Map<string, ApiDevice> = new Map(); // שימוש ב-Map לניהול קל יותר של מכשירים לפי UDN

// Middleware to parse JSON bodies
app.use(express.json());

// הגשת קבצים סטטיים מהתיקייה public
// ודא שהנתיב לתיקיית public נכון ביחס למיקום קובץ השרת
const publicPathDirectory = path.join(__dirname, '..', 'public'); // תיקון הנתיב בהנחה שהקוד המקומפל נמצא ב-dist/server
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

// נקודת קצה חדשה להפעלת פריסט
app.get('/api/play-preset', async (req: Request, res: Response, next: NextFunction) => {
  logger.info('Received request for /api/play-preset');
  const { PRESET_RENDERER_UDN, PRESET_MEDIA_SERVER_UDN, PRESET_FOLDER_OBJECT_ID } = process.env;

  if (!PRESET_RENDERER_UDN || !PRESET_MEDIA_SERVER_UDN || !PRESET_FOLDER_OBJECT_ID) {
    logger.error('Preset configuration is missing or incomplete in .env file.');
    res.status(500).json({ error: "Preset configuration is missing or incomplete. Please check server's .env file." });
    return;
  }

  logger.info(`Attempting to play preset: Renderer UDN: ${PRESET_RENDERER_UDN}, Media Server UDN: ${PRESET_MEDIA_SERVER_UDN}, Folder ID: ${PRESET_FOLDER_OBJECT_ID}`);

  try {
    const result = await playFolderOnRenderer(
      PRESET_RENDERER_UDN,
      PRESET_MEDIA_SERVER_UDN,
      PRESET_FOLDER_OBJECT_ID,
      activeDevices,
      logger // הוספת הלוגר כארגומנט חמישי
    );

    if (result.success) {
      logger.info(`Preset playback command successful: ${result.message}`);
      res.status(200).json({ success: true, message: result.message }); // הוספת return
      return;
    } else {
      logger.error(`Preset playback command failed: ${result.message}`, { statusCode: result.statusCode });
      res.status(result.statusCode || 500).json({ error: result.message }); // הוספת return
      return;
    }
  } catch (error: any) {
    // שגיאות כלליות יותר (למשל, אם playFolderOnRenderer זורק שגיאה באופן בלתי צפוי)
    logger.error('Unexpected error during /api/play-preset processing:', error);
    // next(error) יעביר את השגיאה ל-middleware הכללי לטיפול בשגיאות
    // נוודא שהשגיאה מכילה statusCode אם אפשר
    if (!error.statusCode) {
      error.statusCode = 500;
    }
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