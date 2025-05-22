// קובץ זה מדגים כיצד להשתמש בפונקציות invoke ו-query שנוספו לפעולות ומשתני מצב.
import { discoverSsdpDevices, fetchDeviceDescription } from '../src/upnpDeviceExplorer';
import { BasicSsdpDevice, DeviceDescription, ServiceDescription, Action, StateVariable } from '../src/types';
import { createModuleLogger } from '../src/logger';
import { create } from 'xmlbuilder2';


// הגדרת לוגר עבור הדוגמה עצמה
const logger = createModuleLogger('invokeQueryExample');
// ה-customLogger הוסר לבקשת המשתמש. הפונקציות הפנימיות ישתמשו בלוגר ברירת המחדל שלהן.

const VIDEO_URL = 'http://192.168.1.108:7879/r/%D7%A1%D7%A8%D7%98%D7%95%D7%A0%D7%99%20%D7%96%D7%9E%D7%9F%20%D7%A4%D7%A0%D7%90%D7%99/%D7%A7%D7%9C%D7%99%D7%A4%D7%99%D7%9D%20%D7%9E%D7%95%D7%96%D7%99%D7%A7%D7%94/%D7%90%D7%91%D7%A8%D7%94%D7%9D%20%D7%A4%D7%A8%D7%99%D7%93%20-%20%D7%A2%D7%96%D7%A8%D7%99.mp4';
// const devicesUrl = 'http://192.168.1.122:1411/'; // לא בשימוש

const EXAMPLE_VIDEO = {
    videoUrl: VIDEO_URL,
    videoTitle: "Cry No More", // כותרת לדוגמה
    videoDuration: "0:05:10",
    videoSize: "90262145", // גודל בקובץ לדוגמה
    resolution: "1920x1080" // רזולוציה לדוגמה
};

// בניית המטא-דאטה של DIDL-Lite כמחרוזת XML ללא הצהרת <?xml...?>
// על ידי יצירת אובייקט JS שמייצג את מבנה ה-XML הרצוי
// והמרתו למחרוזת באמצעות create(obj).end()
const didlObject = {
    'DIDL-Lite': {
        '@xmlns': 'urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/',
        '@xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        '@xmlns:upnp': 'urn:schemas-upnp-org:metadata-1-0/upnp/',
        'item': {
            '@id': '0', // או כל ID רלוונטי
            '@parentID': '0', // או ID של הורה רלוונטי
            '@restricted': 'true', // או 'false'
            'dc:title': EXAMPLE_VIDEO.videoTitle,
            'upnp:class': 'object.item.videoItem', // סוג הפריט
            'res': {
                '@protocolInfo': 'http-get:*:video/mp4:*', // עדכן ל-protocolInfo הנכון אם ידוע
                // אפשר להוסיף עוד פרטים כמו bitrate, sampleFrequency וכו' אם רלוונטי
                '@size': EXAMPLE_VIDEO.videoSize,
                '@duration': EXAMPLE_VIDEO.videoDuration,
                '@resolution': EXAMPLE_VIDEO.resolution,
                '#': EXAMPLE_VIDEO.videoUrl // ה-URI של המדיה עצמה נכנס כתוכן של תג ה-res
            }
            // אפשר להוסיף עוד אלמנטים כמו upnp:albumArtURI, dc:creator וכו'
        }
    }
};
const didlLiteVideoMetadata = create(didlObject).end({ prettyPrint: false });
logger.debug('Generated DIDL-Lite Metadata:', didlLiteVideoMetadata);

const timeoutMs = 30 * 1000;

const device = {
    "usn": "uuid:be1c59a2-4a1e-9c76-3288-742038c5ddc8::urn:schemas-upnp-org:device:MediaRenderer:1",
    "location": "http://192.168.1.122:1411/",
    "server": "Linux/i686 UPnP/1,0 DLNADOC/1.50 LGE WebOS TV/Version 0.9",
    "st": "urn:schemas-upnp-org:device:MediaRenderer:1",
    "address": "192.168.1.122",
    "responseHeaders": {
        "LOCATION": "http://192.168.1.122:1411/",
        "CACHE-CONTROL": "max-age=1800",
        "SERVER": "Linux/i686 UPnP/1,0 DLNADOC/1.50 LGE WebOS TV/Version 0.9",
        "EXT": "",
        "USN": "uuid:be1c59a2-4a1e-9c76-3288-742038c5ddc8::urn:schemas-upnp-org:device:MediaRenderer:1",
        "ST": "urn:schemas-upnp-org:device:MediaRenderer:1",
        "DATE": "Wed, 21 May 2025 20:05:10 GMT",
        "DLNADEVICENAME.LGE.COM": "Basement-TV"
    },
    "timestamp": 1747857913718
}

async function main() {


    try {

        const deviceDescription = await fetchDeviceDescription(device, true); 

        if (!deviceDescription) {
            logger.warn(`לא התקבל תיאור עבור ההתקן: ${device.location}`);
            return;
        }

        if (!deviceDescription.services) return;

        const avTransportService = deviceDescription.services['urn:upnp-org:serviceId:AVTransport'];

        if (!avTransportService || !avTransportService.actions) {
            logger.warn('שירות AVTransport לא נמצא או שאין לו פעולות.');
            return;
        }

        const setAVTransportURIAction = avTransportService.actions['SetAVTransportURI'];

        if (!setAVTransportURIAction || !setAVTransportURIAction.invoke) {
            logger.warn('הפעולה SetAVTransportURI אינה זמינה או שאין לה פונקציית invoke.');

            return;
        }

        const playAction = avTransportService.actions['Play'];

        if (!playAction || !playAction.invoke) {
            logger.warn('הפעולה Play אינה זמינה או שאין לה פונקציית invoke.');
            return;
        }

        logger.info(`מנסה להפעיל את הפעולה: ${setAVTransportURIAction.name}`);

        let result = await setAVTransportURIAction.invoke({ // הסרת optional chaining כי כבר בדקנו invoke
            InstanceID: 0,
            CurrentURI: VIDEO_URL,
            CurrentURIMetaData: didlLiteVideoMetadata
        });

        logger.info('תוצאת הפעולה:', result);

        logger.info(`מנסה להפעיל את הפעולה: ${playAction.name}`);
        result = await playAction.invoke( // הוספת await
            { InstanceID: 0, Speed: "1" }
        );

        logger.info('תוצאת הפעולה:', result);

    } catch (error) {
        logger.error('אירעה שגיאה בפונקציה הראשית:', error);
        // console.error(error); // אפשר להחליף ב-logger.error
    }
    // finally block הוסר כי היה ריק
}

main().catch(err => {
    console.error(err);

});