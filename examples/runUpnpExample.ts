// src/runUpnpExample.ts - קובץ הרצה לדוגמה עבור מודול הגילוי החדש
import {
  discoverAndProcessDevices,
  UpnpDevice, // זהו alias ל-FullDeviceDescription
  UpnpService, // זהו alias ל-FullServiceDescription
  MEDIA_SERVER_DEVICE,
  MEDIA_RENDERER_DEVICE,
  AVTRANSPORT_SERVICE,
  CONTENT_DIRECTORY_SERVICE,
} from '../src/upnpDiscoveryService'; // ייבוא מהמודול החדש שלנו
import { sendSoapRequest } from '../src/experimental_ssdp/soapActions'; // נייבא בינתיים מהמיקום הישן
import { DiscoveryOptions } from '../src/types';
import { createModuleLogger } from '../src/logger'; // הוספת ייבוא הלוגר
 
const logger = createModuleLogger('runUpnpExample'); // יצירת מופע לוגר
const TIMEOUT_MS = 30 * 1000; // זמן המתנה לגילוי מכשירים (במילישניות)
 
// קבועים לזיהוי המכשירים הרצויים
const KODI_NAME_IDENTIFIER = "kodi";
const UMS_NAME_IDENTIFIER = "universal media server";

async function main() {
  logger.info('Starting UPnP device discovery using UpnpDeviceExplorer module...');
 
  let targetMediaServer: UpnpDevice | null = null;
  let targetMediaRenderer: UpnpDevice | null = null;
 
  try {
    logger.info(`Starting comprehensive UPnP device discovery (ssdp:all) with timeout: ${TIMEOUT_MS / 1000}s...`);
 
    // אין יותר צורך ב-wifiIpAddress כאן, המודול החדש סורק ממשקים אוטומטית.
    // אם נרצה לשלוט בממשקים, נשתמש ב-discoveryOptions.networkInterfaces.
    const discoveryOptions: Partial<DiscoveryOptions> = {
      // ניתן להוסיף כאן אופציות כמו customLogger, networkInterfaces, וכו'
    };

    const allDiscoveredDevices: UpnpDevice[] = await discoverAndProcessDevices(
      "ssdp:all",
      TIMEOUT_MS,
      (device) => { // קולבק onDeviceFoundCallback
        const friendlyNameLower = device.friendlyName?.toLowerCase();

        if (!targetMediaServer && device.deviceType === MEDIA_SERVER_DEVICE && friendlyNameLower?.includes(UMS_NAME_IDENTIFIER)) {
          targetMediaServer = device;
          logger.info(`\n\n*****************************************************************`);
          logger.info(`* TARGET MEDIA SERVER FOUND (via callback):`);
          logger.info(`* Friendly Name: ${targetMediaServer.friendlyName}`);
          logger.info(`* UDN: ${targetMediaServer.UDN}`);
          // שדה rinfo אינו קיים ישירות ב-UpnpDevice, כתובת ה-IP נמצאת ב-basicDevice ששימש ליצירתו
          // או שצריך להוסיף את כתובת המקור ל-UpnpDevice אם זה חשוב כאן.
          // כרגע נשמיט את הדפסת ה-IP מהקולבק הזה.
          // logger.info(`* IP: ${targetMediaServer.rinfo.address}`);
          logger.info(`*****************************************************************\n`);
        }
 
        if (!targetMediaRenderer && device.deviceType === MEDIA_RENDERER_DEVICE && friendlyNameLower?.includes(KODI_NAME_IDENTIFIER)) {
          targetMediaRenderer = device;
          logger.info(`\n\n*****************************************************************`);
          logger.info(`* TARGET MEDIA RENDERER (KODI) FOUND (via callback):`);
          logger.info(`* Friendly Name: ${targetMediaRenderer.friendlyName}`);
          logger.info(`* UDN: ${targetMediaRenderer.UDN}`);
          // logger.info(`* IP: ${targetMediaRenderer.rinfo.address}`);
          logger.info(`*****************************************************************\n`);
        }
      },
      discoveryOptions
    );
 
    logger.info(`\n\n--- Discovery Process Finished ---`);
    logger.info(`Total unique devices fully processed and returned by Promise: ${allDiscoveredDevices.length}`);
 
    logger.info("\n--- Full list of all discovered devices for review: ---");
    printDeviceDetails(allDiscoveredDevices);
 
 
    // שלב 2: בדיקה אם המכשירים הרצויים נמצאו
    if (!targetMediaServer) {
      logger.info(`Target Media Server (containing "${UMS_NAME_IDENTIFIER}") not found via callback, checking full list...`);
      targetMediaServer = allDiscoveredDevices.find(d => d.deviceType === MEDIA_SERVER_DEVICE && d.friendlyName?.toLowerCase().includes(UMS_NAME_IDENTIFIER)) || null;
      if (targetMediaServer) {
        logger.info(`Fallback: Found Media Server from full list: ${targetMediaServer.friendlyName}`);
      } else {
        logger.error(`ERROR: Target Media Server (containing "${UMS_NAME_IDENTIFIER}") not found at all.`);
      }
    }
    if (!targetMediaRenderer) {
      logger.info(`Target Media Renderer (Kodi, containing "${KODI_NAME_IDENTIFIER}") not found via callback, checking full list...`);
      targetMediaRenderer = allDiscoveredDevices.find(d => d.deviceType === MEDIA_RENDERER_DEVICE && d.friendlyName?.toLowerCase().includes(KODI_NAME_IDENTIFIER)) || null;
      if (targetMediaRenderer) {
        logger.info(`Fallback: Found Media Renderer from full list: ${targetMediaRenderer.friendlyName}`);
      } else {
        logger.error(`ERROR: Target Media Renderer (Kodi, containing "${KODI_NAME_IDENTIFIER}") not found at all.`);
      }
    }
 
    if (!targetMediaServer || !targetMediaRenderer) {
      logger.error("\nCannot proceed with further actions: missing required media server or renderer.");
      return;
    }
 
    logger.info(`\n--- Proceeding with Actions Using Identified Devices ---`);
    // כאן נצטרך אולי לגשת לכתובת ה-IP של ההתקן אם היא נדרשת לפעולות SOAP.
    // המידע הזה היה ב-rinfo.address. נצטרך לוודא שהוא זמין.
    // כרגע, UpnpDevice (שהוא FullDeviceDescription) לא מכיל ישירות את rinfo.
    // הפונקציה fetchDeviceDescription מקבלת locationUrl, שממנו ניתן לגזור את כתובת הבסיס.
    logger.info(`Using Media Server: ${targetMediaServer.friendlyName}`);
    logger.info(`Using Media Renderer: ${targetMediaRenderer.friendlyName}`);
 
    const contentService = targetMediaServer.serviceList?.find(
      s => s.serviceType === CONTENT_DIRECTORY_SERVICE && s.controlURL && !s.scpdError
    );
    const avTransportService = targetMediaRenderer.serviceList?.find(
      s => s.serviceType === AVTRANSPORT_SERVICE && s.controlURL && !s.scpdError
    );
 
    if (!contentService || !contentService.controlURL) {
      logger.error(`ContentDirectory service not found or unusable on ${targetMediaServer.friendlyName}.`);
      return;
    }
    if (!avTransportService || !avTransportService.controlURL) {
      logger.error(`AVTransport service not found or unusable on ${targetMediaRenderer.friendlyName}.`);
      return;
    }
 
    logger.info(`\nSuccessfully identified ContentDirectory on [${targetMediaServer.friendlyName}]: ${contentService.serviceId}`);
    logger.info(`Successfully identified AVTransport on [${targetMediaRenderer.friendlyName}]: ${avTransportService.serviceId}`);
 
    try {
      logger.info(`\n--- Testing SOAP on Renderer: ${targetMediaRenderer.friendlyName} ---`);
      logger.info(`Attempting GetTransportInfo...`);
      const transportInfo = await sendSoapRequest(
        contentService.controlURL, // שים לב: צריך להיות avTransportService.controlURL
        AVTRANSPORT_SERVICE,
        'GetTransportInfo',
        { InstanceID: 0 } // פרמטרים לדוגמה
      );
      logger.info('GetTransportInfo Response:', { response: transportInfo });
 
      logger.info(`\nAttempting GetMediaInfo...`);
      const mediaInfo = await sendSoapRequest(
        avTransportService.controlURL,
        AVTRANSPORT_SERVICE,
        'GetMediaInfo',
        { InstanceID: 0 } // פרמטרים לדוגמה
      );
      logger.info('GetMediaInfo Response:', { response: mediaInfo });
      logger.info(`--- End of SOAP Tests on Renderer ---`);
 
      logger.info("\nPlaceholder for: Browsing UMS and Playing on Kodi...");
 
    } catch (soapError: any) {
      logger.error(`SOAP Action failed for ${targetMediaRenderer.friendlyName}: ${soapError.message}`, { errorDetails: soapError });
      if (soapError.response?.data) {
        logger.error("SOAP Fault:", { fault: soapError.response.data });
      }
    }
 
  } catch (error) {
    const err = error as Error;
    logger.error('An error occurred during the discovery or SOAP process:', { errorMessage: err.message, stack: err.stack });
  }
}
 
