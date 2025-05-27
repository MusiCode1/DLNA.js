// קובץ זה מכיל את המימוש של מודול לחקירת התקני UPnP, כולל גילוי ועיבוד תיאורים.

import * as os from 'os';
import type { RemoteInfo } from 'node:dgram';
import { HTTPParser } from 'http-parser-js';

import { parseHttpPacket, ParsedHttpPacket } from './genericHttpParser'; // תיקון שם הטיפוס
// import axios from 'axios'; // הוסר - הועבר ל-upnpDeviceProcessor
// import * as xml2js from 'xml2js'; // הוסר - הועבר ל-upnpDeviceProcessor
import { createModuleLogger } from './logger'; // הוספת ייבוא הלוגר
// import { sendUpnpCommand } from './upnpSoapClient'; // הוסר - הועבר ל-upnpDeviceProcessor
import { createSocketManager } from './ssdpSocketManager'; // ייבוא מנהל הסוקטים החדש
import { processUpnpDevice } from './upnpDeviceProcessor'; // ייבוא הפונקציה החדשה
import {
  DiscoveryOptions,
  BasicSsdpDevice,
  DeviceDescription, // נשאר בשימוש
  //ServiceDescription, // נשאר בשימוש
  // DeviceIcon, // הוסר - לא בשימוש ישיר כאן
  // Action, // הוסר - לא בשימוש ישיר כאן
  // ActionArgument, // הוסר - לא בשימוש ישיר כאן
  // StateVariable, // הוסר - לא בשימוש ישיר כאן
  ProcessedDevice, // הוספת ייבוא
  DiscoveryDetailLevel, // הוספת ייבוא
  DeviceWithServicesDescription, // נשאר בשימוש
  FullDeviceDescription, // נשאר בשימוש
  RawSsdpMessagePayload, // הוספת ייבוא
  RawSsdpMessageHandler // הוספת ייבוא
} from './types';


// ==========================================================================================
// Constants - קבועים
// ==========================================================================================
const DEFAULT_TIMEOUT_MS = 5000; // קבוע זה עדיין בשימוש כאן
const DEFAULT_SEARCH_TARGET = "ssdp:all";
// const DEFAULT_DISCOVERY_TIMEOUT_PER_INTERFACE_MS = 2000;
const DEFAULT_INCLUDE_IPV6 = false;
// הקבועים הבאים הועברו ל-ssdpSocketManager.ts
// const SSDP_PORT = 1900;
// const SSDP_MULTICAST_ADDRESS_IPV4 = "239.255.255.250";
// const SSDP_MULTICAST_ADDRESS_IPV6_LINK_LOCAL = "FF02::C";
// const M_SEARCH_REQUEST_START_LINE = "M-SEARCH * HTTP/1.1";
// const MX_VALUE = 2;
// const DEFAULT_MULTICAST_TTL = 128; // לא היה בשימוש ישיר בפונקציות שהועברו
// const USER_AGENT = "Node.js/UpnpDeviceExplorer/0.1";

const logger = createModuleLogger('upnpDeviceExplorer'); // יצירת מופע לוגר גלובלי

// ==========================================================================================
// Helper Functions - פונקציות עזר
// ==========================================================================================

/**
 * @hebrew מנתח הודעת SSDP (בקשה או תגובה) באמצעות http-parser-js.
 * @param messageBuffer - הבאפר המכיל את הודעת ה-SSDP.
 * @param rinfo - מידע על השולח (כתובת ופורט).
 * @returns אובייקט BasicSsdpDevice אם הפירסור הצליח, אחרת null.
 */
/**
 * @hebrew ממפה את הפלט של `parseHttpPacket` לאובייקט `BasicSsdpDevice`.
 * @param parsedPacket - האובייקט המוחזר מ-`parseHttpPacket`.
 * @param rinfo - מידע על השולח (כתובת ופורט).
 * @returns אובייקט `BasicSsdpDevice` אם המיפוי הצליח, אחרת `null`.
 */
