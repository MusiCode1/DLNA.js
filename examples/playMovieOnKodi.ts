// examples/playMovieOnKodi.ts
// שכתוב הקובץ לשימוש בספרייה החדשה UpnpDiscoveryService ו-UpnpDeviceExplorer
// וארגון מחדש של הלוגיקה לפונקציות קטנות יותר, ושימוש בפונקציות invoke.

import {
    discoverAndProcessDevices,
    UpnpDevice,
    UpnpService,
    createLogger,
    UpnpSoapClient, // עדיין נחוץ עבור ContentDirectoryService
    ContentDirectoryService,
    BrowseFlag,
    BrowseResult,
    // SoapResponse, // לא נחוץ יותר ישירות בפונקציות אלו
    DidlLiteContainer,
    DidlLiteObject,
    Resource as DlnaResourceDetails,
} from '../src/index';
import { create } from 'xmlbuilder2';

const logger = createLogger('playMovieOnKodiExample');

// --- קבועים גלובליים ---
const SERVER_FRIENDLY_NAME_CONTAINS = "DriveMovies"; // התאם לשם שרת המדיה שלך
const SERVER_DEVICE_TYPE = "urn:schemas-upnp-org:device:MediaServer:1";
const SERVER_CONTENT_DIRECTORY_SERVICE_TYPE = "urn:schemas-upnp-org:service:ContentDirectory:1";

const KODI_FRIENDLY_NAME_CONTAINS = "Basement-TV"; // התאם לשם ה-Kodi/Renderer שלך
const KODI_DEVICE_TYPE = "urn:schemas-upnp-org:device:MediaRenderer:1";
const KODI_AV_TRANSPORT_SERVICE_TYPE = "urn:schemas-upnp-org:service:AVTransport:1";

const TARGET_FOLDER_ID = "%2F%D7%A1%D7%A8%D7%98%D7%95%D7%A0%D7%99" +
    "+%D7%96%D7%9E%D7%9F+%D7%A4%D7%A0%D7%90" +
    "%D7%99%2F%D7%9E%D7%90%D7%A9%D7%94+%D7%95%D7%94%D7%93%D7%95%D7%91"; // התאם ל-ObjectID של התיקייה הרצויה

const EXAMPLE_VIDEO = {
    videoUrl: "http://10.100.102.106:5001/ums/media/49e06994-36bd-490f-858c-5ea4753a10df/50041/-Cry-No-More.mp4", // החלף ב-URL תקין
    videoTitle: "Cry No More (Example)",
    videoDuration: "0:05:10",
    videoSize: "90262145", // גודל בקובץ לדוגמה
    resolution: "1920x1080" // רזולוציה לדוגמה
};

// בניית המטא-דאטה של DIDL-Lite כמחרוזת XML ללא הצהרת <?xml...?>
const didlObjectForExample = {
    'DIDL-Lite': {
        '@xmlns': 'urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/',
        '@xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        '@xmlns:upnp': 'urn:schemas-upnp-org:metadata-1-0/upnp/',
        'item': {
            '@id': 'exampleVideo',
            '@parentID': '0',
            '@restricted': 'true',
            'dc:title': EXAMPLE_VIDEO.videoTitle,
            'upnp:class': 'object.item.videoItem',
            'res': {
                '@protocolInfo': 'http-get:*:video/mp4:*', // התאם אם הפורמט שונה
                '@size': EXAMPLE_VIDEO.videoSize,
                '@duration': EXAMPLE_VIDEO.videoDuration,
                '@resolution': EXAMPLE_VIDEO.resolution,
                '#': EXAMPLE_VIDEO.videoUrl
            }
        }
    }
};
const didlLiteVideoMetadata = create(didlObjectForExample).end({ prettyPrint: false });

const DISCOVERY_TIMEOUT_MS = 15 * 1000; // צמצום זמן הגילוי ל-15 שניות

