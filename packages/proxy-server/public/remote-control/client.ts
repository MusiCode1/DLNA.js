import { WebOSRemote } from 'lg-webos-remote';

// --- DOM Elements ---
// קבועים עבור כל האלמנטים ב-DOM שאנו צריכים לגשת אליהם
const dom = {
    // התחברות וסטטוס
    ipInput: document.getElementById('tv-ip') as HTMLInputElement,
    clientKeyInput: document.getElementById('client-key') as HTMLInputElement,
    connectButton: document.getElementById('connect-btn') as HTMLButtonElement,
    statusDiv: document.getElementById('status') as HTMLDivElement,
    certLink: document.getElementById('cert-link') as HTMLAnchorElement,

    // קונטיינרים ראשיים
    controlsDiv: document.getElementById('controls') as HTMLDivElement,
    screenshotContainer: document.getElementById('screenshot-container') as HTMLDivElement,

    // פקדים כלליים
    showToastButton: document.getElementById('show-toast-btn') as HTMLButtonElement,
    screenshotButton: document.getElementById('screenshot-btn') as HTMLButtonElement,
    continuousScreenshotCb: document.getElementById('continuous-screenshot-cb') as HTMLInputElement,
    screenshotImg: document.getElementById('screenshot-img') as HTMLImageElement,

    // הקלדה
    textInput: document.getElementById('text-input') as HTMLInputElement,
    enterButton: document.getElementById('enter-btn') as HTMLButtonElement,
    deleteButton: document.getElementById('delete-btn') as HTMLButtonElement,

    // הודעות Toast
    toastInputDiv: document.getElementById('toast-input') as HTMLDivElement,
    toastMessageInput: document.getElementById('toast-message') as HTMLInputElement,
    sendToastButton: document.getElementById('send-toast-btn') as HTMLButtonElement,
};

// --- State Management ---
let remote: WebOSRemote | null = null;
let continuousScreenshotInterval: number | null = null;

// --- Core Functions ---

/**
 * מתחבר לטלוויזיה באמצעות ה-IP והמפתח שהוזנו
 */
async function connect() {
    const ip = dom.ipInput.value.trim();
    const clientKey = dom.clientKeyInput.value.trim() || undefined;

    if (!ip) {
        alert('אנא הכנס כתובת IP של הטלוויזיה.');
        return;
    }

    saveSettings();
    updateStatus('מתחבר...', 'prompt');

    const wsProtocol = (window.location.protocol === 'http:') ? 'ws' : 'wss';
    const proxyUrl= `${wsProtocol}://${window.location.hostname}/ws`;

    // יצירת מופע חדש של השלט
    remote = new WebOSRemote({
        ip,
        clientKey,
        // שימוש ב-proxy כדי לעקוף בעיות CORS
        proxyUrl
    });

    // הגדרת מאזיני אירועים עבור המופע של השלט
    addRemoteEventHandlers();

    try {
        await remote.connect();
    } catch (error: any) {
        console.error('Connection Error:', error);
        updateStatus(`שגיאת התחברות: ${error.message}`, 'disconnected');
    }
}

/**
 * מתנתק מהטלוויזיה
 */
function disconnect() {
    if (remote) {
        remote.disconnect();
    }
    stopContinuousScreenshot();
}

// --- Event Handlers ---

function setupUIEventListeners() {
    // התחברות
    dom.connectButton.addEventListener('click', connect);

    // מאזין כללי לכל הכפתורים בתוך div הפקדים
    dom.controlsDiv.addEventListener('click', handleControlsClick);

    // צילום מסך
    dom.screenshotButton.addEventListener('click', takeScreenshot);
    dom.continuousScreenshotCb.addEventListener('change', handleContinuousScreenshotToggle);

    // הודעות Toast
    dom.showToastButton.addEventListener('click', () => {
        dom.toastInputDiv.style.display = dom.toastInputDiv.style.display === 'none' ? 'flex' : 'none';
    });
    dom.sendToastButton.addEventListener('click', sendToast);

    // הקלדה
    dom.textInput.addEventListener('input', handleTextInput);
    dom.enterButton.addEventListener('click', () => remote?.sendEnter().catch(handleRemoteError));
    dom.deleteButton.addEventListener('click', () => remote?.sendDelete().catch(handleRemoteError));

    // שמירת הגדרות
    dom.ipInput.addEventListener('input', () => {
        localStorage.setItem('lg-tv-ip', dom.ipInput.value);
        updateCertLink();
    });
    dom.clientKeyInput.addEventListener('change', () => {
        localStorage.setItem('lg-client-key', dom.clientKeyInput.value);
    });
}

/**
 * מטפל בלחיצות בתוך קונטיינר הפקדים הראשי
 * @param {MouseEvent} event - אירוע הלחיצה
 */
function handleControlsClick(event: MouseEvent) {
    const target = (event.target as HTMLElement).closest('button');
    if (!target || !remote) return;

    const buttonType = target.dataset.button;
    const uri = target.dataset.uri;

    if (buttonType) {
        remote.sendButton(buttonType).catch(handleRemoteError);
    } else if (uri) {
        const payload = target.dataset.payload ? JSON.parse(target.dataset.payload) : {};
        remote.sendMessage({ type: 'request', uri, payload }).catch(handleRemoteError);
    }
}

/**
 * מטפל בשינויים בשדה הטקסט
 */
