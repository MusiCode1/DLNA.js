import { WebOSRemote } from 'lg-webos-remote';

// --- DOM Elements ---
// קבועים עבור כל האלמנטים ב-DOM שאנו צריכים לגשת אליהם
const dom = {
    // התחברות וסטטוס
    ipInput: document.getElementById('tv-ip') as HTMLInputElement,
    clientKeyInput: document.getElementById('client-key') as HTMLInputElement,
    macInput: document.getElementById('tv-mac') as HTMLInputElement,
    connectButton: document.getElementById('connect-btn') as HTMLButtonElement,
    disconnectButton: document.getElementById('disconnect-btn') as HTMLButtonElement,
    wakeButton: document.getElementById('wake-btn') as HTMLButtonElement,
    statusDiv: document.getElementById('status') as HTMLDivElement,
    certLink: document.getElementById('cert-link') as HTMLAnchorElement,
    powerStatusIndicator: document.getElementById('power-status-indicator') as HTMLDivElement,
    powerStatusText: document.getElementById('power-status-text') as HTMLSpanElement,

    // אלמנטים חדשים - בחירת שיטת התחברות
    manualConnection: document.getElementById('manual-connection') as HTMLDivElement,
    listConnection: document.getElementById('list-connection') as HTMLDivElement,
    tvSelect: document.getElementById('tv-select') as HTMLSelectElement,
    selectedTvDetails: document.getElementById('selected-tv-details') as HTMLDivElement,
    selectedTvName: document.getElementById('selected-tv-name') as HTMLSpanElement,
    selectedTvIp: document.getElementById('selected-tv-ip') as HTMLSpanElement,
    selectedTvMac: document.getElementById('selected-tv-mac') as HTMLSpanElement,

    // קונטיינרים ראשיים
    controlsScreenshotWrapper: document.getElementById('controls-screenshot-wrapper') as HTMLDivElement,
    controlsDiv: document.getElementById('controls') as HTMLDivElement,
    screenshotContainer: document.getElementById('screenshot-container') as HTMLDivElement,

    // פקדים כלליים
    showToastButton: document.getElementById('show-toast-btn') as HTMLButtonElement,
    screenshotButton: document.getElementById('screenshot-btn') as HTMLButtonElement,
    continuousScreenshotCb: document.getElementById('continuous-screenshot-cb') as HTMLInputElement,
    screenshotImg: document.getElementById('screenshot-img') as HTMLImageElement,
    screenshotPlaceholder: document.getElementById('screenshot-placeholder') as HTMLDivElement,

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

// משתנה גלובלי לשמירת רשימת הטלוויזיות
let tvListData: Array<{ name: string; ip: string; 'mac-address': string; 'secert-key'?: string }> = [];

type PowerState = 'unknown' | 'checking' | 'waking' | 'awake' | 'offline' | 'error';
let currentPowerState: PowerState = 'unknown';
let isWakeInProgress = false;
let isPowerCheckInProgress = false;
let powerStatusRefreshTimeout: number | null = null;

const POWER_STATE_CLASSES: Record<PowerState, string> = {
    unknown: 'power-status power-status--unknown',
    checking: 'power-status power-status--loading',
    waking: 'power-status power-status--loading',
    awake: 'power-status power-status--on',
    offline: 'power-status power-status--off',
    error: 'power-status power-status--error',
};

const POWER_STATE_MESSAGES: Record<PowerState, string> = {
    unknown: 'מצב המסך לא ידוע',
    checking: 'בודק האם המסך פעיל...',
    waking: 'מפעיל את המסך...',
    awake: 'המסך כרגע דולק',
    offline: 'המסך כבוי או לא מגיב',
    error: 'שגיאה בבדיקת מצב המסך',
};

const MAC_REGEX = /^([0-9A-Fa-f]{2}([-:])){5}([0-9A-Fa-f]{2})$/;
const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function setPowerState(state: PowerState, message?: string) {
    currentPowerState = state;
    dom.powerStatusIndicator.className = POWER_STATE_CLASSES[state];
    dom.powerStatusText.textContent = message ?? POWER_STATE_MESSAGES[state];
}

function getActiveConnectionType(): 'manual' | 'list' {
    const radio = document.querySelector('input[name="connection-type"]:checked') as HTMLInputElement | null;
    return radio?.value === 'list' ? 'list' : 'manual';
}

function normalizeMac(mac: string): string {
    const cleaned = mac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    if (cleaned.length === 12) {
        return cleaned.match(/.{1,2}/g)!.join(':');
    }
    return mac.replace(/-/g, ':').toUpperCase();
}

function isValidMac(mac: string | null | undefined): mac is string {
    return !!mac && MAC_REGEX.test(mac);
}

function isValidIp(ip: string | null | undefined): ip is string {
    if (!ip || !IPV4_REGEX.test(ip)) return false;
    return ip.split('.').every((segment) => {
        const value = Number(segment);
        return value >= 0 && value <= 255;
    });
}

function getCurrentTarget() {
    const connectionType = getActiveConnectionType();
    if (connectionType === 'list') {
        const tv = tvListData.find((item) => item.name === dom.tvSelect.value);
        if (!tv) {
            return { ip: null, mac: null, name: null };
        }
        return {
            ip: tv.ip.trim(),
            mac: normalizeMac(tv['mac-address'] || ''),
            name: tv.name,
        };
    }

    const ip = dom.ipInput.value.trim();
    const mac = normalizeMac(dom.macInput.value.trim());
    return {
        ip,
        mac,
        name: null,
    };
}

function updateWakeButtonState() {
    const { ip, mac } = getCurrentTarget();
    const hasTarget = isValidIp(ip) && isValidMac(mac);
    dom.wakeButton.disabled = !hasTarget || isWakeInProgress || isPowerCheckInProgress;
}

function schedulePowerStatusRefresh(delayMs: number = 0) {
    if (powerStatusRefreshTimeout !== null) {
        window.clearTimeout(powerStatusRefreshTimeout);
    }
    powerStatusRefreshTimeout = window.setTimeout(() => {
        powerStatusRefreshTimeout = null;
        checkPowerStatus();
    }, delayMs);
}
// --- TV List Functions ---

/**
 * טוענת את רשימת הטלוויזיות מהשרת או מ-localStorage
 */
async function loadTVList(): Promise<typeof tvListData> {
    try {
        // טעינה מהשרת - הנתיב הנכון הוא ./tv-list.json כי הקובץ באותה תיקייה
        const response = await fetch('./tv-list.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const tvList = await response.json();
        localStorage.setItem('tv-list', JSON.stringify(tvList));
        localStorage.setItem('tv-list-timestamp', Date.now().toString());
        return tvList;
    } catch (error) {
        console.error('Error loading TV list from server:', error);
        // ננסה לטעון מ-localStorage אם קיים
        const cached = localStorage.getItem('tv-list');
        if (cached) {
            console.log('Using cached TV list');
            return JSON.parse(cached);
        }
        console.warn('No TV list available');
        return [];
    }
}

/**
 * מאתחלת את רשימת הבחירה של הטלוויזיות
 */
async function initializeTVSelect() {
    tvListData = await loadTVList();
    
    if (tvListData.length === 0) {
        dom.tvSelect.innerHTML = '<option value="">לא נמצאו טלוויזיות</option>';
        dom.tvSelect.disabled = true;
        updateWakeButtonState();
        return;
    }
    
    dom.tvSelect.innerHTML = '<option value="">בחר טלוויזיה...</option>' +
        tvListData.map(tv => `<option value="${tv.name}">${tv.name}</option>`).join('');
    dom.tvSelect.disabled = false;
    
    dom.tvSelect.addEventListener('change', () => updateSelectedTVDetails());
    
    // אם יש בחירה שמורה, נטען אותה
    const savedSelection = localStorage.getItem('selected-tv-name');
    if (savedSelection && tvListData.find(tv => tv.name === savedSelection)) {
        dom.tvSelect.value = savedSelection;
        updateSelectedTVDetails();
    }

    updateWakeButtonState();
}

/**
 * מעדכנת את פרטי הטלוויזיה הנבחרת
 */
function updateSelectedTVDetails() {
    const selectedTV = tvListData.find(tv => tv.name === dom.tvSelect.value);
    
    if (selectedTV) {
        dom.selectedTvName.textContent = selectedTV.name;
        dom.selectedTvIp.textContent = selectedTV.ip;
        dom.selectedTvMac.textContent = selectedTV['mac-address'];
        dom.selectedTvDetails.style.display = 'block';
        
        // שמירת הבחירה
        localStorage.setItem('selected-tv-name', selectedTV.name);
        
        // עדכון קישור התעודה
        dom.certLink.href = `https://${selectedTV.ip}:3001`;
        dom.certLink.style.display = 'inline';

        // עדכון שדות ידניים ושמירת כתובת MAC
        dom.ipInput.value = selectedTV.ip;
        const normalizedMac = normalizeMac(selectedTV['mac-address'] || '');
        dom.macInput.value = normalizedMac;
        localStorage.setItem('lg-tv-ip', dom.ipInput.value);
        localStorage.setItem('lg-tv-mac', normalizedMac);

        setPowerState('checking');
        updateWakeButtonState();
        schedulePowerStatusRefresh(150);
    } else {
        dom.selectedTvDetails.style.display = 'none';
        localStorage.removeItem('selected-tv-name');
        setPowerState('unknown');
        updateWakeButtonState();
    }
}

/**
 * מנהלת מעבר בין שיטות התחברות (ידני / רשימה)
 */
function initializeConnectionTypeSwitching() {
    const radios = document.getElementsByName('connection-type') as NodeListOf<HTMLInputElement>;
    
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.value === 'manual') {
                dom.manualConnection.style.display = 'block';
                dom.listConnection.style.display = 'none';
                updateCertLink(); // עדכון קישור לפי IP ידני
                setPowerState('unknown');
                updateWakeButtonState();
                if (isValidIp(dom.ipInput.value.trim()) && isValidMac(normalizeMac(dom.macInput.value.trim()))) {
                    schedulePowerStatusRefresh(0);
                }
            } else {
                dom.manualConnection.style.display = 'none';
                dom.listConnection.style.display = 'block';
                updateSelectedTVDetails(); // עדכון קישור לפי בחירה מהרשימה
            }
            localStorage.setItem('preferred-connection-type', target.value);
        });
    });
    
    // טעינת ההעדפה האחרונה
    const preferred = localStorage.getItem('preferred-connection-type');
    if (preferred && preferred === 'list') {
        const radio = document.querySelector('input[name="connection-type"][value="list"]') as HTMLInputElement;
        if (radio) {
            radio.checked = true;
            dom.manualConnection.style.display = 'none';
            dom.listConnection.style.display = 'block';
            updateSelectedTVDetails();
        }
    }

    updateWakeButtonState();
}

