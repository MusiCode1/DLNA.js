# פרויקט DLNA, Wake on LAN ושרת יישומים

## מבוא קצר

פרויקט זה כולל מספר רכיבים המאפשרים גילוי, שליטה וניהול של התקני רשת, בדגש על התקני UPnP/DLNA ופונקציונליות Wake on LAN.
הפרויקט מאורגן כמבנה Monorepo המנוהל באמצעות Bun, ומכיל את החבילות הבאות:

*   **`dlna.js`**: ספריית הליבה המרכזית. היא מאפשרת גילוי התקני UPnP (Universal Plug and Play) ברשת המקומית באמצעות פרוטוקול SSDP (Simple Service Discovery Protocol). היא מספקת פונקציונליות לאחזור תיאור מפורט של כל התקן (כולל השירותים שהוא מציע), אחזור תיאור מלא של כל שירות (SCPD), ומאפשרת הפעלה ישירה של פעולות (actions) ושאילתת משתני מצב (state variables) של השירותים. ספרייה זו מיועדת לפרסום ב-NPM.
*   **`wake-on-lan`**: חבילה קטנה המספקת פונקציונליות לשליחת חבילות "Wake on LAN" להערת מחשבים והתקנים ברשת.
*   **`@dlna-tv-play/server`**: שרת יישומים מבוסס Express.js המשתמש בשתי הספריות (`dlna.js` ו-`wake-on-lan`) כדי לספק API לניהול התקנים, הפעלתם, ושליטה בפונקציות DLNA.

## מטרה
המטרה של הפרויקט הזה היא עבור דייר בהוסטל של אוטיזם בתפקוד נמוך, שהפעולה של הפעלת הטלוויזיה היא מורכבת מדי קוגניטיבית עבורו.
לכן רציתי ליצור לו לחצן, שבבת אחת גם יפעיל את הטלוויזיה וגם יפעיל רשימת השמעה של סרטונים שהדייר הזה מכיר.
התוכנית היא שהלחצן יפעיל WebHook שיקרא לקוד מהשרת בפרויקט זה, וכך יפעיל את רשימת ההשמעה במכשיר הספציפי.

