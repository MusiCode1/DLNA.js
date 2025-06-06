# תוכנית יישום מפורטת: שיפור מודול ניהול המכשירים

## מבוא והסבר כללי על `ActiveDeviceManager`

מודול `ActiveDeviceManager` החדש נועד לרכז את כל הלוגיקה הקשורה לגילוי רציף, מעקב וניהול מחזור חיים של התקני UPnP ברשת. הוא ימוקם בחבילת הליבה `dlna-core` וישמש כבסיס מרכזי לכל רכיב במערכת שצריך מידע עדכני על מכשירים זמינים.

**מטרות עיקריות:**

*   **גילוי רציף:** המודול יאזין באופן קבוע להודעות SSDP (NOTIFY) ויבצע חיפושי M-SEARCH תקופתיים כדי לזהות מכשירים חדשים ולהסיר מכשירים שעזבו את הרשת.
*   **ניהול מצב מרכזי:** יחזיק רשימה עדכנית של כל המכשירים הפעילים (`activeDevices`) והמידע שנאסף עליהם.
*   **טיפול במחזור חיים:** יטפל בהודעות `ssdp:byebye` ויתחשב בערכי `CACHE-CONTROL: max-age` כדי לקבוע את תוקף המכשירים ולהסיר מכשירים לא פעילים.
*   **פליטת אירועים:** יספק מנגנון אירועים (`devicefound`, `deviceupdated`, `devicelost`, `error`, `started`, `stopped`) כדי לאפשר לרכיבים אחרים להגיב לשינויים בזמן אמת.
*   **גמישות בקבלת פרטים:** יאפשר קונפיגורציה של רמת הפירוט (`detailLevel`) הנדרשת עבור המכשירים, תוך אופטימיזציה למניעת שליפה מיותרת של מידע שכבר קיים.

**יתרונות:**

*   **ריכוזיות:** מונע כפילות קוד ומספק מקור אמת יחיד לגבי מצב המכשירים.
*   **יעילות:** אופטימיזציה של תהליך הגילוי וניהול המשאבים (סוקטים, טיימרים).
*   **מודולריות:** מאפשר שימוש חוזר בלוגיקת הליבה על ידי רכיבים שונים (למשל, השרת, כלי CLI).
*   **תחזוקתיות:** קוד מאורגן וקל יותר לתחזוקה והרחבה.

## החלטות עיצוביות ונימוקים

במהלך תכנון המודול והשינויים הנלווים, התקבלו מספר החלטות עיצוביות במקומות שהייתה בהם התלבטות:

1.  **מבנה `ActiveDeviceManager` (Class היורש מ-`EventEmitter`):**
    *   **התלבטות:** האם להשתמש ב-Class או בפונקציית יצרן (Factory Function).
    *   **החלטה:** נבחר להשתמש ב-Class שיורש מ-`EventEmitter`.
    *   **נימוק:** `ActiveDeviceManager` מנהל מצב פנימי מורכב (רשימת מכשירים, סוקטים, טיימרים, אופציות), יש לו מחזור חיים מוגדר (start/stop), והוא צריך לפלוט אירועים. Class מספק מבנה טבעי ומוכר לניהול מצב (`this`), מתודות, ואינטגרציה עם `EventEmitter` (בין אם בירושה או קומפוזיציה). ירושה ישירה מ-`EventEmitter` היא דפוס נפוץ וברור ב-Node.js למקרים כאלה.

