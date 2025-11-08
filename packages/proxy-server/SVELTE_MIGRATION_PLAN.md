# תוכנית מעבר ל־Svelte עבור proxy-server

## 1. מטרות ועל
- ליצור ממשק משתמש מודרני ל־LG WebOS Remote על בסיס SvelteKit, עם חוויית פיתוח ולוגיקה נוחה יותר לעומת vanilla JS.
- להשאיר את שרת Bun/Hono קיים כ־API/Proxy וליצור תת־פרויקט חדש תחת `packages` עבור ה־UI.
- לשמר את כל היכולות הקיימות: ניהול חיבור, Wake-on-LAN, שליחת פקודות, Toast, צילום מסך רציף ושליחת טקסט.

## 2. תת־פרויקט חדש
- **שם מוצע:** `packages/webos-remote-ui`.
- **סטאק:** SvelteKit + Vite + TypeScript, Tailwind (או שימוש זמני ב־CSS קיים), שימוש ב־Svelte stores לניהול state.
- **תצורת חבילות:** npm workspace (משותפת לשאר הפרויקטים). תלות פנימית ב־`lg-webos-remote` מה־workspace.
- **Environment:** קובץ `.env` עם `PUBLIC_PROXY_BASE_URL` לגישה ל־`http://localhost:3005`.
- **Scripts:** `dev`, `build`, `preview`, ו־`check` (lint/tests). הרשמה תחת `package.json` הראשי.

## 3. Workflow והטמעה מול השרת
- **פיתוח:** להריץ `bun run dev` על ה־proxy הקיים, ו־`npm run dev -- --open` על ה־SvelteKit; להגדיר proxy ב־`vite.config` עבור `/api`, `/proxy`, `/ws`.
- **Production:** build של SvelteKit (`npm run build`) יוצר `build/`. להגדיר deployment strategy:
  1. או לשמור כ־SSR נפרד (SvelteKit adapter-node + pm2 תהליך נוסף).
  2. או ליצור build סטטי (`adapter-static`) ולגרום ל־Hono להגיש את התוצר מ־`public/ui-build`.
- **שיתוף טיפוסים:** `src/lib/types` עם דגמי בקשות/תגובות (`WakeRequest`, `WakeResponse`, `TVDevice`). ניתן לשתף דרך חבילה משותפת אם נדרש.

## 4. חלוקת עמודים וראוטים
- `/` – המסך הראשי עם כל רכיבי השליטה (ברירת מחדל).
- `/settings` – ניהול רשימת טלוויזיות/ברירות מחדל.
- `/diagnostics` (אופציונלי) – תצוגת לוגים, בדיקות חיבור, בדיקת Proxy.
- Layout גלובלי עם header, הודעות שגיאה, ו־CSS גלובלי.

## 5. חלוקת קומפוננטות
1. **AppShell**
   - Layout בסיסי, Theme, טיפול ב־`<Toaster />` (ל־notifications).
2. **ConnectionModeSwitcher**
   - בחירה בין “הזנה ידנית” ל“בחירה מרשימה”.
3. **ManualConnectionForm**
   - שדות IP, Client Key, MAC; ולידציה בזמן אמת; שמירת ערכים ב־localStorage.
4. **TVListSelector**
   - טוען רשימת טלוויזיות מ־`tv-list.json` או משרת REST בעתיד.
   - מציג פרטי TV נבחר.
5. **PowerStatusIndicator**
   - מציג מצב נוכחי (unknown/checking/waking/awake/offline/error) עם עיצוב דומה לקיים.
6. **WakeActions**
   - כפתור Wake-on-LAN, מצב Loading, הודעות שגיאה/הצלחה.
7. **ConnectionStatus**
   - חיווי חיבור WebSocket, קישור לאישור תעודה, כפתורי Connect/Disconnect.
8. **RemoteControls**
   - מכיל D-Pad, כפתורי Volume/Channel/Home/Back; פקדים ניתנים להרחבה.
   - רכיבי משנה: `Dpad`, `VolumeControls`, `MediaControls`.
9. **KeyboardInput**
   - שדה טקסט, כפתורי Enter/Delete, שליחה לרחוק.
10. **ToastSender**
    - טופס לשליחת Toast לטלוויזיה.
11. **ScreenshotPanel**
    - תצוגת תמונה, כפתור צילום חד־פעמי, מצב צילום רציף + מחוון טעינה.
12. **LogsPanel / ActivityFeed** (אופציונלי)
    - מציג אירועים אחרונים לשם דיבוג.
13. **SettingsDialog** (modal) לניהול רשימת מכשירים, שמירת client keys ועוד.

