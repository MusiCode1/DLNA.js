// examples/discoverAndLogDevices.ts
// סקריפט לגילוי התקני UPnP ושמירתם לקובץ JSON Lines באופן מיידי.
 
import { createModuleLogger } from '../src/logger'; // הוספת ייבוא הלוגר
import { discoverAndProcessDevices, UpnpDevice } from '../src/upnpDiscoveryService';
import * as fs from 'fs/promises';
import * as path from 'path';
 
const logger = createModuleLogger('discoverAndLogDevices'); // יצירת מופע לוגר
const OUTPUT_FILE_NAME = 'discovered_devices_log.jsonl';
const DISCOVERY_DURATION_MS = 60 * 1000; // 60 שניות

async function discoverAndLog() {
    const outputFilePath = path.join(__dirname, '..', OUTPUT_FILE_NAME); // שמירה בתיקייה הראשית
    logger.info(`Starting UPnP device discovery for ${DISCOVERY_DURATION_MS / 1000} seconds.`);
    logger.info(`Discovered devices will be logged to: ${outputFilePath}`);
 
    try {
        // ננקה את הקובץ אם הוא קיים, כדי להתחיל רישום נקי בכל הרצה
        await fs.writeFile(outputFilePath, '', 'utf-8');
        logger.info(`Cleared previous log file (if existed): ${outputFilePath}`);
    } catch (err) {
        // אם הקובץ לא קיים, זה בסדר. אם יש שגיאה אחרת, נדפיס אותה.
        if (err instanceof Error && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
            logger.error(`Error clearing log file: ${err.message}`);
        }
    }
 
    let deviceCount = 0;
 
    const onDeviceFoundCallback = async (device: UpnpDevice) => {
        deviceCount++;
        logger.info(`[${deviceCount}] Device processed: ${device.friendlyName} (Type: ${device.deviceType}, URL: ${device.descriptionUrl})`);
        try {
            const deviceJsonString = JSON.stringify(device);
            await fs.appendFile(outputFilePath, deviceJsonString + '\n', 'utf-8');
            logger.info(`   -> Logged to ${OUTPUT_FILE_NAME}`);
        } catch (error: any) {
            logger.error(`   -> Error writing device to log file: ${error.message}`);
        }
    };
 
    try {
        await discoverAndProcessDevices(
            "ssdp:all", // 'upnp:rootdevices' או 'ssdp:all'
            DISCOVERY_DURATION_MS,
            onDeviceFoundCallback,
            {
                includeIPv6: true,
                discoveryTimeoutPerInterfaceMs: DISCOVERY_DURATION_MS, // הגדרת הטיימאאוט לממשק לערך הגלובלי
                
            }
        );
        logger.info(`\nDiscovery process finished after ${DISCOVERY_DURATION_MS / 1000} seconds.`);
        logger.info(`Total devices processed and attempted to log: ${deviceCount}`);
        if (deviceCount > 0) {
            logger.info(`Check the log file: ${outputFilePath}`);
        } else {
            logger.info(`No devices were discovered and processed during this run.`);
        }
    } catch (error: any) {
        logger.error(`An error occurred during the discovery process: ${error.message}`, { stack: error.stack });
    }
}
 
discoverAndLog();