// --- פונקציות עזר ---
function createSimpleDidlLiteForItem(item: DidlLiteObject): string {
    const itemId = item.id ?? "0";
    const parentId = item.parentID ?? "0";
    const title = item.title ?? "Unknown Title";
    const resource = item.resources?.find((r: DlnaResourceDetails) => r.uri);
    const itemUri = resource?.uri ?? "";
    const protocolInfo = resource?.protocolInfo ?? "http-get:*:video/*:*"; // ברירת מחדל גנרית
    const upnpClass = item.class ?? "object.item.videoItem";
    const size = resource?.size?.toString();
    const duration = resource?.duration;
    const resolution = resource?.resolution;
    const restricted = item.restricted?.toString() ?? "true";

    const didlItemObject: any = {
        'DIDL-Lite': {
            '@xmlns': 'urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/',
            '@xmlns:dc': 'http://purl.org/dc/elements/1.1/',
            '@xmlns:upnp': 'urn:schemas-upnp-org:metadata-1-0/upnp/',
            'item': {
                '@id': itemId,
                '@parentID': parentId,
                '@restricted': restricted,
                'dc:title': title,
                'upnp:class': upnpClass,
            }
        }
    };

    const resAttributes: { [key: string]: string | undefined } = { protocolInfo };
    if (size) resAttributes.size = size;
    if (duration) resAttributes.duration = duration;
    if (resolution) resAttributes.resolution = resolution;

    didlItemObject['DIDL-Lite'].item.res = { ...resAttributes, '#': itemUri };

    return create(didlItemObject).end({ prettyPrint: false });
}

async function discoverDevices(timeoutMs: number): Promise<{ umsDevice?: UpnpDevice, kodiDevice?: UpnpDevice }> {
    logger.info(`Starting device discovery for up to ${timeoutMs / 1000} seconds...`);
    let umsDeviceTarget: UpnpDevice | undefined;
    let kodiDeviceTarget: UpnpDevice | undefined;

    // שימוש ב-discoverAndProcessDevices עם includeScpdDetails: true כדי לקבל את כל המידע
    const allDevices = await discoverAndProcessDevices("ssdp:all", timeoutMs, undefined, {});

    for (const device of allDevices) {
        if (!umsDeviceTarget &&
            device.deviceType === SERVER_DEVICE_TYPE &&
            device.friendlyName?.toLowerCase().includes(SERVER_FRIENDLY_NAME_CONTAINS.toLowerCase()) &&
            device.services && Object.values(device.services).some(s => s.serviceType === SERVER_CONTENT_DIRECTORY_SERVICE_TYPE && s.controlURL)) {
            logger.info(`>>> Target UMS identified: ${device.friendlyName}`);
            umsDeviceTarget = device;
        }

        if (!kodiDeviceTarget &&
            device.deviceType === KODI_DEVICE_TYPE &&
            device.friendlyName?.toLowerCase().includes(KODI_FRIENDLY_NAME_CONTAINS.toLowerCase()) &&
            device.services && Object.values(device.services).some(s => s.serviceType === KODI_AV_TRANSPORT_SERVICE_TYPE && s.controlURL)) {
            logger.info(`>>> Target Kodi identified: ${device.friendlyName}`);
            kodiDeviceTarget = device;
        }

        if (umsDeviceTarget && kodiDeviceTarget) break; // מצאנו את שניהם
    }

    if (!umsDeviceTarget) logger.warn(`UMS device containing "${SERVER_FRIENDLY_NAME_CONTAINS}" not found.`);
    if (!kodiDeviceTarget) logger.warn(`Kodi device containing "${KODI_FRIENDLY_NAME_CONTAINS}" not found.`);

    return { umsDevice: umsDeviceTarget, kodiDevice: kodiDeviceTarget };
}

function findServiceOrThrow(device: UpnpDevice, serviceType: string, deviceName: string): UpnpService {
    let foundService: UpnpService | undefined;
    if (device.services) {
        for (const serviceId in device.services) {
            const s = device.services[serviceId];
            if (s.serviceType.includes(serviceType) && s.controlURL) { // שימוש ב-includes לגמישות (למשל, :1, :2)
                foundService = s;
                break;
            }
        }
    }
    if (!foundService) { // אין צורך לבדוק controlURL שוב כי זה חלק מהתנאי בלולאה
        throw new Error(`${serviceType} service not found on ${deviceName} "${device.friendlyName}".`);
    }
    return foundService;
}