2.  **שילוב `actionList` כ-`Map` גנרי עם טיפוסים ספציפיים (`XXXServiceActions`):**
    *   **התלבטות:** כיצד לאזן בין הצורך בגישה גנרית נוחה לפעולות (דרך `Map`) לבין הצורך בטיפוסיות חזקה עבור שירותים ספציפיים.
    *   **החלטה:**
        *   `BaseServiceDescription.actionList` יהיה `Map<string, Action>` (עם `invoke` גנרי).
        *   טיפוסים ספציפיים (כמו `ContentDirectory.SpecificService`) ימשיכו להכיל מאפיין `actions` עם הטיפוס הספציפי שלהם (למשל, `ContentDirectoryServiceActions`).
        *   יצירת קובץ חדש, `upnpSpecificServiceFactory.ts`, שיכיל פונקציות "יצרן/מאמת" (למשל, `tryCreateContentDirectoryService`). פונקציות אלו יקבלו `ServiceDescription` (עם `actionList` הגנרי מאוכלס), יבצעו בדיקות, וינסו לאכלס את המאפיין `service.actions` הספציפי.
    *   **נימוק:** גישה זו מאפשרת גם גישה גנרית נוחה (איטרציה על ה-`Map`, גישה לפי שם) וגם טיפוסיות חזקה עבור שירותים מוכרים. הקובץ `upnpSpecificServiceFactory.ts` מרכז את הלוגיקה של ההמרה וה-type assertions, ושומר על קוד נקי יותר ב-[`upnpDeviceProcessor.ts`](packages/dlna-core/src/upnpDeviceProcessor.ts).

3.  **נרמול מפתחות (במיוחד עבור `serviceList`):**
    *   **התלבטות:** האם להשתמש ב-URN המלא של השירות כמפתח, או במפתח קצר וידידותי.
    *   **החלטה:** עבור `DeviceDescription.serviceList` (ה-`Map`), המפתח יהיה `serviceType` מנורמל למפתח קצר (למשל, "AVTransport") באמצעות פונקציית עזר `normalizeServiceTypeToKey`. פונקציה זו תכלול מפת מיפוי מוגדרת מראש ולוגיקת fallback. עבור מפתחות של פעולות ומשתני מצב, יבוצע נרמול בסיסי (כמו `trim`).
    *   **נימוק:** מפתח קצר וידידותי נוח יותר לשימוש ולגישה ב-`Map`, תוך שמירה על היכולת לזהות את סוג השירות המדויק (ה-URN המלא) דרך המאפיין `serviceType` של אובייקט השירות עצמו.

4.  **עתיד הפונקציות ב-[`upnpDeviceExplorer.ts`](packages/dlna-core/src/upnpDeviceExplorer.ts):**
    *   **התלבטות:** האם להסיר לחלוטין את הפונקציות הקיימות או לשמר חלק מהן.
    *   **החלטה:**
        *   הפונקציה `discoverSsdpDevices` (שמחזירה Promise) תוסר.
        *   הפונקציה `discoverSsdpDevicesIterable` (שמחזירה `AsyncIterable`) תישמר, אך המימוש שלה ישוכתב כך שישתמש ב-[`ActiveDeviceManager`](packages/dlna-core/src/activeDeviceManager.ts) מאחורי הקלעים.
    *   **נימוק:** `AsyncIterable` מספק ממשק שימושי וייחודי לצריכת מכשירים כפי שהם מתגלים. שימוש ב-[`ActiveDeviceManager`](packages/dlna-core/src/activeDeviceManager.ts) כבסיס ימנע כפילות קוד.

5.  **טיפול בבקשות M-SEARCH נכנסות:**
    *   **התלבטות:** האם `ActiveDeviceManager` צריך להגיב לבקשות M-SEARCH שהוא קולט.
    *   **החלטה:** בשלב זה, `ActiveDeviceManager` יתעד קבלת בקשות M-SEARCH אך לא יגיב אליהן.
    *   **נימוק:** המיקוד הנוכחי של המודול הוא גילוי מכשירים *אחרים*. הוספת יכולת תגובה (הפיכתו ל"מכשיר" UPnP בעצמו) היא הרחבה אפשרית לעתיד אך אינה חלק מהדרישות המיידיות של ה-refactor.

## רקע
התוכנית מפרטת את הצעדים הנדרשים לשיפור מודול ניהול המכשירים בפרויקט, תוך התמקדות בהעברת הליבה לחבילת `dlna-core`, אופטימיזציה של תהליכי גילוי, ושיפור הטיפול במחזור חיי המכשיר.