async function checkPowerStatus() {
    const { ip, mac } = getCurrentTarget();
    if (!isValidIp(ip) || !isValidMac(mac)) {
        setPowerState('unknown');
        return;
    }

    if (isWakeInProgress || isPowerCheckInProgress) {
        return;
    }

    isPowerCheckInProgress = true;
    updateWakeButtonState();
    setPowerState('checking');

    try {
        const response = await fetch('/api/wake', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ipAddress: ip,
                macAddress: mac,
                waitBeforePingSeconds: 0,
                pingTotalTimeoutSeconds: 6,
                pingIntervalSeconds: 1,
                pingSingleTimeoutSeconds: 1,
                dryRun: true,
            }),
        });

        let data: any = null;
        try {
            data = await response.json();
        } catch (jsonError) {
            console.warn('Failed to parse power status response as JSON.', jsonError);
        }

        if (!response.ok) {
            const message = data?.message ?? 'שגיאה בבדיקת מצב המסך.';
            setPowerState('error', message);
            return;
        }

        switch (data?.status) {
            case 'awake':
                setPowerState('awake', data?.message ?? POWER_STATE_MESSAGES.awake);
                break;
            case 'offline':
                setPowerState('offline', data?.message ?? POWER_STATE_MESSAGES.offline);
                break;
            case 'timeout':
                setPowerState('offline', data?.message ?? 'הטלוויזיה לא הגיבה בזמן.');
                break;
            default:
                setPowerState('error', data?.message ?? 'תגובה לא מוכרת מהשרת.');
                break;
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setPowerState('error', `שגיאת רשת: ${message}`);
    } finally {
        isPowerCheckInProgress = false;
        updateWakeButtonState();
    }
}

