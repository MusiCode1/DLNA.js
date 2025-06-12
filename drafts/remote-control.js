const SIGNATURE = "eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbm" +
    "ctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR" +
    "+59aFNwYDyjQgKk3auukd7pcegmE2CzPCa0bJ0ZsRAcKkCTJrWo5iDzNhMBWRy" +
    "aMOv5zWSrthlf7G128qvIlpMT0YNY+n/FaOHE73uLrS/g7swl3/qH/BGFG2Hu4" +
    "RlL48eb3lLKqTt2xKHdCs6Cd4RMfJPYnzgvI4BNrFUKsjkcu+WD4OO2A27Pq1n" +
    "50cMchmcaXadJhGrOqH5YmHdOCj5NSHzJYrsW0HPlpuAx/ECMeIZYDh6RMqaFM" +
    "2DXzdKX9NmmyqzJ3o/0lkk/N97gfVRLW5hA29yeAwaCViZNCP8iC9aO0q9fQoj" +
    "oa7NQnAtw==";

const REGISTRATION_PAYLOAD = {
    "forcePairing": false,
    "manifest": {
        "appVersion": "1.1",
        "manifestVersion": 1,
        "permissions": [
            "LAUNCH",
            "LAUNCH_WEBAPP",
            "APP_TO_APP",
            "CLOSE",
            "TEST_OPEN",
            "TEST_PROTECTED",
            "CONTROL_AUDIO",
            "CONTROL_DISPLAY",
            "CONTROL_INPUT_JOYSTICK",
            "CONTROL_INPUT_MEDIA_RECORDING",
            "CONTROL_INPUT_MEDIA_PLAYBACK",
            "CONTROL_INPUT_TV",
            "CONTROL_POWER",
            "READ_APP_STATUS",
            "READ_CURRENT_CHANNEL",
            "READ_INPUT_DEVICE_LIST",
            "READ_NETWORK_STATE",
            "READ_RUNNING_APPS",
            "READ_TV_CHANNEL_LIST",
            "WRITE_NOTIFICATION_TOAST",
            "READ_POWER_STATE",
            "READ_COUNTRY_INFO",
            "READ_SETTINGS",
            "CONTROL_TV_SCREEN",
            "CONTROL_TV_STANBY",
            "CONTROL_FAVORITE_GROUP",
            "CONTROL_USER_INFO",
            "CHECK_BLUETOOTH_DEVICE",
            "CONTROL_BLUETOOTH",
            "CONTROL_TIMER_INFO",
            "STB_INTERNAL_CONNECTION",
            "CONTROL_RECORDING",
            "READ_RECORDING_STATE",
            "WRITE_RECORDING_LIST",
            "READ_RECORDING_LIST",
            "READ_RECORDING_SCHEDULE",
            "WRITE_RECORDING_SCHEDULE",
            "READ_STORAGE_DEVICE_LIST",
            "READ_TV_PROGRAM_INFO",
            "CONTROL_BOX_CHANNEL",
            "READ_TV_ACR_AUTH_TOKEN",
            "READ_TV_CONTENT_STATE",
            "READ_TV_CURRENT_TIME",
            "ADD_LAUNCHER_CHANNEL",
            "SET_CHANNEL_SKIP",
            "RELEASE_CHANNEL_SKIP",
            "CONTROL_CHANNEL_BLOCK",
            "DELETE_SELECT_CHANNEL",
            "CONTROL_CHANNEL_GROUP",
            "SCAN_TV_CHANNELS",
            "CONTROL_TV_POWER",
            "CONTROL_WOL"
        ],
        "signatures": [
            {
                "signature": SIGNATURE,
                "signatureVersion": 1
            }
        ],
        "signed": {
            "appId": "com.lge.test",
            "created": "20140509",
            "localizedAppNames": {
                "": "LG Remote App",
                "ko-KR": "리모컨 앱",
                "zxx-XX": "ЛГ Rэмotэ AПП"
            },
            "localizedVendorNames": {
                "": "LG Electronics"
            },
            "permissions": [
                "TEST_SECURE",
                "CONTROL_INPUT_TEXT",
                "CONTROL_MOUSE_AND_KEYBOARD",
                "READ_INSTALLED_APPS",
                "READ_LGE_SDX",
                "READ_NOTIFICATIONS",
                "SEARCH",
                "WRITE_SETTINGS",
                "WRITE_NOTIFICATION_ALERT",
                "CONTROL_POWER",
                "READ_CURRENT_CHANNEL",
                "READ_RUNNING_APPS",
                "READ_UPDATE_INFO",
                "UPDATE_FROM_REMOTE_APP",
                "READ_LGE_TV_INPUT_EVENTS",
                "READ_TV_CURRENT_TIME"
            ],
            "serial": "2f930e2d2cfe083771f68e4fe7bb07",
            "vendorId": "com.lge"
        }
    },
    "pairingType": "PROMPT"
};

class WebOSRemoteClient extends EventTarget {
    constructor() {
        super();
        this.ws = null;
        this.inputWs = null;
        this.messageId = 0;
        this.pendingRequests = new Map();
        this.REGISTRATION_PAYLOAD = REGISTRATION_PAYLOAD;
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