## שלב 0: הכנות והגדרות טיפוסים

1.  **עדכון טיפוסים ב-[`packages/dlna-core/src/types.ts`](packages/dlna-core/src/types.ts) (ו/או [`packages/dlna-core/src/specificTypes.ts`](packages/dlna-core/src/specificTypes.ts)):**
    *   שנה את הגדרת `DeviceDescription` כך ש-`serviceList` יהיה `Map<string, ServiceDescription>`. המפתח יהיה `serviceType` מנורמל (למשל, "AVTransport") באמצעות פונקציית `normalizeServiceTypeToKey`.
    *   שנה את הגדרת `BaseServiceDescription` (ב-[`types.ts`](packages/dlna-core/src/types.ts)) כך ש-`actionList` יהיה `Map<string, Action>` (מפתח: `action.name` מנורמל) ו-`stateVariableList` יהיה `Map<string, StateVariable>` (מפתח: `stateVariable.name` מנורמל).
    *   הטיפוסים הספציפיים ב-[`specificTypes.ts`](packages/dlna-core/src/specificTypes.ts) (כמו `ContentDirectory.SpecificService`) ימשיכו להכיל את המאפיין `actions` (למשל, `ContentDirectoryServiceActions`) בנוסף ל-`actionList` הגנרי שיגיע בירושה.
    *   הגדר/העבר טיפוס `ApiDevice` (שייצג מכשיר ב-[`ActiveDeviceManager`](packages/dlna-core/src/activeDeviceManager.ts)) שיכלול: `lastSeen: number`, `expiresAt: number`, `detailLevelAchieved: DiscoveryDetailLevel`, ואת כל המידע מ-`FullDeviceDescription` (או הטיפוס המתאים לפי רמת הפירוט שהושגה).
    *   הגדר טיפוס `ActiveDeviceManagerOptions` שיכלול: `searchTarget?`, `mSearchIntervalMs?`, `deviceCleanupIntervalMs?`, `includeIPv6?`, `detailLevel?`, `onRawSsdpMessage?`, `networkInterfaces?`.

## שלב 1: שינויים במודולים קיימים ב-`dlna-core`

1.  **שינויים ב-[`packages/dlna-core/src/upnpDeviceProcessor.ts`](packages/dlna-core/src/upnpDeviceProcessor.ts):**
    *   **הוספת פונקציות עזר לנרמול מפתחות:**
        *   `normalizeServiceTypeToKey(serviceType: string): string`: ממפה URN של שירות למפתח קצר (למשל, "AVTransport"), כולל מפת מיפוי מוגדרת מראש ולוגיקת fallback.
        *   `normalizeGenericKey(key: string): string`: מבצעת `key.trim()` (או נרמול אחר אם יוגדר) עבור שמות פעולות ומשתני מצב.
    *   **בפונקציה `fetchAndParseDeviceDescriptionXml`:**
        *   לאחר קבלת תגובה מ-`axios`, הוסף בדיקת `Content-Type` של התגובה. אם אינו XML, רשום אזהרה והחזר `null`.
        *   שנה את אופן יצירת `serviceList` ל-`Map<string, ServiceDescription>`. המפתח יהיה `normalizeServiceTypeToKey(serviceNode.serviceType)`.
    *   **בפונקציה `fetchScpdAndUpdateService`:**
        *   לאחר קבלת תגובה מ-`axios`, הוסף בדיקת `Content-Type` דומה.
        *   שנה את אופן יצירת `actionList` ל-`Map<string, Action>`. המפתח יהיה `normalizeGenericKey(actionNode.name)`.
        *   שנה את אופן יצירת `stateVariableList` ל-`Map<string, StateVariable>`. המפתח יהיה `normalizeGenericKey(svNode.name)`.
        *   **לאחר** אכלוס `service.actionList` (ה-`Map` הגנרי), קרא לפונקציות המתאימות מהקובץ החדש [`upnpSpecificServiceFactory.ts`](packages/dlna-core/src/upnpSpecificServiceFactory.ts) (ראה שלב 1.5) כדי לנסות לאכלס את המאפיין `service.actions` הספציפי.
    *   ודא שפונקציית `populateActionsAndStateVariables` מעודכנת לשימוש ב-`Map` (למשל, איטרציה על `map.values()`) ושהיא יוצרת את פונקציות ה-`invoke` וה-`query` הגנריות עבור ה-`Action` וה-`StateVariable` שב-`Map`.

