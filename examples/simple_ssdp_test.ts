// קובץ זה מכיל סקריפט פשוט לבדיקת שליחת בקשות SSDP וקבלת תגובות.
import * as dgram from 'dgram';
import * as process from 'process'; // ייבוא מפורש של process
import * as fs from 'fs';
import * as path from 'path';

// ==========================================================================================
// Constants - קבועים
// ==========================================================================================
const SSDP_PORT = 1900;
const SSDP_MULTICAST_ADDRESS_IPV4 = "239.255.255.250";
const M_SEARCH_REQUEST_START_LINE = "M-SEARCH * HTTP/1.1";
const MX_VALUE = 1; // שניות להמתנה לתגובה מהתקנים
const SEARCH_TARGET = "ssdp:all"; // חיפוש כללי
const LISTENING_DURATION_MS = 30 * 1000; // 5 שניות
const USER_AGENT = `SimpleSSDPTestScript/0.1 Node.js/${process.version}`;
const LOG_FILE_NAME = 'ssdp_responses.log';
// קביעת נתיב מלא לקובץ הלוג בתיקייה הנוכחית של הסקריפט
const LOG_FILE_PATH = path.join(__dirname, LOG_FILE_NAME);

// ==========================================================================================
// Main Script Logic - לוגיקת הסקריפט הראשית
// ==========================================================================================


// יצירת stream לכתיבה לקובץ הלוג. 'a' פותח את הקובץ להוספה, יוצר אותו אם לא קיים.
const logStream = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a' });

// פונקציית לוגינג משולבת
const logAndWrite = (message: string, level: 'log' | 'error' | 'warn' = 'log') => {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (level === 'error') {
        console.error(formattedMessage);
    } else if (level === 'warn') {
        console.warn(formattedMessage);
    } else {
        console.log(formattedMessage);
    }
    logStream.write(formattedMessage + '\n');
};


