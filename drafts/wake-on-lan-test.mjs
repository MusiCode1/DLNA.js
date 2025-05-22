import wol from "wake_on_lan";
import wol2 from 'wake-on-lan';
import * as dns from 'node:dns';
import * as os from 'os';

function wake_on_lan() {
  const macAddress = "48:9E:9D:FB:F7:98"; // Replace with the target MAC address
    
  wol.wake(macAddress,{
    address: "192.168.1.255", // Replace with your broadcast address
    interval: 100,
    num_packets: 1,
  }, (error) => {
    if (error) {
      console.error("Error sending Wake-on-LAN packet:", error);
    } else {
      console.log("Wake-on-LAN packet sent successfully.");
    }
  });
}

function printAllNetworkInterfaceInfo() {
  const interfaces = os.networkInterfaces();
  let foundInterface = false;

  console.log('Available Network Interfaces Information:');

  for (const interfaceName in interfaces) {
    const ifaceDetails = interfaces[interfaceName];
    if (ifaceDetails) {
      for (const detail of ifaceDetails) {
        if (detail.family === 'IPv4' && !detail.internal) {
          foundInterface = true;
          console.log(`\nInterface: ${interfaceName}`);
          console.log(`  IP Address: ${detail.address}`);
          console.log(`  Subnet Mask: ${detail.netmask}`);
          console.log(`  MAC Address: ${detail.mac}`);

          // חישוב כתובת ה-Broadcast
          try {
            const ipParts = detail.address.split('.').map(Number);
            const maskParts = detail.netmask.split('.').map(Number);
            
            if (ipParts.length === 4 && maskParts.length === 4) {
              const broadcastParts = ipParts.map((ipPart, i) => {
                return ipPart | (maskParts[i] ^ 255);
              });
              const broadcastAddress = broadcastParts.join('.');
              console.log(`  Calculated Broadcast Address: ${broadcastAddress}`);
            } else {
              console.log('  Could not calculate broadcast address (invalid IP/mask format).');
            }
          } catch (e) {
            console.log(`  Error calculating broadcast address: ${e.message}`);
          }
        }
      }
    }
  }

  if (!foundInterface) {
    console.log('No active IPv4 network interfaces found.');
  }
}

// קריאה לפונקציה החדשה
printAllNetworkInterfaceInfo();