2.  **בדיקות ב-[`packages/dlna-core/src/ssdpSocketManager.ts`](packages/dlna-core/src/ssdpSocketManager.ts):**
    *   המודול נראה מתאים לשימוש. יש לוודא שהוא מנהל סוקטים כראוי (משאירם פתוחים).

## שלב 1.5: יצירת הקובץ `packages/dlna-core/src/upnpSpecificServiceFactory.ts`

1.  **מטרה:** קובץ זה יכיל פונקציות "יצרן/מאמת" עבור כל סוג שירות ספציפי נתמך.
2.  **פונקציות לדוגמה:** `tryCreateContentDirectoryService(service: ServiceDescription): ContentDirectory.SpecificService | null`, `tryCreateAVTransportService(service: ServiceDescription): AVTransport.SpecificService | null`, וכו'.
3.  **לוגיקה פנימית לכל פונקציה:**
    *   תקבל `ServiceDescription` (שכבר יש לו `actionList: Map<string, Action>` גנרי מאוכלס).
    *   תבדוק את `service.serviceType` המלא (ה-URN).
    *   תוודא שפעולות חובה המצופות מהטיפוס הספציפי אכן קיימות ב-`service.actionList` הגנרי.
    *   אם הבדיקות עוברות, תאתחל את המאפיין `service.actions` (למשל, `(service as ContentDirectory.SpecificService).actions = {} as ContentDirectory.ContentDirectoryServiceActions`).
    *   תאכלס את `service.actions` עם הפניות לאובייקטי ה-`Action` המתאימים מה-`actionList` הגנרי, תוך ביצוע type assertion נדרש לחתימות ה-`invoke` הספציפיות.
    *   תחזיר את אובייקט השירות המעודכן (עם הטיפוס הספציפי הנכון) אם ההמרה הצליחה, אחרת `null`.

## שלב 2: יצירת המחלקה `ActiveDeviceManager` ב-[`packages/dlna-core/src/activeDeviceManager.ts`](packages/dlna-core/src/activeDeviceManager.ts)

