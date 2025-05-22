// קובץ זה מכיל סקריפט משופר לגילוי התקני SSDP,
// המשתמש בשני sockets: אחד להאזנה פסיבית ל-NOTIFY
// ואחד לשליחת M-SEARCH וקבלת תגובות.
// הוא גם מנהל רשימת התקנים ייחודיים ושומר אותה ביציאה.

import * as dgram from 'dgram';
import * as fs from 'fs';
import * as path from 'path';
// process אמור להיות זמין גלובלית בסביבת Node.js

// ==========================================================================================
// Constants - קבועים
// ==========================================================================================
const SSDP_PORT = 1900;
const SSDP_MULTICAST_ADDRESS_IPV4 = "239.255.255.250";
const M_SEARCH_HOST_HEADER = `${SSDP_MULTICAST_ADDRESS_IPV4}:${SSDP_PORT}`;
const M_SEARCH_REQUEST_START_LINE = "M-SEARCH * HTTP/1.1";
const MX_VALUE = 3; // שניות להמתנה לתגובה מהתקנים (מומלץ בין 1 ל-5)
const SEARCH_TARGET_ALL = "ssdp:all"; // חיפוש כללי
const USER_AGENT = `EnhancedSSDPDiscoverer/0.1 Node.js/${process.version}`;

const LOG_FILE_NAME = 'enhanced_ssdp_discovery.log';
const DEVICES_FILE_NAME = 'discovered_devices.json';
const SCRIPT_DIR = __dirname; // תיקיית הסקריפט הנוכחי
const LOG_FILE_PATH = path.join(SCRIPT_DIR, LOG_FILE_NAME);
const DEVICES_FILE_PATH = path.join(SCRIPT_DIR, DEVICES_FILE_NAME);

// ==========================================================================================
// Global State - מצב גלובלי
// ==========================================================================================
let logStream: fs.WriteStream;

// מידע על שירות ספציפי או תפקיד לוגי של התקן
interface ServiceEntryPointInfo extends Record<string, string | undefined> {
    USN: string; // ה-USN המלא של השירות
    NT?: string;  // Notification Type (מה-NOTIFY)
    ST?: string;  // Search Target (מהתגובה ל-M-SEARCH)
    LOCATION?: string;
    SERVER?: string;
    'CACHE-CONTROL'?: string;
    _lastSeenService?: string;
    _statusService?: 'alive' | 'byebye';
    _sourceService?: string;
    // כל שאר הכותרות הספציפיות לשירות
}

// מידע על התקן פיזי (מזוהה על ידי ה-Device UUID שלו)
interface PhysicalDeviceInfo {
    deviceUuid: string;
    services: Map<string, ServiceEntryPointInfo>; // מפתח: URN של השירות (החלק אחרי :: ב-USN)
    _firstSeenDevice?: string;
    _lastSeenDevice?: string;
    _overallStatus?: 'alive' | 'mixed' | 'all_byebye'; // סטטוס כללי של ההתקן
    // אפשר להוסיף כאן פרטים שמשותפים לכל השירותים אם יש, למשל LOCATION ראשי אם הוא זהה
    _sources?: Set<string>; // סט של מקורות שמהם התקבל מידע על ההתקן
}

const discoveredPhysicalDevices = new Map<string, PhysicalDeviceInfo>(); // deviceUuid -> PhysicalDeviceInfo

// ==========================================================================================
// Utility Functions - פונקציות עזר
// ==========================================================================================

// פונקציית לוגינג משולבת
const log = (message: string, level: 'log' | 'error' | 'warn' | 'info' = 'info') => {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (level === 'error') console.error(formattedMessage);
    else if (level === 'warn') console.warn(formattedMessage);
    else console.log(formattedMessage);

    if (logStream && !logStream.destroyed) {
        logStream.write(formattedMessage + '\n');
    }
};

// פונקציה לניתוח כותרות מהודעת SSDP
const parseSSDPMessage = (message: Buffer | string): Record<string, string> => {
    const headers: Record<string, string> = {};
    const lines = message.toString('utf-8').split('\r\n');
    
    if (lines.length > 0) {
        headers['START_LINE'] = lines[0]; // שמירת השורה הראשונה (M-SEARCH או NOTIFY או HTTP/1.1 200 OK)
    }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') continue; // התעלם משורות ריקות
        const separatorIndex = line.indexOf(':');
        if (separatorIndex > 0) {
            const key = line.substring(0, separatorIndex).trim().toUpperCase();
            const value = line.substring(separatorIndex + 1).trim();
            headers[key] = value;
        }
    }
    return headers;
};

