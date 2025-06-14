import { EventEmitter } from 'eventemitter3';
import { getWebSocketImplementation, type AnyWebSocket } from './platform';
import { REGISTRATION_PAYLOAD } from './constants';
export * from './types';
import type { WebOSMessage, WebOSResponse, VolumeStatus, ForegroundAppInfo } from './types';
import * as audio from './controls/audio';
import * as system from './controls/system';
import * as application from './controls/application';
import * as input from './controls/input';

type BrowserWebsocket = Window['window']['WebSocket']['prototype'];

interface WebOSRemoteEvents {
    connect: () => void;
    disconnect: (code: number, reason: string) => void;
    error: (error: Error) => void;
    prompt: () => void;
    registered: (clientKey: string) => void;
    message: (message: WebOSResponse) => void;
}

export interface WebOSRemoteConfig {
    ip: string;
    clientKey?: string;
    timeout?: number;
    pairingType?: 'PROMPT' | 'PIN';
    proxyUrl?: string; // Optional proxy URL
}

interface PendingRequestsItem {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    timeout: NodeJS.Timeout;
}

/**
 * # LG WebOS Remote Control
 * A library to control LG webOS TVs.
 */
export class WebOSRemote extends EventEmitter<WebOSRemoteEvents> {
    private config: WebOSRemoteConfig;
    public ws: BrowserWebsocket | null = null;
    public inputWs: any | null = null;
    private messageIdCounter = 0;
    private pendingRequests = new Map<string, PendingRequestsItem>();
    /**
     * יוצר אובייקט חדש לשליטה על טלוויזיית LG.
     * @param config - הגדרות החיבור.
     */
    constructor(config: WebOSRemoteConfig) {
        super();
        this.config = {
            pairingType: 'PIN',
            timeout: 5000, // ברירת מחדל של 5 שניות
            ...config,
        };
        if (globalThis.process?.env) {
            (process.env as any).NODE_TLS_REJECT_UNAUTHORIZED = '0';
        }
    }

    /**
     * מתחבר לטלוויזיה באמצעות WebSocket.
     */
    public async connect(): Promise<void> {
        if (this.ws && this.ws.readyState === 1) { // WebSocket.OPEN
            return;
        }

        this.disconnect(); // Disconnect any existing connections

        // Use proxy URL if provided, otherwise connect directly
        const url = this.config.proxyUrl ? `${this.config.proxyUrl}?ip=${this.config.ip}` : `wss://${this.config.ip}:3001`;

        const isBrowser = !!globalThis.window;
        const wsOptions = isBrowser ? undefined : {
            rejectUnauthorized: false // Option for 'ws' library in Node.js
        };

        return new Promise(async (resolve, reject) => {

            const onConnect = () => {
                this.register();
                this.emit('connect');
                resolve();
            };

            const onError = (event: any) => {
                const error = event.message ? new Error(event.message) : new Error('WebSocket connection error');
                this.emit('error', error);
                this.disconnect();
                reject(error);
            };

            const onClose = (event: any) => {
                this.emit('disconnect', event.code, event.reason);
            };
            this.ws = await getWebSocketImplementation(url);

            this.ws.addEventListener('open', onConnect);
            this.ws.addEventListener('error', onError);
            this.ws.addEventListener('message', this.handleMessage.bind(this));
            this.ws.addEventListener('close', onClose);
        });
    }

    /**
     * מבצע רישום מול הטלוויזיה.
     * @private
     */
    private register() {
        const payload = {
            ...REGISTRATION_PAYLOAD,
            pairingType: "PROMPT",
            'client-key': this.config.clientKey ?? undefined,
        };

        // We use sendRaw here because register has a special response handling
        this.sendRaw({
            type: 'register',
            payload: payload
        });
    }

    /**
     * מטפל בהודעות נכנסות מהטלוויזיה.
     * @param event - המידע שהתקבל.
     * @private
     */
    private handleMessage(event: MessageEvent): void {
        try {
            const resData = event.toString();
            const message: WebOSResponse = JSON.parse(resData);
            this.emit('message', message);

            // Check if this message is a response to a pending request
            if (message.id && this.pendingRequests.has(message.id)) {
                const { resolve, reject, timeout } = this.pendingRequests.get(message.id)!;
                clearTimeout(timeout);

                if (message.type === 'error') {
                    reject(new Error(message.error || 'Unknown error'));
                } else {
                    resolve(message);
                }
                this.pendingRequests.delete(message.id);
                return;
            }

            // Handle other types of messages
            if (message.type === 'registered') {
                const clientKey = message.payload?.['client-key'];
                if (clientKey) {
                    this.config.clientKey = clientKey;
                    this.emit('registered', clientKey);
                }
            } else if (message.payload?.pairingType === 'PROMPT') {
                this.emit('prompt');
            }
        } catch (error) {
            this.emit('error', new Error(`Failed to parse message: ${error}`));
        }
    }


    public sendRaw(message: WebOSMessage): string {
        if (!this.ws || this.ws.readyState !== 1) { // WebSocket.OPEN
            throw new Error('Not connected to TV');
        }

        message.id ?? (message.id = crypto.randomUUID()); // Use global crypto
        this.ws.send(JSON.stringify(message));
        return message.id;
    }

    public sendMessage(message: WebOSMessage): Promise<WebOSResponse> {
        return new Promise((resolve, reject) => {
            const msgId = this.sendRaw(message);

            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(msgId)) {
                    this.pendingRequests.delete(msgId);
                    reject(new Error(`Request timed out after ${this.config.timeout} ms`));
                }
            }, this.config.timeout);

            this.pendingRequests.set(msgId, { resolve, reject, timeout });
        });
    }

    /**
     * מתנתק מהטלוויזיה.
     */
    public disconnect(): void {
        if (this.ws) {

            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close();
            }
            this.ws = null;
        }
        if (this.inputWs) {

            if (this.inputWs.readyState === WebSocket.OPEN) {
                this.inputWs.close();
            }
            this.inputWs = null;
        }
    }

    // Audio Controls
    public getVolume = (): Promise<VolumeStatus> => audio.getVolume(this);
    public setVolume = (volume: number): Promise<void> => audio.setVolume(this, volume);
    public setMute = (mute: boolean): Promise<void> => audio.setMute(this, mute);
    public volumeUp = (): void => audio.volumeUp(this);
    public volumeDown = (): void => audio.volumeDown(this);

    // System Controls
    public turnOff = (): Promise<void> => system.turnOff(this);
    public createToast = (message: string): Promise<void> => system.createToast(this, message);

    // Application Controls
    public launchApp = (appId: string, options?: any): Promise<void> => application.launchApp(this, appId, options);
    public closeApp = (appId: string): Promise<void> => application.closeApp(this, appId);
    public getForegroundAppInfo = (): Promise<ForegroundAppInfo> => application.getForegroundAppInfo(this);
    public listApps = (): Promise<any[]> => application.listApps(this);

    // Input Controls
    public sendButton = (buttonName: string): Promise<void> => input.sendButton(this, buttonName);
}