// קובץ זה מכיל את המימוש של מודול לחקירת התקני UPnP, כולל גילוי ועיבוד תיאורים.

import * as os from 'os';
import * as dgram from 'dgram';
import axios from 'axios';
import * as xml2js from 'xml2js';
import { createModuleLogger } from './logger'; // הוספת ייבוא הלוגר
import { sendUpnpCommand } from './upnpSoapClient'; // הוספת ייבוא לקוח ה-SOAP
import {
    DiscoveryOptions,
    BasicSsdpDevice,
    DeviceDescription,
    ServiceDescription,
    DeviceIcon,
    Action,
    ActionArgument,
    StateVariable
} from './types';


// ==========================================================================================
// Constants - קבועים
// ==========================================================================================
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_SEARCH_TARGET = "ssdp:all";
const DEFAULT_DISCOVERY_TIMEOUT_PER_INTERFACE_MS = 2000;
const DEFAULT_INCLUDE_IPV6 = false;
const SSDP_PORT = 1900;
const SSDP_MULTICAST_ADDRESS_IPV4 = "239.255.255.250";
const SSDP_MULTICAST_ADDRESS_IPV6_LINK_LOCAL = "FF02::C"; // Link-Local scope, הנפוץ ביותר ל-SSDP
// ניתן להוסיף FF05::C (Site-Local), FF08::C (Organization-Local), FF0E::C (Global) אם יש צורך בעתיד
const M_SEARCH_REQUEST_START_LINE = "M-SEARCH * HTTP/1.1";
const MX_VALUE = 2; // שניות להמתנה לתגובה מהתקנים (ערך טיפוסי 1-5)
const DEFAULT_MULTICAST_TTL = 128;
const USER_AGENT = "Node.js/UpnpDeviceExplorer/0.1"; // User-Agent עבור בקשות SSDP

const logger = createModuleLogger('upnpDeviceExplorer'); // יצירת מופע לוגר גלובלי

// ==========================================================================================
// Helper Functions - פונקציות עזר
// ==========================================================================================

/**
 * @hebrew פונקציית לוגינג פנימית.
 */
function defaultLogger(level: 'debug' | 'warn' | 'error', message: string, ...optionalParams: any[]): void {
    // שימוש ב-moduleLogger במקום console. מיפוי רמות 'debug' ל-'info' או 'debug' בהתאם לצורך.
    // כאן נמפה 'debug' ל-'info' כברירת מחדל עבור defaultLogger.
    if (level === 'debug') {
        logger.debug(message, ...optionalParams);
    } else {
        logger[level](message, ...optionalParams);
    }
}

/**
 * @hebrew מנתח הודעת תגובת SSDP.
 */
function parseSsdpResponse(message: Buffer, rinfo: dgram.RemoteInfo): BasicSsdpDevice | null {
    const responseStr = message.toString('utf-8');
    const lines = responseStr.split('\r\n');

    if (!lines[0] || !lines[0].toUpperCase().startsWith("HTTP/1.1 200 OK")) {
        // לא תגובת HTTP 200 OK תקינה
        return null;
    }

    const headers: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "") {
            // סוף כותרות
            break;
        }
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim().toUpperCase();
            const value = line.substring(colonIndex + 1).trim();
            headers[key] = value;
        }
    }

    const usn = headers['USN'];
    const location = headers['LOCATION'];
    const server = headers['SERVER'];
    const st = headers['ST'] || headers['NT']; // NT משמש בהודעות NOTIFY

    if (!usn || !location || !st) {
        // כותרות חובה חסרות
        return null;
    }

    return {
        usn,
        location,
        server: server || '',
        st,
        address: rinfo.address,
        responseHeaders: headers,
        timestamp: Date.now(),
    };
}


// ==========================================================================================
// Helper Function for Network Interface Detection
// ==========================================================================================

/**
 * @hebrew מאתרת ממשקי רשת רלוונטיים עבור גילוי SSDP.
 * @param allNetworkInterfaces - אובייקט המכיל את כל ממשקי הרשת הזמינים (כמו זה המוחזר מ-os.networkInterfaces()).
 * @param includeIPv6 - האם לכלול ממשקי IPv6.
 * @returns מערך של ממשקי רשת רלוונטיים.
 */
function findRelevantNetworkInterfaces(
    allNetworkInterfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>,
    includeIPv6: boolean
): { name: string; address: string; family: 'IPv4' | 'IPv6'; scopeId?: number }[] {
    const relevantInterfaces: { name: string; address: string; family: 'IPv4' | 'IPv6'; scopeId?: number }[] = [];

    if (allNetworkInterfaces) {
        for (const name of Object.keys(allNetworkInterfaces)) {
            const interfaceDetails = allNetworkInterfaces[name];
            if (interfaceDetails) {
                for (const iface of interfaceDetails) {
                    if (iface.internal) continue; // דלג על ממשקים פנימיים

                    if (iface.family === 'IPv4' && !iface.address.startsWith('169.254.')) {
                        relevantInterfaces.push({ name, address: iface.address, family: 'IPv4' });
                        logger.debug(`Found relevant IPv4 interface: ${name} - ${iface.address}`);
                    } else if (includeIPv6 && iface.family === 'IPv6' && iface.address.toLowerCase().startsWith('fe80::')) {
                        relevantInterfaces.push({ name, address: iface.address, family: 'IPv6', scopeId: iface.scopeid });
                        logger.debug(`Found relevant IPv6 link-local interface: ${name} - ${iface.address}%${iface.scopeid || ''}`);
                    }
                }
            }
        }
    }
    return relevantInterfaces;
}


// ==========================================================================================
// Main Discovery Function - פונקציית הגילוי הראשית
// ==========================================================================================