async function browseForVideoItems(cds: ContentDirectoryService, targetObjectId: string): Promise<DidlLiteObject[]> {
    logger.info(`Browsing CDS for video items in ObjectID: ${targetObjectId}...`);
    const browseResult: BrowseResult = await cds.browse(
        targetObjectId, BrowseFlag.BrowseDirectChildren, "*", 0, 0, ""
    );

    logger.info(`Browse for ObjectID '${targetObjectId}': Found ${browseResult.numberReturned} items (Total: ${browseResult.totalMatches})`);
    if (browseResult.updateID) logger.info(`  UpdateID: ${browseResult.updateID}`);

    if (browseResult.items?.length > 0) {
        const videoItems = browseResult.items.filter((item): item is DidlLiteObject => {
            if (item.class) {
                if (item.class.toLowerCase().includes("object.item.videoitem")) return true;
                if (item.class.startsWith("object.item") &&
                    (item as DidlLiteObject).resources?.some(r => r.protocolInfo?.toLowerCase().includes(":video/"))) {
                    return true;
                }
            }
            return false;
        });
        browseResult.items.forEach(item => {
            if (item.class?.toLowerCase().includes("object.container")) {
                logger.info(`Found sub-container: ${(item as DidlLiteContainer).title} (ID: ${item.id})`);
            }
        });
        return videoItems;
    }
    return [];
}

async function setAndPlayMedia(
    avTransportService: UpnpService,
    mediaUri: string,
    mediaMetadata: string,
    mediaTitle: string
): Promise<void> {
    const stopAction = avTransportService.actions?.['Stop'];
    if (stopAction?.invoke) {
        logger.info(`Attempting to stop playback on "${mediaTitle}"...`);
        try {
            await stopAction.invoke({ InstanceID: 0 });
            logger.info(`Stop command successful for "${mediaTitle}".`);
        } catch (error: any) {
            logger.warn(`Error or warning sending Stop command for "${mediaTitle}": ${error.message}`, { fault: error.soapFault });
        }
    } else {
        logger.warn(`Stop action not available on service ${avTransportService.serviceId}`);
    }

    logger.info(`Setting AVTransportURI for "${mediaTitle}" (URI: ${mediaUri})`);
    const setUriAction = avTransportService.actions?.['SetAVTransportURI'];
    if (!setUriAction?.invoke) {
        throw new Error(`SetAVTransportURI action not available or not invokable on service ${avTransportService.serviceId}`);
    }
    await setUriAction.invoke({ InstanceID: 0, CurrentURI: mediaUri, CurrentURIMetaData: mediaMetadata });
    logger.info(`SetAVTransportURI successful for "${mediaTitle}".`);

    logger.info(`Sending Play command for "${mediaTitle}".`);
    const playAction = avTransportService.actions?.['Play'];
    if (!playAction?.invoke) {
        throw new Error(`Play action not available or not invokable on service ${avTransportService.serviceId}`);
    }
    await playAction.invoke({ InstanceID: 0, Speed: "1" });
    logger.info(`Play command successful for "${mediaTitle}".`);
}

async function addMediaToPlaylist(
    avTransportService: UpnpService,
    mediaUri: string,
    mediaMetadata: string,
    mediaTitle: string
): Promise<void> {
    logger.info(`Adding to playlist: "${mediaTitle}" (URI: ${mediaUri})`);
    const setNextUriAction = avTransportService.actions?.['SetNextAVTransportURI'];
    if (setNextUriAction?.invoke) {
        try {
            await setNextUriAction.invoke({ InstanceID: 0, NextURI: mediaUri, NextURIMetaData: mediaMetadata });
            logger.info(`SetNextAVTransportURI successful for "${mediaTitle}".`);
        } catch (error: any) {
            logger.warn(`Error setting next AVTransportURI for "${mediaTitle}": ${error.message}`, { fault: error.soapFault });
        }
    } else {
        logger.warn(`SetNextAVTransportURI action not available on service ${avTransportService.serviceId}`);
    }
}

