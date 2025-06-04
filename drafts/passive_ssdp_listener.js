"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// קובץ זה מכיל סקריפט פשוט להאזנה פסיבית להודעות SSDP Multicast.
const dgram = __importStar(require("dgram"));
const node_os_1 = require("node:os");
// import * as process from 'node:process'; // הסרת ייבוא מפורש, process אמור להיות גלובלי
// ==========================================================================================
// Constants - קבועים
// ==========================================================================================
const SSDP_PORT = 1900;
const SSDP_MULTICAST_ADDRESS_IPV4 = "239.255.255.250";
const HOST_ADDRESS = ['0.0.0.0', '::', '10.100.102.106'][0]; // האזנה בכל ממשקי הרשת
const M_SEARCH_HOST_HEADER = `${SSDP_MULTICAST_ADDRESS_IPV4}:${SSDP_PORT}`;
const M_SEARCH_REQUEST_START_LINE = "M-SEARCH * HTTP/1.1";
const MX_VALUE = 3; // שניות להמתנה לתגובה מהתקנים (מומלץ בין 1 ל-5)
const SEARCH_TARGET_ALL = "ssdp:all"; // חיפוש כללי
const USER_AGENT = `drafts/passive_ssdp_listener.ts/0.1 Node.js/${process.version}`;
const NETWORK_FAMELY_TYPE = ['4', '6'][0];
const APIPA_ADDRESS_v4 = '169.254.';
const APIPA_ADDRESS_v6 = 'fe80::';
// ==========================================================================================
// Filter Configuration - הגדרות סינון
// ==========================================================================================
const KNOWN_DEVICE_TYPES = [
    "ssdp:all",
    "upnp:rootdevice",
    "urn:schemas-upnp-org:device:Basic:1",
    "urn:schemas-upnp-org:device:MediaServer:1",
    "urn:schemas-upnp-org:service:ContentDirectory:1",
    "urn:schemas-upnp-org:service:ConnectionManager:1",
    "urn:schemas-upnp-org:device:MediaRenderer:1",
    "urn:schemas-upnp-org:service:AVTransport:1",
    "urn:schemas-upnp-org:service:RenderingControl:1",
    "urn:dial-multiscreen-org:service:dial:1",
    "urn:lge-com:service:webos-second-screen:1", // LG Specific
    // ניתן להוסיף עוד סוגים לפי הצורך
];
let currentFilterType = null;
let isFilteringEnabled = false;
// ==========================================================================================
// Main Script Logic - לוגיקת הסקריפט הראשית
// ==========================================================================================
const log = (message, level = 'log') => {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    if (level === 'error') {
        console.error(formattedMessage);
    }
    else if (level === 'warn') {
        console.warn(formattedMessage);
    }
    else {
        console.log(formattedMessage);
    }
};
const setSsdpFilter = (deviceType) => {
    if (deviceType && KNOWN_DEVICE_TYPES.includes(deviceType)) {
        currentFilterType = deviceType;
        isFilteringEnabled = true;
        log(`SSDP filter enabled for device type: ${currentFilterType}`, 'log');
    }
    else if (deviceType === null) {
        currentFilterType = null;
        isFilteringEnabled = false;
        log("SSDP filter disabled.", 'log');
    }
    else if (deviceType) {
        log(`Invalid or unknown device type for filter: ${deviceType}. Filter remains unchanged.`, 'warn');
        log(`Available types: ${KNOWN_DEVICE_TYPES.join(', ')}`, 'warn');
    }
};
const sendMSearchRequest = (socket, searchTarget = SEARCH_TARGET_ALL) => {
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
        }
        else {
            log(`M-SEARCH request (${searchTarget}) sent successfully to ${SSDP_MULTICAST_ADDRESS_IPV4}:${SSDP_PORT}`, 'log');
            log("--- M-SEARCH Message Sent ---", 'log');
            log(mSearchBuffer.toString(), 'log');
            log("-----------------------------", 'log');
        }
    });
};
async function main() {
    //setSsdpFilter('urn:schemas-upnp-org:device:MediaRenderer:1');
    log("Starting passive SSDP listener script...");
    const networkInterfacesList = (0, node_os_1.networkInterfaces)();
    const udpFamelyType = 'udp' + NETWORK_FAMELY_TYPE;
    const networkFamelyType = 'IPv' + NETWORK_FAMELY_TYPE;
    // 1. יצירה והגדרת Socket UDP
    // חשוב להשתמש ב-reuseAddr: true כדי לאפשר למספר מאזינים על אותה כתובת/פורט (שימושי לבדיקות)
    const socket = dgram.createSocket({ type: udpFamelyType, reuseAddr: true, });
    socket.on('error', (err) => {
        log(`Socket error:\n${err.stack}`, "error");
        socket.close();
        process.exit(1);
    });
    socket.on('listening', () => {
        const address = socket.address();
        log(`Socket listening on ${address.address}:${address.port}`, "log");
        try {
            // נדרש לעיתים עבור multicast, תלוי במערכת ההפעלה
            socket.setBroadcast(true);
            // TTL גבוה מספיק לרשת מקומית, אך לא קריטי להאזנה פסיבית אם לא שולחים
            socket.setMulticastTTL(128);
            // הצטרפות לקבוצת המולטיקאסט - זה השלב הקריטי להאזנה להודעות NOTIFY
            log('Connected to multicast address...');
            for (const [interfaceName, interfaceInfoList] of Object.entries(networkInterfacesList)) {
                if (!interfaceInfoList)
                    continue;
                for (const interfaceInfo of interfaceInfoList) {
                    if (!interfaceInfo.internal &&
                        !interfaceInfo.address.startsWith(APIPA_ADDRESS_v4) &&
                        !interfaceInfo.address.startsWith(APIPA_ADDRESS_v6) &&
                        interfaceInfo.family === networkFamelyType) {
                        log('interface "' + interfaceName + '" add multicast on address ' + interfaceInfo.address, 'log');
                        socket.addMembership(SSDP_MULTICAST_ADDRESS_IPV4, interfaceInfo.address);
                    }
                }
            }
            socket.setMulticastInterface(HOST_ADDRESS);
            // socket.addSourceSpecificMembership
            log(`Successfully joined multicast group ${SSDP_MULTICAST_ADDRESS_IPV4}`, "log");
            log("Now passively listening for SSDP NOTIFY messages (and M-SEARCH from others)...", "log");
            log("Press Ctrl+C to stop.", "log");
            globalThis.socket = socket;
            globalThis.sendMSearchRequest = sendMSearchRequest;
            globalThis.setSsdpFilter = setSsdpFilter;
            globalThis.KNOWN_DEVICE_TYPES = KNOWN_DEVICE_TYPES;
            globalThis.getIsFilteringEnabled = () => isFilteringEnabled;
            globalThis.getCurrentFilterType = () => currentFilterType;
        }
        catch (e) {
            log(`Error setting socket options or joining multicast group: ${e.message}`, "error");
            log("Listener might not receive multicast messages.", "warn");
        }
    });
    // פונקציית עזר לניתוח כותרות מהודעת SSDP
    const getSsdpHeaderValue = (message, headerName) => {
        const lines = message.split('\r\n');
        for (const line of lines) {
            if (line.toUpperCase().startsWith(headerName.toUpperCase() + ':')) {
                return line.substring(headerName.length + 1).trim();
            }
        }
        return null;
    };
    socket.on('message', (msg, rinfo) => {
        const responseText = msg.toString('utf-8');
        if (isFilteringEnabled && currentFilterType) {
            const ntHeader = getSsdpHeaderValue(responseText, 'NT'); // Notification Type
            const stHeader = getSsdpHeaderValue(responseText, 'ST'); // Search Target
            const usnHeader = getSsdpHeaderValue(responseText, 'USN'); // Unique Service Name
            let deviceIdentifier = null;
            if (ntHeader) {
                deviceIdentifier = ntHeader;
            }
            else if (stHeader) {
                deviceIdentifier = stHeader;
            }
            else if (usnHeader) {
                // USN בדרך כלל מכיל UUID ואז את סוג ההתקן
                // לדוגמה: uuid:abcdefgh-1234-abcd-1234-abcdefghijkl::urn:schemas-upnp-org:device:MediaServer:1
                const parts = usnHeader.split('::');
                if (parts.length > 1) {
                    deviceIdentifier = parts.pop() || null; // קח את החלק האחרון שאמור להיות סוג ההתקן
                }
                else {
                    deviceIdentifier = usnHeader; // אם אין '::', נסה להשתמש ב-USN כולו (פחות סביר שיתאים)
                }
            }
            // בדיקה אם ה-identifier מכיל את ה-currentFilterType
            // זה מאפשר התאמה גם אם ה-filter הוא "ssdp:all" וההודעה היא ספציפית יותר,
            // או אם ה-filter הוא ספציפי וההודעה מכילה אותו.
            if (deviceIdentifier && deviceIdentifier.includes(currentFilterType)) {
                log(`\n\n[FILTERED] Received message from: ${rinfo.address}:${rinfo.port} (size: ${rinfo.size} bytes)` + '\n' +
                    `Matches filter: "${currentFilterType}" (Found in NT/ST/USN: "${deviceIdentifier}")` + '\n' +
                    "--- Message Start ---" +
                    '\n' + responseText +
                    "--- Message End ---" + '\n', "log");
            }
            else {
                // אם הסינון מופעל וההודעה לא תואמת, אל תדפיס אותה (או הדפס הודעת דיבאג אם רוצים)
                // log(`Message from ${rinfo.address}:${rinfo.port} filtered out (type: ${deviceIdentifier}, filter: ${currentFilterType})`, 'log');
            }
        }
        else {
            // אם הסינון כבוי, הדפס את כל ההודעות
            log(`\n\nReceived message from: ${rinfo.address}:${rinfo.port} (size: ${rinfo.size} bytes)` + '\n' +
                "--- Message Start ---" +
                '\n' + responseText +
                "--- Message End ---" + '\n', "log");
        }
    });
    socket.on('connect', () => {
        log('connected!');
    });
    // 2. קשירת ה-Socket
    // חשוב לקשור לפורט SSDP_PORT (1900) ולכתובת HOST_ADDRESS (0.0.0.0)
    // כדי לקלוט הודעות multicast המיועדות לפורט זה בכל ממשקי הרשת.
    try {
        socket.bind(SSDP_PORT, HOST_ADDRESS, () => {
            log(`Socket bind initiated for ${HOST_ADDRESS}:${SSDP_PORT}. Waiting for 'listening' event.`, "log");
        });
    }
    catch (e) {
        log(`Critical error on socket.bind(): ${e.message}`, "error");
        process.exit(1);
    }
    // 3. טיפול בסגירה נקייה (SIGINT)
    process.on('SIGINT', () => {
        log("\nSIGINT received. Shutting down listener...", "log");
        try {
            // חשוב לעזוב את קבוצת המולטיקאסט לפני סגירת הסוקט
            socket.dropMembership(SSDP_MULTICAST_ADDRESS_IPV4);
            log(`Left multicast group ${SSDP_MULTICAST_ADDRESS_IPV4}`, "log");
        }
        catch (e) {
            log(`Error leaving multicast group: ${e.message}`, "warn");
        }
        socket.close(() => {
            log("Socket closed. Exiting.", "log");
            process.exit(0);
        });
    });
}
main().catch(err => {
    const timestamp = new Date().toISOString();
    const errorMessage = `[${timestamp}] [ERROR] Unhandled error in main function: ${err instanceof Error ? err.message : String(err)}`;
    console.error(errorMessage);
    process.exit(1);
});