function _mapHttpPacketToBasicSsdpDevice(
  parsedPacket: ParsedHttpPacket | null, // תיקון שם הטיפוס
  rinfo: RemoteInfo // שימוש ב-import type כדי למנוע ייבוא מלא של dgram
): BasicSsdpDevice | null {
  // אין שדה error ישירות ב-ParsedHttpPacket, הפונקציה parseHttpPacket מחזירה null במקרה של שגיאה
  if (!parsedPacket) {
    logger.debug(`_mapHttpPacketToBasicSsdpDevice: Received null parsedPacket, indicating a parsing failure.`);
    return null;
  }

  // השדות method, versionMajor, versionMinor קיימים ב-parsedPacket
  // השדות statusCode, statusMessage קיימים רק אם זו תגובה
  const { headers, method, statusCode, statusMessage, versionMajor, versionMinor } = parsedPacket;

  // headers הוא כבר Record<string, string> ומונרמל ל-lowercase keys ב-parseHttpPacket
  const normalizedHeaders = headers;

  // הרכבת httpVersion מהשדות versionMajor ו-versionMinor
  const httpVersionString = (versionMajor !== undefined && versionMinor !== undefined)
    ? `${versionMajor}.${versionMinor}`
    : undefined;

  const location = normalizedHeaders['location'];
  const usn = normalizedHeaders['usn'];
  const ntHeader = normalizedHeaders['nt'];
  const ntsHeader = normalizedHeaders['nts'];
  const stHeader = normalizedHeaders['st'];
  const server = normalizedHeaders['server'];
  const cacheControlHeader = normalizedHeaders['cache-control'];

  let cacheControlMaxAge: number | undefined = undefined;
  if (cacheControlHeader) {
    const maxAgeMatch = cacheControlHeader.match(/max-age=(\d+)/i);
    if (maxAgeMatch && maxAgeMatch[1]) {
      cacheControlMaxAge = parseInt(maxAgeMatch[1], 10);
    }
  }

  if (!usn) {
    logger.debug('_mapHttpPacketToBasicSsdpDevice: USN is missing in SSDP message headers.', { remoteAddress: rinfo.address, headers: normalizedHeaders });
    return null;
  }

  const finalSt = stHeader || ntHeader;
  if (!finalSt) {
    logger.debug('_mapHttpPacketToBasicSsdpDevice: ST or NT is missing in SSDP message headers.', { remoteAddress: rinfo.address, headers: normalizedHeaders });
    return null;
  }

  if (statusCode && !location) {
    logger.debug('_mapHttpPacketToBasicSsdpDevice: Location is missing in SSDP response headers.', { remoteAddress: rinfo.address, headers: normalizedHeaders });
    return null;
  }

  if (method === 'NOTIFY' && !ntHeader) { // שימוש ב-method במקום httpMethod
    logger.debug('_mapHttpPacketToBasicSsdpDevice: NT header is missing in NOTIFY request.', { remoteAddress: rinfo.address, headers: normalizedHeaders });
    return null;
  }

  if (method === 'M-SEARCH' && !stHeader) { // שימוש ב-method במקום httpMethod
    logger.debug('_mapHttpPacketToBasicSsdpDevice: ST header is missing in M-SEARCH request.', { remoteAddress: rinfo.address, headers: normalizedHeaders });
    return null;
  }

  return {
    remoteAddress: rinfo.address,
    remotePort: rinfo.port,
    messageType: statusCode ? 'RESPONSE' : 'REQUEST',
    headers: normalizedHeaders,
    location: location || '',
    usn,
    st: finalSt,
    nts: ntsHeader,
    server: server || '',
    cacheControlMaxAge,
    httpMethod: method || undefined, // שימוש ב-method
    httpStatusCode: statusCode || undefined,
    httpStatusMessage: statusMessage || undefined,
    httpVersion: httpVersionString, // שימוש ב-httpVersionString שהורכב
    timestamp: Date.now(),
  };
}


// ==========================================================================================
// Helper Function for Network Interface Detection
// ==========================================================================================

// הפונקציה findRelevantNetworkInterfaces הוסרה כחלק מפישוט לוגיקת ממשקי הרשת.
// ==========================================================================================
// Internal Socket Creation and Management Functions
// ==========================================================================================

/**
 * @hebrew (פנימי) יוצר ומנהל את סוקטי ה-UDP לגילוי SSDP.
 * מטפל ביצירת סוקטים ל-IPv4, ואם נדרש, גם ל-IPv6.
 * כל סוג IP יקבל סוקט נפרד להאזנה ל-NOTIFY וסוקט נפרד לשליחת M-SEARCH וקבלת תגובות.
 * עשוי להשתמש בפונקציית עזר פנימית `_createSingleSocket` למניעת חזרתיות.
 *
 * @param options - אופציות הגילוי, בעיקר `includeIPv6`, `searchTarget`, `timeoutMs`.
 * @param onMessage - קולבק שיופעל עם קבלת הודעה (Buffer) ומידע על מקור ההודעה (rinfo) וסוג הסוקט.
 * @param onError - קולבק שיופעל במקרה של שגיאת סוקט.
 * @returns אובייקט עם מתודות לשליחת M-SEARCH (`sendMSearch`) וסגירת כל הסוקטים (`closeAll`).
 */
