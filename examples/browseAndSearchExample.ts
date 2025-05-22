// examples/browseAndSearchExample.ts

// ייבוא המודולים הנדרשים
// נתיבים יחסיים מתיקיית examples לתיקיית src
// במקום discoverAndProcessDevices, נשתמש ישירות בפונקציות הגילוי הנמוכות יותר
import { discoverSsdpDevicesIterable, fetchDeviceDescription } from '../src/upnpDeviceExplorer';
import { ContentDirectoryService } from '../src/contentDirectoryService'; // ייבוא טיפוסים נכונים
// DeviceDescription הוא הטיפוס המלא של המכשיר, כולל רשימת שירותים לאחר fetch
// BasicSsdpDevice הוא הטיפוס הבסיסי המתקבל מ-SSDP discovery
// DiscoveryOptions משמש להגדרת אפשרויות הגילוי
import {
  DeviceDescription, ServiceDescription, BasicSsdpDevice, DiscoveryOptions,
  BrowseResult, DidlLiteContainer, DidlLiteObject, BrowseFlag
} from '../src/types';
// UpnpSoapClient מיובא כפי שנדרש, וניצור מופע שלו
import { UpnpSoapClient } from '../src/index';
import { createModuleLogger } from '../src/index'; // הוספת ייבוא הלוגר

const logger = createModuleLogger('browseAndSearchExample'); // יצירת מופע לוגר

// קבוע עבור סוג שירות ContentDirectory
const CONTENT_DIRECTORY_SERVICE_TYPE = 'urn:schemas-upnp-org:service:ContentDirectory:1';
const TIMEOUT = 30 * 1000; // 30 שניות, זמן מקסימלי לגילוי כולל

/**
 * פונקציה לעיבוד והדפסת פריטים ותיקיות מתוצאות DIDL-Lite
 * @param items - מערך הפריטים והתיקיות (DidlLiteContainer | DidlLiteObject)
 * @param type - סוג הפעולה (Browse/Search) לצורך לוגים
 */
function printDidlLiteContent(items: (DidlLiteContainer | DidlLiteObject)[], type: 'Browse' | 'Search'): void {
  const containers: DidlLiteContainer[] = items.filter(item => 'childCount' in item || item.class.startsWith('object.container')) as DidlLiteContainer[];
  const mediaObjects: DidlLiteObject[] = items.filter(item => !('childCount' in item || item.class.startsWith('object.container'))) as DidlLiteObject[];

  if (containers.length > 0) {
    logger.info(`  תיקיות שנמצאו ב-${type}:`);
    containers.forEach(container => {
      // הדפסת שם התיקיה והמזהה שלה
      logger.info(`    - ${container.title} (ID: ${container.id}, Class: ${container.class})`);
    });
  }

  if (mediaObjects.length > 0) {
    logger.info(`  פריטים שנמצאו ב-${type}:`);
    mediaObjects.forEach(item => {
      // הדפסת שם הפריט, המזהה והסיווג שלו
      logger.info(`    - ${item.title} (ID: ${item.id}, Class: ${item.class})`);
      // אם קיים מידע על המשאב (למשל, קישור לקובץ), הדפס אותו
      if (item.resources && item.resources.length > 0) {
        const resource = item.resources[0]; // קח את המשאב הראשון אם יש כמה
        if (resource && resource.uri) {
          logger.info(`      Resource: ${resource.uri} (Protocol: ${resource.protocolInfo})`);
        }
      }
    });
  }

  if (containers.length === 0 && mediaObjects.length === 0) {
    logger.info(`  לא נמצאו פריטים או תיקיות בתוכן ה-DIDL-Lite של ${type}.`);
  }
}


/**
 * פונקציה לעיבוד מכשיר ספציפי (ביצוע Browse ו-Search)
 * @param targetDevice המכשיר לעיבוד
 * @param cdServiceInfo פרטי שירות ה-ContentDirectory של המכשיר
 */
