import inquirer, { type Question, type DistinctQuestion, type Answers } from 'inquirer';
// Separator נגיש דרך inquirer.Separator, אין צורך לייבא אותו בנפרד
import {
  discoverSsdpDevices,
  DiscoveryDetailLevel,
  type FullDeviceDescription,
  type ServiceDescription,
  type Action,
  type StateVariable,
  type ActionArgument, // שונה מ-Argument
  // UpnpSoapClient לא מיוצא, נשתמש ב-sendUpnpCommand
  createLogger,
  sendUpnpCommand, // הפונקציה המיוצאת לשליחת פקודות
} from 'dlna.js'; // ייבוא יחסי לחבילת הליבה

const logger = createLogger('CLIDeviceExplorer');

/**
 * מחלץ שם סוג התקן קריא מתוך ה-URN המלא.
 * @param deviceTypeUrn - ה-URN המלא של סוג ההתקן.
 * @returns שם סוג התקן קריא, או ה-URN המקורי אם החילוץ נכשל.
 */
function getFriendlyDeviceType(deviceTypeUrn?: string): string {
  if (!deviceTypeUrn) {
    return 'Unknown Type';
  }
  try {
    const parts = deviceTypeUrn.split(':');
    // בדרך כלל החלק המעניין הוא החלק שלפני האחרון, אחרי 'device'
    // למשל: urn:schemas-upnp-org:device:MediaServer:1 -> MediaServer
    if (parts.length > 2 && parts[parts.length - 2] !== 'device') {
        return parts[parts.length - 2]; // אם זה לא מכיל 'device' במקום הצפוי
    }
    if (parts.length > 1) {
        return parts[parts.length - 2]; // ברירת מחדל לחלק שלפני האחרון
    }
  } catch (e) {
    // במקרה של שגיאה, החזר את ה-URN המקורי
  }
  return deviceTypeUrn; // אם החילוץ נכשל, החזר את ה-URN המקורי
}


async function main() {
  logger.info('Starting DLNA Device Explorer CLI...');

  try {
    const devices = await discoverSsdpDevices({
      timeoutMs: 5000, // שונה ל-timeoutMs
      detailLevel: DiscoveryDetailLevel.Full, // בקש את כל הפרטים
      // logger: createLogger('Discovery'), // הוסר - הלוגר הפנימי ישמש
    });

    if (!devices || devices.length === 0) {
      logger.warn('No devices found on the network.');
      return;
    }

    logger.info(`Found ${devices.length} raw device entries.`);

    // סינון התקנים כפולים לפי UDN
    const uniqueDevicesMap = new Map<string, FullDeviceDescription>();
    for (const device of devices as FullDeviceDescription[]) {
      if (device.UDN && !uniqueDevicesMap.has(device.UDN)) {
        uniqueDevicesMap.set(device.UDN, device);
      } else if (!device.UDN) {
        // במקרה שאין UDN (לא אמור לקרות עם FullDetailLevel, אבל ליתר ביטחון)
        // נשתמש ב-USN או ב-location כמפתח גיבוי, פחות אידיאלי
        const backupKey = device.usn || device.location;
        if (backupKey && !uniqueDevicesMap.has(backupKey)) {
            logger.warn(`Device ${device.friendlyName || device.usn} missing UDN, using ${backupKey} as unique key.`);
            uniqueDevicesMap.set(backupKey, device);
        }
      }
    }

    const filteredDevices = Array.from(uniqueDevicesMap.values());

    if (filteredDevices.length === 0) {
        logger.warn('No unique devices found after filtering.');
        return;
    }

    logger.info(`Displaying ${filteredDevices.length} unique devices.`);
    await selectDeviceMenu(filteredDevices);
  } catch (error) {
    logger.error('An error occurred during device discovery or exploration:', error);
  }
}

