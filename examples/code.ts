import { discoverSsdpDevices } from '../src/upnpDeviceExplorer';
import { MEDIA_SERVER_DEVICE } from "../src/upnpDiscoveryService";

const timeout = 30 * 1000; // 30 seconds

async function main() {
    const devices = await discoverSsdpDevices({
        searchTarget: 'urn:schemas-upnp-org:service:ContentDirectory:1',
        timeoutMs: timeout,
        discoveryTimeoutPerInterfaceMs: timeout,
        onDeviceFound(device) {
            console.log('Device found:', device);
        },
    });
    console.log(devices);
}

main().catch((error) => {
    console.error('Error discovering devices:', error);
});