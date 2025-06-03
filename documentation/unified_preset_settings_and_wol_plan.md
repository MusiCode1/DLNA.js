# תוכנית מאוחדת: מערכת הגדרות פריסט עם תמיכה ב-Wake on LAN (WOL)

**מטרה כוללת:**
לאפשר למשתמש להגדיר פריסט יחיד להפעלת מדיה (Renderer, Media Server, תיקייה), תוך שמירת ההגדרות בקובץ JSON בשרת. התוכנית כוללת תמיכה בהערת ה-Renderer באמצעות Wake on LAN (WOL) ובדיקת זמינותו באמצעות פינג, ולאחר מכן "החייאתו" באמצעות קריאה ל-`processUpnpDeviceFromUrl` אם נדרש.
**הערה:** מימוש ממשק משתמש גרפי למסך הגדרות ([`public/settings.html`](public/settings.html:1), [`public/settings.js`](public/settings.js:1)) יידחה לשלב מאוחר יותר. בשלב זה, ייווצרו נקודות קצה API לניהול ההגדרות.

**1. עדכון טיפוסי הגדרות ([`server/types.ts`](server/types.ts:1))**

*   הגדרת טיפוסים היררכיים עבור הגדרות הפריסט, כאשר `ipAddress` ו-`macAddress` הם שדות חובה עבור ה-Renderer, ופרטי התיקייה (`folder` ו-`folder.objectId`) הם חובה עבור ה-Media Server.

    ```typescript
    // In server/types.ts

    export interface RendererPreset {
      udn: string;
      baseURL: string;
      ipAddress: string; // שדה חובה
      macAddress: string; // שדה חובה
    }

    export interface FolderPreset {
      objectId: string; // שדה חובה
      path?: string | null; // נתיב התיקייה, אופציונלי (לנוחות המשתמש, לא קריטי לפעולה)
    }

    export interface MediaServerPreset {
      udn: string;
      baseURL: string;
      folder: FolderPreset; // שדה חובה
    }

    export interface PresetSettings {
      renderer?: RendererPreset | null;
      mediaServer?: MediaServerPreset | null;
    }
    ```

**2. יצירת/בדיקת כלי עזר ל-WOL ופינג ([`server/wolUtil.ts`](server/wolUtil.ts:1) או שימוש/הרחבה של [`server/wol_script.ts`](server/wol_script.ts:1))**

*   יצירת או וידוא קיום של פונקציה אסינכרונית, לדוגמה:
    `async function sendWolAndPing(macAddress: string, ipAddress: string): Promise<boolean>`
*   הפונקציה תשלח חבילת WOL (באמצעות `sendWakeOnLan` מ-[`server/wol_script.ts`](server/wol_script.ts:1) או לוגיקה דומה).
*   לאחר שליחת ה-WOL, היא תמתין מספר שניות ותבצע בדיקות פינג חוזרות (באמצעות `checkPingWithRetries` מ-[`server/wol_script.ts`](server/wol_script.ts:1) או לוגיקה דומה).
*   הפונקציה תחזיר `true` אם הפינג הצליח בסופו של דבר, ו-`false` אחרת.
*   יש לוודא ש-[`server/wol_script.ts`](server/wol_script.ts:1) קיים, תקין ומייצא את הפונקציות הנדרשות, או ליצור/להתאים אותו. הפונקציות הרלוונטיות הן `sendWakeOnLan` ו-`checkPingWithRetries`.

**3. יצירת מנהל הגדרות ([`server/settingsManager.ts`](server/settingsManager.ts:1))**

*   קובץ זה יכיל:
    *   `async function getPresetSettings(): Promise<PresetSettings>`:
        *   קוראת `data/presetSettings.json`.
        *   מחזירה `{}` (אובייקט ריק) אם הקובץ לא קיים, לא תקין, או ריק.
        *   יוצרת את תיקיית `data` אם אינה קיימת.
    *   `async function savePresetSettings(settings: PresetSettings): Promise<void>`:
        *   שומרת את ההגדרות הנתונות ל-`data/presetSettings.json`.
        *   יוצרת את תיקיית `data` אם אינה קיימת.