## 6. Stores ושירותים
- `ConnectionStore`
  - מצב חיבור (`disconnected`, `connecting`, `paired`, `error`), client key, הודעות.
- `PowerStateStore`
  - מנהל סטטוס נוכחי ופולינג (כולל timers ל־wake/ping).
- `TvListStore`
  - טעינת רשימה, cache ב־localStorage, בחירת מכשיר.
- `RemoteService`
  - עטיפה על `WebOSRemote`, טיפול ב־WebSocket proxy, חיבור/ניתוק.
- `WakeService`
  - פונקציה `wakeDevice(payload)` מול `/api/wake` כולל ניהול requestId/logs.
- `ScreenshotService`
  - Fetch דרך `/proxy` + token למניעת cache; מצב צילום רציף עם interval store.
- `NotificationStore`
  - הודעות UI, שגיאות גלובליות.

## 7. אסטרטגיית עיצוב
- שלב ראשון: ייבוא `public/style.css` כ־global style כדי לשחזר UI במהירות.
- לאחר מכן לפרק ל־Svelte scoped styles או Tailwind:
  - הגדרת theme variables (גוונים כחול/אפור קיימים).
  - יישום תאימות RTL (Svelte מקבל `dir="rtl"` ב־`app.html`).

## 8. שלבי ביצוע
1. **הקמת פרויקט**  
   - ליצור תיקייה `packages/webos-remote-ui`, להריץ `npm create svelte@latest .`, להגדיר TS + ESLint/Prettier.  
   - לעדכן `package.json` ראשי עם workspaces, scripts חדשים.
2. **תשתית Dev/Prod**  
   - להגדיר `vite.config.ts` עם proxy ל־`http://localhost:3005`.  
   - ליצור `.env.example` עם ערכי ברירת מחדל.
3. **העברת HTML/Styles בסיסיים**  
   - יצירת Layout ו־Page בסיסיים עם ה־markup הקיים כדי לאמת שהעיצוב נשמר.
4. **פירוק ל־קומפוננטות**  
   - להעביר בהדרגה כל בלוק ל־component בהתאם לסעיף 5.  
   - לשמור על RTL ועל אותם ID/Classes זמנית כדי לצמצם באגים.
5. **העברת לוגיקה**  
   - ליצור utils עבור ולידציית IP/MAC, normalizing, timers.  
   - לממש stores ושירותים, להזיז פונקציות מ־`client.ts` לשכבות הרלוונטיות.  
   - לבדוק חיבור אמיתי לטלוויזיה עבור פיירינג, שליחת פקודות, toast, keyboard.
6. **שיפורי DX**  
   - להוסיף טיפוסים ל־wake API, WebSocket הודעות.  
   - להוסיף הודעות UI/Notifications אחידות.
7. **בדיקות**  
   - בדיקות יחידה ל־utils/stores.  
   - בדיקות Playwright בסיסיות לזרימת חיבור והפעלת WoL (אם אפשר).  
   - Script `npm run check` שמריץ lint + vitest.
8. **שילוב מחדש עם Bun**  
   - לבחור אסטרטגיית deploy (SSR נפרד או static build).  
   - לעדכן `packages/proxy-server/src/index.ts` להגיש את build (אם static).  
   - לעדכן `pm2.config.js` כך שינהל גם את תהליך ה־UI (או לעבור ל־Docker).
9. **תיעוד**  
   - README חדש תחת `packages/webos-remote-ui` עם הוראות dev/build.  
   - לעדכן README ראשי לגבי מבנה המונורפו וההרצה.

## 9. תלותים וסיכונים
- **זמן התאמה ל־WebOSRemote**: לוודא שהספרייה עובדת בסביבת Svelte (Browser-only). שימוש ב־`onMount` לכל מה שתלוי ב־`window`.
- **שיתוף state עם backend**: אם יתווסף API לניהול רשימות טלוויזיות, יש להכין טיפוסים ומסכי ניהול.
- **ניהול תעודות/SSL**: היות ויש שרת פרוקסי, אין צורך בטיפול בתעודות SSL.
- **צילום מסך רציף**: טעינת תמונות תכופה משהווה; יש לבחון שימוש ב־`object URLs` ו־cancellation.

## 10. Deliverables
- תיקייה `packages/webos-remote-ui` עם קוד SvelteKit מלא, מסמך README ותסריטי npm.
- חיבור מלא לשרת הקיים (dev + prod).
- מסמך בדיקות/QA קצר לתרחישים קריטיים.
- עדכון pm2/config deployment במידת הצורך.