// פונקציה לחילוץ Device UUID ו-Service URN מתוך USN
const extractDeviceUuidAndServiceUrn = (usn: string, headersForFallback: Record<string, string | undefined>): { deviceUuid: string | null, serviceUrn: string | null } => {
    if (!usn) return { deviceUuid: null, serviceUrn: null };
    const parts = usn.split('::');
    const deviceUuid = parts[0];
    // אם אין ::, נניח שזה root device או הכרזה על ה-UUID עצמו.
    // אם יש ::, החלק השני הוא ה-URN של השירות/התפקיד.
    // נשתמש ב-NT או ST מהכותרות כגיבוי אם אין חלק שני ב-USN.
    const serviceUrn = parts.length > 1 ? parts.slice(1).join('::') : ((headersForFallback['NT'] || headersForFallback['ST']) as string || 'device_uuid_itself');
    return { deviceUuid, serviceUrn };
};


// פונקציה לעדכון רשימת ההתקנים הפיזיים
const addOrUpdatePhysicalDevice = (headers: Record<string, string | undefined>, source: string) => {
    const fullUsn = headers['USN'] as string;
    if (!fullUsn) {
        log(`Received message from ${source} without USN. Skipping. Headers: ${JSON.stringify(headers)}`, 'warn');
        return;
    }

    // העברת 'headers' לפונקציה
    const { deviceUuid, serviceUrn: extractedServiceUrn } = extractDeviceUuidAndServiceUrn(fullUsn, headers);
    // קביעת מפתח השירות: אם ה-USN מכיל ::, נשתמש בחלק שאחריו. אחרת, נשתמש ב-NT או ST.
    // אם גם NT/ST לא קיימים (נדיר עבור הודעות תקינות), נשתמש במזהה כללי.
    const serviceKey = extractedServiceUrn || (headers['NT'] || headers['ST'] || fullUsn) as string;


    if (!deviceUuid) { // serviceUrn יכול להיות null אם זה רק הכרזת UUID
        log(`Could not extract Device UUID from USN: ${fullUsn}. Source: ${source}`, 'warn');
        return;
    }

    const nts = (headers['NTS'] as string)?.toLowerCase();
    const now = new Date().toISOString();

    let physicalDevice = discoveredPhysicalDevices.get(deviceUuid);

    if (!physicalDevice) {
        physicalDevice = {
            deviceUuid: deviceUuid,
            services: new Map<string, ServiceEntryPointInfo>(),
            _firstSeenDevice: now,
            _sources: new Set<string>()
        };
        discoveredPhysicalDevices.set(deviceUuid, physicalDevice);
        log(`New physical device detected: ${deviceUuid}. Source: ${source.split(' from ')[1] || source}`, 'info');
    }

    physicalDevice._lastSeenDevice = now;
    physicalDevice._sources?.add(source.split(' from ')[1] || source);

    let serviceInfo = physicalDevice.services.get(serviceKey);
    const currentServiceStatus = nts === 'ssdp:byebye' ? 'byebye' : 'alive';

    const newServiceData: ServiceEntryPointInfo = {
        ...(headers as Omit<ServiceEntryPointInfo, 'USN'>), // כל הכותרות הרלוונטיות
        USN: fullUsn, // שמירת ה-USN המלא של השירות/ההכרזה
        _lastSeenService: now,
        _statusService: currentServiceStatus,
        _sourceService: source,
    };

    if (!serviceInfo) {
        serviceInfo = newServiceData;
        log(`New service/entry point added for ${deviceUuid}: ${serviceKey} (Status: ${currentServiceStatus}). Source: ${source}`, 'info');
    } else {
        // עדכון שירות קיים
        serviceInfo = {
            ...serviceInfo, // שמור מידע קודם של השירות
            ...newServiceData, // דרוס עם המידע החדש
        };
        log(`Service/entry point updated for ${deviceUuid}: ${serviceKey} (Status: ${currentServiceStatus}). Source: ${source}`, 'info');
    }
    physicalDevice.services.set(serviceKey, serviceInfo);

    // עדכון סטטוס כללי של ההתקן הפיזי
    let allByeBye = true;
    let atLeastOneAlive = false;
    if (physicalDevice.services.size === 0 && currentServiceStatus === 'byebye' && serviceKey === (headers['NT'] || headers['ST'] || fullUsn)) {
        // מקרה קצה: התקן שלח byebye על ה-rootdevice או על ה-UUID עצמו, ואין לו שירותים אחרים רשומים כ-alive
         allByeBye = true;
         atLeastOneAlive = false;
    } else {
        for (const srv of physicalDevice.services.values()) {
            if (srv._statusService === 'alive') {
                atLeastOneAlive = true;
                allByeBye = false; // מספיק אחד חי כדי שהכל לא יהיה בייביי
                // break; // אין צורך לשבור אם רוצים לספור את כולם
            }
            // אם שירות אינו 'alive', הוא לא תורם ל-atLeastOneAlive
            // אם שירות אינו 'byebye', הוא מונע allByeBye
            if (srv._statusService !== 'byebye') {
                allByeBye = false;
            }
        }
    }


    if (allByeBye && physicalDevice.services.size > 0) { // רק אם יש שירותים והם כולם בייביי
        physicalDevice._overallStatus = 'all_byebye';
    } else if (atLeastOneAlive) {
        physicalDevice._overallStatus = 'alive';
    } else if (physicalDevice.services.size === 0 && currentServiceStatus === 'byebye') {
        // אם אין שירותים וההודעה האחרונה הייתה byebye על משהו שקשור ישירות ל-UUID
        physicalDevice._overallStatus = 'all_byebye';
    }
    else {
        physicalDevice._overallStatus = 'mixed'; // או undefined אם אין שירותים כלל או שהמצב לא ברור
    }
    
    // טיפול בהודעות לא צפויות שלא עברו את הלוגיקה למעלה
    if (nts !== 'ssdp:alive' && nts !== 'ssdp:byebye' && !(headers['START_LINE'] as string)?.startsWith('HTTP/1.1 200 OK')) {
        if (!(headers['START_LINE'] as string)?.startsWith('M-SEARCH')) {
             log(`Received unexpected SSDP message type for USN ${fullUsn} from ${source}. Start line: ${headers['START_LINE']}. Headers: ${JSON.stringify(headers)}`, 'warn');
        }
    }
};