// הפונקציות _createAndManageSockets ו-_createSingleSocket הועברו לקובץ ssdpSocketManager.ts
// ==========================================================================================
// Internal Discovery Orchestration Function
// ==========================================================================================

/**
 * @hebrew (פנימי) פונקציית התזמור המרכזית. אחראית על הקמת הרשת,
 * האזנה להודעות SSDP, וקריאה לעיבוד מעמיק יותר של כל התקן שמתגלה.
 *
 * @param options - אופציות הגילוי המלאות (כולל `detailLevel` ו-`abortSignal` מובטחים).
 * @param onDeviceProcessed - קולבק שיופעל עבור כל התקן לאחר שעבר עיבוד מלא
 *                            בהתאם ל-`options.detailLevel`.
 * @returns Promise שמסתיים כאשר תהליך הגילוי מסתיים (לאחר timeout או abort).
 */
async function _discoverDevicesOrchestrator(
  options: Omit<Required<DiscoveryOptions>, 'onRawSsdpMessage'> & { onRawSsdpMessage?: RawSsdpMessageHandler }, // options.abortSignal is guaranteed to be an AbortSignal here
  onDeviceProcessed: (device: ProcessedDevice) => void
): Promise<void> {
  const uniqueUsns = new Set<string>();
  const internalAbortController = new AbortController(); // השם שונה לבהירות
  const externalSignalFromOptions = options.abortSignal; // זהו ה-AbortSignal שהועבר מבחוץ

  // האזנה ל-AbortSignal החיצוני
  if (externalSignalFromOptions) { // בדיקה זו טכנית מיותרת אם הטיפוס נאכף, אבל לא מזיקה
    if (externalSignalFromOptions.aborted) {
      logger.debug('[Orchestrator] External signal was already aborted. Aborting internal controller immediately.');
      internalAbortController.abort();
    } else {
      const handleExternalAbort = () => {
        logger.debug('[Orchestrator] External signal from options triggered. Aborting internal controller.');
        internalAbortController.abort();
        // externalSignalFromOptions.removeEventListener('abort', handleExternalAbort); // אין צורך עם once: true
      };
      externalSignalFromOptions.addEventListener('abort', handleExternalAbort, { once: true });
    }
  }

  let socketManager: {
    sendMSearch: (target: string, ipVersion: 4 | 6) => Promise<void>;
    closeAll: () => Promise<PromiseSettledResult<void>[]>;
  } | undefined;

  logger.info(`[Orchestrator] Starting discovery for target: ${options.searchTarget} with timeout: ${options.timeoutMs}ms`);

  const onSocketError = (err: Error, socketType: string) => {
    logger.error(`[Orchestrator] Socket error on ${socketType}:`, err);
    // Consider aborting if a critical socket error occurs, e.g., if all sockets fail.
    // For now, just logging. If _createAndManageSockets throws, it will be handled below.
  };

  const onSocketMessage = (
    msg: Buffer,
    rinfo: RemoteInfo, // שימוש ב-import type
    socketType: string
  ) => {
    // >>> ADD THIS SECTION <<<
    if (options.onRawSsdpMessage) {
      try {
        const payload: RawSsdpMessagePayload = { message: msg, remoteInfo: rinfo, socketType };
        options.onRawSsdpMessage(payload);
      } catch (error) {
        logger.error('Error in user-provided onRawSsdpMessage handler:', error, { remoteAddress: rinfo.address });
        // Continue processing the message normally even if the user's callback fails
      }
    }
    // >>> END OF ADDED SECTION <<<

    if (internalAbortController.signal.aborted) {
      logger.debug(`[Orchestrator] Message received on ${socketType} from ${rinfo.address}:${rinfo.port} after abort. Ignoring.`);
      return;
    }

    // קביעת סוג הפרסר (REQUEST או RESPONSE) על סמך תחילת ההודעה
    // זו לוגיקה שהייתה קיימת ב- _parseSsdpMessageWithHttpParserJs
    // וצריכה להיות מועברת לכאן או ל- parseHttpPacket אם היא גנרית מספיק.
    // כרגע, נניח ש-parseHttpPacket מצפה לקבל את סוג הפרסר.
    // SSDP משתמש בשיטות HTTP-like, אז נצטרך לקבוע אם זו בקשה או תגובה.
    const messageString = msg.toString('utf-8');
    let parserTypeForGenericParser: typeof HTTPParser.REQUEST | typeof HTTPParser.RESPONSE;
    if (messageString.startsWith("HTTP/")) { // תגובות ל-M-SEARCH מתחילות כך
      parserTypeForGenericParser = HTTPParser.RESPONSE;
    } else if (messageString.startsWith("NOTIFY") || messageString.startsWith("M-SEARCH")) { // הודעות NOTIFY או בקשות M-SEARCH (אם נקשיב להן)
      parserTypeForGenericParser = HTTPParser.REQUEST;
    } else {
      logger.warn(`[Orchestrator] Unknown SSDP message type for message from ${rinfo.address}:${rinfo.port} starting with: "${messageString.substring(0, 20)}"`);
      return;
    }

    const parsedPacket = parseHttpPacket(msg, parserTypeForGenericParser);
    const basicDevice = _mapHttpPacketToBasicSsdpDevice(parsedPacket, rinfo);

    if (basicDevice && basicDevice.usn && !internalAbortController.signal.aborted) {
      if (!uniqueUsns.has(basicDevice.usn)) {
        uniqueUsns.add(basicDevice.usn);
        logger.debug(`[Orchestrator] Unique device found: ${basicDevice.usn} from ${rinfo.address}:${rinfo.port} via ${socketType}`);
        // תזמון עיבוד ההתקן כדי לא לחסום את לולאת האירועים של הסוקט
        setTimeout(() => {
          if (internalAbortController.signal.aborted) {
            logger.debug(`[Orchestrator] Aborted before processing device: ${basicDevice.usn}`);
            return;
          }
          processUpnpDevice(basicDevice, options.detailLevel, internalAbortController.signal) // שימוש בפונקציה המיובאת
            .then(processedDevice => {
              if (processedDevice && !internalAbortController.signal.aborted) {
                onDeviceProcessed(processedDevice);
              }
            })
            .catch(error => {
              logger.error(`[Orchestrator] Error processing device ${basicDevice.usn}:`, error);
              const errorDevice: ProcessedDevice = {
                ...basicDevice,
                detailLevelAchieved: DiscoveryDetailLevel.Basic,
                error: error.message || 'Unknown error during device processing'
              };
              if (!internalAbortController.signal.aborted) {
                onDeviceProcessed(errorDevice);
              }
            });
        }, 0);
      } else {
        // logger.trace(`[Orchestrator] Duplicate device announcement: ${basicDevice.usn} from ${rinfo.address}:${rinfo.port}`);
      }
    } else if (basicDevice && !basicDevice.usn) {
      logger.warn(`[Orchestrator] Received SSDP message without USN (should have been filtered by mapper) from ${rinfo.address}:${rinfo.port}. Socket: ${socketType}. Headers:`, basicDevice.headers);
    } else if (!basicDevice) {
      // לוג נרשם כבר בתוך _mapHttpPacketToBasicSsdpDevice או parseHttpPacket
    }
  };

  try {
    socketManager = await createSocketManager({ // שימוש בפונקציה המיובאת והמתוקנת
      includeIPv6: options.includeIPv6,
    },
      onSocketMessage,
      onSocketError
    );

    // שליחת M-SEARCH ראשונית
    if (socketManager) {
      await socketManager.sendMSearch(options.searchTarget, 4);
      if (options.includeIPv6) {
        await socketManager.sendMSearch(options.searchTarget, 6);
      }
    } else {
      logger.warn("[Orchestrator] socketManager is not initialized, cannot send M-SEARCH.");
      // אם אין סוקט מנג'ר, כנראה שיש בעיה קריטית ביצירת הסוקטים.
      // נזרוק שגיאה כדי שה-finally יטפל בניקוי ויציאה.
      throw new Error("Socket manager failed to initialize. Cannot send M-SEARCH.");
    }

    // המתנה לסיום הגילוי (timeout או abort)
    // יצירת Promise שמסתיים כאשר ה-timeout מגיע או כאשר ה-AbortSignal מופעל
    const timeoutPromise = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        logger.debug(`[Orchestrator] Discovery timeout of ${options.timeoutMs}ms reached for target: ${options.searchTarget}.`);
        internalAbortController.abort("Discovery timeout reached"); // הפעלת ה-abort הפנימי
        resolve();
      }, options.timeoutMs);

      // האזנה ל-AbortSignal הפנימי כדי לנקות את הטיימר אם ה-abort מגיע ממקור אחר
      internalAbortController.signal.addEventListener('abort', () => { // תוקן: internalAbortController
        clearTimeout(timer);
        logger.debug('[Orchestrator] Internal AbortController was aborted. Clearing discovery timeout.');
        resolve(); // פתרון ה-Promise של ה-timeout
      }, { once: true });
    });

    await timeoutPromise; // המתנה לסיום ה-timeout או ה-abort

  } catch (error: any) {
    logger.error('[Orchestrator] Critical error during discovery setup or execution:', error);
    internalAbortController.abort("Critical error in orchestrator"); // הפעלת ה-abort הפנימי במקרה של שגיאה קריטית
    // אם השגיאה היא מ- _createAndManageSockets, ייתכן שאין socketManager
    // אם השגיאה היא מ- sendMSearch, socketManager קיים
    // בכל מקרה, ננסה לסגור סוקטים אם הם קיימים ב-finally
  } finally {
    logger.debug('[Orchestrator] Entering finally block. Abort signal status:', { aborted: internalAbortController.signal.aborted, reason: (internalAbortController.signal as any).reason });
    if (socketManager) {
      logger.debug('[Orchestrator] Closing all sockets...');
      await socketManager.closeAll()
        .then(results => {
          logger.debug('[Orchestrator] Socket closeAll finished.');
          results.forEach(result => {
            if (result.status === 'rejected') {
              logger.warn('[Orchestrator] Error closing a socket:', result.reason);
            }
          });
        })
        .catch(err => {
          // למרות ש-closeAll אמור להחזיר PromiseSettledResult, נתפוס שגיאות בלתי צפויות כאן
          logger.error('[Orchestrator] Unexpected error during socketManager.closeAll():', err);
        });
    } else {
      logger.debug('[Orchestrator] socketManager was not initialized, no sockets to close explicitly here.');
    }
    // ודא שה-AbortController הפנימי מבוטל אם לא בוטל כבר
    if (!internalAbortController.signal.aborted) {
      logger.debug("[Orchestrator] Aborting internal AbortController in finally block as a safeguard.");
      internalAbortController.abort("Orchestrator cleanup");
    }
    logger.info(`[Orchestrator] Discovery finished for target: ${options.searchTarget}.`);
  }
}


