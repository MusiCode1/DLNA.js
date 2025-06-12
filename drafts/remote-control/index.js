import { WebOSRemoteClient } from "./client.js";

document.addEventListener('DOMContentLoaded', () => {
    
    const remote = new WebOSRemoteClient();

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
        const ip = tvIpInput.value.trim();
        const key = clientKeyInput.value.trim();
        if (!ip) {
            alert("אנא הכנס כתובת IP.");
            return;
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