/**
 * @hebrew מגלה התקני SSDP ברשת.
 * @param options - אופציות לגילוי.
 * @returns הבטחה שתתממש עם מערך של התקנים שנמצאו.
 */
export async function discoverSsdpDevices(options?: DiscoveryOptions): Promise<BasicSsdpDevice[]> {
    const discoveredDevices: BasicSsdpDevice[] = [];
    const uniqueUsns = new Set<string>();

    // 1. קביעת ברירות מחדל לאופציות
    const effectiveOptions: Required<Omit<DiscoveryOptions, 'onDeviceFound' | 'customLogger' | 'networkInterfaces'>> & Pick<DiscoveryOptions, 'onDeviceFound' | 'customLogger' | 'networkInterfaces'> = {
        timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        searchTarget: options?.searchTarget ?? DEFAULT_SEARCH_TARGET,
        discoveryTimeoutPerInterfaceMs: options?.discoveryTimeoutPerInterfaceMs ?? DEFAULT_DISCOVERY_TIMEOUT_PER_INTERFACE_MS,
        includeIPv6: options?.includeIPv6 ?? DEFAULT_INCLUDE_IPV6,
        // onDeviceFound, customLogger, networkInterfaces נשארים אופציונליים
        onDeviceFound: options?.onDeviceFound,
        customLogger: options?.customLogger,
        networkInterfaces: options?.networkInterfaces,
    };

    const oldLogger = effectiveOptions.customLogger || defaultLogger;
    logger.info('Starting SSDP discovery with options:', effectiveOptions);

    // 2. זיהוי ממשקי רשת רלוונטיים
    const allInterfacesInput = effectiveOptions.networkInterfaces || os.networkInterfaces();
    const relevantInterfaces = findRelevantNetworkInterfaces(allInterfacesInput, effectiveOptions.includeIPv6);

    if (relevantInterfaces.length === 0) {
        logger.warn('No relevant network interfaces found for SSDP discovery.');
        return [];
    }

    logger.debug(`Found ${relevantInterfaces.length} relevant interfaces for discovery.`);

    // 3. ביצוע גילוי על כל ממשק (במקביל)
    const discoveryPromises = relevantInterfaces.map(ifaceInfo =>
        discoverOnSingleInterface(
            ifaceInfo,
            effectiveOptions,
            uniqueUsns, // Set שמשותף בין כל הקריאות ל-discoverOnSingleInterface
            oldLogger,
            effectiveOptions.onDeviceFound // העברת הקולבק
        )
    );

    const results = await Promise.allSettled(discoveryPromises);

    // איסוף כל ההתקנים שנמצאו (כל התקן ברשימות המוחזרות כבר ייחודי גלובלית)
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
            discoveredDevices.push(...result.value);
        } else if (result.status === 'rejected') {
            oldLogger('error', `Discovery on interface ${result.reason?.ifaceInfo?.name || 'unknown'} failed:`, result.reason?.error);
        }
    });

    // מיון ההתקנים לפי חותמת זמן, אם רוצים סדר עקבי
    discoveredDevices.sort((a, b) => a.timestamp - b.timestamp);

    // 4. סיום תהליך הגילוי הכולל (לאחר timeoutMs גלובלי אם מוגדר ורלוונטי)
    // כרגע, ה-timeoutMs הגלובלי לא נאכף באופן פעיל מעבר ל-timeouts של הממשקים.
    // ניתן להוסיף לוגיקה שאם כל הממשקים סיימו לפני timeoutMs, הפונקציה עדיין ממתינה.
    // או, אם timeoutMs קצר יותר מסכום ה-discoveryTimeoutPerInterfaceMs, הוא יכול לקטוע מוקדם יותר.
    // לצורך הפשטות כרגע, נסמוך על סיום כל ההבטחות של הממשקים.

    logger.debug(`SSDP discovery finished. Found ${discoveredDevices.length} unique devices.`);
    return discoveredDevices;
}


/**
 * @hebrew פונקציית עזר לביצוע גילוי על ממשק רשת בודד.
 */