// הפונקציות שהועברו (_fetchAndParseDeviceDescriptionXml, _populateServices, _fetchScpdAndUpdateService, _populateActionsAndStateVariables, _createInvokeFunctionForAction, _createQueryFunctionForStateVar, _fullyProcessSingleDevice) נמחקו מכאן
// והועברו לקובץ src/upnpDeviceProcessor.ts


// ==========================================================================================
// Exported Iterable Discovery Function with Overloads
// ==========================================================================================

/**
 * @hebrew מגלה התקני UPnP ברשת ומחזיר AsyncIterable של התקנים שנמצאו.
 * רמת הפירוט של המידע המוחזר עבור כל התקן נקבעת על ידי `options.detailLevel`.
 *
 * @param options - אופציות לגילוי. כולל:
 *   - `timeoutMs` (מספר, אופציונלי): זמן קצוב כולל לגילוי במילישניות. ברירת מחדל: 5000.
 *   - `searchTarget` (מחרוזת, אופציונלי): יעד החיפוש של SSDP. ברירת מחדל: "ssdp:all".
 *   - `includeIPv6` (בוליאני, אופציונלי): האם לכלול גילוי דרך IPv6. ברירת מחדל: false.
 *   - `detailLevel` (DiscoveryDetailLevel, אופציונלי): רמת הפירוט של המידע המוחזר. ברירת מחדל: 'full'.
 *     - 'basic': מניב {@link BasicSsdpDevice}.
 *     - 'description': מניב {@link DeviceDescription}.
 *     - 'services': מניב {@link DeviceWithServicesDescription}.
 *     - 'full': מניב {@link FullDeviceDescription}.
 *   - `abortSignal` (AbortSignal, אופציונלי): אות לביטול תהליך הגילוי.
 * @returns AsyncIterable המניב התקנים. טיפוס ההתקנים המנובים תלוי ב-`detailLevel`.
 */