async function processSingleDevice(targetDevice: DeviceDescription, cdServiceInfo: ServiceDescription): Promise<void> {
  logger.info(`\nמשתמש במכשיר: ${targetDevice.friendlyName} (סוג: ${targetDevice.deviceType})`);
  logger.info(`פרטי שירות ContentDirectory: URL=${cdServiceInfo.controlURL}, Type=${cdServiceInfo.serviceType}`);

  // ודא ש-actionList קיים (חיוני ליצירת ContentDirectoryService)
  if (!cdServiceInfo.actionList) {
    logger.error(`שירות ContentDirectory במכשיר ${targetDevice.friendlyName} לא מכיל actionList. לא ניתן להמשיך.`, { serviceInfo: cdServiceInfo });
    return; // לא ניתן להמשיך בלי actionList
  }

  // יצירת מופע של UpnpSoapClient
  const soapClient = new UpnpSoapClient();

  // יצירת מופע של ContentDirectoryService
  const contentDirectory = new ContentDirectoryService(
    cdServiceInfo, // מעבירים את אובייקט ServiceDescription המלא
    soapClient     // מעבירים את מופע ה-SoapClient
  );

  // 1. הדגמת פעולת browse
  const objectIdToBrowse = '0'; // מזהה אובייקט השורש (root), בדרך כלל '0'
  logger.info(`\nמבצע פעולת Browse עבור ObjectID: ${objectIdToBrowse}...`);
  try {
    const browseResult: BrowseResult = await contentDirectory.browse(
      objectIdToBrowse,
      BrowseFlag.BrowseDirectChildren, // שימוש ב-enum
      "*", // Filter
      0,   // StartingIndex
      0,   // RequestedCount
      ""   // SortCriteria
    );

    logger.info(`תוצאות Browse (נמצאו ${browseResult.numberReturned} פריטים מתוך ${browseResult.totalMatches} סה"כ):`);
    if (browseResult.items && browseResult.items.length > 0) {
      printDidlLiteContent(browseResult.items, 'Browse');
    } else {
      logger.info('  לא נמצאו פריטים ב-Browse (תוצאה ריקה או שגויה).');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`שגיאה במהלך פעולת Browse (ObjectID: ${objectIdToBrowse}): ${errorMessage}`, { errorDetails: error });
    if (error instanceof Error && 'rawResponse' in error && (error as any).rawResponse) {
      logger.error('   פרטי תגובת השגיאה מהשרת (אם זמינים):', { rawResponse: (error as any).rawResponse });
    } else if (error instanceof Error && 'response' in error && (error as any).response?.data) {
      logger.error('   פרטי תגובת השגיאה מהשרת (דרך response.data):', { responseData: (error as any).response.data });
    }
  }

  // 2. הדגמת פעולת search
  const searchCriteria = 'upnp:class derivedfrom "object.item.videoItem"';
  logger.info(`\nמבצע פעולת Search עם קריטריון: "${searchCriteria}"...`);
  try {
    const searchResult: BrowseResult = await contentDirectory.search(
      '0', // ContainerID: חפש בכל המכשיר (החל מהשורש '0')
      searchCriteria,
      "*", 0, 0, ""
    );

    logger.info(`תוצאות Search (נמצאו ${searchResult.numberReturned} פריטים מתוך ${searchResult.totalMatches} סה"כ):`);
    if (searchResult.items && searchResult.items.length > 0) {
      printDidlLiteContent(searchResult.items, 'Search');
    } else {
      logger.info('  לא נמצאו פריטים ב-Search (תוצאה ריקה או שגויה).');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`שגיאה במהלך פעולת Search (קריטריון: "${searchCriteria}"): ${errorMessage}`, { errorDetails: error });
    if (error instanceof Error && 'rawResponse' in error && (error as any).rawResponse) {
      logger.error('   פרטי תגובת השגיאה מהשרת (אם זמינים):', { rawResponse: (error as any).rawResponse });
    } else if (error instanceof Error && 'response' in error && (error as any).response?.data) {
      logger.error('   פרטי תגובת השגיאה מהשרת (דרך response.data):', { responseData: (error as any).response.data });
    }
  }
}


/**
 * פונקציה ראשית להדגמת גלישה וחיפוש במכשיר UPnP הראשון שנמצא ותומך ב-ContentDirectory.
 */
