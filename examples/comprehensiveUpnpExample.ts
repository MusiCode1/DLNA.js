// examples/comprehensiveUpnpExample.ts - קובץ דוגמה מקיף לשימוש במודולי UPnP החדשים

import {
  discoverAndProcessDevices,
  UpnpDevice,
  UpnpService, // שימוש בטיפוס המיוצא מהשירות
  MEDIA_SERVER_DEVICE,
  MEDIA_RENDERER_DEVICE,
  AVTRANSPORT_SERVICE,
  CONTENT_DIRECTORY_SERVICE,
} from '../src/upnpDiscoveryService'; // ייבוא מהמודול החדש
import { sendSoapRequest } from '../src/experimental_ssdp/soapActions'; // ייבוא מודול ה-SOAP (עדיין מהמיקום הישן)
import { Action, ActionArgument, StateVariable, DeviceDescription } from '../src/types'; // ייבוא טיפוסים נוספים במידת הצורך
import { createModuleLogger } from '../src/logger'; // הוספת ייבוא הלוגר

const logger = createModuleLogger('comprehensiveUpnpExample'); // יצירת מופע לוגר

const TIMEOUT = 60 * 1000; // זמן המתנה לגילוי מכשירים (במילישניות)

// קבועים לזיהוי המכשירים הרצויים
const KODI_NAME_IDENTIFIER = "kodi"; // חלק מהשם של Kodi
const UMS_NAME_IDENTIFIER = ""; // חלק מהשם של UMS (או שרת אחר)
// ניתן להוסיף כאן מזהים נוספים אם רוצים לבדוק שרתים/נגנים אחרים
// const PLEX_NAME_IDENTIFIER = "plex media server";

