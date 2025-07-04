import type { WebSocket } from "ws";
import { randomUUID } from "node:crypto";


const IP = '192.168.1.41';

const SIGNATURE = "eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbm" +
    "ctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR" +
    "+59aFNwYDyjQgKk3auukd7pcegmE2CzPCa0bJ0ZsRAcKkCTJrWo5iDzNhMBWRy" +
    "aMOv5zWSrthlf7G128qvIlpMT0YNY+n/FaOHE73uLrS/g7swl3/qH/BGFG2Hu4" +
    "RlL48eb3lLKqTt2xKHdCs6Cd4RMfJPYnzgvI4BNrFUKsjkcu+WD4OO2A27Pq1n" +
    "50cMchmcaXadJhGrOqH5YmHdOCj5NSHzJYrsW0HPlpuAx/ECMeIZYDh6RMqaFM" +
    "2DXzdKX9NmmyqzJ3o/0lkk/N97gfVRLW5hA29yeAwaCViZNCP8iC9aO0q9fQoj" +
    "oa7NQnAtw==";

export const REGISTRATION_PAYLOAD: Record<string, any> = {
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
    "pairingType": "PIN" // "PIN" או "PROMPT"
};

const uuid = randomUUID();

const message = {
    type: 'register',
    payload: {
        ...REGISTRATION_PAYLOAD,
        pairingType: 'PROMPT'
    },
    id: uuid, // מזהה ייחודי להודעות
};

(process.env as any).NODE_TLS_REJECT_UNAUTHORIZED  = '0';

(() => {

    try {

        const url = `wss://${IP}:3001`;

        // @ts-ignore
        const client = new WebSocket(url, {
            rejectUnauthorized: false
        });

        client.addEventListener('open', () => {
            console.log('WebSocket connection opened');

            //console.log('Sending registration message:', message);

            const payload = JSON.stringify(message);
            // כאן ניתן לבצע פעולות נוסxxx כמו שליחת הודעות
            client.send(payload);
        });

        client.addEventListener('error', (error) => {
            console.error('WebSocket error:', error);
        });

        client.addEventListener('message', (data) => {
            if (data.type === 'message') {
                const msgData = (data.data as string);
                const messageData = JSON.parse(msgData);
                console.log('Received message data:', messageData);
                console.log('Received binary data:', JSON.stringify(data));
                return;

            }

            const message = JSON.stringify(data);
            console.log('Received message:', message);
            console.log(data);

        });

    } catch (error) {
        console.error('Error connecting to WebSocket:', error);
    }
})();

/**
 * 
PS C:\programs\DLNA.js\DLNA.js> bun run .\data\lg-remote.ts
WebSocket connection opened
Received message data: {
  type: "response",
  id: "3f72cc46-85a0-402d-836d-96d34a0c8878",
  payload: {
    pairingType: "PIN",
    returnValue: true,
  },
}
Received binary data: {"isTrusted":true}

 */