1.  **הגדרת המחלקה `ActiveDeviceManager`:**
    *   יורשת מ-`EventEmitter`.
    *   **מאפיינים פרטיים:** `options: Required<ActiveDeviceManagerOptions>`, `activeDevices: Map<string, ApiDevice>`, `socketManager: ReturnType<typeof createSocketManager> | null`, `mSearchIntervalId: NodeJS.Timeout | null`, `cleanupIntervalId: NodeJS.Timeout | null`, `isRunning: boolean`.
    *   **קונסטרוקטור:** מקבל `options?` ומאתחל ברירות מחדל.
    *   **מתודה פרטית `_parseAndMapSsdpMessage(msg: Buffer, rinfo: RemoteInfo): BasicSsdpDevice | null`:**
        *   מכילה את הלוגיקה מ-[`_mapHttpPacketToBasicSsdpDevice`](packages/dlna-core/src/upnpDeviceExplorer.ts:67) (מ-[`upnpDeviceExplorer.ts`](packages/dlna-core/src/upnpDeviceExplorer.ts)).
        *   משתמשת ב-[`parseHttpPacket`](packages/dlna-core/src/genericHttpParser.ts).
        *   מחזירה `BasicSsdpDevice` (כולל כל הכותרות המקוריות בשדה `headers`) או `null`.
        *   **טיפול ב-M-SEARCH נכנס:** אם `basicDevice.httpMethod === 'M-SEARCH'`, רושמת ללוג אך מתעלמת (לא מגיבה) בשלב זה.
    *   **מתודה פרטית `_handleSsdpMessage(msg: Buffer, rinfo: RemoteInfo, socketType: string): Promise<void>`:**
        *   קוראת ל-`_parseAndMapSsdpMessage`.
        *   אם ההודעה היא `ssdp:byebye`: מסירה את המכשיר מ-`activeDevices` ופולטת `devicelost`.
        *   אחרת (alive או תגובה ל-M-SEARCH):
            *   מחשבת `expiresAt` (מ-`cacheControlMaxAge` או ברירת מחדל).
            *   בודקת אם המכשיר (לפי USN) קיים ב-`activeDevices`.
                *   **אם קיים:** מעדכנת `lastSeen`, `expiresAt`. אם נדרש עדכון פרטים (לפי `detailLevel` או אם חסרים), קוראת ל-[`processUpnpDevice`](packages/dlna-core/src/upnpDeviceProcessor.ts:444). פולטת `deviceupdated`.
                *   **אם לא קיים:** קוראת ל-[`processUpnpDevice`](packages/dlna-core/src/upnpDeviceProcessor.ts:444). מוסיפה ל-`activeDevices`. פולטת `devicefound`.
    *   **מתודה פרטית `_cleanupDevices(): void`:**
        *   עוברת על `activeDevices`. מסירה מכשירים ש-`expiresAt` שלהם עבר. פולטת `devicelost`.
    *   **מתודה ציבורית `async start(): Promise<void>`:**
        *   מאתחלת `socketManager` באמצעות [`createSocketManager`](packages/dlna-core/src/ssdpSocketManager.ts:199), מעבירה את `_handleSsdpMessage` כקולבק, ואת `options.onRawSsdpMessage` (אם סופק) כדי לאפשר פליטת אירוע `rawmessage`.
        *   שולחת M-SEARCH ראשוני.
        *   מפעילה `setInterval` ל-M-SEARCH תקופתי.
        *   מפעילה `setInterval` ל-`_cleanupDevices`.
        *   פולטת אירוע `started`.
        *   אם `options.onRawSsdpMessage` סופק, יש להעביר אותו ל-`createSocketManager` (שצריך לתמוך בזה) ובקולבק של `onSocketMessage` ב-[`ActiveDeviceManager`](packages/dlna-core/src/activeDeviceManager.ts), לפלוט אירוע `rawmessage` עם ה-payload.
    *   **מתודה ציבורית `async stop(): Promise<void>`:**
        *   מנקה intervals.
        *   סוגרת `socketManager`.
        *   מנקה `activeDevices`.
        *   פולטת אירוע `stopped`.
    *   **מתודה ציבורית `getActiveDevices(): Map<string, ApiDevice>`:**
        *   מחזירה עותק של `activeDevices`.

## שלב 3: שינויים ב-[`packages/dlna-core/src/upnpDeviceExplorer.ts`](packages/dlna-core/src/upnpDeviceExplorer.ts)

1.  **הסרת הפונקציה `discoverSsdpDevices` (שמחזירה Promise).**
2.  **שכתוב המימוש של `discoverSsdpDevicesIterable`:**
    *   תיצור מופע של `ActiveDeviceManager` (עם האופציות המתאימות).
    *   תפעיל `activeDeviceManager.start()`.
    *   תאזין לאירוע `devicefound` ותעשה `yield` למכשירים.
    *   תטפל ב-`AbortSignal` ו-`timeoutMs` (אם סופקו) כדי לקרוא ל-`activeDeviceManager.stop()` ולסיים.
    *   תוודא קריאה ל-`activeDeviceManager.stop()` ב-`finally`.
3.  **הסרה/ריקון של `_discoverDevicesOrchestrator` והסרת `_mapHttpPacketToBasicSsdpDevice`.**

## שלב 4: עדכון השימוש בשרת - [`packages/server/src/deviceManager.ts`](packages/server/src/deviceManager.ts)