async function main() {
  logger.info('Starting comprehensive UPnP device discovery using the new upnpDiscoveryService...');

  let targetMediaServer: UpnpDevice | null = null;
  let targetMediaRenderer: UpnpDevice | null = null;

  const onDeviceFoundCallback = (device: DeviceDescription) => { // זה הקולבק onDeviceFoundCallback
    const friendlyNameLower = device.friendlyName?.toLowerCase();

    // זיהוי ושמירת שרת המדיה הרצוי (UMS)
    if (!targetMediaServer && device.deviceType === MEDIA_SERVER_DEVICE && friendlyNameLower?.includes(UMS_NAME_IDENTIFIER)) {
      targetMediaServer = device;
      logger.info(`\n\n*****************************************************************`);
      logger.info(`* TARGET MEDIA SERVER (UMS) FOUND (via callback):`);
      logger.info(`* Friendly Name: ${targetMediaServer.friendlyName}`);
      logger.info(`* UDN: ${targetMediaServer.UDN}`);
      logger.info(`* IP: ${targetMediaServer.sourceIpAddress}`); // שימוש ב-sourceIpAddress
      logger.info(`*****************************************************************\n`);
    }

    // זיהוי ושמירת נגן המדיה הרצוי (Kodi)
    if (!targetMediaRenderer && device.deviceType === MEDIA_RENDERER_DEVICE && friendlyNameLower?.includes(KODI_NAME_IDENTIFIER)) {
      targetMediaRenderer = device;
      logger.info(`\n\n*****************************************************************`);
      logger.info(`* TARGET MEDIA RENDERER (KODI) FOUND (via callback):`);
      logger.info(`* Friendly Name: ${targetMediaRenderer.friendlyName}`);
      logger.info(`* UDN: ${targetMediaRenderer.UDN}`);
      logger.info(`* IP: ${targetMediaRenderer.sourceIpAddress}`); // שימוש ב-sourceIpAddress
      logger.info(`*****************************************************************\n`);
    }
  };

  try {
    // שלב 1: גילוי כל המכשירים ברשת פעם אחת, עם קולבק לעיבוד בזמן אמת
    logger.info(`Starting UPnP device discovery (ssdp:all) with timeout: ${TIMEOUT / 1000}s...`);

    // הגדרת כתובת IP ספציפית (אופציונלי, אם רוצים להגביל את הגילוי לממשק רשת מסוים)
    // const specificInterfaceIP = "10.100.102.106"; // לדוגמה
    // logger.info(`Attempting discovery using specific interface IP: ${specificInterfaceIP} for discovery if provided.`);

    const allDiscoveredDevices: UpnpDevice[] = await discoverAndProcessDevices(
      "ssdp:all", // ברירת מחדל, ניתן לשנות לחיפוש ספציפי יותר
      TIMEOUT,
      onDeviceFoundCallback,
      {
        // customLogger: (level, message, ...optionalParams) => logger[level](`[CustomLogger] ${message}`, ...optionalParams),
        // networkInterfaces: undefined, // השתמש בברירת המחדל של המערכת או ספק רשימה
        includeIPv6: true, // ברירת מחדל
        discoveryTimeoutPerInterfaceMs: TIMEOUT // ברירת מחדל
      }
    );

    logger.info(`\n\n--- Discovery Process Finished ---`);
    logger.info(`Total unique devices fully processed and returned by Promise: ${allDiscoveredDevices.length}`);

    // הדפסת כל המכשירים שנמצאו לצורך סקירה כללית
    logger.info("\n--- Full list of all discovered devices for review: ---");
    printDeviceDetails(allDiscoveredDevices);


    // שלב 2: בדיקה אם המכשירים הרצויים נמצאו (דרך הקולבק או מהרשימה המלאה כגיבוי)
    if (!targetMediaServer) {
      logger.info(`Target Media Server (containing "${UMS_NAME_IDENTIFIER}") not found via callback, checking full list...`);
      targetMediaServer = allDiscoveredDevices.find(d => d.deviceType === MEDIA_SERVER_DEVICE && d.friendlyName?.toLowerCase().includes(UMS_NAME_IDENTIFIER)) || null;
      if (targetMediaServer) {
        logger.info(`Fallback: Found Media Server from full list: ${targetMediaServer.friendlyName}`);
      } else {
        logger.warn(`WARNING: Target Media Server (containing "${UMS_NAME_IDENTIFIER}") not found at all.`);
      }
    }
    if (!targetMediaRenderer) {
      logger.info(`Target Media Renderer (Kodi, containing "${KODI_NAME_IDENTIFIER}") not found via callback, checking full list...`);
      targetMediaRenderer = allDiscoveredDevices.find(d => d.deviceType === MEDIA_RENDERER_DEVICE && d.friendlyName?.toLowerCase().includes(KODI_NAME_IDENTIFIER)) || null;
      if (targetMediaRenderer) {
        logger.info(`Fallback: Found Media Renderer from full list: ${targetMediaRenderer.friendlyName}`);
      } else {
        logger.warn(`WARNING: Target Media Renderer (Kodi, containing "${KODI_NAME_IDENTIFIER}") not found at all.`);
      }
    }

    if (!targetMediaServer) {
      logger.info("\nNo Media Server found, SOAP tests for server will be skipped.");
    }
    if (!targetMediaRenderer) {
      logger.info("\nNo Media Renderer found, SOAP tests for renderer will be skipped.");
    }

    // שלב 3: קבלת שירותים רלוונטיים מהמכשירים שנבחרו (אם נמצאו)
    let contentService: UpnpService | undefined;
    if (targetMediaServer) {
      logger.info(`\n--- Identifying services on Media Server: ${targetMediaServer.friendlyName} (IP: ${targetMediaServer.sourceIpAddress}) ---`);
      contentService = targetMediaServer.serviceList?.find(
        s => s.serviceType === CONTENT_DIRECTORY_SERVICE && s.controlURL && s.actionList // ודא שיש controlURL ופעולות
      );
      if (!contentService || !contentService.controlURL) {
        logger.error(`ContentDirectory service not found or unusable on ${targetMediaServer.friendlyName}.`);
      } else {
        logger.info(`Successfully identified ContentDirectory on [${targetMediaServer.friendlyName}]: ${contentService.serviceId}`);
        // כאן ניתן להוסיף דוגמאות SOAP עבור contentService אם רוצים, למשל Browse
      }
    }

    let avTransportService: UpnpService | undefined;
    if (targetMediaRenderer) {
      logger.info(`\n--- Identifying services on Media Renderer: ${targetMediaRenderer.friendlyName} (IP: ${targetMediaRenderer.sourceIpAddress}) ---`);
      avTransportService = targetMediaRenderer.serviceList?.find(
        s => s.serviceType === AVTRANSPORT_SERVICE && s.controlURL && s.actionList // ודא שיש controlURL ופעולות
      );
      if (!avTransportService || !avTransportService.controlURL) {
        logger.error(`AVTransport service not found or unusable on ${targetMediaRenderer.friendlyName}.`);
      } else {
        logger.info(`Successfully identified AVTransport on [${targetMediaRenderer.friendlyName}]: ${avTransportService.serviceId}`);

        // שלב 4: ביצוע פעולות SOAP לדוגמה (GetTransportInfo, GetMediaInfo) על הנגן
        try {
          logger.info(`\n--- Testing SOAP on Renderer: ${targetMediaRenderer.friendlyName} ---`);

          // תיקון: שימוש ב-avTransportService.controlURL הנכון
          const controlUrlForRenderer = avTransportService.controlURL;

          logger.info(`Attempting GetTransportInfo using controlURL: ${controlUrlForRenderer}...`);
          const transportInfo = await sendSoapRequest(
            controlUrlForRenderer,
            AVTRANSPORT_SERVICE, // השירות הנכון
            'GetTransportInfo',
            { InstanceID: 0 } // פרמטרים נדרשים
          );
          logger.info('GetTransportInfo Response:', { response: transportInfo });

          logger.info(`\nAttempting GetMediaInfo using controlURL: ${controlUrlForRenderer}...`);
          const mediaInfo = await sendSoapRequest(
            controlUrlForRenderer,
            AVTRANSPORT_SERVICE, // השירות הנכון
            'GetMediaInfo',
            { InstanceID: 0 } // פרמטרים נדרשים
          );
          logger.info('GetMediaInfo Response:', { response: mediaInfo });
          logger.info(`--- End of SOAP Tests on Renderer ---`);

        } catch (soapError: any) {
          logger.error(`SOAP Action failed for ${targetMediaRenderer.friendlyName}: ${soapError.message}`, { errorDetails: soapError });
          if (soapError.response?.data) {
            logger.error("SOAP Error details:", { responseData: soapError.response.data });
          }
        }
      }
    }

    if (!targetMediaServer && !targetMediaRenderer) {
      logger.warn("\nNeither target Media Server nor Renderer were found. Cannot proceed with SOAP actions.");
    } else if (!targetMediaServer) {
      logger.info("\nMedia Server not found, skipping related actions.");
    } else if (!targetMediaRenderer) {
      logger.info("\nMedia Renderer not found, skipping related actions.");
    }


    logger.info("\nPlaceholder for: Browsing Media Server and Playing on Renderer (if both found)...");
    // כאן נוכל להוסיף את הלוגיקה של גלישה בשרת המדיה (contentService)
    // ואז הפעלת קובץ על הנגן (avTransportService)
    // למשל:
    // 1. Browse UMS ContentDirectory for a specific video item.
    // 2. Get the video item's resource URI and metadata.
    // 3. Use AVTransport's SetAVTransportURI on Kodi with the item's URI and metadata.
    // 4. Use AVTransport's Play on Kodi.

  } catch (error) {
    logger.error('An error occurred during the discovery or SOAP process:', { errorDetails: error });
  }
}