async function discoverOnSingleInterface(
    ifaceInfo: { name: string; address: string; family: 'IPv4' | 'IPv6'; scopeId?: number },
    options: Required<Omit<DiscoveryOptions, 'onDeviceFound' | 'customLogger' | 'networkInterfaces'>> & Pick<DiscoveryOptions, 'onDeviceFound' | 'customLogger' | 'networkInterfaces'>,
    globalUniqueUsns: Set<string>,
    oldLogger: (level: 'debug' | 'warn' | 'error', message: string, ...optionalParams: any[]) => void,
    onDeviceFoundCallback?: (device: BasicSsdpDevice) => void
): Promise<BasicSsdpDevice[]> {
    // מחזיר Promise שמכיל מערך של התקנים *חדשים גלובלית* שנמצאו דרך ממשק זה
    return new Promise<BasicSsdpDevice[]>((resolve, reject) => {
        const devicesFoundOnThisInterfaceAndGloballyNew: BasicSsdpDevice[] = [];
        const socketType = ifaceInfo.family === 'IPv4' ? 'udp4' : 'udp6';
        let sendIntervalId: NodeJS.Timeout | null = null;

        const ssdpTargetAddress = ifaceInfo.family === 'IPv4' ? SSDP_MULTICAST_ADDRESS_IPV4 : SSDP_MULTICAST_ADDRESS_IPV6_LINK_LOCAL;

        const mSearchHost = ifaceInfo.family === 'IPv4'
            ? `${SSDP_MULTICAST_ADDRESS_IPV4}:${SSDP_PORT}`
            : `[${SSDP_MULTICAST_ADDRESS_IPV6_LINK_LOCAL}]:${SSDP_PORT}`;

        const mSearchMessageParts = [
            M_SEARCH_REQUEST_START_LINE,
            `HOST: ${mSearchHost}`,
            `MAN: "ssdp:discover"`,
            `MX: ${MX_VALUE}`,
            `ST: ${options.searchTarget}`,
            `USER-AGENT: ${USER_AGENT}`,
            '\r\n'
        ];
        const mSearchBuffer = Buffer.from(mSearchMessageParts.join('\r\n'));

        // פונקציית עזר פנימית לשליחת בקשת M-SEARCH
        const sendMSearchRequest = (socket: dgram.Socket) => {
            if (socketClosedManually) {
                logger.debug(`[${ifaceInfo.name} / ${ifaceInfo.address}] Socket is ` +
                    `closing or closed, skipping M-SEARCH send.`);
                if (sendIntervalId) { // נקה את האינטרוול אם הוא עדיין קיים והסוקט נסגר
                    clearInterval(sendIntervalId);
                    sendIntervalId = null;
                }
                return;
            }

            logger.debug(`[${ifaceInfo.name} / ${ifaceInfo.address}] ` +
                `Attempting to send M-SEARCH to ${ssdpTargetAddress}:${SSDP_PORT}`);
            socket.send(mSearchBuffer, 0, mSearchBuffer.length, SSDP_PORT, ssdpTargetAddress, (err) => {
                if (err) {
                    // שגיאה בשליחה לא בהכרח אומרת שצריך לסגור הכל, אלא רק לרשום ללוג
                    oldLogger('error', `[${ifaceInfo.name} / ${ifaceInfo.address}] Error sending M-SEARCH: ${err.message}`, err);
                } else {
                    logger.debug(`[${ifaceInfo.name} / ${ifaceInfo.address}] M-SEARCH sent successfully to ${ssdpTargetAddress}:${SSDP_PORT}`);
                }
            });
        };

        logger.debug(`[${ifaceInfo.name} / ${ifaceInfo.address}] Starting discovery. Type: ${socketType}. Target: ${ssdpTargetAddress}. ST: ${options.searchTarget}`);

        const socket = dgram.createSocket({ type: socketType, reuseAddr: true });
        let interfaceTimer: NodeJS.Timeout | null = null;
        let socketClosedManually = false;

        const cleanupAndResolve = (reason?: string, error?: Error) => {
            if (sendIntervalId) { // ניקוי האינטרוול אם קיים
                clearInterval(sendIntervalId);
                sendIntervalId = null;
                logger.debug(`[${ifaceInfo.name} / ${ifaceInfo.address}] Cleared M-SEARCH send interval.`);
            }
            if (socketClosedManually) {
                // אם כבר נסגר, אין מה לעשות, resolve כבר נקרא או ייקרא
                return;
            }
            socketClosedManually = true;
            if (interfaceTimer) {
                clearTimeout(interfaceTimer);
                interfaceTimer = null;
            }
            try {
                socket.removeAllListeners();
                socket.close(() => {
                    logger.debug(`[${ifaceInfo.name} / ${ifaceInfo.address}] Socket closed. Reason: ${reason || 'timeout/error'}. Found ${devicesFoundOnThisInterfaceAndGloballyNew.length} devices on this interface.`);
                    if (error) {
                        // אם הייתה שגיאה קריטית שהובילה לסגירה, נדחה את ה-Promise עם מידע על הממשק
                        reject({ error, ifaceInfo });
                    } else {
                        resolve(devicesFoundOnThisInterfaceAndGloballyNew);
                    }
                });
            } catch (e: any) {
                logger.warn(`[${ifaceInfo.name} / ${ifaceInfo.address}] Error closing socket: ${e.message}`, e);
                if (error) {
                    reject({ error, ifaceInfo });
                } else {
                    // גם אם הסגירה נכשלה, ננסה להחזיר מה שנאסף אם לא הייתה שגיאה קודמת
                    resolve(devicesFoundOnThisInterfaceAndGloballyNew);
                }
            }
        };

        socket.on('error', (err) => {
            oldLogger('error', `[${ifaceInfo.name} / ${ifaceInfo.address}] Socket error: ${err.message}`, err);
            cleanupAndResolve(`socket error: ${err.message}`, err);
        });

        socket.on('listening', () => {
            const addressInfo = socket.address();
            logger.debug(`[${ifaceInfo.name} / ${ifaceInfo.address}] Socket listening on ${addressInfo.address}:${addressInfo.port}`);

            try {
                if (ifaceInfo.family === 'IPv4') {
                    socket.setBroadcast(true);
                }
                socket.setMulticastTTL(DEFAULT_MULTICAST_TTL);

                let membershipInterfaceAddress = ifaceInfo.address;
                let multicastInterfaceOption = ifaceInfo.address;

                if (ifaceInfo.family === 'IPv6' && ifaceInfo.address.toLowerCase().startsWith('fe80::') && ifaceInfo.scopeId !== undefined) {
                    if (process.platform === 'win32') {
                        membershipInterfaceAddress = `${ifaceInfo.address}%${ifaceInfo.scopeId}`;
                        multicastInterfaceOption = `${ifaceInfo.address}%${ifaceInfo.scopeId}`;
                        logger.debug(`[${ifaceInfo.name}] Windows IPv6 Link-Local: using address%scopeId: ${multicastInterfaceOption}`);
                    } else {
                        membershipInterfaceAddress = `${ifaceInfo.address}%${ifaceInfo.name}`;
                        multicastInterfaceOption = `::%${ifaceInfo.name}`;
                        logger.debug(`[${ifaceInfo.name}] Non-Windows IPv6 Link-Local: membership with address%name (${membershipInterfaceAddress}), multicast out with ::%name (${multicastInterfaceOption})`);
                    }
                }

                socket.addMembership(ssdpTargetAddress, membershipInterfaceAddress);
                logger.debug(`[${ifaceInfo.name} / ${ifaceInfo.address}] Joined multicast group ${ssdpTargetAddress} on membership interface ${membershipInterfaceAddress}`);

                // ניסיון להגדיר setMulticastInterface, עם טיפול בשגיאות אפשריות
                try {
                    socket.setMulticastInterface(multicastInterfaceOption);
                    logger.debug(`[${ifaceInfo.name} / ${ifaceInfo.address}] Set multicast output interface to ${multicastInterfaceOption}`);
                } catch (e_multi: any) {
                    oldLogger('error', `[${ifaceInfo.name} / ${ifaceInfo.address}] Error setting multicast interface to "${multicastInterfaceOption}": ${e_multi.message}. SSDP might not work correctly on this interface.`);
                    // לא נזרוק שגיאה קריטית כאן, אלא נמשיך בניסיון לשלוח. ייתכן שעדיין יעבוד במקרים מסוימים.
                }

                // שליחה ראשונית מיידית, ולאחר מכן כל שנייה
                sendMSearchRequest(socket); // קריאה ראשונה מיידית
                if (!socketClosedManually) { // רק אם הסוקט לא בתהליך סגירה
                    sendIntervalId = setInterval(() => sendMSearchRequest(socket), 2000); // שליחות עוקבות כל שנייה
                }

            } catch (e: any) {
                oldLogger('error', `[${ifaceInfo.name} / ${ifaceInfo.address}] Error setting socket options or sending M-SEARCH: ${e.message}`, e);
                cleanupAndResolve(`socket setup error: ${e.message}`, e instanceof Error ? e : new Error(String(e)));
                return;
            }
        });

        socket.on('message', (msgBuffer, rinfo) => {
            logger.debug(`[${ifaceInfo.name} / ${ifaceInfo.address}] Received message from ${rinfo.address}:${rinfo.port}`);
            const device = parseSsdpResponse(msgBuffer, rinfo);
            if (device) {
                if (!globalUniqueUsns.has(device.usn)) {
                    globalUniqueUsns.add(device.usn);
                    devicesFoundOnThisInterfaceAndGloballyNew.push(device);
                    logger.debug(`[${ifaceInfo.name} / ${ifaceInfo.address}] Parsed new unique device: ${device.usn} from ${device.address}. Total unique: ${globalUniqueUsns.size}`);
                    if (onDeviceFoundCallback) {
                        try {
                            onDeviceFoundCallback(device);
                        } catch (e_cb: any) {
                            oldLogger('error', `[${ifaceInfo.name} / ${ifaceInfo.address}] Error in onDeviceFound callback for ${device.usn}: ${e_cb.message}`, e_cb);
                        }
                    }
                } else {
                    logger.debug(`[${ifaceInfo.name} / ${ifaceInfo.address}] Parsed duplicate device (USN already seen globally): ${device.usn}`);
                }
            } else {
                logger.warn(`[${ifaceInfo.name} / ${ifaceInfo.address}] Failed to parse SSDP response from ${rinfo.address}. Content: ${msgBuffer.toString('utf-8', 0, 100)}...`);
            }
        });

        let bindAddress = ifaceInfo.address;
        if (ifaceInfo.family === 'IPv6' && ifaceInfo.address.toLowerCase().startsWith('fe80::') && ifaceInfo.scopeId !== undefined) {
            bindAddress = `${ifaceInfo.address}%${ifaceInfo.scopeId}`;
        }

        try {
            socket.bind({ address: bindAddress, port: 0, exclusive: false }, () => {
                logger.debug(`[${ifaceInfo.name} / ${ifaceInfo.address}] Socket bind initiated for ${bindAddress}. Waiting for 'listening' event.`);
            });
        } catch (e: any) {
            oldLogger('error', `[${ifaceInfo.name} / ${ifaceInfo.address}] Critical error on socket.bind() to ${bindAddress}: ${e.message}`, e);
            cleanupAndResolve(`socket bind error: ${e.message}`, e instanceof Error ? e : new Error(String(e)));
            return;
        }

        interfaceTimer = setTimeout(() => {
            cleanupAndResolve('interface timeout');
        }, options.discoveryTimeoutPerInterfaceMs);
    });
}

