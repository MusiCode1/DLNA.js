class WebOSRemoteClient extends EventTarget {
    constructor() {
        super();
        this.ws = null;
        this.inputWs = null;
        this.messageId = 0;
        this.pendingRequests = new Map();
        this.REGISTRATION_PAYLOAD = {
            "forcePairing": false,
            "pairingType": "PROMPT",
            "manifest": {
                "manifestVersion": 1,
                "appVersion": "1.1",
                "signed": {
                    "created": "20140509",
                    "appId": "com.your.app.id",
                    "vendorId": "com.your.vendor.id",
                    "localizedAppNames": { "": "LG Remote" },
                    "localizedVendorNames": { "": "Your Company" },
                    "permissions": [
                        "TEST_SECURE", "CONTROL_INPUT_TEXT", "CONTROL_MOUSE_AND_KEYBOARD", "READ_INSTALLED_APPS",
                        "READ_LGE_SDX", "READ_NOTIFICATIONS", "SEARCH", "WRITE_SETTINGS", "WRITE_NOTIFICATION_ALERT",
                        "CONTROL_POWER", "READ_CURRENT_CHANNEL", "READ_RUNNING_APPS", "READ_UPDATE_INFO",
                        "UPDATE_FROM_REMOTE_APP", "READ_LGE_TV_INPUT_EVENTS", "READ_TV_CHANNEL_LIST"
                    ],
                    "serial": "2f930e2d2cfe083771f68e4fe7bb07"
                },
                "permissions": [
                    "LAUNCH", "LAUNCH_WEBAPP", "APP_TO_APP", "CLOSE", "TEST_OPEN", "TEST_PROTECTED",
                    "CONTROL_AUDIO", "CONTROL_DISPLAY", "CONTROL_INPUT_JOYSTICK", "CONTROL_INPUT_MEDIA_RECORDING",
                    "CONTROL_INPUT_MEDIA_PLAYBACK", "CONTROL_INPUT_TV", "CONTROL_POWER", "READ_APP_STATUS",
                    "READ_CURRENT_CHANNEL", "READ_INPUT_DEVICE_LIST", "READ_NETWORK_STATE", "READ_RUNNING_APPS",
                    "READ_TV_CHANNEL_LIST", "WRITE_TARGET_INPUT", "READ_POWER_STATE", "READ_COUNTRY_INFO"
                ],
                "signatures": [{
                    "signatureVersion": 1,
                    "signature": "eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbmctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR+59aFNwYDyjQgKk3au3U8pEc1T2R0cEw3EV6kSpJs5T+A/I/pOHdHxV/bB3OjAbpC9125sKinNAp6Vo4v4LIvAO01xMMIevxflGX/525S2O0g1gMWOvDHf/8/25bgJeAIv8A/4aEpRC2kG2eEiVvK0NApSMv/+LSvs2xCCdRsP0GNzAsTV8D0Lw7Q3a0L4J/6M9G/haHGF/R+A/XyJ9DRf7qRjaho358f3c_S_k6/2Y_e2d-OL2y1i_V_v_g_v_G_g_v_x_e_y_E_y_f_y_z"
                }]
            }
        };
    }

    dispatchEvent(event) {
        super.dispatchEvent(event);
    }

    connect(ip, clientKey) {
        if (this.ws) {
            this.disconnect();
        }

        const url = `wss://${ip}:3001`;
        this.dispatchEvent(new CustomEvent('status', { detail: { message: 'מתחבר...', type: 'prompt' } }));

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            const payload = { ...this.REGISTRATION_PAYLOAD };
            if (clientKey) {
                payload['client-key'] = clientKey;
            }
            this.sendMessage('register', undefined, payload);
        };

        this.ws.onmessage = (event) => this.handleMainSocketMessage(event);

        this.ws.onerror = (error) => {
            console.error('WebSocket Error:', error);
            this.dispatchEvent(new CustomEvent('status', { detail: { message: 'שגיאת חיבור. בדוק קונסולה וודא שאישרת את החריגה.', type: 'disconnected' } }));
        };

        this.ws.onclose = () => {
            this.dispatchEvent(new CustomEvent('status', { detail: { message: 'מנותק', type: 'disconnected' } }));
            this.disconnect();
        };
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.inputWs) {
            this.inputWs.close();
            this.inputWs = null;
        }
    }

    handleMainSocketMessage(event) {
        const msg = JSON.parse(event.data);
        console.log('Message from TV:', msg);

        if (this.pendingRequests.has(msg.id)) {
            const { resolve } = this.pendingRequests.get(msg.id);
            resolve(msg.payload);
            this.pendingRequests.delete(msg.id);
        }

        if (msg.type === 'registered') {
            const clientKey = msg.payload['client-key'];
            this.dispatchEvent(new CustomEvent('registered', { detail: { clientKey } }));
            this.dispatchEvent(new CustomEvent('status', { detail: { message: 'מחובר! פותח חיבור קלט...', type: 'connected' } }));
            this.connectInputSocket();
        } else if (msg.payload && msg.payload.pairingType === 'PROMPT') {
            this.dispatchEvent(new CustomEvent('status', { detail: { message: 'נא לאשר את החיבור בטלוויזיה.', type: 'prompt' } }));
        } else if (msg.id.startsWith('screenshot_') && msg.payload.imageUri) {
            this.dispatchEvent(new CustomEvent('screenshot', { detail: { uri: msg.payload.imageUri } }));
        }
    }

    async connectInputSocket() {
        try {
            const payload = await this.sendMessage('request', 'ssap://com.webos.service.networkinput/getPointerInputSocket');
            const socketPath = payload.socketPath;
            if (!socketPath) {
                throw new Error("לא התקבלה כתובת סוקט קלט.");
            }

            this.inputWs = new WebSocket(socketPath);
            this.inputWs.onopen = () => {
                this.dispatchEvent(new CustomEvent('status', { detail: { message: 'מחובר באופן מלא (ראשי + קלט)', type: 'connected' } }));
            };
            this.inputWs.onerror = (err) => {
                console.error("Input WebSocket Error:", err);
                this.dispatchEvent(new CustomEvent('status', { detail: { message: 'שגיאה בחיבור הקלט', type: 'disconnected' } }));
            };
            this.inputWs.onclose = () => console.log("Input WebSocket closed.");

        } catch (error) {
            console.error("Failed to connect input socket:", error);
            this.dispatchEvent(new CustomEvent('status', { detail: { message: 'שגיאה בחיבור סוקט הקלט', type: 'disconnected' } }));
        }
    }

    sendMessage(type, uri, payload = {}) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                return reject(new Error("לא מחובר לטלוויזיה."));
            }
            const id = `${type}_${++this.messageId}`;
            const message = { id, type, uri, payload };

            this.pendingRequests.set(id, {
                resolve,
                reject,
                timeout: setTimeout(() => {
                    this.pendingRequests.delete(id);
                    reject(new Error("Request timed out"));
                }, 5000)
            });

            console.log('Sending message:', message);
            this.ws.send(JSON.stringify(message));
        });
    }

    sendButton(buttonName) {
        if (!this.inputWs || this.inputWs.readyState !== WebSocket.OPEN) {
            alert("חיבור הקלט אינו פתוח.");
            return;
        }
        const command = `type:button\nname:${buttonName}\n\n`;
        console.log("Sending input command:", command);
        this.inputWs.send(command);
    }
}