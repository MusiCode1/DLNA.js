import { WebSocket, type MessageEvent } from 'ws';
import { EventEmitter } from 'eventemitter3';
import crypto from "node:crypto";


import { REGISTRATION_PAYLOAD } from './constants';
export * from './types';
import type { WebOSMessage, WebOSResponse, VolumeStatus, ForegroundAppInfo } from './types';
import * as audio from './controls/audio';
import * as system from './controls/system';
import * as application from './controls/application';
import * as input from './controls/input';

interface WebOSRemoteEvents {
    connect: () => void;
    disconnect: () => void;
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
}

/**
 * # LG WebOS Remote Control
 * A library to control LG webOS TVs.
 */
export class WebOSRemote extends EventEmitter<WebOSRemoteEvents> {
    private config: WebOSRemoteConfig;
    public ws: WebSocket | null = null;
    public inputWs: WebSocket | null = null;
    private messageIdCounter = 0;
    private pendingRequests = new Map<string, { resolve: (value: any) => void, reject: (reason?: any) => void, timeout: NodeJS.Timeout }>();
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
    }

    /**
     * מתחבר לטלוויזיה באמצעות WebSocket.
     */
    public connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                return resolve();
            }

            this.disconnect(); // נתק חיבורים קיימים לפני חיבור חדש

            const url = `wss://${this.config.ip}:3001`;
            this.ws = new WebSocket(url, {});

            const onConnect = () => {
                this.register();
                this.emit('connect');
                resolve();
            };

            const onError = (error: Error) => {
                this.emit('error', error);
                this.disconnect();
                reject(error);
            };

            this.ws.once('open', onConnect);
            this.ws.once('error', onError);
            this.ws.on('message', this.handleMessage.bind(this));
            this.ws.on('close', () => this.emit('disconnect'));
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
     * @param data - המידע שהתקבל.
     * @private
     */
    private handleMessage(data: MessageEvent): void {
        try {
            const resData = data.toString();
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
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('Not connected to TV');
        }

        message.id ?? (message.id = crypto.randomUUID()); // אם לא סופק מזהה, ניצור אחד חדש
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
            this.ws.removeAllListeners();
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close();
            }
            this.ws = null;
        }
        if (this.inputWs) {
            this.inputWs.removeAllListeners();
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