function printDeviceDetails(devices: UpnpDevice[]): void {
  if (devices.length === 0) {
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
    logger.info(`  Base URL: ${device.baseURL || 'N/A'}`);
    logger.info(`  Description URL: ${device.descriptionUrl || 'N/A'}`); // היה חסר N/A
    logger.info(`  Source IP Address: ${device.sourceIpAddress || 'N/A'}`); // שימוש ב-sourceIpAddress
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
          service.actionList.forEach((action: Action) => { // הוספת טיפוס Action
            logger.info(`        * ${action.name}:`);
            if (action.arguments && action.arguments.length > 0) {
              action.arguments.forEach((arg: ActionArgument) => { // הוספת טיפוס ActionArgument
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
          service.stateVariables.forEach((sv: StateVariable) => { // הוספת טיפוס StateVariable
            let svDetails = `        * ${sv.name} (Type: ${sv.dataType}`;
            if (sv.sendEventsAttribute !== undefined) { // בדיקה אם המאפיין קיים
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
    // אין שדה error ישירות על UpnpDevice, שגיאות נתפסות ברמת התהליך או ב-scpdError
  });
}

// הרצת הפונקציה הראשית
main().then(() => {
  logger.info("\nComprehensive UPnP example finished.");
}).catch(err => {
  logger.error("\nCritical error in main execution of comprehensive UPnP example:", { error: err });
});