*   **מבנה קובץ `data/presetSettings.json` לדוגמה:**
    ```json
    {
      "renderer": {
        "udn": "udn-renderer-123",
        "baseURL": "http://renderer-ip:port/desc.xml",
        "ipAddress": "192.168.1.100",
        "macAddress": "00:1A:2B:3C:4D:5E"
      },
      "mediaServer": {
        "udn": "udn-server-456",
        "baseURL": "http://server-ip:port/desc.xml",
        "folder": {
          "objectId": "0$1$2",
          "path": "/Music/MyAlbum"
        }
      }
    }
    ```

**4. עדכון נקודת הקצה [`GET /api/play-preset`](server/index.ts:90) ב-[`server/index.ts`](server/index.ts:1)**

*   **קריאת הגדרות:** שימוש ב-`await getPresetSettings()`.
*   **בדיקת תקינות:** וידוא שכל שדות החובה מההגדרות קיימים (`presetSettings.renderer?.udn`, `presetSettings.renderer?.baseURL`, `presetSettings.renderer?.ipAddress`, `presetSettings.renderer?.macAddress`, `presetSettings.mediaServer?.udn`, `presetSettings.mediaServer?.baseURL`, `presetSettings.mediaServer?.folder?.objectId`). אם אחד מהם חסר, החזרת שגיאה 400 (Bad Request) עם הודעה מתאימה.
*   **לוגיקת Wake on LAN (WOL) והחייאת מכשיר:**
    1.  שליפת `rendererPreset = presetSettings.renderer!` (לאחר בדיקת קיום).
    2.  בדיקה אם ה-Renderer (לפי `rendererPreset.udn`) קיים ב-`activeDevices`.
    3.  אם ה-Renderer **לא** פעיל:
        *   קריאה ל-`await sendWolAndPing(rendererPreset.macAddress, rendererPreset.ipAddress)`.
        *   אם `sendWolAndPing` מחזירה `false` (ההתקן לא התעורר), החזר שגיאה 503 (Service Unavailable) למשתמש: "Renderer did not respond after Wake on LAN attempt."
        *   אם `sendWolAndPing` מחזירה `true`:
            *   קריאה לפונקציה `processUpnpDeviceFromUrl(rendererPreset.baseURL, DiscoveryDetailLevel.Services)` (מיובאת מ-[`src/index.ts`](src/index.ts:1) או ישירות מ-[`src/upnpDeviceProcessor.ts`](src/upnpDeviceProcessor.ts:1)). (ראה סעיף 6 לפרטי הפונקציה `processUpnpDeviceFromUrl`).
            *   אם `processUpnpDeviceFromUrl` מחזירה `null` (החייאה נכשלה), החזר שגיאה 503: "Failed to retrieve renderer details after Wake on LAN."
            *   אם ההחייאה הצליחה, הוסף/עדכן את המכשיר שהוחיה ב-`activeDevices` באמצעות הפונקציה [`updateDeviceList`](server/index.ts:133).
*   **הפעלת המדיה:**
    *   לאחר וידוא שה-Renderer וה-Media Server קיימים ב-`activeDevices` (או הוחיו בהצלחה), קריאה ל-[`playFolderOnRenderer`](server/index.ts:13) עם ה-UDNs וה-`folderObjectId` המתאימים.

**5. יצירת נקודות קצה לניהול הגדרות ב-[`server/index.ts`](server/index.ts:1)**

*   **`GET /api/settings/preset`**:
    *   קוראת הגדרות באמצעות `getPresetSettings`.
    *   מחזירה את אובייקט ההגדרות.
*   **`POST /api/settings/preset`**:
    *   מקבלת אובייקט `PresetSettings` בגוף הבקשה (JSON).
    *   שומרת את ההגדרות באמצעות `savePresetSettings`.
    *   מחזירה סטטוס 200 עם הודעת הצלחה: `{ message: "Preset settings saved successfully." }`.

**6. פונקציית עזר להחייאת מכשירים מספריית UPnP ([`src/upnpDeviceProcessor.ts`](src/upnpDeviceProcessor.ts:1))**

*   **מטרה:** להוסיף פונקציה חדשה לספרייה שתאפשר לקבל תיאור מלא של מכשיר UPnP על סמך ה-`locationUrl` (או `baseURL`) שלו. פונקציה זו תשמש להחייאת מכשירים לאחר WOL או במקרים אחרים בהם המכשיר לא התגלה בסריקה אקטיבית אך ה-`baseURL` שלו ידוע.
*   **שם הפונקציה (קיימת ומיוצאת מ-[`src/upnpDeviceProcessor.ts`](src/upnpDeviceProcessor.ts:1)):**
    `async function processUpnpDeviceFromUrl(locationUrl: string, detailLevel: DiscoveryDetailLevel, abortSignal?: AbortSignal): Promise<ProcessedDevice | null>`
