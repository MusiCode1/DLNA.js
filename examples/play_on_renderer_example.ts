// קובץ: examples/play_on_renderer_example.ts
// סקריפט זה מדגים הערת התקן רינדור, גישה לשרת מדיה,
// דפדוף בתיקייה והשמעת קבצים מהשרת על גבי הרינדור.

import { wakeDeviceAndVerify } from '../drafts/wake_and_check_device';
import { processUpnpDeviceFromUrl, createModuleLogger, DiscoveryDetailLevel, BrowseFlag, ContentDirectoryService } from '../src';
import type {
    FullDeviceDescription,
    ServiceDescription,
    Action,
    DidlLiteObject,
    DidlLiteContainer,
    Resource,
} from '../src/types';

const logger = createModuleLogger('PlayOnRendererExample');

// --- הגדרות קבועות ---
const MEDIA_SERVER_URL = 'http://192.168.1.108:7879/rootDesc.xml';
const RENDERER_DEVICE_XML_URL = 'http://192.168.1.114:1150/'; // לפי אישור המשתמש, זו כתובת ה-XML
const RENDERER_MAC_ADDRESS = 'AC:5A:F0:E5:8C:25';
const RENDERER_IP_ADDRESS = '192.168.1.114'; // נגזר מה-URL של הרינדור
const TARGET_BROWSE_DIRECTORY_ID = '0'; // התיקייה הראשית בשרת המדיה

// --- פונקציות עזר ---

/**
 * מוצא שירות ספציפי מתוך התקן שעבר עיבוד מלא.
 * @param device - התקן שעבר עיבוד מלא.
 * @param serviceTypeOrId - סוג השירות (למשל, "urn:schemas-upnp-org:service:ContentDirectory:1") או ID השירות.
 * @returns השירות שנמצא, או undefined אם לא נמצא.
 */
function findService(
    device: FullDeviceDescription,
    serviceTypeOrId: string
): ServiceDescription | undefined {
    if (!device.serviceList) {
        logger.warn(`Device ${device.friendlyName} has no service list.`);
        return undefined;
    }
    return device.serviceList.find(
        (s) => s.serviceType === serviceTypeOrId || s.serviceId === serviceTypeOrId
    );
}

/**
 * מוצא פעולה ספציפית מתוך שירות.
 * @param service - השירות.
 * @param actionName - שם הפעולה.
 * @returns הפעולה שנמצאה, או undefined אם לא נמצאה.
 */
function findAction(
    service: ServiceDescription,
    actionName: string
): Action | undefined {
    if (!service.actionList) {
        logger.warn(`Service ${service.serviceId} has no action list.`);
        return undefined;
    }
    return service.actionList.find((a) => a.name === actionName);
}