// הפונקציה printDeviceDetails צריכה להתעדכן כדי לצרוך UpnpDevice
// ולהתייחס לכך ש-rinfo אינו חלק ישיר מ-UpnpDevice.
// עם זאת, המבנה הפנימי של serviceList, actions, stateVariables אמור להיות תואם.
function printDeviceDetails(devices: UpnpDevice[]): void {
  if (!devices || devices.length === 0) {
    logger.info('No devices to display.');
    return;
  }
  devices.forEach((device, index) => {
    logger.info(`\nDevice ${index + 1}:`);
    logger.info(`  Friendly Name: ${device.friendlyName || 'N/A'}`);
    logger.info(`  Device Type: ${device.deviceType || 'N/A'}`);
    logger.info(`  UDN: ${device.UDN || 'N/A'}`);
    logger.info(`  Manufacturer: ${device.manufacturer || 'N/A'}`);
    logger.info(`  Model Name: ${device.modelName || 'N/A'}`);
    // logger.info(`  Base URL: ${device.baseURL || 'N/A'}`); // baseURL לא קיים ישירות ב-FullDeviceDescription
    // logger.info(`  Description URL: ${device.descriptionUrl}`); // descriptionUrl לא קיים ישירות ב-FullDeviceDescription
    // logger.info(`  IP Address: ${device.rinfo?.address}:${device.rinfo?.port}`); // rinfo לא קיים
 
    logger.info('  Services:');
    if (device.serviceList && device.serviceList.length > 0) {
      device.serviceList.forEach(service => {
        logger.info(`    - Service Type: ${service.serviceType}`);
        logger.info(`      Service ID: ${service.serviceId}`);
        logger.info(`      Control URL: ${service.controlURL || 'N/A'}`);
        logger.info(`      SCPD URL: ${service.SCPDURL || 'N/A'}`);
        if (service.scpdError) {
          logger.info(`      SCPD Error: ${service.scpdError}`);
        }
 
        if (service.actionList && service.actionList.length > 0) {
          logger.info('      Actions:');
          service.actionList.forEach(action => {
            logger.info(`        * ${action.name}:`);
            if (action.arguments && action.arguments.length > 0) {
              action.arguments.forEach(arg => {
                logger.info(`          - Arg: ${arg.name} (Direction: ${arg.direction}, Related State Variable: ${arg.relatedStateVariable})`);
              });
            } else {
              logger.info(`          (No arguments)`);
            }
          });
        } else if (!service.scpdError) {
          logger.info('      (No actions found or SCPD not processed successfully for actions)');
        }
 
        if (service.stateVariables && service.stateVariables.length > 0) {
          logger.info('      State Variables:');
          service.stateVariables.forEach(sv => {
            let svDetails = `        * ${sv.name} (Type: ${sv.dataType}`;
            if (sv.sendEventsAttribute) {
              svDetails += `, SendEvents: ${sv.sendEventsAttribute}`;
            }
            if (sv.defaultValue) {
              svDetails += `, Default: ${sv.defaultValue}`;
            }
            svDetails += `)`;
            logger.info(svDetails);
            if (sv.allowedValueList && sv.allowedValueList.length > 0) {
              logger.info(`          Allowed Values: [${sv.allowedValueList.join(', ')}]`);
            }
          });
        } else if (!service.scpdError) {
          logger.info('      (No state variables found or SCPD not processed successfully for state variables)');
        }
      });
    } else {
      logger.info('    No services listed.');
    }
    // if (device.error) { // 'error' field is not part of FullDeviceDescription
    //   logger.info(`  Error: ${device.error}`);
    // }
  });
}
 
main().catch(err => {
    logger.error("Unhandled error in main:", { error: err });
});