*   **קלט:**
    *   `locationUrl: string`: כתובת ה-URL המלאה לקובץ התיאור הראשי של המכשיר.
    *   `detailLevel: DiscoveryDetailLevel`: רמת הפירוט הרצויה (לצורך החייאה לשימוש בשרת, `DiscoveryDetailLevel.Services` אמור להספיק).
    *   `abortSignal?: AbortSignal`: אות לביטול הפעולה.
*   **פלט:** `Promise<ProcessedDevice | null>`
    *   `ProcessedDevice`: אובייקט המכשיר המעובד, שהטיפוס הספציפי שלו תלוי ב-`detailLevel` (למשל, `DeviceDescription`, `DeviceWithServicesDescription`, `FullDeviceDescription`).
    *   `null`: אם התהליך נכשל באופן קריטי (למשל, לא ניתן לאחזר את ה-XML הראשוני, או שה-URL לא תקין).
*   **לוגיקה פנימית של `processUpnpDeviceFromUrl` (כפי שמומשה ב-[`src/upnpDeviceProcessor.ts`](src/upnpDeviceProcessor.ts:1)):**
    1.  **אחזור וניתוח XML ראשי:**
        *   קריאה ל-[`fetchAndParseDeviceDescriptionXml(locationUrl, abortSignal)`](src/upnpDeviceProcessor.ts:33).
    2.  **הכנת אובייקט בסיס.**
    3.  **עיבוד לפי `detailLevel`:**
        *   אם `detailLevel === DiscoveryDetailLevel.Basic` או `detailLevel === DiscoveryDetailLevel.Description`: החזרת `initialDeviceDescription`.
        *   אם `detailLevel >= DiscoveryDetailLevel.Services`: קריאה ל-`await populateServices(initialDeviceDescription, abortSignal)`.
        *   אם `detailLevel === DiscoveryDetailLevel.Full`: קריאה ל-[`populateActionsAndStateVariables`](src/upnpDeviceProcessor.ts:353) עבור כל שירות.
    4.  **טיפול ב-AbortSignal.**
*   **ייצוא הפונקציה:** הפונקציה כבר מיוצאת מ-[`src/upnpDeviceProcessor.ts`](src/upnpDeviceProcessor.ts:1) וניתן לייבא אותה בשרת דרך [`src/index.ts`](src/index.ts:1).

**7. צד לקוח - מסך הגדרות פריסט (למימוש עתידי)**

*   **מטרה:** לאפשר למשתמש ממשק גרפי לבחירת ה-Renderer, ה-Media Server והתיקייה לפריסט.
*   **קבצים:** [`public/settings.html`](public/settings.html:1), [`public/settings.js`](public/settings.js:1).
*   **מבנה דף ההגדרות (`settings.html`):**
    *   כותרת: "הגדרות פריסט".
    *   אזור בחירת Renderer:
        *   רשימה נפתחת (`<select>`) של מכשירים שזוהו כ-Renderers (לפי `serviceType` או יכולות).
        *   שדות להזנת כתובת IP וכתובת MAC (אם לא נשלפו אוטומטית).
    *   אזור בחירת Media Server:
        *   רשימה נפתחת (`<select>`) של מכשירים שזוהו כ-Media Servers.
    *   אזור בחירת תיקייה:
        *   יוצג לאחר בחירת Media Server.
        *   יכול להיות רשימה נפתחת או מנגנון דפדוף פשוט המבוסס על קריאות לנקודת הקצה `/api/devices/:udn/browse`.
        *   יציג את שם התיקייה הנבחרת (ואולי את הנתיב המלא).
    *   כפתור "שמור הגדרות".
    *   אזור להצגת הודעות משוב (הצלחה/שגיאה).
