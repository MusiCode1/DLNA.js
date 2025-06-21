import {
    ContentDirectoryService,
    BrowseFlag,
    processUpnpDeviceFromUrl,
    DiscoveryDetailLevel
} from 'dlna.js';
import type { FullDeviceDescription } from 'dlna.js';

async function browseAndSearchContent(device: FullDeviceDescription) {
    const cdsServiceInfo = device.serviceList?.get('ContentDirectory');
    if (!cdsServiceInfo) return;

    const cds = new ContentDirectoryService(cdsServiceInfo);

    try {
        // דוגמה ל-browse
        const browseResult = await cds.browse('0', BrowseFlag.BrowseDirectChildren);
        console.log(`נמצאו ${browseResult.totalMatches} פריטים בתיקיית השורש.`);

        console.log(browseResult.rawResponse?.Result);

        const id = '%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8';

        const browseResult1 = await cds.browse(id, BrowseFlag.BrowseDirectChildren);
        console.log(`נמצאו ${browseResult1.totalMatches} פריטים בתיקייה.`);

        console.log(browseResult1.rawResponse?.Result);


        // דוגמה ל-search
        const searchResult = await cds.search('0', 'dc:title contains "פישר"');
        console.log(`נמצאו ${searchResult.totalMatches} פריטים התואמים לחיפוש.`);

    } catch (error) {
        console.error('שגיאה באינטראקציה עם ContentDirectory:', error);
    }
}

(async () => {

    const rcloneUrl = 'http://localhost:7879/rootDesc.xml';

    const device =
        await processUpnpDeviceFromUrl(
            rcloneUrl,
            DiscoveryDetailLevel.Full
        ) as FullDeviceDescription;

    browseAndSearchContent(device);

})();