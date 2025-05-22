// src/upnpDiscoveryService.ts - שכבת שירות לשימוש במודול UpnpDeviceExplorer
import { createModuleLogger } from './logger'; // הוספת ייבוא הלוגר
import {
  discoverSsdpDevicesIterable,
  fetchDeviceDescription,
} from './upnpDeviceExplorer';
import {
  DeviceDescription as FullDeviceDescription, // שינוי שם למניעת התנגשות עם DetailedUpnpDevice מקומי אם ניצור
  BasicSsdpDevice,
  DiscoveryOptions,
  ServiceDescription as FullServiceDescription,
  Action as FullAction,
  ActionArgument as FullActionArgument,
  StateVariable as FullStateVariable,
  DeviceIcon as FullDeviceIcon
  // SsdpHeaders ו-RemoteAddressInfo אינם מיוצאים ישירות מ-types.ts
  // המידע שלהם כלול בתוך BasicSsdpDevice (responseHeaders ו-address בהתאמה)
} from './types';

// הגדרת ממשקים דומים לאלו שהיו ב-src/experimental_ssdp/discovery.ts
// כדי לשמור על תאימות מסוימת עם src/experimental_ssdp/runDiscovery.ts
// או להתאים את runDiscovery.ts להשתמש ישירות בממשקים מ-./types

// הממשק הזה הוא למעשה FullDeviceDescription מ-./types.ts
// אנחנו נייצא את FullDeviceDescription ישירות או ניצור type alias.
export type UpnpDevice = FullDeviceDescription;
export type UpnpService = FullServiceDescription; // וכן הלאה עבור השאר

// קבועים (ניתן לייבא אותם גם מ-./types אם הוגדרו שם, או להגדיר מחדש)
const UPNP_ORG_SCHEMA = "urn:schemas-upnp-org";
export const UPNP_ORG_SERVICE_SCHEMA = UPNP_ORG_SCHEMA + ":service";
export const UPNP_ORG_DEVICE_SCHEMA = UPNP_ORG_SCHEMA + ":device";

export function buildUpnpServiceTypeIdentifier(serviceType: string, version: number = 1): string {
  return `${UPNP_ORG_SERVICE_SCHEMA}:${serviceType}:${version}`;
}

export function buildUpnpDeviceTypeIdentifier(deviceType: string, version: number = 1): string {
  return `${UPNP_ORG_DEVICE_SCHEMA}:${deviceType}:${version}`;
}

export const AVTRANSPORT_SERVICE = buildUpnpServiceTypeIdentifier("AVTransport", 1);
export const CONTENT_DIRECTORY_SERVICE = buildUpnpServiceTypeIdentifier("ContentDirectory", 1);
export const CONNECTION_MANAGER_SERVICE = buildUpnpServiceTypeIdentifier("ConnectionManager", 1);
export const RENDERING_CONTROL_SERVICE = buildUpnpServiceTypeIdentifier("RenderingControl", 1);

export const MEDIA_SERVER_DEVICE = buildUpnpDeviceTypeIdentifier("MediaServer", 1);
export const MEDIA_RENDERER_DEVICE = buildUpnpDeviceTypeIdentifier("MediaRenderer", 1);


const logger = createModuleLogger('upnpDiscoveryService'); // יצירת מופע לוגר
 
/**
 * מגלה מכשירי UPnP ברשת ומחזיר את פרטיהם המלאים, כולל SCPD.
 * @param searchTarget סוג השירות או המכשיר לחיפוש.
 * @param timeoutMs משך זמן כולל במילישניות להמתנה לתגובות.
 * @param onDeviceFoundCallback קולבק שיופעל עבור כל מכשיר שמתגלה ומעובד.
 * @param discoveryOptions אופציות נוספות למנוע הגילוי.
 * @returns הבטחה (Promise) שמחזירה מערך של UpnpDevice.
 */
