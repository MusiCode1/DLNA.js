# תוכנית לשיפור ניהול התקנים ותיקון הפעלת פריסט

## רקע
הדיון התחיל מבדיקה של לוגיקה בקובץ `packages/server/src/playPresetHandler.ts` שבה נזרקה שגיאה אם התקן renderer לא נמצא במאגר `activeDevices` מיד לאחר ניסיון "החייאה". התברר שההנחה לעדכון מיידי של המאגר אינה תמיד נכונה, ושקיימת כפילות בניהול רשימת ההתקנים בין `dlna-core` (באמצעות `ActiveDeviceManager`) לבין `packages/server/src/deviceManager.ts`. בנוסף, זוהתה אי-עקביות בטיפוס `ApiDevice` בין הליבה לשרת.

התוכנית שלהלן נועדה לטפל בבעיות אלו באופן מקיף.

## שלב 0: איחוד הגדרות טיפוס `ApiDevice` ו-`ApiDeviceIcon`

*   **קובץ יעד:** `packages/server/src/types.ts`
*   **מטרה:** להשתמש בהגדרות הטיפוסים מהליבה (`dlna-core`) במקום בהגדרות מקומיות בשרת, כדי להבטיח עקביות.
*   **פעולות:**
    1.  ב-`packages/server/src/types.ts`, עדכן את הייבוא מ-`dlna.js` כך שיכלול `ApiDevice as CoreApiDevice` ו-`DeviceIcon as CoreDeviceIcon`.
    2.  הסר את ההגדרות המקומיות של `interface ApiDevice` ו-`interface ApiDeviceIcon` מהקובץ.
    3.  הוסף type aliases: `export type ApiDevice = CoreApiDevice;` ו-`export type ApiDeviceIcon = CoreDeviceIcon;`.
*   **בדיקה:** לוודא שהפרויקט עדיין מתקמפל לאחר השינויים.

## שלב 1: Refactor של `packages/server/src/deviceManager.ts`

*   **קובץ יעד:** `packages/server/src/deviceManager.ts`
*   **מטרה:** להפוך את `ActiveDeviceManager` (מהליבה) למקור האמת הבלעדי לרשימת ההתקנים, ולהסיר את ניהול המצב הכפול בשרת.
*   **פעולות:**
    1.  שנה את הפונקציה `getActiveDevices` כך שתחזיר ישירות את התוצאה של `getCoreDeviceManager().getActiveDevices()`. הפונקציה תחזיר כעת `Map<UDN, CoreApiDevice>`.
    2.  הסר את המשתנה `activeDevices: Map<string, ApiDevice>` המקומי.
    3.  הסר את הפונקציה `initializeDeviceManagerEvents` ואת הקריאות אליה (האזנה לאירועים `devicefound`, `deviceupdated`, `devicelost` לעדכון המפה המקומית שכבר לא תהיה קיימת).
*   **בדיקה:** לוודא שהפרויקט עדיין מתקמפל ושרכיבים אחרים המשתמשים ב-`getActiveDevices` (אם ישנם) עדיין פועלים כשורה עם המבנה החדש של המפה המוחזרת (מפתח UDN).

## שלב 2: עדכון לוגיקת הפולינג ב-`packages/server/src/playPresetHandler.ts`

*   **קובץ יעד:** `packages/server/src/playPresetHandler.ts`
*   **מטרה:** ליישם פולינג אמין ויעיל לאיתור ה-renderer ב-`activeDevices` לאחר החייאה, תוך הסתמכות על `getActiveDevices` המתוקנת (שכעת מחזירה מפה עם UDN כמפתח).
*   **פעולות:**
    1.  הוסף ייבוא של `getActiveDevices` מ-`./deviceManager`.
    2.  הגדר קבועים לפולינג (למשל, `POLLING_INTERVAL_MS = 500`, `MAX_POLLING_ATTEMPTS = 10`).
    3.  בתוך הפונקציה `handleRendererTask`, בקטע הקוד שמטפל במצב שבו ה-renderer לא נמצא בתחילה ואמור לעבור החייאה:
        *   לאחר קריאה מוצלחת ל-`processUpnpDeviceFromUrl` (שמחזירה `revivedDevice`), החלף את הבדיקה הישירה של `activeDevices.get(rendererPreset.udn)` בלולאת פולינג.
        *   בכל איטרציה של הלולאה:
            *   קרא ל-`getActiveDevices()` המיובאת כדי לקבל את המפה העדכנית (`Map<UDN, CoreApiDevice>`).
            *   בדוק אם `currentActiveDevices.has(rendererPreset.udn)`.
            *   אם כן, שמור את ההתקן (`currentActiveDevices.get(rendererPreset.udn)`) וצא מהלולאה.
            *   אם לא, המתן `POLLING_INTERVAL_MS` והמשך לניסיון הבא, עד `MAX_POLLING_ATTEMPTS`.
        *   אם ההתקן לא נמצא לאחר כל ניסיונות הפולינג, זרוק `PlaybackError` עם הודעה מתאימה.
        *   אם ההתקן נמצא, החזר אותו.
*   **בדיקה:** לוודא שהפעלת פריסטים עובדת כשורה, במיוחד במצבים שבהם ה-renderer דורש החייאה.