export function discoverSsdpDevicesIterable(
  options: DiscoveryOptions & { detailLevel: DiscoveryDetailLevel.Basic }
): AsyncIterable<BasicSsdpDevice>;
export function discoverSsdpDevicesIterable(
  options: DiscoveryOptions & { detailLevel: DiscoveryDetailLevel.Description }
): AsyncIterable<DeviceDescription>;
export function discoverSsdpDevicesIterable(
  options: DiscoveryOptions & { detailLevel: DiscoveryDetailLevel.Services }
): AsyncIterable<DeviceWithServicesDescription>;
export function discoverSsdpDevicesIterable(
  options: DiscoveryOptions & { detailLevel: DiscoveryDetailLevel.Full }
): AsyncIterable<FullDeviceDescription>;
export function discoverSsdpDevicesIterable(
  options?: DiscoveryOptions
): AsyncIterable<FullDeviceDescription>;

export async function* discoverSsdpDevicesIterable(
  options?: DiscoveryOptions
): AsyncIterable<ProcessedDevice> {
  const abortControllerForIterable = new AbortController();
  const deviceBuffer: ProcessedDevice[] = [];
  let discoveryFinished = false;
  let discoveryError: Error | null = null;

  if (options?.abortSignal) {
    if (options.abortSignal.aborted) {
      logger.debug("discoverSsdpDevicesIterable: External abortSignal provided was already aborted. Aborting iterable controller immediately.");
      abortControllerForIterable.abort("External signal was initially aborted");
    } else {
      const externalAbortHandler = () => {
        logger.debug("discoverSsdpDevicesIterable: External abortSignal triggered. Aborting iterable controller.");
        abortControllerForIterable.abort("External signal triggered abort");
      };
      options.abortSignal.addEventListener('abort', externalAbortHandler, { once: true });
    }
  }

  const effectiveOptions: Parameters<typeof _discoverDevicesOrchestrator>[0] = {
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    searchTarget: options?.searchTarget ?? DEFAULT_SEARCH_TARGET,
    //discoveryTimeoutPerInterfaceMs: options?.discoveryTimeoutPerInterfaceMs ?? DEFAULT_DISCOVERY_TIMEOUT_PER_INTERFACE_MS,
    onDeviceFound: (device: ProcessedDevice) => {
      if (abortControllerForIterable.signal.aborted) {
        logger.debug("discoverSsdpDevicesIterable (onDeviceFound): Iterable aborted, not adding device to buffer:", device.usn || (device as DeviceDescription).UDN);
        return;
      }
      deviceBuffer.push(device);
      if (pendingPromiseResolve) {
        const resolve = pendingPromiseResolve;
        pendingPromiseResolve = null;
        pendingPromiseReject = null;
        resolve({ value: deviceBuffer.shift()!, done: false });
      }
    },
    includeIPv6: options?.includeIPv6 ?? DEFAULT_INCLUDE_IPV6,
    networkInterfaces: options?.networkInterfaces ?? (os.networkInterfaces() as NodeJS.Dict<os.NetworkInterfaceInfo[]>),
    detailLevel: options?.detailLevel ?? DiscoveryDetailLevel.Full,
    abortSignal: abortControllerForIterable.signal,
    // onRawSsdpMessage is now correctly typed due to the change in _discoverDevicesOrchestrator's signature
    // and how effectiveOptions is passed to it.
    // The issue was that Required<DiscoveryOptions> made onRawSsdpMessage: RawSsdpMessageHandler (not undefined).
    // Now, _discoverDevicesOrchestrator expects onRawSsdpMessage to be potentially undefined.
    onRawSsdpMessage: options?.onRawSsdpMessage,
  };

  let pendingPromiseResolve: ((result: IteratorResult<ProcessedDevice>) => void) | null = null;
  let pendingPromiseReject: ((reason?: any) => void) | null = null;

  _discoverDevicesOrchestrator(effectiveOptions, effectiveOptions.onDeviceFound)
    .then(() => {
      logger.debug("discoverSsdpDevicesIterable: Orchestrator finished successfully.");
      discoveryFinished = true;
      if (pendingPromiseResolve) {
        const resolve = pendingPromiseResolve;
        pendingPromiseResolve = null;
        pendingPromiseReject = null;
        resolve({ value: undefined, done: true });
      }
    })
    .catch(err => {
      logger.error("discoverSsdpDevicesIterable: Orchestrator caught an error.", err);
      discoveryError = err;
      discoveryFinished = true;
      if (pendingPromiseReject) {
        const reject = pendingPromiseReject;
        pendingPromiseReject = null;
        pendingPromiseResolve = null;
        reject(err);
      } else if (pendingPromiseResolve) {
        logger.warn("discoverSsdpDevicesIterable: Orchestrator caught error, pendingPromiseReject was null, but pendingPromiseResolve existed.");
        pendingPromiseResolve = null;
        pendingPromiseReject = null;
        logger.error("CRITICAL: Orchestrator error but no pendingPromiseReject. This may lead to an unhandled promise rejection or hung iterable.");
      }
    });

  try {
    while (true) {
      if (abortControllerForIterable.signal.aborted) {
        logger.debug("discoverSsdpDevicesIterable: Loop detected iterable abort signal. Cleaning up and exiting.");
        const reason = (abortControllerForIterable.signal as any).reason || "Discovery aborted by iterable controller";
        throw new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
      }

      if (deviceBuffer.length > 0) {
        yield deviceBuffer.shift()!;
      } else if (discoveryError) {
        throw discoveryError;
      } else if (discoveryFinished) {
        return;
      } else {
        yield new Promise<ProcessedDevice>((resolveOuter, rejectOuter) => {
          pendingPromiseResolve = (iteratorResult) => {
            if (abortControllerForIterable.signal.aborted) {
              pendingPromiseResolve = null;
              pendingPromiseReject = null;
              if (!discoveryFinished) {
                const reason = (abortControllerForIterable.signal as any).reason || "Discovery aborted by iterable controller";
                rejectOuter(new Error(typeof reason === 'string' ? reason : JSON.stringify(reason)));
              }
              return;
            }
            if (iteratorResult.done) {
              pendingPromiseResolve = null;
              pendingPromiseReject = null;
            } else {
              resolveOuter(iteratorResult.value as ProcessedDevice);
            }
          };
          pendingPromiseReject = (err) => {
            pendingPromiseResolve = null;
            pendingPromiseReject = null;
            if (abortControllerForIterable.signal.aborted && !(err instanceof Error && err.message?.includes("aborted"))) {
              logger.debug("Error received in pendingPromiseReject after iterable abort, preferring abort completion.", err);
              if (!discoveryFinished) {
                const reason = (abortControllerForIterable.signal as any).reason || "Discovery aborted by iterable controller";
                rejectOuter(new Error(typeof reason === 'string' ? reason : JSON.stringify(reason)));
              }
            } else {
              rejectOuter(err);
            }
          };
        });
      }
    }
  } finally {
    logger.debug("discoverSsdpDevicesIterable: Entering finally block.");
    if (!abortControllerForIterable.signal.aborted) {
      logger.debug("discoverSsdpDevicesIterable: Aborting iterable's AbortController in finally block because generator is exiting.");
      abortControllerForIterable.abort("Generator is exiting");
    }

    const rejectHandler = pendingPromiseReject;
    const resolveHandler = pendingPromiseResolve;

    if (rejectHandler) {
      logger.warn("AsyncIterable for discoverSsdpDevicesIterable is finishing with a pending rejectHandler. Cleaning up.");
      try {
        (rejectHandler as (reason?: any) => void)(new Error("Generator for discoverSsdpDevicesIterable is closing."));
      } catch (e) {
        logger.error("Error while trying to reject pending promise in finally block of discoverSsdpDevicesIterable", e);
      }
    } else if (resolveHandler) {
      logger.warn("AsyncIterable for discoverSsdpDevicesIterable is finishing with a pending resolveHandler. Cleaning up.");
      try {
        (resolveHandler as (value: IteratorResult<ProcessedDevice, any>) => void)({ value: undefined, done: true });
      } catch (e) {
        logger.error("Error while trying to resolve pending promise in finally block of discoverSsdpDevicesIterable", e);
      }
    }
    pendingPromiseReject = null;
    pendingPromiseResolve = null;
  }
}