// ==========================================================================================
// Iterable Discovery Function - פונקציית גילוי איטרטיבית
// ==========================================================================================

/**
 * @hebrew מגלה התקני SSDP ברשת ומחזיר אותם באופן איטרטיבי.
 * @param options - אופציות לגילוי.
 * @returns AsyncIterable של התקנים שנמצאו.
 */
export async function* discoverSsdpDevicesIterable(options?: DiscoveryOptions): AsyncIterable<BasicSsdpDevice> {
    const oldLogger = options?.customLogger || defaultLogger;
    logger.debug('Starting true iterable SSDP discovery...');

    const deviceQueue: (BasicSsdpDevice | null)[] = []; // null מסמן סיום
    let triggerNextPromise: (() => void) | null = null; // פונקציה שתקרא כשיש התקן חדש או שהגילוי הסתיים
    let discoveryProcessFinished = false;
    let discoveryProcessError: Error | null = null;

    // קריאה חוזרת מותאמת אישית שתופעל עבור כל התקן שמתגלה
    const customOnDeviceFound = (device: BasicSsdpDevice) => {
        oldLogger('debug', `[Iterable] Device found via callback: ${device.usn}`);
        deviceQueue.push(device); // הוסף התקן לתור
        if (triggerNextPromise) {
            triggerNextPromise(); // הודע ללולאת ה-yield שיש התקן חדש
        }

        // אם המשתמש סיפק onDeviceFound משלו, נקרא גם לו
        if (options?.onDeviceFound) {
            try {
                options.onDeviceFound(device);
            } catch (e: any) {
                oldLogger('error', `[Iterable] Error in user-provided onDeviceFound callback: ${e.message}`, e);
            }
        }
    };

    // הפעל את תהליך הגילוי הראשי ברקע
    // הוא יקרא ל-customOnDeviceFound שלנו עבור כל התקן
    // וגם יפתור את ההבטחה כשהוא מסיים או נכשל
    const discoveryPromise = discoverSsdpDevices({
        ...options,
        onDeviceFound: customOnDeviceFound, // שימוש בקריאה החוזרת המותאמת שלנו
    }).then(() => {
        logger.debug('[Iterable] Core discovery process finished successfully.');
        discoveryProcessFinished = true;
        deviceQueue.push(null); // הוסף סמן סיום לתור
        if (triggerNextPromise) {
            triggerNextPromise(); // הודע ללולאת ה-yield שהתהליך הסתיים
        }
    }).catch(err => {
        oldLogger('error', '[Iterable] Error in core discovery process:', err);
        discoveryProcessError = err;
        discoveryProcessFinished = true; // גם במקרה של שגיאה, התהליך הסתיים
        deviceQueue.push(null); // הוסף סמן סיום לתור
        if (triggerNextPromise) {
            triggerNextPromise(); // הודע ללולאת ה-yield שהתהליך הסתיים (עם שגיאה)
        }
    });

    // לולאה שמייצרת התקנים מהתור עד שהתהליך מסתיים
    while (true) {
        if (deviceQueue.length > 0) {
            const deviceOrNull = deviceQueue.shift(); // קח את ההתקן הבא מהתור

            if (deviceOrNull === null) { // אם זה סמן הסיום
                logger.debug('[Iterable] Reached end-of-queue marker.');
                break; // סיים את הלולאה
            }
            // אם זה התקן תקין, החזר אותו
            if (deviceOrNull) {
                 logger.debug(`[Iterable] Yielding device: ${deviceOrNull.usn}`);
                yield deviceOrNull;
            }
        } else if (discoveryProcessFinished) {
            // אם התור ריק והתהליך הסתיים, אין עוד מה לעשות
            logger.debug('[Iterable] Queue is empty and discovery process finished.');
            break;
        } else {
            // אם התור ריק והתהליך עוד לא הסתיים, המתן להתקן הבא או לסיום
            logger.debug('[Iterable] Queue is empty, awaiting next device or discovery completion...');
            await new Promise<void>(resolve => {
                triggerNextPromise = resolve;
            });
            triggerNextPromise = null; // אפס לאחר שימוש כדי למנוע קריאות מיותרות
        }
    }

    // אם הייתה שגיאה בתהליך הגילוי, זרוק אותה מחדש כדי שהצרכן של ה-iterable ידע
    if (discoveryProcessError) {
        logger.error('[Iterable] Rethrowing discovery error from iterable.');
        throw discoveryProcessError;
    }

    logger.debug('Iterable SSDP discovery completed.');
}