// פונקציה לשמירת רשימת ההתקנים לקובץ
const saveDiscoveredDevices = () => {
    log("Saving discovered physical devices to file...", 'info');
    try {
        const devicesArray = Array.from(discoveredPhysicalDevices.values()).map(device => {
            const servicesObject: Record<string, ServiceEntryPointInfo> = {};
            device.services.forEach((value, key) => {
                servicesObject[key] = value;
            });
            return {
                ...device,
                services: servicesObject,
                _sources: Array.from(device._sources || [])
            };
        });

        fs.writeFileSync(DEVICES_FILE_PATH, JSON.stringify(devicesArray, null, 2), 'utf-8');
        log(`Successfully saved ${devicesArray.length} physical devices to ${DEVICES_FILE_PATH}`, 'info');
    } catch (error: any) {
        log(`Error saving devices file: ${error.message}`, 'error');
    }
};

// ==========================================================================================
// Socket Setup Functions - פונקציות להגדרת Sockets
// ==========================================================================================

// פונקציה ליצירה והגדרת socket להאזנה פסיבית ל-NOTIFY
const createNotifyListenerSocket = (): dgram.Socket => {
    log("Creating NOTIFY listener socket...", 'info');
    const notifySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    notifySocket.on('error', (err) => {
        log(`NOTIFY listener socket error: ${err.stack}`, 'error');
        // שקול אם לצאת מהאפליקציה או רק לסגור את הסוקט הזה
    });

    notifySocket.on('message', (msg, rinfo) => {
        const messageSource = `NOTIFY listener from ${rinfo.address}:${rinfo.port}`;
        log(`Received message on NOTIFY listener from ${rinfo.address}:${rinfo.port}`, 'log');
        const headers = parseSSDPMessage(msg);
        
        // הודעות NOTIFY תמיד יעובדו
        if ((headers['START_LINE'] as string)?.startsWith('NOTIFY')) {
            addOrUpdatePhysicalDevice(headers, messageSource);
        }
        // הודעות M-SEARCH שנקלטות כאן הן ממקורות אחרים, נרשום אותן אך לא נעבד כהתקן
        else if ((headers['START_LINE'] as string)?.startsWith('M-SEARCH')) {
            log(`NOTIFY listener: Detected M-SEARCH from another source: ${rinfo.address}. Start line: ${headers['START_LINE']}`, 'log');
        }
        // תגובות HTTP שנקלטות כאן הן כנראה תגובות multicast ל-M-SEARCH של מישהו אחר
        else if ((headers['START_LINE'] as string)?.startsWith('HTTP/1.1')) {
            log(`NOTIFY listener: Received HTTP response (likely multicast response to another's M-SEARCH): ${headers['START_LINE']}. Source: ${rinfo.address}`, 'warn');
            // אפשר לשקול לעבד גם אותן אם הן מכילות USN ומידע רלוונטי
            if (headers['USN']) {
                 // addOrUpdatePhysicalDevice(headers, messageSource + " (HTTP response)");
            }
        }
        else {
            log(`NOTIFY listener: Received unexpected message type. Start line: ${headers['START_LINE'] || 'Unknown format'}. Full headers: ${JSON.stringify(headers)}`, 'warn');
        }
    });

    notifySocket.on('listening', () => {
        try {
            notifySocket.setBroadcast(true); // נדרש לעיתים
            notifySocket.setMulticastTTL(128);
            notifySocket.addMembership(SSDP_MULTICAST_ADDRESS_IPV4);
            log(`NOTIFY listener socket joined multicast group ${SSDP_MULTICAST_ADDRESS_IPV4}. Listening on ${notifySocket.address().address}:${notifySocket.address().port}`, 'info');
        } catch (e: any) {
            log(`NOTIFY listener: Error setting socket options or joining multicast: ${e.message}`, 'error');
        }
    });
    
    notifySocket.bind(SSDP_PORT, "0.0.0.0", () => {
        log(`NOTIFY listener socket bound to 0.0.0.0:${SSDP_PORT}`, 'info');
    });

    return notifySocket;
};

