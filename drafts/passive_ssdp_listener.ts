// קובץ זה מכיל סקריפט פשוט להאזנה פסיבית להודעות SSDP Multicast.
import * as dgram from 'dgram';
import { networkInterfaces, } from "node:os";
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
// Main Script Logic - לוגיקת הסקריפט הראשית
// ==========================================================================================

const log = (message: string, level: 'log' | 'error' | 'warn' = 'log') => {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (level === 'error') {
        console.error(formattedMessage);
    } else if (level === 'warn') {
        console.warn(formattedMessage);
    } else {
        console.log(formattedMessage);
    }
};

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
            log(`M-SEARCH request (${searchTarget}) sent successfully to ${SSDP_MULTICAST_ADDRESS_IPV4}:${SSDP_PORT}`, 'log');
            log("--- M-SEARCH Message Sent ---", 'log');
            log(mSearchBuffer.toString(), 'log');
            log("-----------------------------", 'log');
        }
    });
};

async function main() {
    log("Starting passive SSDP listener script...");

    const networkInterfacesList = networkInterfaces();

    const udpFamelyType = 'udp' + NETWORK_FAMELY_TYPE as dgram.SocketType;
    const networkFamelyType = 'IPv' + NETWORK_FAMELY_TYPE as 'IPv4' | 'IPv6';


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
            log('Connected to multicast address...')

            for (const [interfaceName, interfaceInfoList] of Object.entries(networkInterfacesList)) {
                if (!interfaceInfoList) continue;

                for (const interfaceInfo of interfaceInfoList) {

                    if (
                        !interfaceInfo.internal &&
                        !interfaceInfo.address.startsWith(APIPA_ADDRESS_v4) &&
                        !interfaceInfo.address.startsWith(APIPA_ADDRESS_v6) &&
                        interfaceInfo.family === networkFamelyType
                    ) {
                        log('interface ' + interfaceName + ' add multicast on address ' + interfaceInfo.address, 'log');
                        socket.addMembership(SSDP_MULTICAST_ADDRESS_IPV4, interfaceInfo.address);
                    }

                }

            }

            socket.setMulticastInterface(HOST_ADDRESS);

            // socket.addSourceSpecificMembership
            log(`Successfully joined multicast group ${SSDP_MULTICAST_ADDRESS_IPV4}`, "log");
            log("Now passively listening for SSDP NOTIFY messages (and M-SEARCH from others)...", "log");
            log("Press Ctrl+C to stop.", "log");

            (globalThis as any).socket = socket;
            (globalThis as any).sendMSearchRequest = sendMSearchRequest;
        } catch (e: any) {
            log(`Error setting socket options or joining multicast group: ${e.message}`, "error");
            log("Listener might not receive multicast messages.", "warn");
        }
    });

    socket.on('message', (msg, rinfo) => {
        const responseText = msg.toString('utf-8');

        log(
            `\n\nReceived message from: ${rinfo.address}:${rinfo.port} (size: ${rinfo.size} bytes)` + '\n' +
            "--- Message Start ---" +
            '\n' + responseText +
            "--- Message End ---" + '\n',
            "log");

    });

    socket.on('connect', () => {
        log('connected!')
    })

    // 2. קשירת ה-Socket
    // חשוב לקשור לפורט SSDP_PORT (1900) ולכתובת HOST_ADDRESS (0.0.0.0)
    // כדי לקלוט הודעות multicast המיועדות לפורט זה בכל ממשקי הרשת.
    try {
        socket.bind(SSDP_PORT, HOST_ADDRESS, () => {
            log(`Socket bind initiated for ${HOST_ADDRESS}:${SSDP_PORT}. Waiting for 'listening' event.`, "log");
        });
    } catch (e: any) {
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
        } catch (e: any) {
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