// ==========================================================================================
// SCPD Fetching and Parsing Function - פונקציה לאחזור וניתוח SCPD
// ==========================================================================================

interface ScpdResult {
    actionList: Action[];
    stateVariables: StateVariable[];
    scpdError?: undefined; // אין שגיאה
}

interface ScpdErrorResult {
    actionList?: undefined;
    stateVariables?: undefined;
    scpdError: string; // יש שגיאה
}

/**
 * @hebrew מאחזר ומנתח את קובץ ה-SCPD של שירות.
 * @param scpdUrl - כתובת ה-URL של קובץ ה-SCPD.
 * @param baseUrl - כתובת ה-URL הבסיסית של ההתקן (לפתרון URLים יחסיים בתוך ה-SCPD, אם יש).
 * @param oldLogger - פונקציית לוגינג.
 * @returns הבטחה שתתממש עם אובייקט המכיל את רשימת הפעולות ומשתני המצב, או שגיאה.
 */
async function fetchServiceScpdDetails(
    scpdUrl: string,
    baseUrl: string, // נדרש לפתרון URLים יחסיים פוטנציאליים בתוך SCPD (פחות נפוץ, אבל טוב שיהיה)
    oldLogger: (level: 'debug' | 'warn' | 'error', message: string, ...optionalParams: any[]) => void
): Promise<ScpdResult | ScpdErrorResult> {
    logger.debug(`[SCPD] Fetching service description from: ${scpdUrl}`);

    try {
        const response = await axios.get(scpdUrl, {
            timeout: DEFAULT_TIMEOUT_MS, // ניתן להתאמה
            responseType: 'text'
        });

        if (response.status !== 200) {
            const errorMsg = `[SCPD] Failed to fetch SCPD from ${scpdUrl}. Status: ${response.status}`;
            oldLogger('error', errorMsg);
            return { scpdError: errorMsg };
        }

        const xmlData = response.data;
        logger.debug(`[SCPD] Successfully fetched XML data from ${scpdUrl}. Length: ${xmlData.length}`);

        const parser = new xml2js.Parser({
            explicitArray: false,
            explicitRoot: false, // בדרך כלל ל-SCPD יש שורש <scpd>
            tagNameProcessors: [xml2js.processors.stripPrefix],
            valueProcessors: [xml2js.processors.parseNumbers, xml2js.processors.parseBooleans]
        });

        const parsedXml = await parser.parseStringPromise(xmlData);
        logger.debug(`[SCPD] Successfully parsed XML data from ${scpdUrl}`);

        const actionList: Action[] = [];
        const stateVariableList: StateVariable[] = [];

        // עיבוד רשימת הפעולות (actionList)
        if (parsedXml.actionList && parsedXml.actionList.action) {
            const actionsInput = Array.isArray(parsedXml.actionList.action) ? parsedXml.actionList.action : [parsedXml.actionList.action];
            for (const actionNode of actionsInput) {
                const action: Action = { name: actionNode.name, arguments: [] };
                if (actionNode.argumentList && actionNode.argumentList.argument) {
                    const argsInput = Array.isArray(actionNode.argumentList.argument) ? actionNode.argumentList.argument : [actionNode.argumentList.argument];
                    action.arguments = argsInput.map((argNode: any): ActionArgument => ({
                        name: argNode.name,
                        direction: argNode.direction as 'in' | 'out',
                        relatedStateVariable: argNode.relatedStateVariable
                    }));
                }
                actionList.push(action);
            }
        }

        // עיבוד טבלת משתני המצב (serviceStateTable)
        if (parsedXml.serviceStateTable && parsedXml.serviceStateTable.stateVariable) {
            const stateVarsInput = Array.isArray(parsedXml.serviceStateTable.stateVariable) ? parsedXml.serviceStateTable.stateVariable : [parsedXml.serviceStateTable.stateVariable];
            for (const svNode of stateVarsInput) {
                const stateVar: StateVariable = {
                    name: svNode.name,
                    dataType: svNode.dataType,
                    defaultValue: svNode.defaultValue,
                    sendEventsAttribute: svNode['@_sendEvents'] === 'yes' // שים לב לטיפול בתכונה
                };
                if (svNode.allowedValueList && svNode.allowedValueList.allowedValue) {
                    stateVar.allowedValueList = Array.isArray(svNode.allowedValueList.allowedValue) ? svNode.allowedValueList.allowedValue : [svNode.allowedValueList.allowedValue];
                }
                stateVariableList.push(stateVar);
            }
        }

        logger.debug(`[SCPD] Parsed ${actionList.length} actions and ${stateVariableList.length} state variables from ${scpdUrl}`);
        return { actionList, stateVariables: stateVariableList };

    } catch (error: any) {
        const errorMsg = `[SCPD] Error fetching or parsing SCPD from ${scpdUrl}: ${error.message}`;
        oldLogger('error', errorMsg, error);
        return { scpdError: errorMsg };
    }
}