// פונקציה ליצירה והגדרת socket לשליחת M-SEARCH וקבלת תגובות
const createMSearchClientSocket = (): dgram.Socket => {
    log("Creating M-SEARCH client socket...", 'info');
    const mSearchSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true }); // reuseAddr פחות קריטי כאן כי נקשור לפורט אקראי

    mSearchSocket.on('error', (err) => {
        log(`M-SEARCH client socket error: ${err.stack}`, 'error');
    });

    mSearchSocket.on('message', (msg, rinfo) => {
        const messageSource = `M-SEARCH client from ${rinfo.address}:${rinfo.port}`;
        log(`Received message on M-SEARCH client from ${rinfo.address}:${rinfo.port}`, 'log');
        const headers = parseSSDPMessage(msg);

        // תגובות M-SEARCH (HTTP 200 OK) תמיד יעובדו
        if ((headers['START_LINE'] as string)?.startsWith('HTTP/1.1 200 OK')) {
            addOrUpdatePhysicalDevice(headers, messageSource);
        }
        // אם ה-M-SEARCH client קולט NOTIFY (כי הוא גם הצטרף ל-multicast)
        else if ((headers['START_LINE'] as string)?.startsWith('NOTIFY')) {
            log(`M-SEARCH client: Detected NOTIFY message. Source: ${rinfo.address}. Processing...`, 'log');
            addOrUpdatePhysicalDevice(headers, messageSource + " (detected NOTIFY)");
        }
        else {
            log(`M-SEARCH client: Received unexpected message type. Start line: ${headers['START_LINE'] || 'Unknown format'}. Full headers: ${JSON.stringify(headers)}`, 'warn');
        }
    });
    
    // קשירה לפורט אקראי (undefined) בכל הממשקים
    mSearchSocket.bind(undefined, "0.0.0.0", () => {
        const address = mSearchSocket.address();
        log(`M-SEARCH client socket bound to ${address.address}:${address.port}`, 'info');
        // לאחר הקשירה, אפשר להצטרף לקבוצת המולטיקאסט אם רוצים לקלוט גם NOTIFY דרך הסוקט הזה,
        // אך מכיוון שיש לנו סוקט ייעודי ל-NOTIFY, זה פחות הכרחי כאן.
        // עם זאת, הצטרפות יכולה לעזור לקלוט תגובות M-SEARCH שנשלחות כ-multicast.
        try {
            mSearchSocket.addMembership(SSDP_MULTICAST_ADDRESS_IPV4);
            log(`M-SEARCH client socket joined multicast group ${SSDP_MULTICAST_ADDRESS_IPV4}.`, 'info');
        } catch (e: any) {
            log(`M-SEARCH client: Error joining multicast group: ${e.message}`, 'warn');
        }
    });

    return mSearchSocket;
};

