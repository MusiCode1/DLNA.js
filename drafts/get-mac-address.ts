// declare module 'node-arp';

import * as arp from "node-arp";
 
arp.getMAC('192.168.1.43', function(err, mac) {
    if (!err) {
        console.log(mac);
    }
});