async function main() {

    logAndWrite("Starting SSDP discovery script...");

    // 1. בניית הודעת M-SEARCH
    const mSearchHost = `${SSDP_MULTICAST_ADDRESS_IPV4}:${SSDP_PORT}`;
    const mSearchMessageParts = [
        M_SEARCH_REQUEST_START_LINE,
        `HOST: ${mSearchHost}`,
        `MAN: "ssdp:discover"`,
        `MX: ${MX_VALUE}`,
        `ST: ${SEARCH_TARGET}`,
        `USER-AGENT: ${USER_AGENT}`,
        '\r\n' // שורה ריקה בסוף הכותרות, לפני גוף ההודעה (שאין כאן)
    ];
    const mSearchBuffer = Buffer.from(mSearchMessageParts.join('\r\n'));

    // 2. יצירה והגדרת Socket UDP
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let discoveredDevicesCount = 0;
    let listeningTimeout: NodeJS.Timeout | null = null;
    let sendMessageInterval: NodeJS.Timeout | null = null;

    const sendSearchMessage = (socket: dgram.Socket) => {
        socket.send(mSearchBuffer, 0, mSearchBuffer.length, SSDP_PORT, SSDP_MULTICAST_ADDRESS_IPV4, (err) => {
            if (err) {
                logAndWrite(`Error sending M-SEARCH: ${err.message}`, "error");
                cleanupAndExit(1);
            } else {
                logAndWrite(`M-SEARCH request sent successfully to ${SSDP_MULTICAST_ADDRESS_IPV4}:${SSDP_PORT}`, "log");
                logAndWrite("--- M-SEARCH Message Sent ---", "log");
                logAndWrite("\n\n" + mSearchBuffer.toString(), "log");
                logAndWrite("-----------------------------", "log");
                logAndWrite(`\nListening for responses for ${LISTENING_DURATION_MS / 1000} seconds...`, "log");
            }
        });
    }

    // פונקציית ניקוי וסגירה
    const cleanupAndExit = (exitCode = 0) => {
        logAndWrite("\nCleaning up and exiting...", "log");
        if (listeningTimeout) {
            clearTimeout(listeningTimeout);
            listeningTimeout = null;
        }

        if (sendMessageInterval) {
            clearInterval(sendMessageInterval);
            sendMessageInterval = null;
        }

        const closeLogStreamAndExit = () => {
            // ודא שה-stream עדיין פתוח לפני ניסיון סגירה
            if (logStream && !logStream.destroyed) {
                logStream.end(() => {
                    // אין להשתמש ב-logAndWrite כאן כי ה-stream כבר נסגר או בתהליך סגירה
                    const finalMsg = `[${new Date().toISOString()}] [LOG] Log stream closed. Exiting with code ${exitCode}.`;
                    console.log(finalMsg); // הדפסה אחרונה לקונסול
                    process.exit(exitCode);
                });
            } else {
                // אם ה-stream כבר סגור או לא היה קיים
                const finalMsg = `[${new Date().toISOString()}] [LOG] Log stream already closed or not initialized. Exiting with code ${exitCode}.`;
                console.log(finalMsg);
                process.exit(exitCode);
            }
        };

        if (socket) {
            try {
                socket.removeAllListeners(); // הסר מאזינים כדי למנוע פעולות נוספות
                socket.close(() => {
                    logAndWrite("Socket closed.", "log");
                    closeLogStreamAndExit();
                });
            } catch (e: any) {
                logAndWrite(`Error closing socket: ${e.message}`, "error");
                closeLogStreamAndExit(); // נסה לסגור את הלוג גם אם סגירת הסוקט נכשלה
            }
        } else {
            logAndWrite("Socket was not initialized or already closed.", "warn");
            closeLogStreamAndExit();
        }
    };

    socket.on('error', (err) => {
        logAndWrite(`Socket error:\n${err.stack}`, "error");
        cleanupAndExit(1); // יציאה עם קוד שגיאה
    });

    socket.on('listening', () => {
        const address = socket.address();
        logAndWrite(`Socket listening on ${address.address}:${address.port}`, "log");
        logAndWrite("Attempting to send M-SEARCH request...", "log");

        // הגדרות נוספות לסוקט לפני השליחה (אופציונלי אך מומלץ ל-multicast)
        try {
            socket.setBroadcast(true); // נדרש לפעמים עבור multicast, תלוי במערכת ההפעלה
            socket.setMulticastTTL(128); // TTL גבוה מספיק לרשת מקומית
            socket.addMembership(SSDP_MULTICAST_ADDRESS_IPV4); // הצטרפות לקבוצת המולטיקאסט
            logAndWrite(`Joined multicast group ${SSDP_MULTICAST_ADDRESS_IPV4}`, "log");
        } catch (e: any) {
            logAndWrite(`Warning: Could not set some socket options (broadcast/multicast TTL/membership). Discovery might be affected. Error: ${e.message}`, "warn");
        }

        // sendMessageInterval = setInterval(() => sendSearchMessage(socket), 2000);
        sendSearchMessage(socket);

    });

    socket.on('message', (msg, rinfo) => {
        discoveredDevicesCount++;
        const responseText = msg.toString('utf-8');
        logAndWrite(`\n[${discoveredDevicesCount}] Received response from: ${rinfo.address}:${rinfo.port}`, "log");
        logAndWrite("--- Response Message ---", "log");
        logAndWrite(responseText, "log");
        logAndWrite("------------------------", "log");
    });

    // 3. קשירת ה-Socket
    try {
        // קשירה לפורט 0 (בחירה אוטומטית של פורט פנוי) ולכל הממשקים (0.0.0.0)
        socket.bind(undefined, undefined, () => { // שימוש ב-undefined כדי לאפשר ל-Node לבחור פורט וכתובת מתאימים
            logAndWrite("Socket bind initiated. Waiting for 'listening' event.", "log");
        });
    } catch (e: any) {
        logAndWrite(`Critical error on socket.bind(): ${e.message}`, "error");
        cleanupAndExit(1);
    }


    // 4. ניהול זמן האזנה וסיום
    listeningTimeout = setTimeout(() => {
        logAndWrite(`\nFinished listening after ${LISTENING_DURATION_MS / 1000} seconds.`, "log");
        logAndWrite(`Total devices responded: ${discoveredDevicesCount}`, "log");
        cleanupAndExit(0);
    }, LISTENING_DURATION_MS);

    // 5. טיפול בסגירה נקייה (SIGINT)
    process.on('SIGINT', () => {
        logAndWrite("\nSIGINT received.", "log");
        cleanupAndExit(0);
    });

    logAndWrite("Script setup complete. Binding socket...", "log");
}

main().catch(err => {
    // בשלב זה, logAndWrite עשוי לא להיות מוגדר אם השגיאה היא לפני הגדרתו
    // לכן, נשתמש ב-console.error ישירות ונוודא יציאה.
    const timestamp = new Date().toISOString();
    const errorMessage = `[${timestamp}] [ERROR] Unhandled error in main function: ${err instanceof Error ? err.message : String(err)}`;
    console.error(errorMessage);
    // ננסה לכתוב לקובץ אם ה-stream כבר נוצר, אך זה לא מובטח
    // במקרה של שגיאה קריטית מאוד מוקדמת, ייתכן שקובץ הלוג לא יכיל את השגיאה הזו.
    try {
        if (fs.existsSync(LOG_FILE_PATH)) { // בדוק אם הקובץ נוצר (או היה קיים)
            fs.appendFileSync(LOG_FILE_PATH, errorMessage + '\n');
        }
    } catch (writeError) {
        console.error(`[${timestamp}] [ERROR] Additionally, failed to write unhandled error to log file: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
    }
    process.exit(1);
});