async function selectDeviceMenu(devices: FullDeviceDescription[]) {
  const { selectedDeviceUSN } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedDeviceUSN',
      message: 'Select a device to explore:',
      choices: devices.map(device => ({
        name: `${device.friendlyName} (${device.modelName || 'Unknown Model'}) - [${getFriendlyDeviceType(device.deviceType)}] - ${device.baseURL}`,
        value: device.UDN, // השתמש ב-UDN כמזהה ייחודי
      })),
    },
  ]);

  const selectedDevice = devices.find(d => d.UDN === selectedDeviceUSN);
  if (!selectedDevice) {
    logger.error('Selected device not found. This should not happen.');
    return;
  }

  logger.info(`Exploring device: ${selectedDevice.friendlyName}`);
  await deviceActionsMenu(selectedDevice);
}

async function deviceActionsMenu(device: FullDeviceDescription) {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: `Device: ${device.friendlyName} - What do you want to do?`,
      choices: [
        { name: 'List services', value: 'listServices' },
        new inquirer.Separator(),
        { name: 'Back to device list (Restart discovery)', value: 'rediscover' },
        { name: 'Exit', value: 'exit' },
      ],
    },
  ]);

  switch (action) {
    case 'listServices':
      await selectServiceMenu(device);
      break;
    case 'rediscover':
      await main(); // התחל מחדש
      break;
    case 'exit':
      logger.info('Exiting explorer.');
      return;
  }
}

async function selectServiceMenu(device: FullDeviceDescription) {
  if (!device.serviceList || device.serviceList.length === 0) {
    logger.warn(`Device ${device.friendlyName} has no services listed.`);
    await deviceActionsMenu(device); // חזרה לתפריט הקודם
    return;
  }

  const { selectedServiceId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedServiceId',
      message: `Device: ${device.friendlyName} - Select a service:`,
      choices: [
        ...device.serviceList.map(service => ({
          name: `${service.serviceType} (ID: ${service.serviceId})`,
          value: service.serviceId,
        })),
        new inquirer.Separator(),
        { name: 'Back to device actions', value: 'backToDevice' }
      ],
    },
  ]);

  if (selectedServiceId === 'backToDevice') {
    await deviceActionsMenu(device);
    return;
  }

  const selectedService = device.serviceList.find(s => s.serviceId === selectedServiceId);
  if (!selectedService) {
    logger.error('Selected service not found. This should not happen.');
    await deviceActionsMenu(device);
    return;
  }

  logger.info(`Exploring service: ${selectedService.serviceId} of device ${device.friendlyName}`);
  await serviceActionsMenu(device, selectedService);
}

async function serviceActionsMenu(device: FullDeviceDescription, service: ServiceDescription) {
  // ודא שפרטי השירות המלאים (SCPD) נטענו
  // בפועל, discoverSsdpDevices עם DiscoveryDetailLevel.Full אמור לטעון אותם,
  // אך אם לא, תצטרך פונקציה נוספת שתטען אותם לפי הצורך.
  // כאן נניח שהם קיימים אם actionList קיים.

  if (!service.actionList || service.actionList.length === 0) {
    logger.warn(`Service ${service.serviceId} has no actions listed.`);
    await selectServiceMenu(device); // חזרה לתפריט הקודם
    return;
  }

  const choices = [
    { name: 'List actions', value: 'listActions' },
    { name: 'List state variables', value: 'listStateVariables' },
    new inquirer.Separator(),
    { name: 'Back to service list', value: 'backToServices' },
    { name: 'Back to device actions', value: 'backToDevice' },
    { name: 'Exit', value: 'exit' },
  ];

  const { actionChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'actionChoice',
      message: `Service: ${service.serviceId} - What do you want to do?`,
      choices,
    },
  ]);

  switch (actionChoice) {
    case 'listActions':
      await selectActionMenu(device, service);
      break;
    case 'listStateVariables':
      await listStateVariables(device, service);
      break;
    case 'backToServices':
      await selectServiceMenu(device);
      break;
    case 'backToDevice':
      await deviceActionsMenu(device);
      break;
    case 'exit':
      logger.info('Exiting explorer.');
      return;
  }
}