// ==========================================================================================
// Device Description Fetching Function - פונקציה לאחזור תיאור התקן
// ==========================================================================================

/**
 * @hebrew מאחזר ומנתח את קובץ התיאור (XML) של התקן, ואופציונלית גם את פרטי ה-SCPD של כל שירות.
 * @param basicDevice - אובייקט ההתקן הבסיסי כפי שהתקבל מ-SSDP.
 * @param includeScpdDetails - האם לכלול אחזור וניתוח של SCPD עבור כל שירות. @default false
 * @param customLogger - פונקציית לוגינג מותאמת אישית (אופציונלי).
 * @returns הבטחה שתתממש עם אובייקט DeviceDescription, או null אם נכשל.
 */
export async function fetchDeviceDescription(
    basicDevice: BasicSsdpDevice,
    includeScpdDetails: boolean = false,
    customLogger?: (level: 'debug' | 'warn' | 'error', message: string, ...optionalParams: any[]) => void
): Promise<DeviceDescription | null> {
    const oldLogger = customLogger || defaultLogger;
    const locationUrl = basicDevice.location; // שימוש בכתובת מההתקן הבסיסי

    logger.debug(`[DeviceExplorer] Fetching device description from: ${locationUrl}. Include SCPD: ${includeScpdDetails}. Source IP: ${basicDevice.address}`);

    try {
        const response = await axios.get(locationUrl, {
            timeout: DEFAULT_TIMEOUT_MS,
            responseType: 'text'
        });

        if (response.status !== 200) {
            oldLogger('error', `[DeviceExplorer] Failed to fetch device description from ${locationUrl}. Status: ${response.status}`);
            return null;
        }

        const xmlData = response.data;
        logger.debug(`[DeviceExplorer] Successfully fetched XML from ${locationUrl}. Length: ${xmlData.length}`);

        const parser = new xml2js.Parser({
            explicitArray: false,
            explicitRoot: false,
            tagNameProcessors: [xml2js.processors.stripPrefix],
            attrNameProcessors: [xml2js.processors.stripPrefix],
            valueProcessors: [xml2js.processors.parseNumbers, xml2js.processors.parseBooleans]
        });

        const parsedXml = await parser.parseStringPromise(xmlData);
        logger.debug(`[DeviceExplorer] Successfully parsed XML from ${locationUrl}`);

        const deviceNode = parsedXml.device;
        if (!deviceNode) {
            oldLogger('error', `[DeviceExplorer] Invalid XML structure: Missing 'device' root element in ${locationUrl}`);
            return null;
        }

        const baseUrl = (() => {
            if (parsedXml.URLBase) {
                logger.debug(`[DeviceExplorer] Using URLBase from XML: ${parsedXml.URLBase}`);
                try {
                    const parsedBase = new URL(parsedXml.URLBase);
                    // ודא שה-URLBase מסתיים בלוכסן
                    return parsedBase.href.endsWith('/') ? parsedBase.href : parsedXml.URLBase + '/';
                } catch (e) {
                    logger.warn(`[DeviceExplorer] Invalid URLBase in XML: ${parsedXml.URLBase}. Falling back to locationUrl derivative.`, e);
                }
            }
            try {
                const url = new URL(locationUrl);
                // גזור את הנתיב עד לקובץ התיאור עצמו, כולל הלוכסן האחרון של התיקייה
                return `${url.protocol}//${url.host}${url.pathname.substring(0, url.pathname.lastIndexOf('/') + 1)}`;
            } catch (e) {
                logger.warn(`[DeviceExplorer] Could not parse locationUrl to derive baseURL: ${locationUrl}. Error: ${e instanceof Error ? e.message : String(e)}. Using locationUrl as is or its directory.`);
                // נסיון אחרון לגזור את התיקייה אם locationUrl הוא קובץ
                const lastSlash = locationUrl.lastIndexOf('/');
                if (lastSlash > -1 && lastSlash < locationUrl.length - 1) {
                    return locationUrl.substring(0, lastSlash + 1);
                }
                return locationUrl.endsWith('/') ? locationUrl : locationUrl + '/'; // Fallback
            }
        })();
        logger.debug(`[DeviceExplorer] Determined baseURL: ${baseUrl} for location: ${locationUrl}`);

        // קריאה לפונקציה שמעבדת את ה-node של ההתקן
        return mapXmlNodeToDeviceDescription(
            deviceNode,
            baseUrl,
            oldLogger,
            locationUrl, // originalLocationUrl
            includeScpdDetails,
            basicDevice.address // optionalSourceIpAddress
        );

    } catch (error: any) {
        oldLogger('error', `[DeviceExplorer] Error fetching or parsing device description from ${locationUrl}: ${error.message}`, error);
        return null;
    }
}

