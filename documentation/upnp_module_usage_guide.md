# מדריך שימוש במודול גילוי UPnP

## מבוא קצר

מודול זה מאפשר גילוי התקני UPnP (Universal Plug and Play) ברשת המקומית. הוא מספק פונקציונליות לאיתור התקנים באמצעות פרוטוקול SSDP (Simple Service Discovery Protocol), אחזור תיאור מפורט של כל התקן (כולל רשימת השירותים שהוא מציע), וכן אחזור תיאור מלא של כל שירות (SCPD - Service Control Protocol Description), המפרט את הפעולות (actions) והמשתנים (state variables) של השירות.

המודול בנוי בצורה שכבתית, כאשר [`src/upnpDiscoveryService.ts`](../src/upnpDiscoveryService.ts:1) מספק ממשק ברמה גבוהה ונוח לשימוש, בעוד ש-[`src/upnpDeviceExplorer.ts`](../src/upnpDeviceExplorer.ts:1) חושף פונקציות ברמה נמוכה יותר לשליטה פרטנית. קובץ [`src/types.ts`](../src/types.ts:1) מכיל את כל הגדרות הטיפוסים והממשקים הרלוונטיים. כל אלו מיוצאים כעת דרך קובץ האינדקס המרכזי [`src/index.ts`](../src/index.ts) לנוחות השימוש.

## התקנה/הכנות

המודול הוא חלק אינטגרלי מהפרויקט הנוכחי. יש לוודא שהקבצים הבאים קיימים בפרויקט:
*   [`src/upnpDeviceExplorer.ts`](../src/upnpDeviceExplorer.ts:1)
*   [`src/types.ts`](../src/types.ts:1)
*   [`src/upnpDiscoveryService.ts`](../src/upnpDiscoveryService.ts:1)

כמו כן, יש לוודא שכל התלויות של הפרויקט מותקנות (לדוגמה, על ידי הרצת `npm install` או `bun install`).

## שימוש בסיסי - גילוי התקנים

הדרך הפשוטה ביותר לגלות התקנים היא באמצעות הפונקציה `discoverAndProcessDevices` המיובאת מ-[`src/index.ts`](../src/index.ts) (במקור מ-[`src/upnpDiscoveryService.ts`](../src/upnpDiscoveryService.ts:1)).

### ייבוא הפונקציה

```typescript
import { discoverAndProcessDevices, UpnpDevice, UpnpService } from '../src/index'; // ייבוא מקובץ האינדקס המאוחד
```

### דוגמת קוד לגילוי התקנים