async function selectActionMenu(device: FullDeviceDescription, service: ServiceDescription) {
  if (!service.actionList || service.actionList.length === 0) {
    logger.warn(`Service ${service.serviceId} has no actions.`);
    await serviceActionsMenu(device, service);
    return;
  }

  const { selectedActionName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedActionName',
      message: `Service: ${service.serviceId} - Select an action to invoke:`,
      choices: [
        ...service.actionList.map(act => ({
          name: act.name,
          value: act.name,
        })),
        new inquirer.Separator(),
        { name: 'Back to service actions', value: 'backToServiceActions' }
      ],
    },
  ]);

  if (selectedActionName === 'backToServiceActions') {
    await serviceActionsMenu(device, service);
    return;
  }

  const selectedAction = service.actionList.find(act => act.name === selectedActionName);
  if (!selectedAction) {
    logger.error('Selected action not found.');
    await serviceActionsMenu(device, service);
    return;
  }

  await invokeAction(device, service, selectedAction);
}

async function invokeAction(device: FullDeviceDescription, service: ServiceDescription, action: Action) {
  logger.info(`Preparing to invoke action: ${action.name} on service ${service.serviceId}`);

  const inputArguments: { [key: string]: string | number } = {};
  const outputArgumentNames: string[] = [];

  if (action.arguments) { // שונה ל-arguments
    for (const arg of action.arguments) { // שונה ל-arguments
      if (arg.direction === 'in') {
        // אם יש משתנה מצב קשור, נסוך להציג את הערכים האפשריים אם קיימים
        const relatedStateVariable = service.stateVariableList?.find(sv => sv.name === arg.relatedStateVariable); // שונה ל-stateVariableList
        // ננסה להשתמש בטיפוסים המיובאים. ייתכן שנצטרך להתאים אותם יותר.
        // DistinctQuestion<Answers>['choices'] יכול להיות הדרך לגשת למבנה של choices.
        // עם זאת, choices הוא פשוט מערך של אובייקטים עם name/value או Separator.
        let choices: any[] | undefined; // משאירים any[] כרגע כדי לפתור את שגיאת ה-overload
        let argType: 'list' | 'input' | 'password' | 'confirm' | 'checkbox' | 'rawlist' | 'expand' | 'editor' | 'number' = 'input'; // טיפוס ספציפי יותר

        if (relatedStateVariable?.allowedValueList && relatedStateVariable.allowedValueList.length > 0) {
          choices = relatedStateVariable.allowedValueList.map(val => ({ name: val, value: val }));
          argType = 'list';
        } else if (relatedStateVariable?.dataType === 'boolean') {
            choices = [{name: 'Yes (1 or true)', value: '1'}, {name: 'No (0 or false)', value: '0'}];
            argType = 'list';
        }


        const { value } = await inquirer.prompt([
          {
            type: argType,
            name: 'value',
            message: `Enter value for argument "${arg.name}" (type: ${relatedStateVariable?.dataType || 'unknown'}):`,
            choices: choices, // יהיה undefined אם אין רשימה מותרת
            // ניתן להוסיף כאן validation בהתאם ל-dataType או allowedValueRange
            filter: (input: any) => { // הוספת טיפוס any
                if (relatedStateVariable?.dataType === 'ui4' || relatedStateVariable?.dataType === 'i4' || relatedStateVariable?.dataType === 'number') {
                    return Number(input);
                }
                return input;
            }
          },
        ]);
        inputArguments[arg.name] = value;
      } else if (arg.direction === 'out') {
        outputArgumentNames.push(arg.name);
      }
    }
  }

  logger.debug(`Invoking action "${action.name}" with arguments:`, inputArguments);

  try {
    // בניית ה-URL המלא ל-controlURL של השירות
    const controlURL = new URL(service.controlURL, device.baseURL).toString();
    // const soapClient = new UpnpSoapClient(controlURL, service.serviceType, createLogger(`SoapClient-${service.serviceId}`)); // הוסר
    // const result = await soapClient.invokeAction(action.name, inputArguments); // הוסר

    // שימוש בפונקציה sendUpnpCommand
    const result = await sendUpnpCommand(controlURL, service.serviceType, action.name, inputArguments);

    logger.info(`Action "${action.name}" invoked successfully.`);
    if (Object.keys(result).length > 0) {
      logger.info('Output arguments:');
      for (const key in result) {
        if (outputArgumentNames.includes(key)) {
          logger.info(`  ${key}: ${result[key]}`);
        }
      }
    } else {
      logger.info('No output arguments returned or defined for this action.');
    }

  } catch (error: any) {
    logger.error(`Error invoking action "${action.name}":`, {
      message: error.message,
      statusCode: error.statusCode, // אם קיים מהשגיאה של soapClient
      body: error.body, // אם קיים
      requestArgs: inputArguments,
    });
  }

  // חזרה לתפריט הפעולות של השירות
  await selectActionMenu(device, service);
}

