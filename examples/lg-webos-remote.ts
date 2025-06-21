
import { WebOSRemote } from "lg-webos-remote";

(process.env as any).NODE_TLS_REJECT_UNAUTHORIZED = '0';

(async () => {

    try {

        const ip = '192.168.1.41';

        const clientKey = 'e6d865a8129fc69d17db75829985ad14';


        const client = new WebOSRemote({ ip, pairingType: 'PIN', clientKey });

        client.on('connect', () => {
            console.log(`Connected to LG TV at ${ip}`);
        });

        client.on('error', (error) => {
            console.error(`Error connecting to LG TV: ${error.message}`);
        });

        client.on('disconnect', () => {
            console.log(`Disconnected from LG TV at ${ip}`);
        });

        client.on('message', (message) => {
            console.log(`Received message: ${JSON.stringify(message)}`);
        });

        client.on('prompt', () => {
            console.log('')
        });

        await client.connect();

        /* await new Promise((resolve) => {
            client.on('registered', (clientKey) => {
                console.log(`Registered with client key: ${clientKey}`);
                resolve(true);
            });
        }); */



        client.sendMessage({
            type: 'request',
            uri: 'ssap://audio/getSoundOutput',
        }).then((response) => {
            console.log(`Sound output: ${JSON.stringify(response)}`);
        }).catch((error) => {
            console.error(`Error getting sound output: ${error.message}`);
        });

        client.sendMessage({
            type: 'request',
            uri: 'ssap://com.webos.applicationManager/getForegroundAppInfo',
            payload:{
                
            }
        }).then((response) => {
            console.log(`One-shot command executed: ${JSON.stringify(response)}`);

        }).catch((error) => {
            console.error(`Error turning off TV: ${error.message}`);
        });


    } catch (error) {
        console.error('Error in main execution:', error);

    }
})();