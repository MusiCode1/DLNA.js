import { createModuleLogger } from '../src/logger'; // הוספת ייבוא הלוגר
import { discoverSsdpDevicesIterable, fetchDeviceDescription } from '../src/upnpDeviceExplorer';
import { BasicSsdpDevice, DeviceDescription, DiscoveryOptions, ServiceDescription, DeviceIcon /*, etc. */ } from '../src/types';
// אין צורך לייבא SsdpDevice מ-dlna-types.ts אם BasicSsdpDevice מספיק

const logger = createModuleLogger('testCustomDiscovery'); // יצירת מופע לוגר

async function testDiscovery() {
  logger.info('Starting custom SSDP discovery...');
  const timeout = 20 * 1000; // 5 שניות זמן קצוב
  const serviceType = 'ssdp:all'; // חיפוש כל ההתקנים

  try {
    const devices = discoverSsdpDevicesIterable({
      searchTarget: serviceType,
      timeoutMs: timeout,
      discoveryTimeoutPerInterfaceMs: timeout, // זמן קצוב לכל ממשק
    });

    logger.info(`Searching for devices with ST: "${serviceType}" for ${timeout / 1000} seconds...`);

    let deviceFound = false;
    for await (const device of devices) {
      deviceFound = true;
      logger.info('\n--- Device Found ---');
      logger.info(`USN: ${device.usn}`);
      logger.info(`ST: ${device.st}`);
      logger.info(`Location: ${device.location}`);
      logger.info(`Server: ${device.server}`);
      logger.info(`Remote Address: ${device.address}`); // תיקון: remoteAddress -> address
      // אין remotePort ב-BasicSsdpDevice, הכתובת המלאה נמצאת ב-address אם זה IP:PORT
      logger.info(`Raw Headers:`, { headers: device.responseHeaders }); // תיקון: headers -> responseHeaders


      if (device.location) {
        logger.info(`\nFetching device description from: ${device.location}`);
        try {
          // עדכון: העברת האובייקט device כולו, והעברת true כדי לאחזר פרטי SCPD
          const description = await fetchDeviceDescription(device, true);

          if (description) {
            // תיקון: הגישה לשדות היא ישירה, לא דרך description.device
            logger.info('Device Description:');
            logger.info(`  Friendly Name: ${description.friendlyName}`);
            logger.info(`  Manufacturer: ${description.manufacturer}`);
            logger.info(`  Model Name: ${description.modelName}`);
            logger.info(`  Source IP: ${description.sourceIpAddress}`); // הדפסת השדה החדש
            logger.info(`  Base URL: ${description.baseURL}`); // הדפסת השדה החדש
            logger.info(`  Description URL: ${description.descriptionUrl}`); // הדפסת השדה החדש
            // אפשר להוסיף עוד פרטים לפי הצורך

            // הדפסת פרטי שירותים
            if (description.services && Object.keys(description.services).length > 0) {
              logger.info('  Services:');
              for (const serviceId in description.services) {
                const service = description.services[serviceId];
                logger.info(`    - Service ID: ${service.serviceId} (Type: ${service.serviceType})`);
                logger.info(`      Control URL: ${service.controlURL || 'N/A'}`);
                logger.info(`      SCPD URL: ${service.SCPDURL || 'N/A'}`);
                if (service.scpdError) {
                  logger.info(`      SCPD Error: ${service.scpdError}`);
                }

                // הדפסת פעולות
                if (service.actions && Object.keys(service.actions).length > 0) {
                  logger.info('      Actions:');
                  for (const actionName in service.actions) {
                    const action = service.actions[actionName];
                    if (action) { // בדיקה ש-action אינו undefined
                        logger.info(`        * ${action.name}:`);
                        if (action.arguments && action.arguments.length > 0) {
                          action.arguments.forEach((arg: import('../src/types').ActionArgument) => {
                            logger.info(`          - Arg: ${arg.name} (Direction: ${arg.direction}, Related State Variable: ${arg.relatedStateVariable})`);
                          });
                        } else {
                          logger.info(`          (No arguments)`);
                      }
                    } else {
                        logger.warn(`        * Action '${actionName}' is undefined.`);
                    }
                } // סגירת הלולאה for (const actionName in service.actions)
              } else if (!service.scpdError) {
                // logger.info('      (No actions found or SCPD not processed successfully for actions)');
                }

                // הדפסת משתני מצב
                if (service.stateVariables && service.stateVariables.length > 0) {
                  logger.info('      State Variables:');
                  service.stateVariables.forEach(sv => {
                    let svDetails = `        * ${sv.name} (Type: ${sv.dataType}`;
                    if (sv.sendEventsAttribute) {
                      svDetails += `, SendEvents: ${sv.sendEventsAttribute}`;
                    }
                    if (sv.defaultValue) {
                      svDetails += `, Default: ${sv.defaultValue}`;
                    }
                    svDetails += `)`;
                    logger.info(svDetails);
                    if (sv.allowedValueList && sv.allowedValueList.length > 0) {
                      logger.info(`          Allowed Values: [${sv.allowedValueList.join(', ')}]`);
                    }
                  });
                } else if (!service.scpdError) {
                  // logger.info('      (No state variables found or SCPD not processed successfully for state variables)');
              }
            } // סגירת הלולאה for (const serviceId in description.services)
          } else {
            logger.info('  No services listed for this device.');
            }
          } else {
            logger.info('  Could not fetch device description.');
          }

        } catch (err) {
          const error = err as Error;
          logger.error(`Error fetching device description: ${error.message}`, { stack: error.stack });
        }
      }
      logger.info('--------------------');
    }

    if (!deviceFound) {
      logger.info('\nNo devices found within the timeout period.');
    }

  } catch (error) {
    const err = error as Error;
    logger.error('Error during SSDP discovery:', { errorMessage: err.message, stack: err.stack });
  } finally {
    logger.info('\nCustom SSDP discovery process finished.');
  }
}

// הרצת פונקציית הבדיקה
testDiscovery().catch(error => {
  logger.error("Unhandled error in testDiscovery:", { error });
});