async function wakeTv() {
    if (isWakeInProgress || isPowerCheckInProgress) {
        return;
    }

    const { ip, mac } = getCurrentTarget();
    if (!isValidIp(ip)) {
        alert('אנא הזן כתובת IP תקינה לפני הפעלת המסך.');
        return;
    }

    if (!isValidMac(mac)) {
        alert('אנא הזן כתובת MAC תקינה (לדוגמה AA:BB:CC:DD:EE:FF).');
        return;
    }

    isWakeInProgress = true;
    updateWakeButtonState();
    setPowerState('waking');

    try {
        const response = await fetch('/api/wake', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ipAddress: ip,
                macAddress: mac,
                waitBeforePingSeconds: 5,
                pingTotalTimeoutSeconds: 45,
                pingIntervalSeconds: 3,
                pingSingleTimeoutSeconds: 3,
                dryRun: false,
            }),
        });

        let data: any = null;
        try {
            data = await response.json();
        } catch (jsonError) {
            console.warn('Failed to parse wake response as JSON.', jsonError);
        }

        if (!response.ok) {
            const message = data?.message ?? 'שליחת Wake-on-LAN נכשלה.';
            setPowerState('error', message);
            return;
        }

        switch (data?.status) {
            case 'awake':
                setPowerState('awake', data?.message ?? POWER_STATE_MESSAGES.awake);
                break;
            case 'offline':
                setPowerState('offline', data?.message ?? POWER_STATE_MESSAGES.offline);
                break;
            case 'timeout':
                setPowerState('error', data?.message ?? 'הפעולה חרגה ממגבלת הזמן.');
                break;
            default:
                setPowerState('error', data?.message ?? 'תגובה לא מוכרת מהשרת.');
                break;
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setPowerState('error', `שגיאת רשת: ${message}`);
    } finally {
        isWakeInProgress = false;
        updateWakeButtonState();
        if (currentPowerState !== 'awake' && !isPowerCheckInProgress) {
            schedulePowerStatusRefresh(5000);
        }
    }
}