### סדר הפעולות
סדר הפעולות שצריך לקרות על מנת לבצע את הנ"ל הוא:
1. הפעלת הטלוויזיה (על ידי WakeOnLan).
2. המתנה עד שהטלוויזיה תופעל ותגיב לבקשות (מיושם עם בדיקה ע"י `ping`).
3. (במקביל) קבלת רשימת הקבצים בתיקייה מוגדרת מראש משרת ה DLNA.
4. שליחת הפקודה להפעלת הסרטון הראשון.
5. שליחת הפקודה להוספת הסרטונים הבאים לרשימת ההשמעה, כל סרטון בפקודה נפרדת.

## מבנה הפרויקט

הפרויקט מאורגן בתיקיית `packages/` ראשית, כאשר כל חבילה (`dlna.js`, `wake-on-lan`, `server`) נמצאת בתיקיית משנה משלה.
כל חבילה מכילה:
*   קובץ [`package.json`](#) המגדיר את תלויותיה, סקריפטים ופרטי החבילה.
*   תיקיית `src/` המכילה את קוד המקור של החבילה.
*   קובץ `index.ts` בתוך `src/` המשמש כנקודת כניסה ראשית לייצוא הפונקציונליות של החבילה.
*   קובץ [`tsconfig.json`](#) להגדרות TypeScript הספציפיות לחבילה.

הפרויקט משתמש ב-Bun Workspaces לניהול התלויות בין החבילות.

## התקנה והרצה

1.  **התקנת תלויות**:
    ודא ש-Bun מותקן במערכת שלך. לאחר מכן, בתיקיית השורש של הפרויקט, הרץ:
    ```bash
    bun install
    ```
    פקודה זו תתקין את כל התלויות של כל החבילות ותקשר ביניהן (workspaces).

2.  **בניית החבילות**:
    כדי לבנות את כל החבילות (לקמפל את קוד ה-TypeScript ל-JavaScript), הרץ מהתיקייה הראשית:
    ```bash
    bun run build:all
    ```
    (בהנחה שהגדרתם סקריפט כזה ב-package.json הראשי, או שתצטרכו להריץ `bun run build` בתוך כל חבילה או להשתמש בפילטרים).
    לדוגמה, לבניית חבילת `dlna.js` בלבד:
    ```bash
    bun run --filter "dlna.js" build
    ```

3.  **הרצת השרת**:
    לאחר שהחבילות נבנו, ניתן להריץ את השרת באמצעות הפקודה מהתיקייה הראשית:
    ```bash
    bun start
    ```
    השרת יאזין בדרך כלל בכתובת `http://localhost:3300`.

## שימוש בספריית `dlna.js` - גילוי התקנים

הדרך העיקרית לגלות התקנים באמצעות ספריית `dlna.js` היא באמצעות הפונקציה `discoverSsdpDevices`.

### ייבוא הפונקציה והטיפוסים הרלוונטיים

```typescript
import {
  discoverSsdpDevices,
  DiscoveryDetailLevel,
  type ProcessedDevice, // טיפוס גנרי, יכול להיות אחד מהבאים
  type FullDeviceDescription, // אם detailLevel הוא Full
  type BasicSsdpDevice,       // אם detailLevel הוא Basic
  type DeviceDescription      // אם detailLevel הוא Description
  // וטיפוסים נוספים לפי הצורך, כמו ServiceDescription, Action, StateVariable
} from 'dlna.js'; // ייבוא מחבילת dlna.js
```

### דוגמת קוד לגילוי התקנים

הפונקציה `discoverSsdpDevices` מקבלת אובייקט `DiscoveryOptions` המאפשר להגדיר:
*   `searchTarget` (אופציונלי, ברירת מחדל: `"ssdp:all"`): מחרוזת המגדירה את סוג ההתקנים או השירותים לחפש.
*   `timeoutMs` (אופציונלי, ברירת מחדל: `5000`): משך זמן מקסימלי (במילישניות) להמתנה לתגובות מהתקנים.
*   `onDeviceFound` (אופציונלי): פונקציית callback שתקרא עבור כל התקן שמתגלה ומעובד לרמת הפירוט המבוקשת.
*   `detailLevel` (אופציונלי, ברירת מחדל: `DiscoveryDetailLevel.Basic`): קובע את רמת הפירוט של המידע שיוחזר עבור כל התקן.
    *   `DiscoveryDetailLevel.Basic`: מחזיר `BasicSsdpDevice` (מידע בסיסי מהודעת SSDP).
    *   `DiscoveryDetailLevel.Description`: מחזיר `DeviceDescription` (כולל תיאור XML של ההתקן).
    *   `DiscoveryDetailLevel.Services`: מחזיר `DeviceDescription` עם רשימת שירותים בסיסית (ללא SCPD).
    *   `DiscoveryDetailLevel.Full`: מחזיר `FullDeviceDescription` (כולל תיאור XML, רשימת שירותים עם SCPD מלא, ופונקציות `invoke`/`query`).
*   אופציות נוספות כמו `customLogger`, `headers`, `sourcePort`, `maxRetries`.

```typescript
async function findDevicesExample() {
  console.log('Starting UPnP device discovery...');
  try {
    await discoverSsdpDevices({
      // searchTarget: "ssdp:all", // ברירת מחדל
      timeoutMs: 5000,
      detailLevel: DiscoveryDetailLevel.Full, // בקש את כל הפרטים
      onDeviceFound: (device: ProcessedDevice) => {
        // כאן device הוא כבר ברמת הפירוט המבוקשת
        // אם detailLevel הוא Full, אפשר לבצע המרה בטוחה ל-FullDeviceDescription
        const fullDevice = device as FullDeviceDescription;
        console.log(`Found device: ${fullDevice.friendlyName} (Type: ${fullDevice.deviceType})`);
        console.log(`  UDN: ${fullDevice.UDN}`);
        console.log(`  Location: ${fullDevice.location}`);
        console.log(`  Remote Address: ${fullDevice.remoteAddress}:${fullDevice.remotePort}`);

        if (fullDevice.serviceList && fullDevice.serviceList.length > 0) {
          console.log(`  Services: ${fullDevice.serviceList.length}`);
          fullDevice.serviceList.forEach(service => {
            console.log(`    - ${service.serviceId} (${service.serviceType})`);
            if (service.actionList && service.actionList.length > 0) {
                console.log(`      Actions: ${service.actionList.map(a => a.name).join(', ')}`);
            }
          });
        }
      }
    });
    console.log('Device discovery finished.');
  } catch (error) {
    console.error('Error during device discovery:', error);
  }
}

findDevicesExample();
```

## הסבר על `onDeviceFound` (קולבק)

פונקציית ה-callback `onDeviceFound`, המועברת דרך `DiscoveryOptions` לפונקציה `discoverSsdpDevices`, היא דרך נוחה לקבל ולעבד התקנים ברגע שהם מתגלים ומעובדים לרמת הפירוט שצוינה ב-`detailLevel`.
הטיפוס המועבר לקולבק הוא `ProcessedDevice`. טיפוס זה הוא איחוד (union) של `BasicSsdpDevice`, `DeviceDescription`, ו-`FullDeviceDescription`. הטיפוס הספציפי של האובייקט `device` בתוך הקולבק יהיה תואם לערך של `detailLevel` שהוגדר ב-`DiscoveryOptions`.
לדוגמה, אם `detailLevel` הוא `DiscoveryDetailLevel.Full`, אז `device` יהיה מסוג `FullDeviceDescription`.

## מבנה אובייקטי ההתקן (`BasicSsdpDevice`, `DeviceDescription`, `FullDeviceDescription`)

הספרייה מחזירה סוגים שונים של אובייקטי התקן בהתאם ל-`detailLevel` המבוקש:

*   **`BasicSsdpDevice`**: מכיל את המידע הגולמי שהתקבל מהודעת ה-SSDP.
    *   `usn`: ה-Unique Service Name.
    *   `location`: כתובת ה-URL לקובץ תיאור ה-XML של ההתקן.
    *   `st`: ה-Search Target / Service Type.
    *   `server`: מחרוזת השרת ששלח את התגובה.
    *   `cacheControl`: ערך ה-Cache-Control.
    *   `remoteAddress`: כתובת ה-IP של ההתקן.
    *   `remotePort`: הפורט של ההתקן.
    *   `headers`: כל הכותרות שהתקבלו בהודעת ה-SSDP.

*   **`DeviceDescription`** (מרחיב את `BasicSsdpDevice`): כולל את המידע מנותח מקובץ ה-XML של ההתקן.
    *   `UDN` (Unique Device Name): מזהה ייחודי של ההתקן.
    *   `friendlyName`: שם ידידותי למשתמש של ההתקן.
    *   `deviceType`: סוג ההתקן (למשל, `urn:schemas-upnp-org:device:MediaServer:1`).
    *   `manufacturer`: יצרן ההתקן.
    *   `manufacturerURL` (אופציונלי).
    *   `modelName`: שם הדגם של ההתקן.
    *   `modelNumber` (אופציונלי).
    *   `modelURL` (אופציונלי).
    *   `serialNumber` (אופציונלי).
    *   `presentationURL` (אופציונלי): כתובת URL לממשק אינטרנטי של ההתקן.
    *   `iconList` (אופציונלי): מערך של אייקונים עבור ההתקן.
    *   `serviceList` (אופציונלי): מערך של אובייקטים `ServiceDescription` (בסיסי, ללא פרטי SCPD מלאים אלא אם `detailLevel` גבוה יותר).
    *   `deviceList` (אופציונלי): מערך של התקנים משוננים (nested devices).
    *   `baseURL`: כתובת ה-URL הבסיסית של ההתקן, שנגזרה לטובת פתרון כתובות יחסיות.
    *   `xmlString` (אופציונלי): מחרוזת ה-XML המקורית של תיאור ההתקן.

*   **`FullDeviceDescription`** (מרחיב את `DeviceDescription`): כולל את כל המידע, כולל פרטי SCPD מלאים עבור כל שירות, ופונקציות `invoke` ו-`query` מוכנות לשימוש.
    *   השדה `serviceList` יכיל אובייקטי `ServiceDescription` שבהם `actionList` ו-`stateVariableList` מאוכלסים, ולכל `Action` תהיה פונקציית `invoke` ולכל `StateVariable` רלוונטי תהיה פונקציית `query`.

## אחזור פרטי שירותים מלאים (SCPD)

כאשר משתמשים בפונקציה `discoverSsdpDevices` עם `detailLevel` של `DiscoveryDetailLevel.Full` (או `DiscoveryDetailLevel.Services` עבור מידע חלקי על השירותים), פרטי ה-SCPD (Service Control Protocol Description) מאוכלסים אוטומטית.
*   עבור `DiscoveryDetailLevel.Full`, המידע המלא על כל שירות, כולל רשימת הפעולות (`actionList`) ורשימת המשתנים (`stateVariableList`), נשמר באובייקט `ServiceDescription` המתאים בתוך `device.serviceList`.
*   בנוסף, לכל `Action` ב-`actionList` מתווספת פונקציית `invoke` להפעלה ישירה, ולכל `StateVariable` רלוונטי ב-`stateVariableList` מתווספת פונקציית `query` לשאילתת ערכו.
*   אם הייתה שגיאה באחזור או ניתוח ה-SCPD עבור שירות מסוים, השדה `scpdError` באותו `ServiceDescription` יכיל הודעת שגיאה.

האופציה `includeScpdDetails` שהייתה קיימת בעבר הוסרה, והתנהגות זו נשלטת כעת באופן בלעדי על ידי `detailLevel`.

## מבנה `ServiceDescription`, `Action`, ו-`StateVariable`

הטיפוסים הללו מוגדרים בתוך חבילת `dlna.js` (במקור בקבצים כמו `types.ts`) ומיוצאים דרך נקודת הכניסה הראשית של החבילה (`dlna.js/index`):

*   **`ServiceDescription`:**
    *   `serviceType`: סוג השירות (למשל, `urn:schemas-upnp-org:service:AVTransport:1`).
    *   `serviceId`: מזהה השירות.
    *   `SCPDURL`: כתובת ה-URL (יחסית או מוחלטת) של קובץ ה-SCPD.
    *   `controlURL`: כתובת ה-URL (יחסית או מוחלטת) לשליחת פקודות SOAP לשירות.
    *   `eventSubURL`: כתובת ה-URL (יחסית או מוחלטת) להרשמה לאירועים מהשירות.
    *   `actionList` (אופציונלי): מערך של אובייקטים מסוג `Action`. מאוכלס אם `detailLevel` הוא `Full`.
    *   `stateVariableList` (אופציונלי): מערך של אובייקטים מסוג `StateVariable`. מאוכלס אם `detailLevel` הוא `Full`.
    *   `scpdError` (אופציונלי): מחרוזת המכילה הודעת שגיאה אם אחזור/ניתוח ה-SCPD נכשל.

*   **`Action`:**
    *   `name`: שם הפעולה.
    *   `arguments` (אופציונלי): מערך של אובייקטים מסוג `ActionArgument`.
    *   `invoke` (אופציונלי): פונקציה `(args: Record<string, any>) => Promise<Record<string, any>>` להפעלת הפעולה. נוספת אוטומטית כאשר `detailLevel` הוא `Full`.

*   **`StateVariable`:**
    *   `name`: שם המשתנה.
    *   `dataType`: סוג הנתונים של המשתנה.
    *   `sendEvents`: (היה `sendEventsAttribute`) האם המשתנה שולח אירועים (ערך `yes` או `no` מה-XML, מומר ל-`boolean` אם אפשרי).
    *   `allowedValueList` (אופציונלי): מערך של ערכים מותרים.
    *   `defaultValue` (אופציונלי): ערך ברירת מחדל.
    *   `query` (אופציונלי): פונקציה `() => Promise<any>` לשאילתת ערך המשתנה. נוספת אוטומטית כאשר `detailLevel` הוא `Full` וניתן לשאילתה.

## גישה למידע SCPD

כאשר `detailLevel` הוא `Full`, ניתן לגשת למידע ה-SCPD מתוך אובייקט `FullDeviceDescription` שהתקבל ב-`onDeviceFound`:

```typescript
// ...בתוך onDeviceFound, כאשר device הוא FullDeviceDescription...
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
          console.log(`      - ${action.name} ${action.invoke ? '(invokable)' : ''}`);
          // הדגמת שימוש ב-invoke (בצורה בטוחה)
          if (action.name === 'GetVolume' && action.invoke && service.serviceType.includes('RenderingControl')) {
            action.invoke({ InstanceID: 0, Channel: 'Master' }) // הנחות לדוגמה
              .then(result => console.log(`        Result of ${action.name}:`, result))
              .catch(err => console.error(`        Error invoking ${action.name}:`, err.message || err));
          }
          if (action.arguments && action.arguments.length > 0) {
            action.arguments.forEach(arg => {
              console.log(`        * Arg: ${arg.name}, Direction: ${arg.direction}, RelatedStateVariable: ${arg.relatedStateVariable}`);
            });
          }
        });
      } else {
        console.log('    No actions found or SCPD not processed for actions.');
      }

      if (service.stateVariableList && service.stateVariableList.length > 0) {
        console.log(`    State Variables:`);
        service.stateVariableList.forEach(variable => {
          console.log(`      - ${variable.name} (Type: ${variable.dataType}, SendEvents: ${variable.sendEvents}) ${variable.query ? '(queryable)' : ''}`);
          // הדגמת שימוש ב-query (בצורה בטוחה)
          if (variable.name === 'Mute' && variable.query && service.serviceType.includes('RenderingControl')) {
            variable.query()
              .then(value => console.log(`        Value of ${variable.name}: ${value}`))
              .catch(err => console.error(`        Error querying ${variable.name}:`, err.message || err));
          }
        });
      } else {
        console.log('    No state variables found or SCPD not processed for state variables.');
      }
    }
  });
}
```

## שימוש בפונקציות ברמה נמוכה יותר (אופציונלי, למתקדמים)

למשתמשים המעוניינים בשליטה פרטנית יותר, חבילת `dlna.js` מייצאת גם את הפונקציות הבאות:

*   **`discoverSsdpDevicesIterable(options?: DiscoveryOptions): AsyncIterable<ProcessedDevice>`:**
    פונקציה זו מבצעת גילוי SSDP ומחזירה `AsyncIterable`. כל איבר ב-iterable הוא אובייקט `ProcessedDevice` שתואם ל-`detailLevel` שצוין ב-`options`. זה מאפשר עיבוד של התקנים ברגע שהם מתגלים ומעובדים, מבלי לחכות לסיום כל תהליך הגילוי.

*   **`processUpnpDevice(basicDevice: BasicSsdpDevice, options: DeviceProcessingOptions): Promise<ProcessedDevice | null>`:**
    (מיוצא מתוך `dlna.js`, במקור מהמודול `upnpDeviceProcessor.ts`)
    פונקציה זו לוקחת `BasicSsdpDevice` (למשל, כזה שהתקבל מאיטרטור גילוי בסיסי יותר) ומעבדת אותו לרמת הפירוט המבוקשת ב-`options.detailLevel`. היא אחראית על אחזור ה-XML, ניתוחו, אחזור SCPD (אם נדרש), והוספת פונקציות `invoke`/`query`.

הפונקציה `fetchDeviceDescription` שהייתה קיימת בעבר הפכה פנימית (`_fetchAndParseDeviceDescriptionXml`) ומשמשת כחלק מ-`processUpnpDevice`.
בדרך כלל, הפונקציה `discoverSsdpDevices` (עם קולבק `onDeviceFound`) או `discoverSsdpDevicesIterable` אמורות להספיק לרוב מקרי השימוש.

## קבועים שימושיים

חבילת `dlna.js` מייצאת מספר קבועים שיכולים להיות שימושיים בעבודה עם התקני UPnP, בעיקר לשימוש בפרמטר `searchTarget` או לזיהוי סוגי התקנים ושירותים:

```typescript
import {
  // Search Targets (ST)
  SSDP_ALL, // "ssdp:all"
  UPNP_ROOT_DEVICE, // "upnp:rootdevice"

  // Device Types
  MEDIA_SERVER_DEVICE, // "urn:schemas-upnp-org:device:MediaServer:1"
  MEDIA_RENDERER_DEVICE, // "urn:schemas-upnp-org:device:MediaRenderer:1"
  // ... ועוד סוגי התקנים

  // Service Types
  AVTRANSPORT_SERVICE, // "urn:schemas-upnp-org:service:AVTransport:1"
  CONTENT_DIRECTORY_SERVICE, // "urn:schemas-upnp-org:service:ContentDirectory:1"
  RENDERING_CONTROL_SERVICE, // "urn:schemas-upnp-org:service:RenderingControl:1"
  CONNECTION_MANAGER_SERVICE, // "urn:schemas-upnp-org:service:ConnectionManager:1"
  // ... ועוד סוגי שירותים
} from 'dlna.js';

// דוגמה לשימוש:
// discoverSsdpDevices({ searchTarget: MEDIA_RENDERER_DEVICE, ... });
```
יש לוודא שהקבועים אכן מיוצאים וזמינים.

## עבודה עם תוכן (ContentDirectoryService)

שירות `ContentDirectoryService` מאפשר אינטראקציה עם שירות ContentDirectory של התקני UPnP, כגון שרתי מדיה. הוא מאפשר עיון בתיקיות, חיפוש פריטים וקבלת מידע מפורט עליהם.

### ייבוא

```typescript
import {
  ContentDirectoryService,
  BrowseFlag,
  type BrowseResult,
  type DidlLiteContainer,
  type DidlLiteObject,
  type Resource,
  type ServiceDescription, // נדרש לאתחול ServiceDescription
  // sendUpnpCommand // ContentDirectoryService מייבא זאת ישירות
  type FullDeviceDescription, // מכיל baseURL
  CONTENT_DIRECTORY_SERVICE // קבוע שימושי
} from 'dlna.js';
```

### אתחול השירות

כדי להשתמש ב-`ContentDirectoryService`, יש צורך באובייקט `ServiceDescription` (המייצג את שירות ContentDirectory הספציפי בהתקן) וב-`baseURL` של ההתקן.

```typescript
// נניח שיש לנו אובייקט 'device' מסוג FullDeviceDescription שהתקבל מגילוי
// ושאנחנו רוצים לעבוד עם שירות ContentDirectory שלו.

let cdsServiceInfo: ServiceDescription | undefined;
if (device.serviceList) {
    cdsServiceInfo = device.serviceList.find(s => s.serviceType.includes(CONTENT_DIRECTORY_SERVICE));
}

if (cdsServiceInfo) {
  const cds = new ContentDirectoryService(cdsServiceInfo, device.baseURL);
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
    const result: BrowseResult = await cds.browse({
      objectID: objectId, // ObjectID (למשל, "0" עבור השורש)
      browseFlag: BrowseFlag.BrowseDirectChildren, // דגל לעיון בילדים ישירים
      filter: "*", // Filter (לקבל את כל המאפיינים)
      startingIndex: 0,
      requestedCount: 0 // 0 עבור כל הפריטים התואמים
    });

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

      if (item.class.startsWith('object.container')) { // זהו DidlLiteContainer
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
//   const cds = new ContentDirectoryService(cdsServiceInfo, device.baseURL);
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

הטיפוסים `DidlLiteContainer`, `DidlLiteObject`, ו-`Resource` מכילים שדות רבים המתארים את מאפייני הפריטים והמשאבים שלהם. הם מוגדרים ומיוצאים על ידי חבילת `dlna.js`.

## שליחת פקודות SOAP (`sendUpnpCommand`) - גישה ישירה

בעוד שהדרך המומלצת לאינטראקציה עם פעולות היא דרך פונקציות ה-`invoke` שנוספו לאובייקטי ה-`Action` (כאשר `detailLevel` הוא `Full`), הפונקציה `sendUpnpCommand` (המיוצאת מחבילת `dlna.js`) זמינה לשימוש ישיר. היא משמשת "מתחת למכסה המנוע" על ידי פונקציות ה-`invoke` ועל ידי שירותים ספציפיים כמו `ContentDirectoryService`. ניתן להשתמש בה ישירות אם יש צורך בשליטה נמוכה יותר, לשליחת פקודות שאין להן עטיפה ייעודית, או לצורך ניפוי שגיאות.

### ייבוא

```typescript
import {
  sendUpnpCommand,
  type SoapFault, // לטיפול בשגיאות
  type ServiceDescription, // נדרש כדי לקבל controlURL ו-serviceType
  CONNECTION_MANAGER_SERVICE // קבוע שימושי לדוגמה
} from 'dlna.js';
```

### דוגמת שימוש

הפונקציה `sendUpnpCommand` מקבלת אובייקט `UpnpCommandOptions` עם הפרמטרים הבאים:
*   `controlURL`: כתובת ה-URL של נקודת הבקרה של השירות (נמצא ב-`ServiceDescription.controlURL`).
*   `serviceType`: ה-URN של סוג השירות (נמצא ב-`ServiceDescription.serviceType`).
*   `actionName`: שם הפעולה לביצוע (למשל, "GetProtocolInfo").
*   `args` (אופציונלי): אובייקט JavaScript המכיל את הארגומנטים של הפעולה. אם אין ארגומנטים, ניתן להשמיט או להעביר אובייקט ריק `{}`.
*   `baseURL` (אופציונלי): כתובת בסיס לפתרון `controlURL` אם הוא יחסי.
*   `customLogger` (אופציונלי).

```typescript
async function getProtocolInfoExample(service: ServiceDescription, baseUrl?: string) {
  if (!service.controlURL || !service.serviceType) {
    console.error("Service controlURL or serviceType is missing.");
    return;
  }

  try {
    // הפונקציה sendUpnpCommand זורקת שגיאה במקרה של כשל SOAP או רשת
    const result: Record<string, any> = await sendUpnpCommand({
      controlURL: service.controlURL,
      serviceType: service.serviceType,
      actionName: "GetProtocolInfo", // שם הפעולה
      args: {}, // אין פרמטרים לפעולה זו
      baseURL: baseUrl
    });

    console.log("GetProtocolInfo successful!");
    console.log("Source:", result.Source);
    console.log("Sink:", result.Sink);

  } catch (error: any) {
    console.error("Error invoking GetProtocolInfo via sendUpnpCommand:");
    if (error.soapFault) {
        const fault = error.soapFault as SoapFault;
        console.error(`  Fault Code: ${fault.faultCode}`);
        console.error(`  Fault String: ${fault.faultString}`);
        if (fault.detail?.UPnPError?.errorCode) { // מבנה שונה לפרטי שגיאת UPnP
            console.error(`  UPnP Error Code: ${fault.detail.UPnPError.errorCode}`);
        }
        if (fault.detail?.UPnPError?.errorDescription) {
             console.error(`  UPnP Error Description: ${fault.detail.UPnPError.errorDescription}`);
        }
    } else {
        console.error(`  Message: ${error.message}`);
    }
  }
}

// כדי להריץ את הדוגמה:
// נניח שיש לנו 'device' מסוג FullDeviceDescription, ואנחנו רוצים לקרוא לפעולה בשירות ConnectionManager שלו
// let connManagerService: ServiceDescription | undefined;
// if (device.serviceList) {
//   connManagerService = device.serviceList.find(s => s.serviceType.includes(CONNECTION_MANAGER_SERVICE));
// }
// if (connManagerService) {
//   getProtocolInfoExample(connManagerService, device.baseURL);
// }
```

### מבנה התגובה מ-`sendUpnpCommand`

הפונקציה `sendUpnpCommand` מחזירה `Promise<Record<string, any>>`.
*   במקרה של הצלחה, ה-Promise יתממש עם אובייקט המכיל את הפרמטרים שהוחזרו מהפעולה (למשל, עבור `GetProtocolInfo`, הוא יכיל את `Source` ו-`Sink`).
*   במקרה של שגיאת SOAP או שגיאת רשת, ה-Promise יידחה עם אובייקט `Error`. אם השגיאה היא שגיאת SOAP, לאובייקט ה-`Error` יתווסף מאפיין `soapFault` מסוג `SoapFault` המכיל את פרטי השגיאה.
    *   `faultCode`: קוד השגיאה (למשל, `s:Client` או `s:Server`).
    *   `faultString`: תיאור מילולי של השגיאה.
    *   `detail` (אופציונלי): אובייקט המכיל פרטים נוספים, שעשוי לכלול `UPnPError` עם:
        *   `errorCode`: קוד שגיאה ספציפי ל-UPnP.
        *   `errorDescription`: תיאור שגיאת ה-UPnP.

## יצירת לוגרים (createLogger)

המודול כולל מערכת לוגינג מבוססת `winston` המאפשרת יצירת לוגרים מותאמים לכל מודול או חלק בקוד שלך. זה עוזר לארגן ולסנן הודעות לוג בצורה יעילה.

### ייבוא

```typescript
import { createLogger } from 'dlna.js';
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
*   `LOG_MODULES`: רשימה מופרדת בפסיקים של שמות מודולים שרק עבורם יודפסו הודעות לוג (למשל, `MyApplicationLogic,upnpDeviceExplorer`). אם לא מוגדר, ריק, או `*`, יודפסו הודעות מכל המודולים (אלא אם מודול ספציפי מוסתר על ידי `LOG_HIDE_MODULES`).
*   `LOG_HIDE_MODULES`: רשימה מופרדת בפסיקים של שמות מודולים שיש להסתיר מהלוגים. לדוגמה, `InternalDebug,VerboseModule`. אם מודול מופיע כאן, הוא לא יודפס גם אם הוא כלול ב-`LOG_MODULES` או אם `LOG_MODULES` הוא `*`.

ניתן לעיין בקובץ [`src/logger.ts`](../src/logger.ts) לפרטים נוספים על משתני הסביבה הנתמכים והתנהגות ברירת המחדל.

## דוגמת קוד מורחבת

דוגמה זו (בהשראת [`examples/comprehensiveUpnpExample.ts`](../examples/comprehensiveUpnpExample.ts)) מדגימה גילוי התקנים, סינון התקנים מסוג "MediaRenderer", והדפסת פרטי שירות "AVTransport" אם קיים, כולל הפעלת פעולה.

```typescript
import {
  discoverSsdpDevices,
  DiscoveryDetailLevel,
  MEDIA_RENDERER_DEVICE,
  AVTRANSPORT_SERVICE,
  type FullDeviceDescription,
  type ServiceDescription,
  type Action
} from '../src/index';

async function findAndInspectMediaRenderers() {
  console.log('Looking for Media Renderer devices...');
  const foundRenderers: FullDeviceDescription[] = [];

  try {
    await discoverSsdpDevices({
      searchTarget: MEDIA_RENDERER_DEVICE,
      timeoutMs: 7000, // זמן ארוך יותר לגילוי
      detailLevel: DiscoveryDetailLevel.Full, // נבקש את כל הפרטים
      onDeviceFound: (processedDevice: ProcessedDevice) => {
        const device = processedDevice as FullDeviceDescription; // הנחה ש-detailLevel הוא Full
        console.log(`\nFound Media Renderer: ${device.friendlyName} (UDN: ${device.UDN})`);
        console.log(`  Location: ${device.location}`);
        console.log(`  Manufacturer: ${device.manufacturer || 'N/A'}, Model: ${device.modelName || 'N/A'}`);
        foundRenderers.push(device);

        if (device.serviceList) {
          const avTransportService = device.serviceList.find(
            (s: ServiceDescription) => s.serviceType.includes(AVTRANSPORT_SERVICE)
          );

          if (avTransportService) {
            console.log(`  AVTransport Service (${avTransportService.serviceId}):`);
            console.log(`    Control URL: ${avTransportService.controlURL}`);
            console.log(`    SCPD URL: ${avTransportService.SCPDURL}`);

            if (avTransportService.actionList) {
              console.log(`    Actions (${avTransportService.actionList.length}):`);
              avTransportService.actionList.forEach((action: Action) => {
                console.log(`      - ${action.name} ${action.invoke ? '(Invokable)' : ''}`);
              });

              // ננסה להפעיל פעולה, למשל GetMediaInfo
              const getMediaInfoAction = avTransportService.actionList.find(a => a.name === 'GetMediaInfo');
              if (getMediaInfoAction && getMediaInfoAction.invoke) {
                console.log(`    Invoking GetMediaInfo...`);
                getMediaInfoAction.invoke({ InstanceID: "0" }) // InstanceID הוא בדרך כלל מחרוזת
                  .then(mediaInfo => {
                    console.log(`      GetMediaInfo Result for ${device.friendlyName}:`);
                    console.log(`        NrTracks: ${mediaInfo.NrTracks}`);
                    console.log(`        MediaDuration: ${mediaInfo.MediaDuration}`);
                    console.log(`        CurrentURI: ${mediaInfo.CurrentURI}`);
                  })
                  .catch(err => {
                    console.error(`      Error invoking GetMediaInfo for ${device.friendlyName}:`, err.message || err);
                  });
              }
            } else {
              console.log('    No actions found for AVTransport service (SCPD might be missing or failed).');
            }
          } else {
            console.log('  AVTransport service not found on this renderer.');
          }
        } else {
          console.log('  No services listed for this renderer.');
        }
      }
    });

    console.log(`\nDiscovery finished. Found ${foundRenderers.length} Media Renderers.`);
    if (foundRenderers.length > 0) {
      console.log("Summary of found renderers:");
      foundRenderers.forEach(r => console.log(`- ${r.friendlyName} (UDN: ${r.UDN})`));
    }

  } catch (error) {
    console.error('\nError during comprehensive Media Renderer discovery:', error);
  }
}

findAndInspectMediaRenderers();