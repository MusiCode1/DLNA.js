// server/rendererHandler.ts
import { Request, Response, NextFunction, Router } from 'express';
import { sendUpnpCommand, createModuleLogger } from '../src';
import type { ServiceDescription } from '../src';
import type { ApiDevice } from './types';

const logger = createModuleLogger('rendererHandler');

// הפונקציה הזו תכיל את הלוגיקה המרכזית לניגון תיקייה
// היא תקבל את כל התלויות הנדרשות ותחזיר Promise
export async function playFolderOnRenderer(
  rendererUdn: string,
  mediaServerUdn: string,
  folderObjectId: string,
  activeDevices: Map<string, ApiDevice>,
  parentLogger: typeof logger // הוספת הפרמטר parentLogger
): Promise<{ success: boolean; message: string; statusCode?: number }> {
  parentLogger.info(`Attempting to play folder ${folderObjectId} from server ${mediaServerUdn} on renderer ${rendererUdn}`);

  const renderer = getValidatedDevice(rendererUdn, 'Renderer', activeDevices, { status: (code: number) => ({ send: (body: any) => { throw { statusCode: code, body }; } }) } as any as Response);
  if (!renderer) {
    const message = `Renderer with UDN ${rendererUdn} not found or invalid.`;
    parentLogger.warn(message); // שימוש ב-parentLogger
    return { success: false, message, statusCode: 404 };
  }

  const mediaServer = getValidatedDevice(mediaServerUdn, 'Media Server', activeDevices, { status: (code: number) => ({ send: (body: any) => { throw { statusCode: code, body }; } }) } as any as Response);
  if (!mediaServer) {
    const message = `Media Server with UDN ${mediaServerUdn} not found or invalid.`;
    parentLogger.warn(message); // שימוש ב-parentLogger
    return { success: false, message, statusCode: 404 };
  }

  const cdServiceDescriptionOriginal = getValidatedService(mediaServer, 'ContentDirectory', 'ContentDirectory', { status: (code: number) => ({ send: (body: any) => { throw { statusCode: code, body }; } }) } as any as Response);
  if (!cdServiceDescriptionOriginal) {
    const message = `ContentDirectory service not found or invalid for media server ${mediaServerUdn}.`;
    parentLogger.warn(message); // שימוש ב-parentLogger
    return { success: false, message, statusCode: 404 };
  }

  const avTransportService = getValidatedService(renderer, 'AVTransport', 'AVTransport', { status: (code: number) => ({ send: (body: any) => { throw { statusCode: code, body }; } }) } as any as Response);
  if (!avTransportService) {
    const message = `AVTransport service not found or invalid for renderer ${rendererUdn}.`;
    parentLogger.warn(message); // שימוש ב-parentLogger
    return { success: false, message, statusCode: 404 };
  }

  try {
    const absoluteCdControlURL = new URL(cdServiceDescriptionOriginal.controlURL, mediaServer.baseURL).href;
    const cdServiceForBrowse: ServiceDescription = {
      ...cdServiceDescriptionOriginal,
      controlURL: absoluteCdControlURL
    };

    const { ContentDirectoryService } = await import('../src/contentDirectoryService');
    const { BrowseFlag } = await import('../src/types');

    const cds = new ContentDirectoryService(cdServiceForBrowse);
    const browseResult = await cds.browse(folderObjectId, BrowseFlag.BrowseDirectChildren, '*', 0, 0);

    if (!browseResult || browseResult.numberReturned === 0 || !browseResult.items || browseResult.items.length === 0) {
      const message = `Folder with ID ${folderObjectId} is empty or not found on media server ${mediaServerUdn}.`;
      parentLogger.warn(message); // שימוש ב-parentLogger
      return { success: false, message, statusCode: 404 };
    }

    const videoItems = browseResult.items.filter((item: any) => {
      const upnpClass = item.class || item['upnp:class'];
      const hasResources = item.res || (item.resources && item.resources.length > 0);
      return typeof upnpClass === 'string' && upnpClass.startsWith('object.item.videoItem') && hasResources;
    });

    if (videoItems.length === 0) {
      const message = `No video items found in folder ${folderObjectId} on media server ${mediaServerUdn}.`;
      parentLogger.warn(message); // שימוש ב-parentLogger
      return { success: false, message, statusCode: 404 };
    }

    const firstItemData = videoItems[0];
    let firstItemUrl: string | null = null;
    let firstItemDidlXml: string = "";

    const getItemUriAndDidl = (itemData: any, parentIdForDidl: string): { uri: string | null, didl: string } => {
      let currentItemResUrl: string | null = null;
      let protocolInfo = "http-get:*:video/*:*"; // Default
      let itemTitle = itemData.title || itemData['dc:title'] || 'Video Item';
      let itemUpnpClass = itemData.class || itemData['upnp:class'] || 'object.item.videoItem';
      let itemIdForDidl = itemData.id || itemData._id || `${parentIdForDidl}/${videoItems.indexOf(itemData)}`;

      if (itemData.resources && itemData.resources[0] && itemData.resources[0].uri) {
        currentItemResUrl = itemData.resources[0].uri;
        if (itemData.resources[0].protocolInfo) protocolInfo = itemData.resources[0].protocolInfo;
      } else if (itemData.res) {
        if (typeof itemData.res === 'string') currentItemResUrl = itemData.res;
        else if (Array.isArray(itemData.res) && itemData.res[0]) {
          if (typeof itemData.res[0] === 'string') currentItemResUrl = itemData.res[0];
          else if (itemData.res[0]._ && typeof itemData.res[0]._ === 'string') {
            currentItemResUrl = itemData.res[0]._;
            if (itemData.res[0].$ && itemData.res[0].$.protocolInfo) protocolInfo = itemData.res[0].$.protocolInfo;
          }
        }
      }

      if (!currentItemResUrl) return { uri: null, didl: "" };

      let absoluteItemUrl = currentItemResUrl;
      if (!absoluteItemUrl.startsWith('http://') && !absoluteItemUrl.startsWith('https://')) {
        try {
          absoluteItemUrl = new URL(absoluteItemUrl, mediaServer.baseURL).toString();
        } catch (e) {
          parentLogger.warn(`Play-folder (helper): Could not construct absolute URL for item ${itemIdForDidl}: ${currentItemResUrl}. Error: ${e}`); // שימוש ב-parentLogger
          return { uri: null, didl: "" };
        }
      }

      const didl = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">
<item id="${xmlEscape(itemIdForDidl)}" parentID="${xmlEscape(parentIdForDidl)}" restricted="1">
<dc:title>${xmlEscape(itemTitle)}</dc:title>
<upnp:class>${xmlEscape(itemUpnpClass)}</upnp:class>
<res protocolInfo="${xmlEscape(protocolInfo)}">${xmlEscape(absoluteItemUrl)}</res>
</item>
</DIDL-Lite>`;
      return { uri: absoluteItemUrl, didl };
    };

    const firstItemDetails = getItemUriAndDidl(firstItemData, folderObjectId);
    firstItemUrl = firstItemDetails.uri;
    firstItemDidlXml = firstItemDetails.didl;

    if (!firstItemUrl) {
      const message = `Could not determine URL for the first video item in folder ${folderObjectId}.`;
      parentLogger.error(message); // שימוש ב-parentLogger
      return { success: false, message, statusCode: 500 };
    }

    await stopPlayback(avTransportService, renderer.udn);
    await setAvTransportUri(avTransportService, renderer.udn, firstItemUrl, firstItemDidlXml);
    await startPlayback(avTransportService, renderer.udn);

    parentLogger.info(`Playback started for first item in folder ${folderObjectId}: ${firstItemData.title || 'Untitled'} on renderer ${renderer.friendlyName}`); // שימוש ב-parentLogger

    if (videoItems.length > 1) {
      for (let i = 1; i < videoItems.length; i++) {
        const nextItemData = videoItems[i];
        const nextItemDetails = getItemUriAndDidl(nextItemData, folderObjectId);
        if (nextItemDetails.uri && nextItemDetails.didl) {
          try {
            await setNextAvTransportUri(avTransportService, renderer.udn, nextItemDetails.uri, nextItemDetails.didl);
            parentLogger.info(`Added to playlist: ${nextItemData.title || 'Untitled'}`); // שימוש ב-parentLogger
          } catch (playlistError: any) {
            parentLogger.warn(`Error adding item '${nextItemData.title || 'Untitled'}' to playlist: ${playlistError.message}`); // שימוש ב-parentLogger
          }
        } else {
          parentLogger.warn(`Skipping item in playlist (missing URI or DIDL): ${nextItemData.title || `Item at index ${i}`}`); // שימוש ב-parentLogger
        }
      }
    }

    return { success: true, message: `Folder playback initiated on ${renderer.friendlyName} for folder ${folderObjectId}` };

  } catch (error: any) {
    parentLogger.error(`General error processing folder ${folderObjectId} for preset playback:`, error); // שימוש ב-parentLogger
    const statusCode = (error.soapFault && error.soapFault.upnpErrorCode) ? 502 : (error.statusCode || 500);
    const message = error.message || "An unexpected error occurred during preset playback.";
    return { success: false, message, statusCode };
  }
}


interface PlayRequestParams {
  rendererUdn: string;
}

interface PlayRequestBody {
  mediaServerUdn: string; // UDN של שרת המדיה
  objectID: string;       // ID של הפריט בשרת המדיה
}

interface PlayFolderRequestBody { // שם הממשק הוחזר למקורי
  mediaServerUdn: string; // UDN של שרת המדיה
  folderObjectID: string;   // ID של התיקייה בשרת המדיה
}

// פונקציית עזר ל-escape של תווים מיוחדים ב-XML
function xmlEscape(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&'""]/g, (char) => {
    switch (char) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return char;
    }
  });
}

// Helper function to get and validate a device
function getValidatedDevice(
  udn: string,
  deviceType: 'Renderer' | 'Media Server',
  activeDevices: Map<string, ApiDevice>,
  res: Response
): ApiDevice | null {
  const device = activeDevices.get(udn);
  if (!device) {
    logger.warn(`Request failed: ${deviceType} with UDN ${udn} not found.`);
    res.status(404).send({ error: `${deviceType} with UDN ${udn} not found` });
    return null;
  }
  if (!device.serviceList || !device.baseURL) {
    logger.warn(`Request failed: ${deviceType} ${udn} is missing serviceList or baseURL.`);
    res.status(500).send({ error: `${deviceType} ${udn} is missing essential information (serviceList or baseURL).` });
    return null;
  }
  logger.debug(`Found ${deviceType.toLowerCase()}: ${device.friendlyName} (UDN: ${udn})`);
  return device;
}

// Helper function to get and validate a service from a device
function getValidatedService(
  device: ApiDevice,
  serviceTypeIdentifier: string,
  serviceFriendlyName: 'ContentDirectory' | 'AVTransport',
  res: Response
): ServiceDescription | null {
  const service = device.serviceList!.find( // Added non-null assertion
    (s: ServiceDescription) => s.serviceType?.includes(`urn:schemas-upnp-org:service:${serviceTypeIdentifier}`) || s.serviceId?.includes(`urn:upnp-org:serviceId:${serviceTypeIdentifier}`)
  );

  if (!service || !service.controlURL || !service.serviceType) {
    logger.warn(`Request failed: ${serviceFriendlyName} service, controlURL, or serviceType not found for device ${device.udn}.`);
    res.status(404).send({ error: `${serviceFriendlyName} service, controlURL, or serviceType not found for device ${device.udn}` });
    return null;
  }
  logger.debug(`Found ${serviceFriendlyName} service for device ${device.udn}: ${service.serviceId}`);
  return service;
}

// Helper function to stop playback
async function stopPlayback(avTransportService: ServiceDescription, rendererUdn: string): Promise<void> {
  if (!avTransportService.actionList || !Array.isArray(avTransportService.actionList)) {
    logger.warn(`Stop command skipped: AVTransport service for renderer ${rendererUdn} does not have a valid actionList.`);
    return;
  }
  const stopAction = avTransportService.actionList.find(a => a.name === 'Stop');
  if (stopAction?.invoke) {
    logger.debug(`Attempting to stop playback on renderer ${rendererUdn}...`);
    try {
      await stopAction.invoke({ InstanceID: '0' });
      logger.info(`Stop command successful for renderer ${rendererUdn}.`);
    } catch (error: any) {
      // Log warning for stop, but don't let it fail the whole operation
      logger.warn(`Error or warning sending Stop command for renderer ${rendererUdn}: ${error.message}`, { fault: error.soapFault });
    }
  } else {
    logger.warn(`Stop action not available on AVTransport service for renderer ${rendererUdn}`);
  }
}

// Helper function to set AVTransportURI
async function setAvTransportUri(
  avTransportService: ServiceDescription,
  rendererUdn: string,
  itemUrl: string,
  itemMetadataXml: string
): Promise<void> {
  if (!avTransportService.actionList || !Array.isArray(avTransportService.actionList)) {
    throw new Error(`SetAVTransportURI failed: AVTransport service for renderer ${rendererUdn} does not have a valid actionList.`);
  }
  const setUriAction = avTransportService.actionList.find(a => a.name === 'SetAVTransportURI');
  if (!setUriAction?.invoke) {
    throw new Error(`SetAVTransportURI action not found or not invokable on renderer ${rendererUdn}`);
  }
  logger.debug(`Attempting SetAVTransportURI on renderer ${rendererUdn} with URI: ${itemUrl} and MetaData length: ${itemMetadataXml.length}`);
  await setUriAction.invoke({
    InstanceID: '0',
    CurrentURI: itemUrl,
    CurrentURIMetaData: itemMetadataXml,
  });
  logger.info(`SetAVTransportURI successful for renderer ${rendererUdn}.`);
}

// Helper function to start Play
async function startPlayback(avTransportService: ServiceDescription, rendererUdn: string): Promise<void> {
  if (!avTransportService.actionList || !Array.isArray(avTransportService.actionList)) {
    throw new Error(`Play command failed: AVTransport service for renderer ${rendererUdn} does not have a valid actionList.`);
  }
  const playAction = avTransportService.actionList.find(a => a.name === 'Play');
  if (!playAction?.invoke) {
    throw new Error(`Play action not found or not invokable on renderer ${rendererUdn}`);
  }
  logger.debug(`Attempting Play action on renderer ${rendererUdn}.`);
  await playAction.invoke({
    InstanceID: '0',
    Speed: '1',
  });
  logger.info(`Play command successful for renderer ${rendererUdn}.`);
}

// Helper function to set NextAVTransportURI
async function setNextAvTransportUri(
  avTransportService: ServiceDescription,
  rendererUdn: string,
  itemUrl: string,
  itemMetadataXml: string
): Promise<void> {
  if (!avTransportService.actionList || !Array.isArray(avTransportService.actionList)) {
    // Log a warning but don't throw, as the primary playback might have started.
    logger.warn(`SetNextAVTransportURI skipped: AVTransport service for renderer ${rendererUdn} does not have a valid actionList.`);
    return;
  }
  const setNextUriAction = avTransportService.actionList.find(a => a.name === 'SetNextAVTransportURI');
  if (!setNextUriAction?.invoke) {
    logger.warn(`SetNextAVTransportURI action not found or not invokable on renderer ${rendererUdn}. Cannot add to playlist.`);
    return;
  }
  logger.debug(`Attempting SetNextAVTransportURI on renderer ${rendererUdn} with NextURI: ${itemUrl} and NextMetaData length: ${itemMetadataXml.length}`);
  await setNextUriAction.invoke({
    InstanceID: '0',
    NextURI: itemUrl,
    NextURIMetaData: itemMetadataXml, // Note: Parameter name is NextURIMetaData for this action
  });
  logger.info(`SetNextAVTransportURI successful for renderer ${rendererUdn} for item ${itemUrl}.`);
}


// Main handler function, refactored to use the new helpers
async function executePlaybackCommands(
  renderer: ApiDevice,
  avTransportService: ServiceDescription,
  itemUrl: string,
  itemMetadataXml: string,
  res: Response,
  next: NextFunction,
  itemNameForLog: string
): Promise<void> {
  if (!renderer.baseURL) {
    logger.error(`executePlaybackCommands: Renderer ${renderer.udn} is missing baseURL.`);
    res.status(500).send({ error: `Renderer ${renderer.udn} is missing essential information (baseURL).` });
    return;
  }

  try {
    await stopPlayback(avTransportService, renderer.udn); // Good practice to stop first
    await setAvTransportUri(avTransportService, renderer.udn, itemUrl, itemMetadataXml);
    await startPlayback(avTransportService, renderer.udn);
    res.status(200).send({ success: true, message: `Playback started on ${renderer.friendlyName} for item ${itemNameForLog}` });
  } catch (error: any) {
    logger.error(`SOAP command failed for renderer ${renderer.udn} during single item playback:`, {
      message: error.message,
      stack: error.stack,
      details: error.soapFault || error.details
    });
    if (error.soapFault && error.soapFault.upnpErrorCode) {
      (error as any).statusCode = 502;
      (error as any).customMessage = `SOAP Fault: ${error.soapFault.faultString} (UPnP Code: ${error.soapFault.upnpErrorCode})`;
    } else if (!error.statusCode) {
      (error as any).statusCode = 500;
    }
    next(error);
  }
}


export function createRendererHandler(activeDevices: Map<string, ApiDevice>): Router {
  const router = Router();

  router.post(
    '/:rendererUdn/play',
    async (req: Request<PlayRequestParams, any, PlayRequestBody>, res: Response, next: NextFunction) => {
      const { rendererUdn } = req.params;
      const { mediaServerUdn, objectID } = req.body;

      logger.info(`Received play request for renderer UDN: ${rendererUdn}, mediaServer UDN: ${mediaServerUdn}, objectID: ${objectID}`);

      if (!mediaServerUdn || !objectID) {
        logger.warn('Play request failed: mediaServerUdn or objectID is missing.');
        res.status(400).send({ error: 'mediaServerUdn and objectID are required' });
        return;
      }

      const renderer = getValidatedDevice(rendererUdn, 'Renderer', activeDevices, res);
      if (!renderer) return;

      const mediaServer = getValidatedDevice(mediaServerUdn, 'Media Server', activeDevices, res);
      if (!mediaServer) return;

      const cdServiceDescriptionOriginal = getValidatedService(mediaServer, 'ContentDirectory', 'ContentDirectory', res);
      if (!cdServiceDescriptionOriginal) return;

      let itemMetadataXml: string = "";
      let itemUrl: string = "";

      try {
        const absoluteCdControlURL = new URL(cdServiceDescriptionOriginal.controlURL, mediaServer.baseURL).href;
        const cdServiceForBrowse: ServiceDescription = {
          ...cdServiceDescriptionOriginal,
          controlURL: absoluteCdControlURL
        };

        const { ContentDirectoryService } = await import('../src/contentDirectoryService');
        const { BrowseFlag } = await import('../src/types');

        const cds = new ContentDirectoryService(cdServiceForBrowse);
        const browseResult = await cds.browse(objectID, BrowseFlag.BrowseMetadata, '*', 0, 1);

        if (!browseResult || browseResult.numberReturned === 0 || !browseResult.items || browseResult.items.length === 0) {
          logger.warn(`Play request failed: Object with ID ${objectID} not found on media server ${mediaServerUdn}.`);
          res.status(404).send({ error: `Object with ID ${objectID} not found on media server ${mediaServerUdn}` });
          return;
        }

        const itemData = browseResult.items[0] as any;
        if (itemData.resources && itemData.resources[0] && itemData.resources[0].uri) {
          itemUrl = itemData.resources[0].uri;
        } else if (itemData.res && typeof itemData.res === 'string') {
          itemUrl = itemData.res;
        } else if (itemData.res && Array.isArray(itemData.res) && itemData.res[0] && typeof itemData.res[0]._ === 'string') {
          itemUrl = itemData.res[0]._;
        } else {
          logger.warn(`Play request failed: Could not find resource URI for objectID ${objectID} on media server ${mediaServerUdn}. Item data: ${JSON.stringify(itemData)}`);
          res.status(404).send({ error: `Resource URI not found for objectID ${objectID}` });
          return;
        }

        if (itemUrl && !itemUrl.startsWith('http://') && !itemUrl.startsWith('https://')) {
          itemUrl = new URL(itemUrl, mediaServer.baseURL).toString();
        }

        // Extract or build DIDL-Lite XML
        if (browseResult.rawResponse && typeof browseResult.rawResponse.Result === 'string') {
          const didlResultString = browseResult.rawResponse.Result;
          // Attempt to extract the <item> ... </item> XML directly
          const itemMatch = didlResultString.match(/<item[\s\S]*?<\/item>/i); // Case-insensitive for item tag
          if (itemMatch && itemMatch[0]) {
            const extractedItemXml = itemMatch[0]
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'")
              .replace(/&amp;/g, '&'); // Must be last

            // Check if the result is already a full DIDL-Lite or just the item
            if (didlResultString.toLowerCase().includes('<didl-lite')) {
              itemMetadataXml = didlResultString
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .replace(/&amp;/g, '&');
            } else {
              itemMetadataXml = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">${extractedItemXml}</DIDL-Lite>`;
            }
          } else {
            logger.warn(`Could not extract <item> XML from browse result for ${objectID}. DIDL Result (first 500 chars): ${didlResultString.substring(0, 500)}`);
          }
        } else {
          logger.warn(`Raw XML result (browseResult.rawResponse.Result) not found or not a string in browseResult for ${objectID}.`);
        }

        if (!itemMetadataXml && itemData) {
          logger.info(`Attempting to build fallback DIDL-Lite for ${objectID}`);
          const title = itemData.title || 'Video Item';
          const upnpClass = itemData.class || 'object.item.videoItem';
          const protocolInfo = (itemData.resources && itemData.resources[0] && itemData.resources[0].protocolInfo) || "http-get:*:video/*:*";

          itemMetadataXml = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">
  <item id="${xmlEscape(objectID)}" parentID="${xmlEscape(itemData.parentId || '-1')}" restricted="1">
    <dc:title>${xmlEscape(title)}</dc:title>
    <upnp:class>${xmlEscape(upnpClass)}</upnp:class>
    <res protocolInfo="${xmlEscape(protocolInfo)}">${xmlEscape(itemUrl)}</res>
  </item>
</DIDL-Lite>`.trim();
          logger.debug(`Fallback DIDL-Lite generated: ${itemMetadataXml}`);
        }

        logger.debug(`Using Item URL: ${itemUrl}, Item Metadata XML length: ${itemMetadataXml.length}`);
        if (itemMetadataXml.length === 0) {
          logger.warn(`itemMetadataXml is empty for objectID ${objectID}. Playback might fail or lack metadata on the renderer.`);
          // Consider not sending empty metadata or sending a specific minimal structure if required by AVTransport.
          // For now, we allow sending it empty as some renderers might handle it or only need CurrentURI.
        }

      } catch (error: any) {
        logger.error(`Failed to browse media server ${mediaServerUdn} for objectID ${objectID}:`, error);
        next(error);
        return;
      }

      if (!itemUrl) {
        logger.error(`Failed to determine itemUrl for objectID ${objectID} on media server ${mediaServerUdn}.`);
        res.status(500).send({ error: `Could not determine media URL for item ${objectID}` });
        return;
      }

      const avTransportService = getValidatedService(renderer, 'AVTransport', 'AVTransport', res);
      if (!avTransportService) return;

      await executePlaybackCommands(renderer, avTransportService, itemUrl, itemMetadataXml, res, next, objectID);
    }
  );

  router.post(
    '/:rendererUdn/play-folder', // נתיב הוחזר למקורי
    async (req: Request<PlayRequestParams, any, PlayFolderRequestBody>, res: Response, next: NextFunction) => { // שימוש בטיפוס המקורי לגוף הבקשה
      const { rendererUdn } = req.params;
      const { mediaServerUdn, folderObjectID } = req.body; // שימוש ישיר ב-folderObjectID

      logger.info(`Received play-folder request for renderer UDN: ${rendererUdn}, mediaServer UDN: ${mediaServerUdn}, folderObjectID: ${folderObjectID}`);

      if (!mediaServerUdn || !folderObjectID) {
        logger.warn('Play-folder request failed: mediaServerUdn or folderObjectID is missing.');
        res.status(400).send({ error: 'mediaServerUdn and folderObjectID are required' });
        return;
      }


      const renderer = getValidatedDevice(rendererUdn, 'Renderer', activeDevices, res);
      if (!renderer) return;

      const mediaServer = getValidatedDevice(mediaServerUdn, 'Media Server', activeDevices, res);
      if (!mediaServer) return;

      const cdServiceDescriptionOriginal = getValidatedService(mediaServer, 'ContentDirectory', 'ContentDirectory', res);
      if (!cdServiceDescriptionOriginal) return;
      const avTransportService = getValidatedService(renderer, 'AVTransport', 'AVTransport', res);
      if (!avTransportService) return; // זה כבר אמור להיות מטופל על ידי getValidatedService אבל נשאר לבטיחות

      try {
        // העברנו את הלוגר של המודול הזה, מכיוון שזה הקונטקסט של ה-route handler הזה
        const result = await playFolderOnRenderer(rendererUdn, mediaServerUdn, folderObjectID, activeDevices, logger);
        if (result.success) {
          res.status(200).send({ success: true, message: result.message });
        } else {
          res.status(result.statusCode || 500).send({ error: result.message });
        }
      } catch (error: any) {
        // שגיאות שנזרקו על ידי getValidatedDevice (דרך ה-mock של res) יתפסו כאן
        if (error.statusCode && error.body) {
          logger.error(`Play-folder: Validation error for UDNs ${rendererUdn}/${mediaServerUdn}:`, error.body);
          res.status(error.statusCode).send(error.body);
        } else {
          logger.error(`Play-folder: General error processing folder ${folderObjectID} on media server ${mediaServerUdn} for renderer ${rendererUdn}:`, error);
          if (!res.headersSent) {
            const statusCode = (error.soapFault && error.soapFault.upnpErrorCode) ? 502 : (error.statusCode || 500);
            next({ ...error, statusCode }); // מעבירים את השגיאה ל-middleware הכללי עם הסטטוס קוד הנכון
          }
        }
      }
    }
  );

  return router;
}