async function playMovieOnKodiRefactored() {
    logger.info("Starting UPnP playlist playback orchestration (Refactored)...");

    try {
        const { umsDevice, kodiDevice } = await discoverDevices(DISCOVERY_TIMEOUT_MS);
        if (!umsDevice || !kodiDevice) {
            logger.error("Could not find both UMS and Kodi devices. Exiting.");
            return;
        }
        logger.info(`Successfully discovered UMS: "${umsDevice.friendlyName}" and Kodi: "${kodiDevice.friendlyName}"`);

        const cdServiceInfo = findServiceOrThrow(umsDevice, SERVER_CONTENT_DIRECTORY_SERVICE_TYPE, "UMS");
        const avTransportServiceInfo = findServiceOrThrow(kodiDevice, KODI_AV_TRANSPORT_SERVICE_TYPE, "Kodi");

        logger.info(`Found ContentDirectory service on UMS with control URL: ${cdServiceInfo.controlURL}`);
        logger.info(`Found AVTransport service on Kodi with control URL: ${avTransportServiceInfo.controlURL}`);

        const cds = new ContentDirectoryService(cdServiceInfo, new UpnpSoapClient());

        let videoItems: DidlLiteObject[] = [];
        try {
            videoItems = await browseForVideoItems(cds, TARGET_FOLDER_ID);
            logger.info(`Found ${videoItems.length} video items in UMS folder ${TARGET_FOLDER_ID}.`);
        } catch (browseError: any) {
            logger.error(`Error browsing UMS folder ObjectID ${TARGET_FOLDER_ID}: ${browseError.message}`, { errorDetails: browseError });
        }

        if (videoItems.length > 0) {
            const firstItem = videoItems[0];
            const firstItemTitle = firstItem.title || 'Unknown UMS Item';
            const firstItemResource = firstItem.resources?.find(r => r.uri);

            if (firstItemResource?.uri) {
                logger.info(`\nAttempting to play first item from UMS: "${firstItemTitle}" URI: ${firstItemResource.uri}`);
                const firstItemDidl = createSimpleDidlLiteForItem(firstItem);
                await setAndPlayMedia(avTransportServiceInfo, firstItemResource.uri, firstItemDidl, firstItemTitle);

                if (videoItems.length > 1) {
                    logger.info("Adding remaining items to Kodi playlist...");
                    for (let i = 1; i < videoItems.length; i++) {
                        const nextItem = videoItems[i];
                        const nextItemTitle = nextItem.title || `UMS Item ${i + 1}`;
                        const nextItemResource = nextItem.resources?.find(r => r.uri);
                        if (nextItemResource?.uri) {
                            const nextItemDidl = createSimpleDidlLiteForItem(nextItem);
                            await addMediaToPlaylist(avTransportServiceInfo, nextItemResource.uri, nextItemDidl, nextItemTitle);
                        } else {
                            logger.warn(`Skipping item "${nextItemTitle}" in playlist (missing URI).`);
                        }
                    }
                    logger.info("Finished adding items to playlist.");
                }
                logger.info(`\nPlaylist playback from UMS successfully initiated on Kodi!`);
                return;
            } else {
                logger.warn(`First item "${firstItemTitle}" from UMS has no resource URI. Proceeding to example video.`);
            }
        } else {
            logger.info(`No video items found in folder ${TARGET_FOLDER_ID} or error during browse. Playing example video instead.`);
        }

        logger.info("\nAttempting to play the example video as a fallback.");
        await setAndPlayMedia(avTransportServiceInfo, EXAMPLE_VIDEO.videoUrl, didlLiteVideoMetadata, EXAMPLE_VIDEO.videoTitle);
        logger.info(`Play command sent for example video "${EXAMPLE_VIDEO.videoTitle}".`);

    } catch (error: any) {
        logger.error("\n--- An error occurred during the refactored orchestration process ---");
        if (error instanceof Error) {
            logger.error(error.message, { stack: error.stack });
        } else {
            logger.error("An unknown error occurred", { errorObject: error });
        }
    } finally {
        logger.info("Refactored orchestration attempt finished.");
    }
}

playMovieOnKodiRefactored();