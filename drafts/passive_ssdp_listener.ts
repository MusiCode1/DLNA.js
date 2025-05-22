// קובץ זה מכיל סקריפט פשוט להאזנה פסיבית להודעות SSDP Multicast.
import * as dgram from 'dgram';
// import * as process from 'node:process'; // הסרת ייבוא מפורש, process אמור להיות גלובלי

// ==========================================================================================
// Constants - קבועים
// ==========================================================================================
const SSDP_PORT = 1900;
const SSDP_MULTICAST_ADDRESS_IPV4 = "239.255.255.250";
const HOST_ADDRESS = "0.0.0.0"; // האזנה בכל ממשקי הרשת

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

async function main() {
    log("Starting passive SSDP listener script...");

    // 1. יצירה והגדרת Socket UDP
    // חשוב להשתמש ב-reuseAddr: true כדי לאפשר למספר מאזינים על אותה כתובת/פורט (שימושי לבדיקות)
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

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
            socket.addMembership(SSDP_MULTICAST_ADDRESS_IPV4); 
            log(`Successfully joined multicast group ${SSDP_MULTICAST_ADDRESS_IPV4}`, "log");
            log("Now passively listening for SSDP NOTIFY messages (and M-SEARCH from others)...", "log");
            log("Press Ctrl+C to stop.", "log");
        } catch (e: any) {
            log(`Error setting socket options or joining multicast group: ${e.message}`, "error");
            log("Listener might not receive multicast messages.", "warn");
        }
    });

    socket.on('message', (msg, rinfo) => {
        const responseText = msg.toString('utf-8');
        log(`\nReceived message from: ${rinfo.address}:${rinfo.port} (size: ${rinfo.size} bytes)`, "log");
        log("--- Message Start ---", "log");
        log(responseText);
        log("--- Message End ---", "log");
    });

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