export async function discoverAndProcessDevices(
  searchTarget: string = "ssdp:all", // 'ssdp:all' או 'upnp:rootdevices' או כל סוג אחר
  timeoutMs: number = 5000,
  onDeviceFoundCallback?: (device: UpnpDevice) => void,
  discoveryOptions?: Partial<DiscoveryOptions>
): Promise<UpnpDevice[]> {
  // הדפסה בתחילת הפונקציה
  logger.debug(`discoverAndProcessDevices called with searchTarget: ${searchTarget}, timeoutMs: ${timeoutMs}`);
  const functionStartTime = Date.now();
 
  const allProcessedDevices: UpnpDevice[] = [];
  const uniqueDeviceLocations = new Set<string>(); // למנוע עיבוד כפול של אותו LOCATION

  const mergedOptions: DiscoveryOptions = {
    searchTarget,
    timeoutMs,
    includeIPv6: discoveryOptions?.includeIPv6 || false,
    discoveryTimeoutPerInterfaceMs: discoveryOptions?.discoveryTimeoutPerInterfaceMs || 2000,
    customLogger: discoveryOptions?.customLogger,
    networkInterfaces: discoveryOptions?.networkInterfaces,
    // onDeviceFound המקורי של discoverSsdpDevices לא ישמש ישירות כאן,
    // אנו נטפל בעיבוד ובקולבק בעצמנו.
  };

  logger.info(`Starting discovery with options:`, mergedOptions);
  logger.debug(`mergedOptions.timeoutMs: ${mergedOptions.timeoutMs}, mergedOptions.discoveryTimeoutPerInterfaceMs: ${mergedOptions.discoveryTimeoutPerInterfaceMs}`);
 
  try {
    // הדפסה לפני הקריאה ל-discoverSsdpDevicesIterable
    logger.debug(`Calling discoverSsdpDevicesIterable at ${new Date().toISOString()}`);
    const devicesIterable = discoverSsdpDevicesIterable(mergedOptions);
    logger.debug(`Returned from discoverSsdpDevicesIterable, starting for-await loop at ${new Date().toISOString()}`);
    let iterationCount = 0;
 
    for await (const basicDevice of devicesIterable) {
      iterationCount++;
      logger.debug(`Iteration ${iterationCount} in for-await loop at ${new Date().toISOString()}`);
      if (basicDevice.location && !uniqueDeviceLocations.has(basicDevice.location)) {
        uniqueDeviceLocations.add(basicDevice.location); // סמן LOCATION כנצפה
        logger.info(`Basic device found: ${basicDevice.usn} at ${basicDevice.location}. Fetching details...`);
        try {
          // אחזר פרטים מלאים, כולל SCPD
          // עדכון: העברת האובייקט basicDevice כולו
          const detailedDevice = await fetchDeviceDescription(basicDevice, true);
          
          if (detailedDevice) {
            // התאמת המבנה ל-UpnpDevice אם יש צורך (כרגע FullDeviceDescription הוא המטרה)
            // כאן detailedDevice הוא כבר במבנה הרצוי (FullDeviceDescription)
            allProcessedDevices.push(detailedDevice);
            if (onDeviceFoundCallback) {
              try {
                onDeviceFoundCallback(detailedDevice);
              } catch (callbackError: any) {
                // מאחר ו-detailedDevice אינו null כאן, אין צורך בבדיקה נוספת
                logger.error(`Error in onDeviceFoundCallback for ${detailedDevice.friendlyName || detailedDevice.UDN}: ${callbackError.message}`);
              }
            }
          } else {
            logger.warn(`Could not fetch full details for ${basicDevice.location}. Skipping this device.`);
          }
        } catch (fetchError: any) {
          logger.error(`Error fetching/processing details for ${basicDevice.location}: ${fetchError.message}`);
          // אפשר להוסיף את המכשיר הבסיסי עם שגיאה לרשימה אם רוצים
        }
      } else if (basicDevice.location && uniqueDeviceLocations.has(basicDevice.location)) {
        // logger.debug(`Skipping already processed location: ${basicDevice.location}`);
      } else if (!basicDevice.location) {
        logger.warn(`Device found without location: ${basicDevice.usn}`);
      }
    }
    // הדפסה אחרי סיום הלולאה
    logger.debug(`Finished for-await loop after ${iterationCount} iterations at ${new Date().toISOString()}`);
  } catch (discoveryError: any) {
    logger.error(`Critical error during discovery process: ${discoveryError.message}`);
    // ניתן לזרוק את השגיאה הלאה אם רוצים שהקוד הקורא יטפל בה
    throw discoveryError;
  }
 
  const functionEndTime = Date.now();
  const functionDuration = (functionEndTime - functionStartTime) / 1000;
  logger.debug(`discoverAndProcessDevices finishing. Duration: ${functionDuration} seconds. Total unique devices processed: ${allProcessedDevices.length}`);
  logger.info(`Discovery finished. Total unique devices processed: ${allProcessedDevices.length}`);
  return allProcessedDevices;
}