// פונקציה לשליחת הודעת M-SEARCH
const sendMSearchRequest = (socket: dgram.Socket, searchTarget: string = SEARCH_TARGET_ALL) => {
    const mSearchMessageParts = [
        M_SEARCH_REQUEST_START_LINE,
        `HOST: ${M_SEARCH_HOST_HEADER}`,
        `MAN: "ssdp:discover"`,
        `MX: ${MX_VALUE}`,
        `ST: ${searchTarget}`,
        `USER-AGENT: ${USER_AGENT}`,
        '\r\n'
    ];
    const mSearchBuffer = Buffer.from(mSearchMessageParts.join('\r\n'));

    socket.send(mSearchBuffer, 0, mSearchBuffer.length, SSDP_PORT, SSDP_MULTICAST_ADDRESS_IPV4, (err) => {
        if (err) {
            log(`Error sending M-SEARCH (${searchTarget}): ${err.message}`, 'error');
        } else {
            log(`M-SEARCH request (${searchTarget}) sent successfully to ${SSDP_MULTICAST_ADDRESS_IPV4}:${SSDP_PORT}`, 'info');
            log("--- M-SEARCH Message Sent ---", 'log');
            log(mSearchBuffer.toString(), 'log');
            log("-----------------------------", 'log');
        }
    });
};

// ==========================================================================================
// Main Application Logic - לוגיקת האפליקציה הראשית
// ==========================================================================================
async function startDiscovery() {
    logStream = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a' });
    log("Enhanced SSDP Discoverer started.", 'info');
    log(`Logging to: ${LOG_FILE_PATH}`, 'info');
    log(`Discovered devices will be saved to: ${DEVICES_FILE_PATH} on exit.`, 'info');

    const notifySocket = createNotifyListenerSocket();
    const mSearchSocket = createMSearchClientSocket();

    // המתן מעט כדי לוודא שהסוקטים קשורים לפני שליחת M-SEARCH
    await new Promise(resolve => setTimeout(resolve, 1000)); 

    // שלח M-SEARCH ראשוני
    sendMSearchRequest(mSearchSocket, SEARCH_TARGET_ALL);

    // אפשר להוסיף שליחת M-SEARCH תקופתית אם רוצים
    // const mSearchInterval = setInterval(() => {
    //     sendMSearchRequest(mSearchSocket, SEARCH_TARGET_ALL);
    // }, 60 * 1000); // כל דקה

    log("Discovery running. Press Ctrl+C to stop and save devices.", 'info');

    // טיפול בסגירה נקייה (SIGINT)
    const cleanupAndExit = (signal: string) => {
        log(`\n${signal} received. Shutting down...`, 'info');

        // if (mSearchInterval) clearInterval(mSearchInterval);

        // סגירת הסוקטים
        const closeSocket = (socket: dgram.Socket, name: string): Promise<void> => {
            return new Promise((resolve) => {
                if (socket) {
                    try {
                        // עזיבת קבוצת המולטיקאסט אם הצטרף
                        if (name === "NOTIFY listener" || name === "M-SEARCH client") { // בהנחה ששניהם הצטרפו
                             socket.dropMembership(SSDP_MULTICAST_ADDRESS_IPV4);
                             log(`${name} socket left multicast group.`, 'info');
                        }
                        socket.close(() => {
                            log(`${name} socket closed.`, 'info');
                            resolve();
                        });
                    } catch (e: any) {
                        log(`Error closing ${name} socket: ${e.message}`, 'warn');
                        resolve(); // המשך בכל מקרה
                    }
                } else {
                    resolve();
                }
            });
        };

        Promise.all([
            closeSocket(notifySocket, "NOTIFY listener"),
            closeSocket(mSearchSocket, "M-SEARCH client")
        ]).then(() => {
            saveDiscoveredDevices();
            if (logStream && !logStream.destroyed) {
                logStream.end(() => {
                    console.log("Log stream closed. Exiting.");
                    process.exit(0);
                });
            } else {
                process.exit(0);
            }
        });
    };

    process.on('SIGINT', () => cleanupAndExit('SIGINT'));
    process.on('SIGTERM', () => cleanupAndExit('SIGTERM'));
}

// ==========================================================================================
// Script Execution - הרצת הסקריפט
// ==========================================================================================
startDiscovery().catch(error => {
    log(`Unhandled error in startDiscovery: ${error instanceof Error ? error.message : String(error)}`, 'error');
    if (logStream && !logStream.destroyed) {
        logStream.end(() => process.exit(1));
    } else {
        process.exit(1);
    }
});