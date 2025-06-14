import { WebOSRemote } from 'lg-webos-remote';

// DOM Elements
const ipInput = document.getElementById('tv-ip') as HTMLInputElement;
const clientKeyInput = document.getElementById('client-key') as HTMLInputElement;
const connectButton = document.getElementById('connect-btn') as HTMLButtonElement;
// const disconnectButton = document.getElementById('disconnect-btn') as HTMLButtonElement; // This button does not exist in the HTML
const statusDiv = document.getElementById('status') as HTMLDivElement;
const controlsDiv = document.getElementById('controls') as HTMLDivElement;
const toastButton = document.getElementById('show-toast-btn') as HTMLButtonElement; // Corrected ID
const turnOffButton = document.querySelector('button[data-uri="ssap://system/turnOff"]') as HTMLButtonElement; // Corrected selector

let remote: WebOSRemote | null = null;

function updateStatus(message: string, type: 'prompt' | 'connected' | 'disconnected') {
    statusDiv.textContent = message;
    statusDiv.className = `status-${type}`;
}

function setupEventListeners() {
    connectButton.addEventListener('click', connect);
    // disconnectButton.addEventListener('click', disconnect);
    toastButton.addEventListener('click', () => {
        const toastInput = document.getElementById('toast-message') as HTMLInputElement;
        const message = toastInput.value || 'Hello from browser!';
        remote?.createToast(message);
    });
    turnOffButton.addEventListener('click', () => remote?.turnOff());
}

async function connect() {
    const ip = ipInput.value;
    const clientKey = clientKeyInput.value || undefined;

    if (!ip) {
        alert('Please enter the TV IP address.');
        return;
    }

    updateStatus(`Connecting to proxy for TV at ${ip}...`, 'prompt');

    // We instantiate our isomorphic WebOSRemote class.
    // It will run entirely in the browser, but connect via our simple proxy.
    remote = new WebOSRemote({
        ip,
        clientKey,
        // We use the `proxyUrl` config we added to solve the CORS issue.
        proxyUrl: `ws://localhost:3005/ws`
    });

    addRemoteEventHandlers();

    try {
        await remote.connect();
    } catch (error: any) {
        updateStatus(`Error: ${error.message}`, 'disconnected');
        console.error(error);
    }
}

function disconnect() {
    if (remote) {
        remote.disconnect();
    }
}

function addRemoteEventHandlers() {
    if (!remote) return;

    remote.on('connect', () => {
        updateStatus('Connected to TV via proxy!', 'connected');
        connectButton.disabled = true;
        // disconnectButton.disabled = false;
        controlsDiv.style.display = 'block';
    });

    remote.on('disconnect', () => {
        updateStatus('Disconnected', 'disconnected');
        connectButton.disabled = false;
        // disconnectButton.disabled = true;
        controlsDiv.style.display = 'none';
        remote = null;
    });

    remote.on('error', (error: Error) => {
        console.error('Remote Error:', error);
        updateStatus(`Error: ${error.message}`, 'disconnected');
    });

    remote.on('prompt', () => {
        updateStatus('Please approve the connection on your TV.', 'prompt');
    });

    remote.on('registered', (key: string) => {
        clientKeyInput.value = key;
        updateStatus('Registered! Client key saved.', 'connected');
    });
}

// Initial setup
document.addEventListener('DOMContentLoaded', setupEventListeners);