// --- Core Functions ---

/**
 * מתחבר לטלוויזיה באמצעות ה-IP והמפתח שהוזנו
 */
async function connect() {
    const connectionTypeRadio = document.querySelector('input[name="connection-type"]:checked') as HTMLInputElement;
    const connectionType = connectionTypeRadio?.value || 'manual';
    
    let ip: string;
    let clientKey: string | undefined;
    
    if (connectionType === 'manual') {
        ip = dom.ipInput.value.trim();
        clientKey = dom.clientKeyInput.value.trim() || undefined;
        if (!ip) {
            alert('אנא הכנס כתובת IP של הטלוויזיה.');
            return;
        }
    } else {
        const selectedTV = tvListData.find(tv => tv.name === dom.tvSelect.value);
        if (!selectedTV) {
            alert('אנא בחר טלוויזיה מהרשימה.');
            return;
        }
        ip = selectedTV.ip;
        clientKey = selectedTV['secert-key'];
        
        // עדכון השדות הידניים למקרה שהמשתמש ירצה לעבור להזנה ידנית
        dom.ipInput.value = ip;
        dom.clientKeyInput.value = clientKey || '';
        dom.macInput.value = normalizeMac(selectedTV['mac-address'] || '');
    }

    saveSettings();
    updateStatus('מתחבר...', 'prompt');

    const wsProtocol = (window.location.protocol === 'http:') ? 'ws' : 'wss';
    const proxyUrl= `${wsProtocol}://${window.location.host}/ws`;

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
    } else {
        updateUIForConnectionState(false);
        setPowerState('unknown');
        schedulePowerStatusRefresh(0);
        updateStatus('מנותק', 'disconnected');
    }
    stopContinuousScreenshot();
}

// --- Event Handlers ---

