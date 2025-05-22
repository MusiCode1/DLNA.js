// examples/discoverMediaServers.ts
// סקריפט לגילוי התקני UPnP והדפסת התקני MediaServer בלבד.

import { createModuleLogger } from '../src/logger'; // הוספת ייבוא הלוגר
import { discoverAndProcessDevices, UpnpDevice } from '../src/upnpDiscoveryService';

const logger = createModuleLogger('discoverMediaServers'); // יצירת מופע לוגר
const DISCOVERY_DURATION_MS = 30 * 1000; // 10 שניות לגילוי מהיר יותר בדוגמה זו
const MEDIA_SERVER_DEVICE_TYPE = 'urn:schemas-upnp-org:device:MediaServer:1';

process.env.LOG_MODULES = 'discoverMediaServers'; // הגדרת מודול הלוגר לדוגמה זו
process.env.LOG_LEVEL = 'silly'; // הגדרת רמת הלוג לדוגמה זו

async function discoverMediaServers() {
    logger.info(`Starting UPnP device discovery for ${DISCOVERY_DURATION_MS / 1000} seconds.`);
    logger.info(`Looking for devices of type: ${MEDIA_SERVER_DEVICE_TYPE}`);

    let totalDeviceCount = 0;
    const mediaServers: UpnpDevice[] = []; // מערך לאחסון התקני מדיה סרבר

    const onDeviceFoundCallback = async (device: UpnpDevice) => {
        totalDeviceCount++;
        // logger.debug(`Device found: ${device.friendlyName} (Type: ${device.deviceType}, URL: ${device.descriptionUrl})`);

        if (device.deviceType === MEDIA_SERVER_DEVICE_TYPE) {
            mediaServers.push(device); // הוספת ההתקן למערך
            logger.info(`MediaServer Discovered: ${device.friendlyName} (Added to list)`);
        }
    };

    try {
        await discoverAndProcessDevices(
            "ssdp:all", // חיפוש כל ההתקנים
            DISCOVERY_DURATION_MS,
            onDeviceFoundCallback,
            {
                includeIPv6: false,
                discoveryTimeoutPerInterfaceMs: DISCOVERY_DURATION_MS
            }
        );
        logger.info(`\nDiscovery process finished after ${DISCOVERY_DURATION_MS / 1000} seconds.`);
        logger.info(`Total devices processed: ${totalDeviceCount}`);
        logger.info(`Total MediaServers found: ${mediaServers.length}`);

        if (mediaServers.length > 0) {
            logger.info("\nList of discovered MediaServers:");
            mediaServers.forEach((server, index) => {
                logger.info(`[${index + 1}] ${server.friendlyName}`);
                logger.info(`    URL: ${server.descriptionUrl}`);
                logger.info(`    UDN: ${server.UDN}`);
                logger.info(`    Device Type: ${server.deviceType}`);
            });
        } else {
            logger.info(`No MediaServer devices were discovered during this run.`);
        }
    } catch (error: any) {
        logger.error(`An error occurred during the discovery process: ${error.message}`, { stack: error.stack });
    }
}

discoverMediaServers();