1.  ייבא והשתמש ב-`ActiveDeviceManager` מ-`dlna-core` במקום `ContinuousDeviceExplorer`.
2.  ב-`startDiscovery`: צור מופע יחיד של `ActiveDeviceManager`, האזן לאירועים (`devicefound`, `deviceupdated`, `devicelost`, `error`, `rawmessage` אם נחוץ), והפעל `coreDeviceManager.start()`.
3.  ב-`stopDiscovery`: קרא ל-`coreDeviceManager.stop()`.
4.  עדכן את `getActiveDevices` לקרוא למתודה המקבילה ב-`coreDeviceManager`.
5.  הסר את `updateDeviceList` ואת לוגיקת הניקוי המקומית.
6.  אם `getRawMessagesBuffer` נשאר, הוא יתבסס על אירוע `rawmessage` מ-`ActiveDeviceManager`.

## שלב 5: בדיקות וטיפול בשגיאות מפורט (במהלך היישום)

*   כתיבת בדיקות יחידה (Unit tests) עבור `ActiveDeviceManager` ו-`upnpSpecificServiceFactory`.
*   בדיקות אינטגרציה לוודא שהשרת עובד כצפוי.
*   בדיקה ש-`discoverSsdpDevicesIterable` עובד כצפוי.
*   במהלך היישום, יש לבצע בדיקה מעמיקה של הקוד, להוסיף טיפול בשגיאות במקומות שחסר, ולטפל במקרי קצה.

## תרשים מבנה מוצע (כפי שסוכם קודם, עם התייחסות ל-Factory)

```mermaid
graph TD
    subgraph dlna-core
        CoreModule[activeDeviceManager.ts]
        CoreModule -- Inherits & Uses --> NodeEvents(EventEmitter)
        CoreModule -- Uses --> SocketMgr([ssdpSocketManager.ts])
        SocketMgr -- Manages --> InternalSockets(Persistent Sockets)
        CoreModule -- Uses --> DeviceProc([upnpDeviceProcessor.ts])
        DeviceProc -- Uses --> HTTPParser([genericHttpParser.ts])
        DeviceProc -- Uses --> SpecificServiceFactory([upnpSpecificServiceFactory.ts])
        CoreModule -- Performs --> SSDPDiscoveryLogic(SSDP Discovery Logic: M-SEARCH & Passive Listen via SocketMgr)
        InternalSockets -- Raw SSDP Data --> CoreModule
        CoreModule -- Parses & Maps --> ParsedSSDPInfo(BasicSsdpDevice)
        CoreModule -- Processes w/ DeviceProc --> FullDeviceDetails(ApiDevice Data with Specific Actions)
        CoreModule -- Manages --> ActiveDevicesMap{Active Devices Map w/ expiresAt}
        CoreModule -- Handles --> ByeByeLogic[SSDP ByeBye Logic]
        CoreModule -- Handles --> CacheControlLogic[Cache-Control Logic]
        DeviceProc -- Validates --> XMLContentTypeValidation[XML Content-Type Validation]
        CoreModule -- Emits Events --> EventBus((Events: deviceFound, deviceLost, deviceUpdated, error, started, stopped, rawmessage?))
    end

    subgraph server
        ServerDeviceManager[deviceManager.ts] -- Creates Instance & Consumes --> CoreModule
        ServerDeviceManager -- Listens To --> EventBus
        Routes[routes.ts] -- Uses --> ServerDeviceManager
        App[app.ts] -- Uses --> ServerDeviceManager
        PlayPreset[playPresetHandler.ts] -- Uses --> ServerDeviceManager
    end

    subgraph dlna-core-utils
        UPnPExplorer[upnpDeviceExplorer.ts]
        UPnPExplorer -- Provides --> IterableInterface(discoverSsdpDevicesIterable)
        IterableInterface -- Uses (internally) --> CoreModule
    end

    OtherConsumers[Other Consumers (e.g., CLI tools)] -- Potentially Uses --> IterableInterface
    OtherConsumers -- Potentially Creates Instance & Consumes --> CoreModule