// ==========================================================================================
// Exported Discovery Function with Overloads
// ==========================================================================================

/**
 * @hebrew מגלה התקני UPnP ברשת.
 * רמת הפירוט של המידע המוחזר נקבעת על ידי `options.detailLevel`.
 * אם מסופק קולבק `onDeviceFound`, הוא יופעל עבור כל התקן שמתגלה ומעובד.
 * הפונקציה מחזירה Promise שמתממש עם מערך של כל ההתקנים שנמצאו ועובדו.
 *
 * @param options - אופציות לגילוי. כולל:
 *   - `timeoutMs` (מספר, אופציונלי): זמן קצוב כולל לגילוי במילישניות. ברירת מחדל: 5000.
 *   - `searchTarget` (מחרוזת, אופציונלי): יעד החיפוש של SSDP. ברירת מחדל: "ssdp:all".
 *   - `includeIPv6` (בוליאני, אופציונלי): האם לכלול גילוי דרך IPv6. ברירת מחדל: false.
 *   - `detailLevel` (DiscoveryDetailLevel, אופציונלי): רמת הפירוט של המידע המוחזר. ברירת מחדל: 'full'.
 *     - 'basic': מחזיר {@link BasicSsdpDevice}.
 *     - 'description': מחזיר {@link DeviceDescription}.
 *     - 'services': מחזיר {@link DeviceWithServicesDescription}.
 *     - 'full': מחזיר {@link FullDeviceDescription}.
 *   - `onDeviceFound` (פונקציה, אופציונלי): קולבק שיופעל עבור כל התקן שמתגלה ומעובד במלואו. מקבל את ההתקן המעובד כארגומנט.
 *   - `abortSignal` (AbortSignal, אופציונלי): אות לביטול תהליך הגילוי.
 * @returns הבטחה שתתממש עם מערך של התקנים. טיפוס ההתקנים במערך תלוי ב-`detailLevel`.
 */