*   **לוגיקה ב-JavaScript ([`public/settings.js`](public/settings.js:1)):**
    *   **בעת טעינת הדף:**
        1.  קריאה ל-`GET /api/settings/preset` לטעינת ההגדרות השמורות.
        2.  קריאה ל-`GET /api/devices` לטעינת רשימת המכשירים הזמינים.
        3.  אכלוס הרשימות הנפתחות של ה-Renderers וה-Media Servers.
        4.  אם קיימות הגדרות שמורות, בחירת הערכים המתאימים ברשימות הנפתחות ומילוי שדות ה-IP/MAC.
        5.  אם שמור Media Server, טעינת התיקיות שלו (קריאה ל-`POST /api/devices/:udn/browse` עם `ObjectID: '0'`) ואם שמורה תיקייה, בחירתה.
    *   **בעת בחירת Media Server מהרשימה הנפתחת:**
        1.  קבלת ה-`udn` של ה-Media Server שנבחר.
        2.  קריאה ל-`POST /api/devices/:udn/browse` (עם `ObjectID: '0'`) כדי לקבל את רשימת התיקיות ברמה העליונה.
        3.  אכלוס אזור בחירת התיקייה.
    *   **בעת לחיצה על "שמור הגדרות":**
        1.  איסוף הערכים הנבחרים:
            *   עבור Renderer: `udn`, `baseURL` (מהאובייקט המקורי שהתקבל מ-`/api/devices`), `ipAddress`, `macAddress`.
            *   עבור Media Server: `udn`, `baseURL`.
            *   עבור תיקייה: `objectId`, `path` (אם רלוונטי).
        2.  בניית אובייקט `PresetSettings` במבנה ההיררכי שסוכם.
        3.  קריאה ל-`POST /api/settings/preset` עם אובייקט ההגדרות החדש.
        4.  הצגת הודעת הצלחה/שגיאה למשתמש.

**תרשים זרימה (עבור `GET /api/play-preset`):**
```mermaid
sequenceDiagram
    participant User as משתמש (דרך כלי API)
    participant ServerPlayPreset as GET /api/play-preset
    participant SettingsManager as server/settingsManager.ts
    participant WOLUtil as server/wolUtil.ts (sendWolAndPing)
    participant UPnPRevivalLib as src/upnpDeviceProcessor.ts (processUpnpDeviceFromUrl)
    participant ActiveDevices as activeDevices Map
    participant RendererHandler as server/rendererHandler.ts (playFolderOnRenderer)

    User->>ServerPlayPreset: בקשה להפעלת פריסט
    ServerPlayPreset->>SettingsManager: getPresetSettings()
    SettingsManager-->>ServerPlayPreset: מחזיר PresetSettings

    alt הגדרות קריטיות חסרות (renderer.udn/baseURL/ip/mac, mediaServer.udn/baseURL, mediaServer.folder.objectId)
        ServerPlayPreset-->>User: שגיאה 400: הגדרות פריסט לא מלאות
        stop
    end

    ServerPlayPreset->>ActiveDevices: בדוק אם Renderer (presetSettings.renderer.udn) פעיל
    alt Renderer לא פעיל
        ServerPlayPreset->>WOLUtil: sendWolAndPing(renderer.macAddress, renderer.ipAddress)
        alt WOL או Ping נכשלו
            WOLUtil-->>ServerPlayPreset: מחזיר false
            ServerPlayPreset-->>User: שגיאה 503: לא ניתן להעיר את ה-Renderer
            stop
        else WOL ו-Ping הצליחו
            WOLUtil-->>ServerPlayPreset: מחזיר true
            ServerPlayPreset->>UPnPRevivalLib: processUpnpDeviceFromUrl(renderer.baseURL, DetailLevel.Services)
            alt החייאת Renderer נכשלה
                UPnPRevivalLib-->>ServerPlayPreset: null
                ServerPlayPreset-->>User: שגיאה 503: לא ניתן לאחזר פרטי Renderer לאחר WOL
                stop
            else החייאת Renderer הצליחה
                UPnPRevivalLib-->>ServerPlayPreset: revivedRendererDevice
                ServerPlayPreset->>ActiveDevices: עדכן/הוסף revivedRendererDevice (דרך updateDeviceList)
            end
        end
    end

    %% ניתן להוסיף לוגיקה דומה עבור Media Server אם נדרש בעתיד (כרגע לא בתוכנית)

    ServerPlayPreset->>RendererHandler: playFolderOnRenderer(presetSettings.renderer.udn, presetSettings.mediaServer.udn, presetSettings.mediaServer.folder.objectId, activeDevices, logger)
    RendererHandler-->>ServerPlayPreset: תוצאת הפעלה (הצלחה/כישלון)
    ServerPlayPreset-->>User: מחזיר תוצאה