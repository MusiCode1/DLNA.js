# תוכנית לשיפור מודול ניהול המכשירים (סיכום)

## 1. יעד מרכזי
שיפור מודול ניהול המכשירים על ידי העברתו לליבת `dlna-core`, אופטימיזציה של תהליך גילוי המכשירים, וטיפול נכון יותר במחזור החיים שלהם.

## 2. מודול ליבה חדש: `activeDeviceManager.ts`
- **מיקום:** `packages/dlna-core/src/activeDeviceManager.ts`
- **מבנה:** ימומש כ-`Class` שיורש מ-`EventEmitter` (Node.js `events` module).
- **אחריויות עיקריות:**
    - ניהול תהליך גילוי מכשירים רציף.
    - אחזקת רשימה עדכנית של מכשירים פעילים (`Map<string, ApiDevice>`).
    - פליטת אירועים: `devicefound`, `devicelost`, `deviceupdated`.
    - חשיפת מתודות: `getActiveDevices(): Map<string, ApiDevice>`, `start()`, `stop()`.
- **ניהול סוקטים:** יחזיק סוקטים קבועים פתוחים (לא ייצור ויסגור בכל מחזור).

## 3. אסטרטגיית גילוי מכשירים
- שילוב של האזנה פסיבית מתמדת להודעות `NOTIFY`.
- ביצוע M-SEARCH ראשוני בעת אתחול.
- (אופציונלי) M-SEARCH תקופתי בתדירות נמוכה כגיבוי.

## 4. ניהול מחזור חיי מכשיר
- **`CACHE-CONTROL: max-age`:** שימוש לקביעת זמן תפוגה (`expiresAt`) למכשיר.
- **`ssdp:byebye`:** טיפול להסרה מיידית של מכשירים.
- **אופטימיזציה של פרטים:**
    - ברירת מחדל `detailLevel: DiscoveryDetailLevel.Full`.
    - בדיקה אם פרטים מלאים קיימים לפני שליפה חוזרת; אם כן, עדכון `lastSeen` בלבד.
    - אין רענון תקופתי אוטומטי של פרטים מלאים.
- **יציבות:** בדיקת `Content-Type` של תגובות HTTP לפני ניתוח XML.

## 5. שימוש בשרת (`packages/server`)
- [`deviceManager.ts`](packages/server/src/deviceManager.ts) (בשרת) ישתמש במופע של [`ActiveDeviceManager`](packages/dlna-core/src/activeDeviceManager.ts).
- יאזין לאירועים מהליבה וישתמש במתודות שלה.

## 6. תרשים מבנה מוצע

```mermaid
graph TD
    subgraph dlna-core
        CoreModule[activeDeviceManager.ts]
        CoreModule -- Inherits & Uses --> NodeEvents(EventEmitter)
        CoreModule -- Manages --> InternalSockets(Persistent Sockets)
        CoreModule -- Performs --> SSDPDiscoveryLogic(SSDP Discovery Logic: M-SEARCH & Passive Listen)
        SSDPDiscoveryLogic -- Raw Device Data --> CoreModule
        CoreModule -- Manages --> ActiveDevicesMap{Active Devices Map w/ expiresAt}
        CoreModule -- Handles --> ByeByeLogic[SSDP ByeBye Logic]
        CoreModule -- Handles --> CacheControlLogic[Cache-Control Logic]
        CoreModule -- Validates --> XMLContentTypeValidation[XML Content-Type Validation]
        CoreModule -- Emits Events --> EventBus((Events: deviceFound, deviceLost, deviceUpdated))
    end

    subgraph server
        ServerDeviceManager[deviceManager.ts] -- Creates Instance & Consumes --> CoreModule
        ServerDeviceManager -- Listens To --> EventBus
        Routes[routes.ts] -- Uses --> ServerDeviceManager
        App[app.ts] -- Uses --> ServerDeviceManager
        PlayPreset[playPresetHandler.ts] -- Uses --> ServerDeviceManager
    end

    OtherConsumers[Other Consumers (e.g., CLI tools)] -- Potentially Creates Instance & Consumes --> CoreModule
    OtherConsumers -- Potentially Listens To --> EventBus