export function discoverSsdpDevices(
  options: DiscoveryOptions & { detailLevel: DiscoveryDetailLevel.Basic }
): Promise<BasicSsdpDevice[]>;
export function discoverSsdpDevices(
  options: DiscoveryOptions & { detailLevel: DiscoveryDetailLevel.Description }
): Promise<DeviceDescription[]>;
export function discoverSsdpDevices(
  options: DiscoveryOptions & { detailLevel: DiscoveryDetailLevel.Services }
): Promise<DeviceWithServicesDescription[]>;
export function discoverSsdpDevices(
  options: DiscoveryOptions & { detailLevel: DiscoveryDetailLevel.Full }
): Promise<FullDeviceDescription[]>;
export function discoverSsdpDevices(
  options?: DiscoveryOptions // detailLevel defaults to 'full'
): Promise<FullDeviceDescription[]>;

/**
 * @hebrew מגלה התקני SSDP ומחזיר אותם כמערך לאחר סיום הגילוי.
 */
export async function discoverSsdpDevices(
  optionsParam?: DiscoveryOptions
): Promise<ProcessedDevice[]> {
  const devices: ProcessedDevice[] = [];
  const internalAbortController = new AbortController();
  const currentAbortSignalFromOptions = optionsParam?.abortSignal;

  let effectiveAbortSignal: AbortSignal;

  if (currentAbortSignalFromOptions) {
    effectiveAbortSignal = currentAbortSignalFromOptions;
    if (currentAbortSignalFromOptions.aborted) {
      logger.debug("discoverSsdpDevices: External abortSignal provided was already aborted.");
    }
  } else {
    effectiveAbortSignal = internalAbortController.signal;
  }

  const onDeviceProcessedCallback = (device: ProcessedDevice) => {
    if (effectiveAbortSignal.aborted) {
      logger.debug("discoverSsdpDevices (onDeviceProcessedCallback): Discovery aborted, not adding device:", device.usn || (device as DeviceDescription).UDN);
      return;
    }
    devices.push(device);
    optionsParam?.onDeviceFound?.(device);
  };

  const effectiveOptions: Parameters<typeof _discoverDevicesOrchestrator>[0] = {
    timeoutMs: optionsParam?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    searchTarget: optionsParam?.searchTarget ?? DEFAULT_SEARCH_TARGET,
    //discoveryTimeoutPerInterfaceMs: optionsParam?.discoveryTimeoutPerInterfaceMs ?? DEFAULT_DISCOVERY_TIMEOUT_PER_INTERFACE_MS,
    onDeviceFound: onDeviceProcessedCallback,
    includeIPv6: optionsParam?.includeIPv6 ?? DEFAULT_INCLUDE_IPV6,
    networkInterfaces: optionsParam?.networkInterfaces ?? (os.networkInterfaces() as NodeJS.Dict<os.NetworkInterfaceInfo[]>),
    detailLevel: optionsParam?.detailLevel ?? DiscoveryDetailLevel.Full,
    abortSignal: effectiveAbortSignal,
    onRawSsdpMessage: optionsParam?.onRawSsdpMessage,
  };

  try {
    logger.info(`discoverSsdpDevices: Starting discovery with effective options for target: ${effectiveOptions.searchTarget}`);
    await _discoverDevicesOrchestrator(effectiveOptions, onDeviceProcessedCallback);
    logger.info(`discoverSsdpDevices: Orchestrator finished. Found ${devices.length} devices for target: ${effectiveOptions.searchTarget}.`);
  } catch (err: any) {
    logger.error('discoverSsdpDevices: Orchestrator threw an unhandled error. This should ideally be handled within the orchestrator.', err);
    if (!currentAbortSignalFromOptions && !internalAbortController.signal.aborted) {
      internalAbortController.abort("Unhandled error in discoverSsdpDevices");
    }
  } finally {
    if (!currentAbortSignalFromOptions && !internalAbortController.signal.aborted) {
      logger.debug("discoverSsdpDevices: Aborting internal AbortController in finally as a safeguard.");
      internalAbortController.abort("discoverSsdpDevices cleanup");
    }
  }

  if (effectiveAbortSignal.aborted && devices.length === 0) {
    const reason = (effectiveAbortSignal as any).reason || "Discovery aborted";
    logger.info(`discoverSsdpDevices: Discovery was aborted (Reason: ${reason}), returning empty array as no devices were collected.`);
  } else if (effectiveAbortSignal.aborted) {
    const reason = (effectiveAbortSignal as any).reason || "Discovery aborted";
    logger.info(`discoverSsdpDevices: Discovery was aborted (Reason: ${reason}), returning ${devices.length} devices collected before abort.`);
  }

  return devices;
}

