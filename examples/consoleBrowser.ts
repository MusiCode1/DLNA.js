import {
    discoverAndProcessDevices,
    UpnpDevice,
    UpnpService,
    MEDIA_SERVER_DEVICE,
    CONTENT_DIRECTORY_SERVICE, // ייבוא זה נחוץ לזיהוי סוג השירות
    ContentDirectoryService,
    BrowseFlag,
    // BrowseResult, // יוגדר בתוך הפונקציה או ייובא אם יש שימוש ישיר בטיפוס מחוץ לה
    DidlLiteContainer, // לזיהוי סוג פריט
    DidlLiteObject,   // לזיהוי סוג פריט
    UpnpSoapClient,
    // createLogger // אופציונלי, נוסיף אם נחליט להשתמש בלוגר ייעודי
} from '../src/index';

// Node.js built-in module for reading user input
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

// משתנים גלובליים שישמשו לאחסון השרת הנבחר ופרטי שירות ה-CDS שלו
let selectedServerDevice: UpnpDevice | null = null;
let selectedCdsServiceInfo: UpnpService | null = null;
let globalSoapClient: UpnpSoapClient | null = null;

/**
 * פונקציה ראשית אסינכרונית להרצת הלוגיקה של דפדפן הקונסול.
 */
async function main() {
    console.log('Starting UPnP MediaServer discovery...');
    const foundMediaServers: UpnpDevice[] = [];

    try {
        await discoverAndProcessDevices(
            MEDIA_SERVER_DEVICE,
            5000, // Timeout for discovery
            (device: UpnpDevice) => {
                // נוודא שזה באמת שרת מדיה ובדיקה נוספת שקיים אובייקט services
                if (device.deviceType.includes(MEDIA_SERVER_DEVICE) && device.services) {
                    let cdsCheck: UpnpService | undefined;
                    for (const serviceId in device.services) {
                        const service = device.services[serviceId];
                        if (service.serviceType.includes(CONTENT_DIRECTORY_SERVICE)) {
                            cdsCheck = service;
                            break;
                        }
                    }
                    if (cdsCheck) {
                        console.log(`Found Media Server: ${device.friendlyName} (UDN: ${device.UDN})`);
                        foundMediaServers.push(device);
                    } else {
                        // console.log(`Device ${device.friendlyName} is a MediaServer but lacks ContentDirectory service.`);
                    }
                }
            },
            {
                discoveryTimeoutPerInterfaceMs: 10 * 1000
            }
        );

        if (foundMediaServers.length === 0) {
            console.log('No Media Servers found on the network.');
            return;
        }

        console.log('\nAvailable Media Servers:');
        foundMediaServers.forEach((server, index) => {
            console.log(`${index + 1}. ${server.friendlyName} (IP: ${server.sourceIpAddress || 'N/A'})`);
        });

        const rl = readline.createInterface({ input, output });
        let serverChoice = -1;

        while (serverChoice < 0 || serverChoice >= foundMediaServers.length) {
            const answer = await rl.question(`Please enter the number of the server to browse (1-${foundMediaServers.length}): `);
            const choice = parseInt(answer, 10) - 1;
            if (choice >= 0 && choice < foundMediaServers.length) {
                serverChoice = choice;
            } else {
                console.log('Invalid selection. Please try again.');
            }
        }
        rl.close();

        selectedServerDevice = foundMediaServers[serverChoice];
        console.log(`\nSelected server: ${selectedServerDevice.friendlyName}`);

        if (!selectedServerDevice.services) {
            console.error('Error: Selected server does not have a services object.');
            return;
        }

        let cdsService: UpnpService | undefined;
        for (const serviceId in selectedServerDevice.services) {
            const service = selectedServerDevice.services[serviceId];
            if (service.serviceType.includes(CONTENT_DIRECTORY_SERVICE)) {
                cdsService = service;
                break;
            }
        }
        selectedCdsServiceInfo = cdsService || null;

        if (!selectedCdsServiceInfo) {
            console.error(`Error: ContentDirectory service not found on ${selectedServerDevice.friendlyName}.`);
            return;
        }

        if (!selectedCdsServiceInfo.controlURL || !selectedCdsServiceInfo.SCPDURL) {
            console.error('Error: ContentDirectory service is missing controlURL or SCPDURL.');
            return;
        }

        console.log('ContentDirectory service found.');
        globalSoapClient = new UpnpSoapClient();

        // הגדרת הפונקציה הגלובלית
        (globalThis as any).browseServer = async (objectId: string = "0") => {
            if (!selectedServerDevice || !selectedCdsServiceInfo || !globalSoapClient) {
                console.error('Server or CDS info not initialized. Please run the main script part first.');
                return;
            }

            console.log(`\nAttempting to browse ObjectID: ${objectId} on ${selectedServerDevice.friendlyName}`);
            try {
                const cds = new ContentDirectoryService(selectedCdsServiceInfo, globalSoapClient);
                const browseResult = await cds.browse(
                    objectId,
                    BrowseFlag.BrowseDirectChildren,
                    "*", // Filter
                    0,   // StartingIndex
                    0    // RequestedCount (0 for all)
                );

                console.log(`--- Browsing Results for ObjectID: ${objectId} ---`);
                if (browseResult.items.length === 0) {
                    console.log('No items found.');
                } else {
                    browseResult.items.forEach(item => {
                        let itemType = "Item"; // ברירת מחדל
                        if (item.class && item.class.includes('object.container')) {
                            itemType = "Folder";
                        } else if (item.class && item.class.includes('object.item')) {
                            itemType = "File";
                        }
                        // דרך נוספת לזיהוי תיקייה, אם childCount קיים
                        if ((item as DidlLiteContainer).childCount !== undefined) {
                            itemType = "Folder";
                        }

                        console.log(`- ${item.title} (ID: ${item.id}) (${itemType})`);
                    });
                }
                console.log(`Returned: ${browseResult.numberReturned}, Total Matches: ${browseResult.totalMatches}, UpdateID: ${browseResult.updateID || 'N/A'}`);
                console.log(`--- End of Results for ObjectID: ${objectId} ---`);

            } catch (error) {
                console.error(`Error browsing ContentDirectory (ObjectID: ${objectId}):`, error);
            }
        };

        console.log(`\nYou can now use the global function 'browseServer(objectId)' in the console.`);
        console.log(`For example: browseServer() or browseServer("0") to browse the root.`);
        console.log(`Type '.exit' or press Ctrl+C twice to exit the REPL if it doesn't exit automatically.`);
        // The script will now idle, allowing the user to call browseServer() from the REPL.

    } catch (error) {
        console.error('An error occurred in the main function:', error);
    }
}

// הרצת הפונקציה הראשית
main().then(async () => {
    // console.log('Main function finished. The script will remain active for REPL commands.');
    // אין צורך להשאיר את התהליך פתוח באופן מלאכותי אם ה-REPL נשאר פתוח
    setInterval(() => "noop", 5 * 1000)
}).catch(err => {
    console.error("Unhandled error during main execution:", err);
    process.exit(1); // יציאה עם קוד שגיאה במקרה של כשל לא מטופל ב-main
});