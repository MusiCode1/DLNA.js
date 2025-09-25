// declare module 'node-arp';

import * as arp from "node-arp";
import { promisify } from "node:util";

const getMacPromise = promisify(arp.getMAC);

getMacPromise('10.100.102.120')
    .then(mac => {
        console.log("MAC address is: " + mac);
    })
    .catch(err => {
        console.error("Error retrieving MAC address:", err);
    });