async function listStateVariables(device: FullDeviceDescription, service: ServiceDescription) {
  logger.info(`State variables for service: ${service.serviceId}`);
  if (!service.stateVariableList || service.stateVariableList.length === 0) { // שונה ל-stateVariableList
    logger.warn('No state variables found for this service.');
  } else {
    service.stateVariableList.forEach(sv => { // שונה ל-stateVariableList
      let info = `  - ${sv.name} (dataType: ${sv.dataType})`;
      if (sv.sendEvents === 'yes') {
        info += ' (sends events)';
      }
      if (sv.defaultValue) {
        info += `, Default: ${sv.defaultValue}`;
      }
      logger.info(info);
      if (sv.allowedValueList && sv.allowedValueList.length > 0) {
        logger.info(`    Allowed values: ${sv.allowedValueList.join(', ')}`);
      }
      // if (sv.allowedValueRange) { // הוסר - השדה לא קיים בטיפוס
      //   logger.info(`    Allowed range: min=${sv.allowedValueRange.minimum}, max=${sv.allowedValueRange.maximum}, step=${sv.allowedValueRange.step || 'N/A'}`);
      // }
    });
  }

  // ננסה לקרוא את הערכים הנוכחיים של משתני המצב (אם השירות תומך ב-QueryStateVariable)
  // זהו חלק מתקדם יותר, שכן לא כל המשתנים ניתנים לשאילתה ישירה.
  // לעיתים, צריך להפעיל פעולה ספציפית כדי לקבל ערכים.
  // כאן נדגים שאילתה ישירה אם אפשר.

  const queryableVariables = service.stateVariableList?.filter(sv => !sv.name.startsWith('A_ARG_TYPE_')) || []; // שונה ל-stateVariableList

  if (queryableVariables.length > 0) {
    logger.info('\nAttempting to query current values for (some) state variables:');
    const controlURL = new URL(service.controlURL, device.baseURL).toString();
    // const soapClient = new UpnpSoapClient(controlURL, service.serviceType, createLogger(`SoapQuery-${service.serviceId}`)); // הוסר

    for (const sv of queryableVariables) {
        // לא כל משתנה ניתן לשאילתה ישירה. ננסה רק את אלו שלא נראים כמו ארגומנטים פנימיים.
        // שירותים מסוימים דורשים פעולת QueryStateVariable ספציפית.
        // כאן נשתמש בפעולה הגנרית QueryStateVariable אם היא קיימת.
        // נבדוק אם יש פעולה בשם QueryStateVariable
        const queryAction = service.actionList?.find(a => a.name === 'QueryStateVariable');
        if (queryAction) {
            try {
                const args = { 'varName': sv.name }; // הארגומנט הסטנדרטי לפעולה זו
                // שימוש בפונקציה sendUpnpCommand
                const result = await sendUpnpCommand(controlURL, service.serviceType, 'QueryStateVariable', args);
                // הפלט של QueryStateVariable הוא בדרך כלל ארגומנט בשם 'return'
                if (result && typeof result.return !== 'undefined') {
                    logger.info(`  ${sv.name}: ${result.return}`);
                } else {
                    // logger.debug(`QueryStateVariable for ${sv.name} did not return a 'return' value or result was empty.`);
                }
            } catch (error: any) {
                // logger.debug(`Could not query state variable ${sv.name}: ${error.message}`);
            }
        } else {
            // logger.debug(`Service ${service.serviceId} does not have a standard QueryStateVariable action.`);
        }
    }
  }


  // חזרה לתפריט הפעולות של השירות
  await serviceActionsMenu(device, service);
}


// התחלת התוכנית
main().catch(error => {
  logger.error('Unhandled error in main execution:', error);
});