function setupUIEventListeners() {
    // התחברות
    dom.connectButton.addEventListener('click', connect);
    dom.disconnectButton.addEventListener('click', () => {
        dom.disconnectButton.disabled = true;
        updateStatus('מנתק...', 'prompt');
        disconnect();
    });
    dom.wakeButton.addEventListener('click', async () => {
        saveSettings();
        await wakeTv();
    });

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
        setPowerState('unknown');
        updateWakeButtonState();
    });
    dom.ipInput.addEventListener('change', () => {
        const normalizedMac = normalizeMac(dom.macInput.value.trim());
        if (isValidIp(dom.ipInput.value.trim()) && isValidMac(normalizedMac)) {
            schedulePowerStatusRefresh(0);
        }
    });
    dom.clientKeyInput.addEventListener('change', () => {
        localStorage.setItem('lg-client-key', dom.clientKeyInput.value);
    });
    dom.macInput.addEventListener('input', () => {
        updateWakeButtonState();
    });
    dom.macInput.addEventListener('change', () => {
        dom.macInput.value = normalizeMac(dom.macInput.value.trim());
        localStorage.setItem('lg-tv-mac', dom.macInput.value);
        if (isValidIp(dom.ipInput.value.trim()) && isValidMac(dom.macInput.value)) {
            schedulePowerStatusRefresh(0);
        } else {
            setPowerState('unknown');
        }
        updateWakeButtonState();
    });

    dom.powerStatusIndicator.addEventListener('click', () => {
        schedulePowerStatusRefresh(0);
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
        const originalUrl = await remote.takeScreenshot();
        const proxyUrl = `/proxy?url=${encodeURIComponent(originalUrl)}`;
        dom.screenshotImg.src = `${proxyUrl}&t=${new Date().getTime()}`;
        dom.screenshotImg.style.display = 'block';
        dom.screenshotPlaceholder.style.display = 'none';
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
        setPowerState('checking');
    });

    remote.on('proxyConnected', () => {
        updateStatus('מחובר!', 'connected');
        updateUIForConnectionState(true);
        setPowerState('awake');
        
    }
    );

    remote.on('disconnect', () => {
        updateStatus('מנותק', 'disconnected');
        updateUIForConnectionState(false);
        remote = null;
        setPowerState('unknown');
        schedulePowerStatusRefresh(0);
    });

    remote.on('error', (error: Error) => {
        console.error('Remote Error:', error);
        updateStatus(`שגיאה: ${error.message}`, 'disconnected');
        setPowerState('error', error.message);
    });

    remote.on('prompt', () => {
        updateStatus('נא לאשר את החיבור בטלוויזיה.', 'prompt');
    });

    remote.on('registered', (key: string) => {
        dom.clientKeyInput.value = key;
        localStorage.setItem('lg-client-key', key);
        updateStatus('נרשם בהצלחה! מפתח הלקוח נשמר.', 'connected');
        takeScreenshot();
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
    dom.disconnectButton.disabled = !isConnected;
    dom.controlsScreenshotWrapper.style.display = isConnected ? 'flex' : 'none';
    if (!isConnected) {
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
    const savedMac = localStorage.getItem('lg-tv-mac');
    if (savedMac) {
        dom.macInput.value = normalizeMac(savedMac);
    }
    updateCertLink();
    updateWakeButtonState();
    setPowerState('unknown');
    if (isValidIp(dom.ipInput.value.trim()) && isValidMac(normalizeMac(dom.macInput.value.trim()))) {
        schedulePowerStatusRefresh(150);
    }
}

/**
 * שומר הגדרות נוכחיות ב-localStorage
 */
function saveSettings() {
    localStorage.setItem('lg-tv-ip', dom.ipInput.value);
    localStorage.setItem('lg-client-key', dom.clientKeyInput.value);
    const normalizedMac = normalizeMac(dom.macInput.value);
    dom.macInput.value = normalizedMac;
    localStorage.setItem('lg-tv-mac', normalizedMac);
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
    
    // אתחול רכיבי הבחירה
    initializeConnectionTypeSwitching();
    initializeTVSelect();
}

// הרצת האפליקציה לאחר שה-DOM נטען במלואו
document.addEventListener('DOMContentLoaded', main);

// The methods are now part of the library.