async function main() {
  logger.info('מתחיל גילוי מכשירי UPnP, יעבד את המכשיר הראשון המתאים...');
  let deviceProcessedSuccessfully = false;

  // הגדרות עבור תהליך הגילוי
  const discoveryOptions: Partial<DiscoveryOptions> = {
    searchTarget: "ssdp:all", // אפשר גם לחפש ישירות את CONTENT_DIRECTORY_SERVICE_TYPE
    timeoutMs: TIMEOUT,       // זמן מקסימלי כולל לתהליך הגילוי
    discoveryTimeoutPerInterfaceMs: TIMEOUT, // זמן המתנה לתגובות מכל ממשק רשת, ברירת מחדל 2000ms
    // אם רוצים שהאיטרטור יחזיר מכשירים מהר יותר, אפשר להקטין
    // אך timeoutMs הוא המגבלה הכוללת.
    // customLogger: console, // אם רוצים לוגים מפורטים יותר ממנוע הגילוי
  };

  // שימוש באיטרטור אסינכרוני לגילוי מכשירים
  // הלולאה תרוץ עד שיעבור TIMEOUT או עד שנצא ממנה מפורשות (break)
  const devicesIterable = discoverSsdpDevicesIterable(discoveryOptions);
  const uniqueDeviceLocations = new Set<string>(); // למנוע עיבוד כפול של אותו מכשיר אם הוא מופיע מספר פעמים

  logger.info(`מתחיל סריקת מכשירים... התהליך יפסיק לאחר עיבוד המכשיר הראשון המתאים או לאחר ${TIMEOUT / 1000} שניות.`);

  try {
    for await (const basicDevice of devicesIterable) {
      // בדוק אם כבר טיפלנו במכשיר זה (לפי ה-LOCATION שלו)
      if (basicDevice.location && !uniqueDeviceLocations.has(basicDevice.location)) {
        uniqueDeviceLocations.add(basicDevice.location); // סמן את המיקום כנצפה
        logger.info(`\nנמצא מכשיר בסיסי: ${basicDevice.usn || 'לא ידוע USN'} בכתובת ${basicDevice.location}. מאחזר פרטים מלאים...`);

        try {
          // אחזר פרטים מלאים של המכשיר, כולל תיאור שירותים (SCPD)
          const detailedDevice: DeviceDescription | null = await fetchDeviceDescription(basicDevice, true); // true = אחזר SCPD

          if (detailedDevice && detailedDevice.serviceList) {
            logger.info(`בדיקת מכשיר: ${detailedDevice.friendlyName || 'שם לא ידוע'} (${detailedDevice.modelName || 'דגם לא ידוע'})`);

            // חפש את שירות ה-ContentDirectory במכשיר
            const cdServiceInfo = detailedDevice.serviceList.find(
              (s: ServiceDescription) => s.serviceType === CONTENT_DIRECTORY_SERVICE_TYPE
            );

            if (cdServiceInfo) {
              logger.info(`נמצא שירות ContentDirectory במכשיר: ${detailedDevice.friendlyName}`);
              // הפעל את לוגיקת העיבוד עבור המכשיר שנמצא
              await processSingleDevice(detailedDevice, cdServiceInfo);
              deviceProcessedSuccessfully = true;
              logger.info('העיבוד של המכשיר הראשון המתאים הסתיים. מפסיק את תהליך הגילוי.');
              break; // יציאה מהלולאה, מפסיק את הגילוי
            } else {
              // logger.info(`  מכשיר ${detailedDevice.friendlyName} אינו תומך בשירות ContentDirectory.`);
            }
          } else if (detailedDevice) {
            logger.info(`  לא הצלחנו לאחזר רשימת שירותים עבור ${detailedDevice.friendlyName || basicDevice.usn}.`);
          } else {
            logger.warn(`  לא הצלחנו לאחזר פרטים מלאים עבור ${basicDevice.location}.`);
          }
        } catch (fetchError: any) {
          logger.error(`  שגיאה באחזור או עיבוד פרטים עבור ${basicDevice.location}: ${fetchError.message}`, { errorDetails: fetchError });
        }
      } else if (basicDevice.location && uniqueDeviceLocations.has(basicDevice.location)) {
        // logger.debug(`  מדלג על מיקום שכבר נבדק: ${basicDevice.location}`);
      } else if (!basicDevice.location) {
        logger.warn(`  מכשיר התגלה ללא מיקום (LOCATION): ${basicDevice.usn || 'USN לא ידוע'}`);
      }
      // אין צורך בבדיקת זמן כאן, discoverSsdpDevicesIterable יסתיים לבד אחרי timeoutMs
    } // סוף לולאת for await

    // הודעה אם לא נמצא מכשיר מתאים לאחר סיום הגילוי (timeout או break)
    if (!deviceProcessedSuccessfully) {
      logger.info('\nלא נמצא מכשיר תומך בשירות ContentDirectory במהלך הגילוי, או שהעיבוד נכשל.');
    }

  } catch (error) {
    // טיפול בשגיאות כלליות שעלולות להתרחש במהלך הגילוי
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('אירעה שגיאה כללית במהלך הרצת הדוגמה:', { errorMessage, errorDetails: error });
  } finally {
    // יציאה מהלולאת for await אמורה לנקות את המשאבים של האיטרטור.
    // אין צורך בקריאה מפורשת ל-stopDiscovery.
    logger.info('\nהדגמה הסתיימה. הרץ את הקובץ (למשל, באמצעות `bun run examples/browseAndSearchExample.ts`) כדי לבדוק את התקשורת עם מכשירי UPnP ברשת שלך.');
  }
}

// הרצת הפונקציה הראשית של הדוגמה
main().catch(err => {
  // טיפול בשגיאות שלא נתפסו בפונקציה הראשית (למשל, שגיאות קריטיות)
  logger.error("שגיאה קריטית בלתי צפויה ברמה העליונה:", { error: err });
});