הפונקציה `discoverAndProcessDevices` מקבלת את הפרמטרים הבאים:
*   `searchTarget` (אופציונלי, ברירת מחדל: `"ssdp:all"`): מחרוזת המגדירה את סוג ההתקנים או השירותים לחפש.
*   `timeoutMs` (אופציונלי, ברירת מחדל: `5000`): משך זמן מקסימלי (במילישניות) להמתנה לתגובות מהתקנים.
*   `onDeviceFoundCallback` (אופציונלי): פונקציית callback שתקרא עבור כל התקן שמתגלה ועונה על הקריטריונים, לאחר שאוחזר תיאור המכשיר המלא שלו (כולל SCPD).
*   `discoveryOptions` (אופציונלי): אובייקט המכיל אופציות נוספות עבור מנוע הגילוי ברמה הנמוכה יותר (כמו `includeIPv6`, `customLogger` וכו').

```typescript
async function findDevices() {
  console.log('Starting UPnP device discovery...');
  try {
    // קריאה עם ערכי ברירת מחדל ל-searchTarget ו-timeoutMs
    await discoverAndProcessDevices(
      undefined, // searchTarget (ישתמש ב-"ssdp:all")
      undefined, // timeoutMs (ישתמש ב-5000)
      (device: UpnpDevice) => { // onDeviceFoundCallback
        console.log(`Found device: ${device.friendlyName} (${device.deviceType})`);
        console.log(`  UDN: ${device.UDN}`);
        if (device.serviceList) {
            console.log(`  Services: ${device.serviceList.length}`);
            // כאן ניתן לגשת לפרטי השירותים המלאים, כולל SCPD
            // למשל, להדפיס את רשימת הפעולות של השירות הראשון:
            if (device.serviceList.length > 0 && device.serviceList[0].actionList) {
              console.log(`    Actions for ${device.serviceList[0].serviceId}:`);
              device.serviceList[0].actionList.forEach(action => { // גישה ישירה ל-actionList
                console.log(`      - ${action.name}`);
              });
            }
        }
      }
      // ניתן להוסיף כאן אובייקט discoveryOptions אם יש צורך
      // למשל: { includeIPv6: true }
    );
    console.log('Device discovery finished.');
  } catch (error) {
    console.error('Error during device discovery:', error);
  }
}

findDevices();
```

### הסבר על `onDeviceFoundCallback`

פונקציית ה-callback `onDeviceFoundCallback` היא הדרך העיקרית לקבל ולעבד את ההתקנים המתגלים. היא מקבלת כפרמטר אובייקט מסוג `UpnpDevice` (מיוצא מ-[`src/index.ts`](../src/index.ts), במקור מ-[`src/upnpDiscoveryService.ts`](../src/upnpDiscoveryService.ts:1) ככינוי ל-`DeviceDescription` מ-[`src/types.ts`](../src/types.ts:1)) המכיל את כל המידע על ההתקן, כולל פרטי SCPD (כפי שיוסבר בהמשך).

### מבנה האובייקט `UpnpDevice`

האובייקט `UpnpDevice` מכיל מידע מקיף על ההתקן שהתגלה. השדות העיקריים כוללים:
*   `UDN` (Unique Device Name): מזהה ייחודי של ההתקן.
*   `friendlyName`: שם ידידותי למשתמש של ההתקן.
*   `deviceType`: סוג ההתקן (למשל, `urn:schemas-upnp-org:device:MediaServer:1`).
*   `manufacturer`: יצרן ההתקן.
*   `modelName`: שם הדגם של ההתקן.
*   `presentationURL` (אופציונלי): כתובת URL לממשק אינטרנטי של ההתקן.
*   `serviceList` (אופציונלי): מערך של אובייקטים מסוג `UpnpService` (שהוא `ServiceDescription`), כאשר כל אובייקט מייצג שירות שההתקן מציע.
*   `iconList` (אופציונלי): רשימת אייקונים עבור ההתקן.
*   `descriptionUrl` (אופציונלי): כתובת ה-URL המקורית של קובץ תיאור ההתקן (כפי שהתקבלה מה-SSDP).
*   `baseURL` (אופציונלי): כתובת ה-URL הבסיסית של ההתקן, שנגזרה לטובת פתרון כתובות יחסיות.
*   `sourceIpAddress` (אופציונלי): כתובת ה-IP של ההתקן ממנו התקבלה תגובת ה-SSDP.

## אחזור פרטי שירותים מלאים (SCPD)

כאשר משתמשים בפונקציה `discoverAndProcessDevices` מ-[`src/index.ts`](../src/index.ts) (במקור מ-[`src/upnpDiscoveryService.ts`](../src/upnpDiscoveryService.ts:1)), אחזור פרטי ה-SCPD (Service Control Protocol Description) מתבצע באופן אוטומטי עבור כל שירות של כל התקן מתגלה. זאת מכיוון שהיא קוראת פנימית לפונקציה `fetchDeviceDescription` (מ-[`src/upnpDeviceExplorer.ts`](../src/upnpDeviceExplorer.ts:1)) עם הפרמטר `includeScpdDetails: true` כברירת מחדל.

המידע המלא על השירות, כולל הפעולות (`Action`) והמשתנים (`StateVariable`), נשמר ישירות תחת השדות `actionList` ו-`stateVariables` (בהתאמה) באובייקט `UpnpService` (שהוא `ServiceDescription`) המתאים בתוך `device.serviceList`. אם הייתה שגיאה באחזור או ניתוח ה-SCPD, השדה `scpdError` יכיל הודעת שגיאה.

### מבנה `ServiceDescription`, `Action`, ו-`StateVariable`

הטיפוסים הללו מוגדרים ב-[`src/types.ts`](../src/types.ts:1) (ומיוצאים דרך [`src/index.ts`](../src/index.ts)):

*   **`UpnpService` (או `ServiceDescription`):**
    *   `serviceType`: סוג השירות (למשל, `urn:schemas-upnp-org:service:AVTransport:1`).
    *   `serviceId`: מזהה השירות.
    *   `SCPDURL`: כתובת ה-URL של קובץ ה-SCPD.
    *   `controlURL`: כתובת ה-URL לשליחת פקודות SOAP לשירות.
    *   `eventSubURL`: כתובת ה-URL להרשמה לאירועים מהשירות.
    *   `actionList` (אופציונלי): מערך של אובייקטים מסוג `Action`.
    *   `stateVariables` (אופציונלי): מערך של אובייקטים מסוג `StateVariable`.
    *   `scpdError` (אופציונלי): מחרוזת המכילה הודעת שגיאה אם אחזור/ניתוח ה-SCPD נכשל.

*   **`Action`:**
    *   `name`: שם הפעולה.
    *   `arguments` (אופציונלי): מערך של אובייקטים מסוג `ActionArgument`, המפרטים את הארגומנטים של הפעולה (שם, כיוון, משתנה מצב קשור).

*   **`StateVariable`:**
    *   `name`: שם המשתנה.
    *   `dataType`: סוג הנתונים של המשתנה (למשל, `string`, `ui4`, `boolean`).
    *   `sendEventsAttribute` (אופציונלי, מסוג `boolean`): האם המשתנה שולח אירועים (מבוסס על התכונה `sendEvents="yes"` ב-XML).
    *   `allowedValueList` (אופציונלי): רשימת ערכים מותרים (עבור משתנים מסוימים).
    *   `defaultValue` (אופציונלי): ערך ברירת מחדל.

### גישה למידע SCPD

ניתן לגשת למידע זה מתוך אובייקט `UpnpDevice` שהתקבל ב-`onDeviceFoundCallback`:

```typescript
// ...בתוך onDeviceFoundCallback...
if (device.serviceList) {
  device.serviceList.forEach(service => {
    console.log(`  Service: ${service.serviceId} (${service.serviceType})`);
    if (service.scpdError) {
      console.log(`    Error fetching/parsing SCPD: ${service.scpdError}`);
    } else {
      console.log(`    SCPD URL: ${service.SCPDURL}`);
      if (service.actionList && service.actionList.length > 0) {
        console.log(`    Actions:`);
        service.actionList.forEach(action => {
          console.log(`      - ${action.name}`);
          if (action.arguments && action.arguments.length > 0) {
            action.arguments.forEach(arg => {
              console.log(`        * Arg: ${arg.name}, Direction: ${arg.direction}, RelatedStateVariable: ${arg.relatedStateVariable}`);
            });
          }
        });
      } else {
        console.log('    No actions found or SCPD not processed for actions.');
      }

      if (service.stateVariables && service.stateVariables.length > 0) {
        console.log(`    State Variables:`);
        service.stateVariables.forEach(variable => {
          console.log(`      - ${variable.name} (Type: ${variable.dataType}, SendEvents: ${variable.sendEventsAttribute})`);
        });
      } else {
        console.log('    No state variables found or SCPD not processed for state variables.');
      }
    }
  });
}
```

## שימוש בפונקציות ברמה נמוכה יותר (אופציונלי, למתקדמים)

למשתמשים המעוניינים בשליטה פרטנית יותר על תהליך הגילוי ואחזור הנתונים, קובץ [`src/upnpDeviceExplorer.ts`](../src/upnpDeviceExplorer.ts:1) (שמיוצא גם דרך [`src/index.ts`](../src/index.ts)) חושף שתי פונקציות עיקריות:

*   **`discoverSsdpDevicesIterable(options?: DiscoveryOptions): AsyncIterable<BasicSsdpDevice>`:**
    פונקציה זו מבצעת גילוי SSDP ומחזירה `AsyncIterable`. כל איבר ב-iterable הוא אובייקט `BasicSsdpDevice` בסיסי המכיל את המידע הראשוני שהתקבל מהתקן (כמו `usn`, `location`, `st`). פונקציה זו אינה מאחזרת את תיאור ההתקן המלא (XML) או את פרטי ה-SCPD. `DiscoveryOptions` הוא אובייקט המאפשר להגדיר `searchTarget`, `timeoutMs` ועוד.

*   **`fetchDeviceDescription(basicDevice: BasicSsdpDevice, includeScpdDetails: boolean = false, customLogger?: Function): Promise<DeviceDescription | null>`:**
    פונקציה זו מקבלת אובייקט `BasicSsdpDevice` (שהתקבל מ-`discoverSsdpDevicesIterable` למשל), מאחזרת את קובץ ה-XML מכתובת ה-`location` שלו, מנתחת אותו, ומחזירה אובייקט `DeviceDescription` (שהוא הטיפוס הבסיסי של `UpnpDevice`) מלא. אם `includeScpdDetails` הוא `true` (שימו לב שבפונקציה זו ברירת המחדל היא `false`, בניגוד לשימוש בה בתוך `discoverAndProcessDevices`), הפונקציה תאחזר ותנתח גם את קבצי ה-SCPD עבור כל שירות.

שילוב של שתי פונקציות אלו מאפשר גמישות מרבית, אך דורש טיפול מורכב יותר בתהליך האסינכרוני ובניהול השגיאות.

## קבועים שימושיים

הקובץ [`src/index.ts`](../src/index.ts) (במקור מ-[`src/upnpDiscoveryService.ts`](../src/upnpDiscoveryService.ts:1)) מייצא מספר קבועים שיכולים להיות שימושיים בעבודה עם התקני UPnP, בעיקר לשימוש בפרמטר `searchTarget` או לזיהוי סוגי התקנים ושירותים:

```typescript
import {
  // SSDP_ALL אינו מיוצא ישירות; ניתן להשתמש ב-"ssdp:all" או בברירת המחדל של הפונקציה.
  MEDIA_SERVER_DEVICE,
  MEDIA_RENDERER_DEVICE,
  AVTRANSPORT_SERVICE,
  CONTENT_DIRECTORY_SERVICE,
  RENDERING_CONTROL_SERVICE,
  CONNECTION_MANAGER_SERVICE,
} from '../src/index'; // ייבוא מקובץ האינדקס המאוחד

// דוגמה לשימוש:
// discoverAndProcessDevices({ searchTarget: MEDIA_RENDERER_DEVICE, ... });
```

*   `"ssdp:all"` (מחרוזת לשימוש ישיר, או ברירת מחדל ב-`discoverAndProcessDevices`): לחיפוש כל ההתקנים.
*   `MEDIA_SERVER_DEVICE`: "urn:schemas-upnp-org:device:MediaServer:1"
*   `MEDIA_RENDERER_DEVICE`: "urn:schemas-upnp-org:device:MediaRenderer:1"
*   `AVTRANSPORT_SERVICE`: "urn:schemas-upnp-org:service:AVTransport:1"
*   `CONTENT_DIRECTORY_SERVICE`: "urn:schemas-upnp-org:service:ContentDirectory:1"
*   `RENDERING_CONTROL_SERVICE`: "urn:schemas-upnp-org:service:RenderingControl:1"
*   `CONNECTION_MANAGER_SERVICE`: "urn:schemas-upnp-org:service:ConnectionManager:1"

## עבודה עם תוכן (ContentDirectoryService)

שירות `ContentDirectoryService` מאפשר אינטראקציה עם שירות ContentDirectory של התקני UPnP, כגון שרתי מדיה. הוא מאפשר עיון בתיקיות, חיפוש פריטים וקבלת מידע מפורט עליהם.

### ייבוא

```typescript
import {
  ContentDirectoryService,
  BrowseFlag,
  BrowseResult,
  DidlLiteContainer,
  DidlLiteObject,
  Resource,
  UpnpService, // נדרש לאתחול ServiceDescription
  UpnpSoapClient // נדרש לאתחול ContentDirectoryService
} from '../src/index';
```

### אתחול השירות

כדי להשתמש ב-`ContentDirectoryService`, יש צורך באובייקט `ServiceDescription` (המייצג את שירות ContentDirectory הספציפי בהתקן) ובמופע של `UpnpSoapClient`.

```typescript
// נניח שיש לנו אובייקט 'device' מסוג UpnpDevice שהתקבל מגילוי
// ושאנחנו רוצים לעבוד עם שירות ContentDirectory שלו.
// כמו כן, נניח ש-'device.serviceList' מאוכלס כראוי.

const cdsServiceInfo = device.serviceList?.find(
  (s: UpnpService) => s.serviceType.includes('ContentDirectory')
);

if (cdsServiceInfo) {
  const soapClient = new UpnpSoapClient(); // אתחול לקוח SOAP
  const cds = new ContentDirectoryService(cdsServiceInfo, soapClient);
  console.log('ContentDirectoryService initialized.');
  // כעת ניתן להשתמש ב-cds, למשל: browseContent(cds);
} else {
  console.log('ContentDirectory service not found on the device.');
}
```

### דוגמת שימוש: עיון בתוכן

הפעולה הנפוצה ביותר היא `browse`.

```typescript
async function browseContent(cds: ContentDirectoryService, objectId: string = "0") {
  try {
    const result: BrowseResult = await cds.browse(
      objectId, // ObjectID (למשל, "0" עבור השורש)
      BrowseFlag.BrowseDirectChildren, // דגל לעיון בילדים ישירים
      "*", // Filter (לקבל את כל המאפיינים)
      0,   // startingIndex
      0    // requestedCount (0 עבור כל הפריטים התואמים)
    );

    console.log(`Browsing ObjectID '${objectId}': Found ${result.numberReturned} items (Total: ${result.totalMatches})`);
    if (result.updateID) {
      console.log(`  UpdateID: ${result.updateID}`);
    }

    result.items.forEach((item, index) => {
      console.log(`  Item ${index + 1}:`);
      console.log(`    Title: ${item.title}`);
      console.log(`    ID: ${item.id}`);
      console.log(`    ParentID: ${item.parentId}`);
      console.log(`    Class: ${item.class}`);
      console.log(`    Restricted: ${item.restricted}`);

      if ('childCount' in item) { // זהו DidlLiteContainer
        const container = item as DidlLiteContainer;
        console.log(`    Type: Container`);
        if (container.childCount !== undefined) {
          console.log(`    Child Count: ${container.childCount}`);
        }
        if (container.searchable !== undefined) {
          console.log(`    Searchable: ${container.searchable}`);
        }
      } else { // זהו DidlLiteObject
        const object = item as DidlLiteObject;
        console.log(`    Type: Object`);
        if (object.resources && object.resources.length > 0) {
          console.log(`    Resources:`);
          object.resources.forEach((res, rIndex) => {
            console.log(`      Resource ${rIndex + 1}:`);
            console.log(`        URI: ${res.uri}`);
            if (res.protocolInfo) console.log(`        ProtocolInfo: ${res.protocolInfo}`);
            if (res.size) console.log(`        Size: ${res.size}`);
            if (res.duration) console.log(`        Duration: ${res.duration}`);
            // ניתן להוסיף עוד מאפייני Resource לפי הצורך
          });
        }
        if (object.albumArtURI) console.log(`    Album Art URI: ${object.albumArtURI}`);
        // ניתן להוסיף עוד מאפייני DidlLiteObject
      }
    });
  } catch (error) {
    console.error(`Error browsing ContentDirectory (ObjectID: ${objectId}):`, error);
  }
}

// כדי להריץ את הדוגמה:
// if (cdsServiceInfo) {
//   const soapClient = new UpnpSoapClient();
//   const cds = new ContentDirectoryService(cdsServiceInfo, soapClient);
//   browseContent(cds); // עיון בשורש
//   // browseContent(cds, "someOtherContainerId"); // עיון בתיקייה ספציפית
// }
```

### מבנה התוצאה (`BrowseResult`)

האובייקט `BrowseResult` המוחזר מפעולת `browse` (או `search`) מכיל:
*   `items`: מערך של אובייקטים, כל אחד יכול להיות `DidlLiteContainer` (מייצג תיקייה) או `DidlLiteObject` (מייצג פריט מדיה).
*   `numberReturned`: מספר הפריטים שהוחזרו בפועל בקריאה זו.
*   `totalMatches`: המספר הכולל של פריטים התואמים לקריטריונים (יכול להיות גדול מ-`numberReturned` אם נעשה שימוש בפגינציה).
*   `updateID` (אופציונלי): מזהה המשמש למעקב אחר שינויים בתוכן השרת.

הטיפוסים `DidlLiteContainer`, `DidlLiteObject`, ו-`Resource` מכילים שדות רבים המתארים את מאפייני הפריטים והמשאבים שלהם, כפי שמפורט ב-[`src/types.ts`](../src/types.ts:1) (ומיוצא דרך [`src/index.ts`](../src/index.ts)).

## שליחת פקודות SOAP (UpnpSoapClient)

ה-`UpnpSoapClient` הוא לקוח גנרי המאפשר לשלוח בקשות SOAP לשירותי UPnP. הוא משמש "מתחת למכסה המנוע" על ידי שירותים ספציפיים כמו `ContentDirectoryService`, אך ניתן להשתמש בו גם ישירות אם יש צורך לשלוח פקודות שאין להן עטיפה ייעודית, או לצורך ניפוי שגיאות.

### ייבוא

```typescript
import {
  UpnpSoapClient,
  SoapResponse,
  SoapFault, // לטיפול בשגיאות
  SoapResponsePayload // לגישה לנתונים מוצלחים
  // UpnpService נדרש כדי לקבל controlURL ו-serviceType
} from '../src/index';
```

### אתחול הלקוח

```typescript
const soapClient = new UpnpSoapClient();
```
ניתן להעביר אופציות לפרסר ה-XML (xml2js) ולבונה ה-XML (xmlbuilder2) בעת יצירת המופע, אך לרוב הגדרות ברירת המחדל מספיקות.

### דוגמת שימוש: קריאה לפעולה (`invokeAction`)

המתודה העיקרית היא `invokeAction`, המקבלת את הפרמטרים הבאים:
*   `controlURL`: כתובת ה-URL של נקודת הבקרה של השירות (נמצא ב-`UpnpService.controlURL`).
*   `serviceType`: ה-URN של סוג השירות (נמצא ב-`UpnpService.serviceType`).
*   `actionName`: שם הפעולה לביצוע (למשל, "GetProtocolInfo").
*   `actionParams`: אובייקט JavaScript המכיל את הארגומנטים של הפעולה. אם אין ארגומנטים, יש להעביר אובייקט ריק `{}`.

```typescript
async function getProtocolInfoExample(service: UpnpService, client: UpnpSoapClient) {
  if (!service.controlURL || !service.serviceType) {
    console.error("Service controlURL or serviceType is missing.");
    return;
  }

  try {
    const response: SoapResponse = await client.invokeAction(
      service.controlURL,
      service.serviceType,
      "GetProtocolInfo", // שם הפעולה
      {} // אין פרמטרים לפעולה זו
    );

    if (response.success && response.data) {
      console.log("GetProtocolInfo successful!");
      console.log("Source:", response.data.actionResponse.Source);
      console.log("Sink:", response.data.actionResponse.Sink);
    } else if (response.fault) {
      console.error("SOAP Fault for GetProtocolInfo:");
      console.error(`  Fault Code: ${response.fault.faultCode}`);
      console.error(`  Fault String: ${response.fault.faultString}`);
      if (response.fault.upnpErrorCode) {
        console.error(`  UPnP Error Code: ${response.fault.upnpErrorCode}`);
      }
      if (response.fault.upnpErrorDescription) {
        console.error(`  UPnP Error Description: ${response.fault.upnpErrorDescription}`);
      }
    }
  } catch (error) {
    console.error("Error invoking GetProtocolInfo:", error);
  }
}

// כדי להריץ את הדוגמה:
// נניח שיש לנו 'device' מסוג UpnpDevice, ואנחנו רוצים לקרוא לפעולה בשירות ConnectionManager שלו
// const connManagerService = device.serviceList?.find(s => s.serviceType.includes('ConnectionManager'));
// if (connManagerService) {
//   const soapClient = new UpnpSoapClient();
//   getProtocolInfoExample(connManagerService, soapClient);
// }
```

### מבנה התגובה (`SoapResponse`)

האובייקט `SoapResponse` המוחזר מ-`invokeAction` מכיל:
*   `success` (boolean): `true` אם הבקשה הצליחה והתקבלה תגובה תקינה מהשירות, `false` אם התרחשה שגיאת SOAP או שגיאת תקשורת.
*   `data` (אופציונלי, מסוג `SoapResponsePayload`): אם `success` הוא `true`, שדה זה יכיל את נתוני התגובה.
    *   `actionResponse`: אובייקט המכיל את הפרמטרים שהוחזרו מהפעולה (למשל, עבור `GetProtocolInfo`, הוא יכיל את `Source` ו-`Sink`).
    *   `raw`: כל גוף תגובת ה-SOAP המנותח.
*   `fault` (אופציונלי, מסוג `SoapFault`): אם `success` הוא `false`, שדה זה יכיל פרטים על השגיאה.
    *   `faultCode`: קוד השגיאה (למשל, "Client", "Server", או קוד HTTP אם השגיאה היא ברמת הפרוטוקול).
    *   `faultString`: תיאור מילולי של השגיאה.
    *   `detail` (אופציונלי): פרטים נוספים על השגיאה.
    *   `upnpErrorCode` (אופציונלי): קוד שגיאה ספציפי ל-UPnP (אם השגיאה היא שגיאת UPnP מוגדרת).
    *   `upnpErrorDescription` (אופציונלי): תיאור שגיאת ה-UPnP.

## יצירת לוגרים (createLogger)

המודול כולל מערכת לוגינג מבוססת `winston` המאפשרת יצירת לוגרים מותאמים לכל מודול או חלק בקוד שלך. זה עוזר לארגן ולסנן הודעות לוג בצורה יעילה.

### ייבוא

```typescript
import { createLogger } from '../src/index';
```

### דוגמת שימוש

```typescript
// יצירת לוגר עבור מודול ספציפי בשם 'MyApplicationLogic'
const appLogger = createLogger('MyApplicationLogic');

function performSomeOperation(data: any) {
  appLogger.info('Starting operation with data:', data);

  if (!data.id) {
    appLogger.warn('Operation called without an ID in data.');
  }

  try {
    // ... לוגיקה כלשהי ...
    if (Math.random() < 0.1) {
      throw new Error("A simulated random error occurred.");
    }
    appLogger.debug('Intermediate step completed successfully.');
    appLogger.info('Operation completed successfully.');
  } catch (error: any) {
    appLogger.error('Operation failed:', { errorMessage: error.message, stack: error.stack, inputData: data });
  }
}

performSomeOperation({ id: 123, value: 'test' });
performSomeOperation({ value: 'another test without id' });
```

### הגדרות הלוגר

התנהגות הלוגר (כגון רמת הלוג המינימלית להדפסה, האם להדפיס לקונסולה, האם לכתוב לקובץ, ונתיב קובץ הלוג) נשלטת באמצעות משתני סביבה. המשתנים העיקריים כוללים:
*   `LOG_LEVEL`: רמת הלוג (למשל, `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`). ברירת מחדל: `info`.
*   `LOG_TO_CONSOLE`: `true` או `false`. ברירת מחדל: `true` (אם לא מוגדר).
*   `LOG_TO_FILE`: `true` או `false`. ברירת מחדל: `false`.
*   `LOG_FILE_PATH`: נתיב לקובץ הלוג אם `LOG_TO_FILE` הוא `true`. ברירת מחדל: `logs/app.log`.
*   `LOG_MODULES`: רשימה מופרדת בפסיקים של שמות מודולים שרק עבורם יודפסו הודעות לוג (למשל, `MyApplicationLogic,upnpDiscoveryService`). אם לא מוגדר, ריק, או `*`, יודפסו הודעות מכל המודולים.

ניתן לעיין בקובץ [`src/logger.ts`](../src/logger.ts:1) לפרטים נוספים על משתני הסביבה הנתמכים והתנהגות ברירת המחדל.

## דוגמת קוד מורחבת

דוגמה זו (בהשראת [`examples/comprehensiveUpnpExample.ts`](../examples/comprehensiveUpnpExample.ts:1)) מדגימה גילוי התקנים, סינון התקנים מסוג "MediaRenderer", והדפסת פרטי שירות "AVTransport" אם קיים.

```typescript
import { discoverAndProcessDevices, MEDIA_RENDERER_DEVICE, AVTRANSPORT_SERVICE, UpnpDevice, UpnpService } from '../src/index'; // ייבוא מקובץ האינדקס המאוחד
// אין צורך לייבא Service בנפרד אם משתמשים ב-UpnpService

async function findAndInspectMediaRenderers() {
  console.log('Looking for Media Renderer devices...');
  const foundRenderers: UpnpDevice[] = [];

  try {
    await discoverAndProcessDevices(
      MEDIA_RENDERER_DEVICE, // searchTarget: חפש רק Media Renderers
      7000, // timeoutMs: המתן 7 שניות
      (device: UpnpDevice) => { // onDeviceFoundCallback
        console.log(`Found Media Renderer: ${device.friendlyName} (UDN: ${device.UDN})`);
        foundRenderers.push(device);

        if (device.serviceList) {
          // חפש את שירות AVTransport
          const avTransportService = device.serviceList.find(
            (service: UpnpService) => service.serviceType.includes(AVTRANSPORT_SERVICE)
          );

          if (avTransportService) {
            console.log(`  AVTransport Service (${avTransportService.serviceId}):`);
            console.log(`    Control URL: ${avTransportService.controlURL}`);
            console.log(`    SCPD URL: ${avTransportService.SCPDURL}`);
            if (avTransportService.scpdError) {
                console.log(`    SCPD Error: ${avTransportService.scpdError}`);
            } else if (avTransportService.actionList && avTransportService.actionList.length > 0) {
              console.log(`    Actions:`);
              avTransportService.actionList.forEach(action => {
                console.log(`      - ${action.name}`);
              });
              // אפשר להמשיך ולפרט StateVariables וכו'
            } else {
              console.log('    No actions found for AVTransport service.');
            }
          } else {
            console.log(`  AVTransport service not found for ${device.friendlyName}`);
          }
        }
      }
    );

    if (foundRenderers.length === 0) {
      console.log('No Media Renderer devices found.');
    } else {
      console.log(`\nDiscovery finished. Found ${foundRenderers.length} Media Renderer(s).`);
    }

  } catch (error) {
    console.error('Error during Media Renderer discovery:', error);
  }
}

findAndInspectMediaRenderers();
```

מדריך זה מכסה את השימוש העיקרי במודול גילוי ה-UPnP. לפרטים נוספים, מומלץ לעיין בקוד המקור של הקבצים המוזכרים ובדוגמאות נוספות אם קיימות.