function handleTextInput(event: Event) {
    if (!remote) return;
    const target = event.target as HTMLInputElement;
    // WebOS IME doesn't work with backspace, it works with sending the whole text.
    remote.sendText(target.value).catch(handleRemoteError);
}

function sendToast() {
    if (!remote) return;
    const message = dom.toastMessageInput.value;
    if (message) {
        remote.createToast(message).catch(handleRemoteError);
        dom.toastMessageInput.value = '';
        dom.toastInputDiv.style.display = 'none';
    }
}

/**
 * מצלם תמונת מסך
 */
async function takeScreenshot() {
    if (!remote) return;
    try {
        const url = await remote.takeScreenshot();
        dom.screenshotImg.src = `${url}?t=${new Date().getTime()}`;
        dom.screenshotContainer.style.display = 'flex';
    } catch (error) {
        handleRemoteError(error as Error);
        stopContinuousScreenshot();
    }
}

function handleContinuousScreenshotToggle() {
    if (dom.continuousScreenshotCb.checked) {
        startContinuousScreenshot();
    } else {
        stopContinuousScreenshot();
    }
}

/**
 * מתחיל צילום מסך רציף
 */
function startContinuousScreenshot() {
    stopContinuousScreenshot();
    takeScreenshot();
    continuousScreenshotInterval = window.setInterval(takeScreenshot, 1000);
}

/**
 * עוצר צילום מסך רציף
 */
function stopContinuousScreenshot() {
    if (continuousScreenshotInterval) {
        clearInterval(continuousScreenshotInterval);
        continuousScreenshotInterval = null;
    }
}

/**
 * מגדיר מאזיני אירועים עבור המופע של השלט
 */
function addRemoteEventHandlers() {
    if (!remote) return;

    remote.on('connect', () => {
        // The proxyConnected event will handle the final connected state
        updateStatus('מחובר לפרוקסי, ממתין לחיבור לטלוויזיה...', 'prompt');
    });

    remote.on('proxyConnected', () => {
        updateStatus('מחובר!', 'connected');
        updateUIForConnectionState(true);
    }
    );

    remote.on('disconnect', () => {
        updateStatus('מנותק', 'disconnected');
        updateUIForConnectionState(false);
        remote = null;
    });

    remote.on('error', (error: Error) => {
        console.error('Remote Error:', error);
        updateStatus(`שגיאה: ${error.message}`, 'disconnected');
    });

    remote.on('prompt', () => {
        updateStatus('נא לאשר את החיבור בטלוויזיה.', 'prompt');
    });

    remote.on('registered', (key: string) => {
        dom.clientKeyInput.value = key;
        localStorage.setItem('lg-client-key', key);
        updateStatus('נרשם בהצלחה! מפתח הלקוח נשמר.', 'connected');
    });
}

// --- UI and Utility Functions ---

/**
 * מעדכן את הודעת הסטטוס ואת העיצוב שלה
 * @param {string} message - ההודעה להצגה
 * @param {'prompt' | 'connected' | 'disconnected'} type - סוג הסטטוס
 */
function updateStatus(message: string, type: 'prompt' | 'connected' | 'disconnected') {
    dom.statusDiv.textContent = message;
    dom.statusDiv.className = `status ${type}`;
}

/**
 * מעדכן את ממשק המשתמש בהתאם למצב החיבור
 * @param {boolean} isConnected - האם מחובר או לא
 */
function updateUIForConnectionState(isConnected: boolean) {
    dom.connectButton.disabled = isConnected;
    dom.controlsDiv.style.display = isConnected ? 'block' : 'none';
    if (!isConnected) {
        dom.screenshotContainer.style.display = 'none';
        stopContinuousScreenshot();
    }
}

/**
 * טוען הגדרות שמורות מ-localStorage
 */
function loadSettings() {
    const savedIp = localStorage.getItem('lg-tv-ip');
    if (savedIp) {
        dom.ipInput.value = savedIp;
    }
    const savedKey = localStorage.getItem('lg-client-key');
    if (savedKey) {
        dom.clientKeyInput.value = savedKey;
    }
    updateCertLink();
}

/**
 * שומר הגדרות נוכחיות ב-localStorage
 */
function saveSettings() {
    localStorage.setItem('lg-tv-ip', dom.ipInput.value);
    localStorage.setItem('lg-client-key', dom.clientKeyInput.value);
}

/**
 * מעדכן את הקישור לאישור התעודה
 */
function updateCertLink() {
    const ip = dom.ipInput.value.trim();
    if (ip) {
        // ה-proxy מאזין ב-HTTPS על פורט 3001
        dom.certLink.href = `https://${ip}:3001`;
        dom.certLink.style.display = 'inline';
    } else {
        dom.certLink.style.display = 'none';
    }
}

/**
 * מטפל בשגיאות מהשלט ומציג אותן למשתמש
 * @param {Error} err - אובייקט השגיאה
 */
function handleRemoteError(err: Error) {
    console.error("Remote command failed:", err);
    alert(`הפעולה נכשלה: ${err.message}`);
}

// --- Initialization ---

/**
 * פונקציית האתחול הראשית
 */
function main() {
    loadSettings();
    setupUIEventListeners();
}

// הרצת האפליקציה לאחר שה-DOM נטען במלואו
document.addEventListener('DOMContentLoaded', main);

// The methods are now part of the library.