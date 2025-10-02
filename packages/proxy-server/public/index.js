import { WebOSRemoteClient } from "./client.js";
// משתנה גלובלי לשמירת רשימת הטלוויזיות
let tvListData = [];

// טעינת רשימת הטלוויזיות מהשרת או מ-localStorage
async function loadTVList() {
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

// אתחול הרשימה הנגללת
async function initializeTVSelect() {
    const select = document.getElementById('tv-select');
    tvListData = await loadTVList();
    
    if (tvListData.length === 0) {
        select.innerHTML = '<option value="">לא נמצאו טלוויזיות</option>';
        select.disabled = true;
        return;
    }
    
    select.innerHTML = '<option value="">בחר טלוויזיה...</option>' +
        tvListData.map(tv => `<option value="${tv.name}">${tv.name}</option>`).join('');
    
    select.addEventListener('change', () => updateSelectedTVDetails());
    
    // אם יש בחירה שמורה, נטען אותה
    const savedSelection = localStorage.getItem('selected-tv-name');
    if (savedSelection && tvListData.find(tv => tv.name === savedSelection)) {
        select.value = savedSelection;
        updateSelectedTVDetails();
    }
}

// עדכון פרטי הטלוויזיה הנבחרת
function updateSelectedTVDetails() {
    const select = document.getElementById('tv-select');
    const details = document.getElementById('selected-tv-details');
    const certLink = document.getElementById('cert-link');
    const selectedTV = tvListData.find(tv => tv.name === select.value);
    
    if (selectedTV) {
        document.getElementById('selected-tv-name').textContent = selectedTV.name;
        document.getElementById('selected-tv-ip').textContent = selectedTV.ip;
        document.getElementById('selected-tv-mac').textContent = selectedTV['mac-address'];
        details.style.display = 'block';
        
        // שמירת הבחירה
        localStorage.setItem('selected-tv-name', selectedTV.name);
        
        // עדכון קישור התעודה
        certLink.href = `https://${selectedTV.ip}:3001`;
        certLink.style.display = 'inline';
    } else {
        details.style.display = 'none';
        localStorage.removeItem('selected-tv-name');
    }
}

// ניהול מעבר בין שיטות התחברות
function initializeConnectionTypeSwitching() {
    const radios = document.getElementsByName('connection-type');
    const manualForm = document.getElementById('manual-connection');
    const listForm = document.getElementById('list-connection');
    
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'manual') {
                manualForm.style.display = 'block';
                listForm.style.display = 'none';
                updateCertLink(); // עדכון קישור לפי IP ידני
            } else {
                manualForm.style.display = 'none';
                listForm.style.display = 'block';
                updateSelectedTVDetails(); // עדכון קישור לפי בחירה מהרשימה
            }
            localStorage.setItem('preferred-connection-type', e.target.value);
        });
    });
    
    // טעינת ההעדפה האחרונה
    const preferred = localStorage.getItem('preferred-connection-type');
    if (preferred && preferred === 'list') {
        const radio = document.querySelector('input[name="connection-type"][value="list"]');
        if (radio) {
            radio.checked = true;
            manualForm.style.display = 'none';
            listForm.style.display = 'block';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    
    const remote = new WebOSRemoteClient();

    // אתחול רכיבי הבחירה
    initializeConnectionTypeSwitching();
    initializeTVSelect();

    const tvIpInput = document.getElementById('tv-ip');
    const clientKeyInput = document.getElementById('client-key');
    const connectBtn = document.getElementById('connect-btn');
    const statusDiv = document.getElementById('status');
    const controlsDiv = document.getElementById('controls');
    const showToastBtn = document.getElementById('show-toast-btn');
    const toastInputDiv = document.getElementById('toast-input');
    const toastMessageInput = document.getElementById('toast-message');
    const sendToastBtn = document.getElementById('send-toast-btn');
    const screenshotBtn = document.getElementById('screenshot-btn');
    const screenshotContainer = document.getElementById('screenshot-container');
    const screenshotImg = document.getElementById('screenshot-img');
    const certLink = document.getElementById('cert-link');

    const textInput = document.getElementById('text-input');
    const enterBtn = document.getElementById('enter-btn');
    const deleteBtn = document.getElementById('delete-btn');

    // --- Event Listeners from Remote Class ---
    remote.addEventListener('status', (e) => {
        statusDiv.textContent = e.detail.message;
        statusDiv.className = 'status ' + e.detail.type;
        connectBtn.disabled = (e.detail.type !== 'disconnected');
        const mainContent = document.getElementById('main-content-wrapper');
        mainContent.style.display = 'flex'; // Ensure wrapper is visible
        if (e.detail.type === 'disconnected') {
            controlsDiv.style.display = 'none';
            screenshotContainer.style.display = 'none';
        } else {
            controlsDiv.style.display = 'block';
        }
    });

    remote.addEventListener('registered', (e) => {
        localStorage.setItem('lg-client-key', e.detail.clientKey);
        clientKeyInput.value = e.detail.clientKey;
    });

    let currentScreenshotUrl = null;
    remote.addEventListener('screenshot', async (e) => {
        try {
            // נשתמש ב-fetch עם no-cache כדי להבטיח שהתמונה תמיד תטען מחדש
            const response = await fetch(e.detail.uri, { cache: 'no-cache', mode: "no-cors" });
            const imageBlob = await response.blob();


            screenshotImg.src = e.detail.uri;
            screenshotContainer.style.display = 'flex';
        } catch (error) {
            console.error("Failed to fetch or display screenshot:", error);
        }
    });

    // --- UI Event Listeners ---
    connectBtn.addEventListener('click', () => {
        const connectionType = document.querySelector('input[name="connection-type"]:checked').value;
        let ip, key;
        
        if (connectionType === 'manual') {
            ip = tvIpInput.value.trim();
            key = clientKeyInput.value.trim();
            if (!ip) {
                alert("אנא הכנס כתובת IP.");
                return;
            }
        } else {
            const select = document.getElementById('tv-select');
            const selectedTV = tvListData.find(tv => tv.name === select.value);
            if (!selectedTV) {
                alert("אנא בחר טלוויזיה מהרשימה.");
                return;
            }
            ip = selectedTV.ip;
            key = selectedTV['secert-key'];
            
            // עדכון השדות הידניים למקרה שהמשתמש ירצה לעבור להזנה ידנית
            tvIpInput.value = ip;
            clientKeyInput.value = key;
        }
        
        remote.connect(ip, key);
    });

    controlsDiv.addEventListener('click', (event) => {
        const target = event.target.closest('button');
        if (!target) return;

        if (target.dataset.button) {
            remote.sendButton(target.dataset.button);
        } else if (target.dataset.uri) {
            const payload = target.dataset.payload ? JSON.parse(target.dataset.payload) : {};
            remote.sendMessage('request', target.dataset.uri, payload).catch(err => alert(err.message));
        }
    });

    const continuousScreenshotCb = document.getElementById('continuous-screenshot-cb');

    screenshotBtn.addEventListener('click', () => {
        remote.takeScreenshot();
    });

    continuousScreenshotCb.addEventListener('change', (e) => {
        if (e.target.checked) {
            remote.startContinuousScreenshot();
        } else {
            remote.stopContinuousScreenshot();
        }
    });

    showToastBtn.addEventListener('click', () => {
        toastInputDiv.style.display = toastInputDiv.style.display === 'none' ? 'flex' : 'none';
    });

    sendToastBtn.addEventListener('click', () => {
        const message = toastMessageInput.value;
        if (message) {
            remote.sendMessage('request', 'ssap://system.notifications/createToast', { message: message });
            toastMessageInput.value = '';
            toastInputDiv.style.display = 'none';
        }
    });

    // --- Typing controls ---
    let lastText = '';
    textInput.addEventListener('input', (e) => {
        const currentText = e.target.value;
        if (currentText.length > lastText.length) {
            // User typed a character
            const newChar = currentText.slice(lastText.length);
            remote.sendText(newChar).catch(err => console.error("Send text error:", err));
        } else {
            // User deleted a character
            remote.sendDelete().catch(err => console.error("Send delete error:", err));
        }
        lastText = currentText;
    });

    enterBtn.addEventListener('click', () => {
        remote.sendEnter().catch(err => console.error("Send enter error:", err));
    });

    deleteBtn.addEventListener('click', () => {
        remote.sendDelete().catch(err => console.error("Send delete error:", err));
        // Also update the input field and our state
        textInput.value = textInput.value.slice(0, -1);
        lastText = textInput.value;
    });

    // --- Local Storage and UI Helpers ---
    function updateCertLink() {
        const ip = tvIpInput.value.trim();
        if (ip) {
            certLink.href = `https://${ip}:3001`;
            certLink.style.display = 'inline';
        } else {
            certLink.style.display = 'none';
        }
    }

    tvIpInput.addEventListener('input', () => {
        localStorage.setItem('lg-tv-ip', tvIpInput.value);
        updateCertLink();
    });
    clientKeyInput.addEventListener('change', () => {
        localStorage.setItem('lg-client-key', clientKeyInput.value);
    });

    // Load saved values
    const savedIp = localStorage.getItem('lg-tv-ip');
    if (savedIp) {
        tvIpInput.value = savedIp;
    }
    const savedKey = localStorage.getItem('lg-client-key');
    if (savedKey) {
        clientKeyInput.value = savedKey;
    }
    updateCertLink();
});