// ==========================================================================================
// XML to DeviceDescription Mapping Function - פונקציית מיפוי XML לתיאור התקן
// ==========================================================================================

// פונקציית עזר למיפוי צומת XML ל-DeviceDescription (לשימוש חוזר עבור התקנים משוננים)
// עודכנה לקבל includeScpdDetails ולהיות אסינכרונית
async function mapXmlNodeToDeviceDescription(
    deviceNode: any,
    baseUrl: string, // זהו ה-baseURL שחושב ב-fetchDeviceDescription
    oldLogger: (level: 'debug' | 'warn' | 'error', message: string, ...optionalParams: any[]) => void,
    originalLocationUrl: string, // זהו ה-locationUrl המקורי של קובץ התיאור
    includeScpdDetails: boolean,
    optionalSourceIpAddress?: string // פרמטר חדש, אופציונלי
): Promise<DeviceDescription> {

    const resolveUrl = (base: string, relative?: string): string | undefined => {
        if (!relative) return undefined;
        try {
            return new URL(relative, base).toString();
        } catch (e) {
            logger.warn(`[mapXmlNodeToDeviceDescription for ${originalLocationUrl}] Could not resolve URL: relative='${relative}', base='${base}'`);
            return relative;
        }
    };

    const description: DeviceDescription = {
        deviceType: deviceNode.deviceType,
        friendlyName: deviceNode.friendlyName,
        manufacturer: deviceNode.manufacturer,
        manufacturerURL: resolveUrl(baseUrl, deviceNode.manufacturerURL),
        modelDescription: deviceNode.modelDescription,
        modelName: deviceNode.modelName,
        modelNumber: deviceNode.modelNumber,
        modelURL: resolveUrl(baseUrl, deviceNode.modelURL),
        serialNumber: deviceNode.serialNumber,
        UDN: deviceNode.UDN,
        presentationURL: resolveUrl(baseUrl, deviceNode.presentationURL),
        iconList: [],
        services: {}, // שונה ממערך לאובייקט
        deviceList: [],
        // אכלוס השדות החדשים
        descriptionUrl: originalLocationUrl,
        baseURL: baseUrl,
        sourceIpAddress: optionalSourceIpAddress
    };

    interface XmlIconNode { // הגדרה מקומית אם לא רוצים לייבא או להגדיר גלובלית יותר
        mimetype: string;
        width: string | number;
        height: string | number;
        depth: string | number;
        url: string;
    }

    if (deviceNode.iconList && deviceNode.iconList.icon) {
        const iconsInput = Array.isArray(deviceNode.iconList.icon) ? deviceNode.iconList.icon : [deviceNode.iconList.icon];
        description.iconList = iconsInput.map((icon: XmlIconNode) => ({
            mimetype: icon.mimetype,
            width: typeof icon.width === 'string' ? parseInt(icon.width, 10) : icon.width,
            height: typeof icon.height === 'string' ? parseInt(icon.height, 10) : icon.height,
            depth: typeof icon.depth === 'string' ? parseInt(icon.depth, 10) : icon.depth,
            url: resolveUrl(baseUrl, icon.url)
        })).filter((icon: any) =>
            icon.url && !isNaN(icon.width) && !isNaN(icon.height) && !isNaN(icon.depth)
        ) as DeviceIcon[];
    }

    if (deviceNode.serviceList && deviceNode.serviceList.service) {
        const servicesInput = Array.isArray(deviceNode.serviceList.service) ? deviceNode.serviceList.service : [deviceNode.serviceList.service];

        const servicePromises: Promise<ServiceDescription>[] = servicesInput.map(async (serviceNode: any): Promise<ServiceDescription> => {
            const scpdUrlResolved = resolveUrl(baseUrl, serviceNode.SCPDURL);
            const controlUrlResolved = resolveUrl(baseUrl, serviceNode.controlURL);
            const eventSubUrlResolved = resolveUrl(baseUrl, serviceNode.eventSubURL);

            const serviceDesc: ServiceDescription = {
                serviceType: serviceNode.serviceType,
                serviceId: serviceNode.serviceId,
                SCPDURL: scpdUrlResolved || '',
                controlURL: controlUrlResolved || '',
                eventSubURL: eventSubUrlResolved || '',
                actions: {}, // שונה ממערך לאובייקט
                stateVariables: [], // נשאר מערך
            };

            if (includeScpdDetails && serviceDesc.SCPDURL) {
                logger.debug(`[mapXmlNodeToDeviceDescription for ${originalLocationUrl}] Fetching SCPD for service: ${serviceDesc.serviceId} from ${serviceDesc.SCPDURL}`);
                const scpdDetails = await fetchServiceScpdDetails(serviceDesc.SCPDURL, baseUrl, oldLogger);
                if (scpdDetails.scpdError) {
                    serviceDesc.scpdError = scpdDetails.scpdError;
                } else if (scpdDetails.actionList) {
                    serviceDesc.actions = {}; // אתחול אובייקט הפעולות
                    scpdDetails.actionList.forEach(action => {
                        const invokeFunc = async (args: Record<string, any> = {}): Promise<Record<string, any>> => {
                            if (!serviceDesc.controlURL || !serviceDesc.serviceType) {
                                const errorMsg = `[Invoke] Cannot invoke action '${action.name}': controlURL or serviceType is missing for service '${serviceDesc.serviceId}'.`;
                                logger.error(errorMsg);
                                throw new Error(errorMsg);
                            }
                            logger.debug(`[Invoke] Invoking action '${action.name}' on service '${serviceDesc.serviceId}' at '${serviceDesc.controlURL}' with args:`, args);
                            try {
                                const result = await sendUpnpCommand(serviceDesc.controlURL, serviceDesc.serviceType, action.name, args);
                                logger.debug(`[Invoke] Action '${action.name}' successful. Result:`, result);
                                return result;
                            } catch (error: any) {
                                logger.error(`[Invoke] Error invoking action '${action.name}':`, error.message, error.soapFault || error);
                                throw error;
                            }
                        };
                        if (action.name) { // ודא שלפעולה יש שם לפני הוספתה
                           (serviceDesc.actions as Record<string, Action>)[action.name] = { // Type assertion
                                ...action,
                                invoke: invokeFunc
                            };
                        }
                    });

                    serviceDesc.stateVariables = scpdDetails.stateVariables || [];

                    // נסיון להוסיף פונקציות query למשתני מצב
                    // גישה לפעולה QueryStateVariable דרך אובייקט actions
                    const queryStateVariableAction = (serviceDesc.actions as Record<string, Action | undefined>)?.['QueryStateVariable'];
                    if (queryStateVariableAction && queryStateVariableAction.invoke && queryStateVariableAction.arguments) { // בדיקה נוספת ל-arguments
                        const varNameArgument = queryStateVariableAction.arguments.find((arg: ActionArgument) => arg.direction === 'in' && (arg.name === 'varName' || arg.name === 'VariableName'));
                        if (varNameArgument && serviceDesc.stateVariables) {
                            // stateVariables נשאר מערך, אז נמפה אותו כרגיל
                            serviceDesc.stateVariables = serviceDesc.stateVariables.map(sv => {
                                const queryFunc = async (): Promise<any> => {
                                    logger.debug(`[Query] Querying state variable '${sv.name}' using '${queryStateVariableAction.name}' on service '${serviceDesc.serviceId}'.`);
                                    try {
                                        const result = await queryStateVariableAction.invoke!({ [varNameArgument.name]: sv.name });
                                        if (result && typeof result === 'object') {
                                            if (Object.prototype.hasOwnProperty.call(result, sv.name)) {
                                                return result[sv.name];
                                            }
                                            const outArguments = queryStateVariableAction.arguments?.filter((arg: ActionArgument) => arg.direction === 'out');
                                            if (outArguments?.length === 1 && Object.prototype.hasOwnProperty.call(result, outArguments[0].name)) {
                                                return result[outArguments[0].name];
                                            }
                                            const resultKeys = Object.keys(result);
                                            if (resultKeys.length === 1) {
                                                return result[resultKeys[0]];
                                            }
                                            logger.warn(`[Query] Could not determine the specific return value for '${sv.name}' from QueryStateVariable result:`, result);
                                            return result;
                                        }
                                        return result;
                                    } catch (error: any) {
                                        logger.error(`[Query] Error querying state variable '${sv.name}':`, error.message, error.soapFault || error);
                                        throw error;
                                    }
                                };
                                return {
                                    ...sv,
                                    query: queryFunc
                                };
                            });
                        }
                    }
                }
            } else if (includeScpdDetails && !serviceDesc.SCPDURL) {
                serviceDesc.scpdError = `[mapXmlNodeToDeviceDescription for ${originalLocationUrl}] Cannot fetch SCPD for service ${serviceDesc.serviceId}, SCPDURL missing.`;
            }
            return serviceDesc;
        });

        const resolvedServices = await Promise.all(servicePromises);
        description.services = {}; // אתחול אובייקט השירותים
        resolvedServices.forEach(service => {
            if (service?.serviceId) { // ודא שהשירות וה-ID קיימים
                description.services![service.serviceId] = service;
            }
        });
    }

    if (deviceNode.deviceList && deviceNode.deviceList.device) {
        const subDevicesInput = Array.isArray(deviceNode.deviceList.device) ? deviceNode.deviceList.device : [deviceNode.deviceList.device];
        const subDevicePromises = subDevicesInput.map((subDeviceNode: any) =>
            // קריאה רקורסיבית עם אותם פרמטרים, כולל optionalSourceIpAddress שיועבר הלאה
            mapXmlNodeToDeviceDescription(subDeviceNode, baseUrl, oldLogger, originalLocationUrl, includeScpdDetails, optionalSourceIpAddress)
        );
        description.deviceList = await Promise.all(subDevicePromises);
    }

    return description;
}