// --- פונקציה ראשית ---
async function main() {
    logger.info('Starting play on renderer example script...');

    // שלב 1: הערת התקן הרינדור והמתנה להתעוררותו
    logger.info(`Attempting to wake renderer device ${RENDERER_IP_ADDRESS} (MAC: ${RENDERER_MAC_ADDRESS})...`);
    try {
        await wakeDeviceAndVerify(
            RENDERER_MAC_ADDRESS,
            RENDERER_IP_ADDRESS,
            '255.255.255.255', // broadcast address
            9, // wol port
            90, // ping total timeout seconds (מותאם להתקנים שלוקח להם זמן לעלות)
            3,  // ping interval seconds
            5   // ping single timeout seconds
        );
        logger.info(`Renderer device ${RENDERER_IP_ADDRESS} should be awake.`);
    } catch (error) {
        logger.error(`Failed to wake or verify renderer device ${RENDERER_IP_ADDRESS}. Aborting script.`, error);
        return;
    }

    // שלב 2: עיבוד התקן שרת המדיה
    logger.info(`Processing media server at ${MEDIA_SERVER_URL}...`);
    let mediaServerDevice: FullDeviceDescription | null = null;
    try {
        const processedServer = await processUpnpDeviceFromUrl(
            MEDIA_SERVER_URL,
            DiscoveryDetailLevel.Full
        );
        if (processedServer && processedServer.detailLevelAchieved === DiscoveryDetailLevel.Full) {
            mediaServerDevice = processedServer as FullDeviceDescription;
            logger.info(`Successfully processed media server: ${mediaServerDevice.friendlyName}`);
        } else {
            logger.error('Failed to fully process media server or detail level was not Full.');
            if (processedServer && processedServer.error) {
                logger.error(`Server processing error: ${processedServer.error}`);
            }
            return;
        }
    } catch (error) {
        logger.error(`Error processing media server at ${MEDIA_SERVER_URL}. Aborting script.`, error);
        return;
    }

    // שלב 3: עיבוד התקן הרינדור
    logger.info(`Processing renderer device at ${RENDERER_DEVICE_XML_URL}...`);
    let rendererDevice: FullDeviceDescription | null = null;
    try {
        const processedRenderer = await processUpnpDeviceFromUrl(
            RENDERER_DEVICE_XML_URL,
            DiscoveryDetailLevel.Full
        );
        if (processedRenderer && processedRenderer.detailLevelAchieved === DiscoveryDetailLevel.Full) {
            rendererDevice = processedRenderer as FullDeviceDescription;
            logger.info(`Successfully processed renderer device: ${rendererDevice.friendlyName}`);
        } else {
            logger.error('Failed to fully process renderer device or detail level was not Full.');
            if (processedRenderer && processedRenderer.error) {
                logger.error(`Renderer processing error: ${processedRenderer.error}`);
            }
            return;
        }
    } catch (error) {
        logger.error(`Error processing renderer device at ${RENDERER_DEVICE_XML_URL}. Aborting script.`, error);
        return;
    }

    // שלב 4: דפדוף בתיקייה בשרת המדיה
    logger.info(`Browsing directory ID "${TARGET_BROWSE_DIRECTORY_ID}" on media server "${mediaServerDevice.friendlyName}"...`);
    const cdsServiceInfo = findService(mediaServerDevice, 'urn:schemas-upnp-org:service:ContentDirectory:1');
    if (!cdsServiceInfo) {
      logger.error(`ContentDirectory service not found on media server ${mediaServerDevice.friendlyName}. Aborting.`);
      return;
    }
  
    let mediaItems: DidlLiteObject[] = [];
    try {
      // יצירת מופע של ContentDirectoryService
      const cds = new ContentDirectoryService(cdsServiceInfo);
      
      logger.debug(`Attempting to browse directory ID "${TARGET_BROWSE_DIRECTORY_ID}" using ContentDirectoryService.`);
      const browseResult = await cds.browse(
        TARGET_BROWSE_DIRECTORY_ID,
        BrowseFlag.BrowseDirectChildren,
        '*', // Filter
        0,   // StartingIndex
        0,   // RequestedCount (0 for all)
        ''   // SortCriteria
      );
      logger.debug('Browse action successful using ContentDirectoryService. Result:', browseResult);
  
      if (browseResult && browseResult.items) {
        mediaItems = browseResult.items.filter(
          (item: DidlLiteContainer | DidlLiteObject): item is DidlLiteObject =>
            item.class.startsWith('object.item.audioItem') || item.class.startsWith('object.item.videoItem')
        );
      }
  
      if (mediaItems.length === 0) {
        logger.info(`No media items (audio/video) found in directory "${TARGET_BROWSE_DIRECTORY_ID}" or parsing failed.`);
      } else {
        logger.info(`Found ${mediaItems.length} media item(s) in directory "${TARGET_BROWSE_DIRECTORY_ID}".`);
      }
  
    } catch (error) {
      logger.error(`Error browsing ContentDirectory on ${mediaServerDevice.friendlyName} using ContentDirectoryService. Aborting.`, error);
      return;
    }
    
    // אם אין פריטים, אין טעם להמשיך לשלב הניגון.
    if (mediaItems.length === 0) {
        logger.info('No media items to play. Exiting playback stage.');
        // אפשר לסיים את הסקריפט כאן אם רוצים
        // logger.info('Play on renderer example script finished (no items to play).');
        // return;
        // נמשיך כדי להדגים את שאר הלוגיקה, אך היא לא תעשה כלום
    }
  
    // שלב 5: השמעת הקבצים על הרינדור
    logger.info(`Preparing to play media on renderer "${rendererDevice.friendlyName}"...`);
    const avTransportService = findService(rendererDevice, 'urn:schemas-upnp-org:service:AVTransport:1');
    if (!avTransportService) {
        logger.error(`AVTransport service not found on renderer ${rendererDevice.friendlyName}. Aborting.`);
        return;
    }

    const setAvTransportUriAction = findAction(avTransportService, 'SetAVTransportURI');
    const playAction = findAction(avTransportService, 'Play');

    if (!setAvTransportUriAction || !setAvTransportUriAction.invoke) {
        logger.error(`SetAVTransportURI action not found or not invokable on AVTransport service of ${rendererDevice.friendlyName}. Aborting.`);
        return;
    }
    if (!playAction || !playAction.invoke) {
        logger.error(`Play action not found or not invokable on AVTransport service of ${rendererDevice.friendlyName}. Aborting.`);
        return;
    }

    for (const item of mediaItems) {
        if (!item.resources || item.resources.length === 0) {
            logger.warn(`Media item "${item.title}" (ID: ${item.id}) has no resources. Skipping.`);
            continue;
        }
        const resource = item.resources[0]; // בדרך כלל ניקח את המשאב הראשון
        const mediaUrl = resource.uri;

        logger.info(`Attempting to play: "${item.title}" (URL: ${mediaUrl}) on ${rendererDevice.friendlyName}`);

        try {
            // 1. הגדרת ה-URI
            const setUriArgs = {
                InstanceID: 0, // בדרך כלל 0
                CurrentURI: mediaUrl,
                CurrentURIMetaData: '', // אפשר להשאיר ריק או לספק DIDL-Lite עבור פריט בודד
                // יצירת DIDL-Lite פשוט עבור פריט בודד:
                // `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">` +
                // `<item id="${item.id}" parentID="${item.parentId}" restricted="${item.restricted}"><dc:title>${item.title}</dc:title><upnp:class>${item.class}</upnp:class>` +
                // `<res protocolInfo="${resource.protocolInfo || ''}" size="${resource.size || ''}" duration="${resource.duration || ''}">${mediaUrl}</res></item></DIDL-Lite>`
            };
            logger.debug('Invoking SetAVTransportURI with args:', setUriArgs);
            await setAvTransportUriAction.invoke(setUriArgs);
            logger.info(`SetAVTransportURI successful for "${item.title}".`);

            // המתנה קצרה (אופציונלי, יכול לעזור להתקנים מסוימים)
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 2. הפעלת הניגון
            const playArgs = {
                InstanceID: 0,
                Speed: '1', // מהירות ניגון רגילה
            };
            logger.debug('Invoking Play with args:', playArgs);
            await playAction.invoke(playArgs);
            logger.info(`Play command sent for "${item.title}".`);

            // המתנה לסיום הניגון - זהו חלק מורכב.
            // אפשר להאזין לאירועי AVTransport (LastChange) כדי לדעת מתי הניגון הסתיים או השתנה.
            // לצורך הדוגמה הפשוטה הזו, נמתין זמן קבוע או שנמשיך לפריט הבא מיד.
            // כאן נדפיס הודעה ונמשיך (כלומר, נפעיל את כל השירים ברצף מהיר).
            logger.info(`Playback of "${item.title}" initiated. This example does not wait for completion.`);
            // אם רוצים להמתין, לדוגמה 10 שניות:
            // logger.info('Waiting 10 seconds before playing next item (if any)...');
            // await new Promise(resolve => setTimeout(resolve, 10000));

        } catch (error) {
            logger.error(`Error during playback of "${item.title}" (URL: ${mediaUrl}) on ${rendererDevice.friendlyName}.`, error);
            // אפשר להחליט אם להמשיך לפריט הבא או לעצור את הסקריפט
        }
    }

    logger.info('Play on renderer example script finished.');
}

// הרצת הפונקציה הראשית אם הקובץ מורץ ישירות
if (require.main === module) {
    main().catch(error => {
        logger.error("An unexpected error occurred in the main execution:", error);
    });
}