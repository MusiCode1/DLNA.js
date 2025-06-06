// src/upnpDeviceProcessor.test.ts
import { describe, it, expect, mock, spyOn, beforeEach } from 'bun:test'; // הוסף beforeEach
import { processUpnpDevice } from './upnpDeviceProcessor';
import type { BasicSsdpDevice, DeviceDescription, FullDeviceDescription, ServiceDescription, Action, StateVariable, DeviceWithServicesDescription } from './types'; // הוספתי DeviceWithServicesDescription
import { DiscoveryDetailLevel } from './types'; // ודא ש-enum מיובא
import { createModuleLogger } from './logger';
import axios from 'axios'; // ייבוא רגיל, Bun יטפל ב-mock
import * as upnpSoapClient from './upnpSoapClient'; // ייבוא כדי שנוכל לעשות spyOn
import { create } from 'xmlbuilder2'; // הוספת ייבוא עבור xmlbuilder2

// Mock the entire axios module
mock.module('axios', () => {
    const mockAxios = {
        get: mock(async (url: string, config?: any) => { // הפוך את הפונקציה לאסינכרונית, הוסף config
            // ברירת מחדל: החזר שגיאה אם לא סופק mock ספציפי לבדיקה
            logger.warn(`axios.get called with unmocked URL: ${url}`);
            if (config?.signal?.aborted) {
                const error = new Error(`Request aborted for ${url}`);
                (error as any).isAxiosError = true;
                (error as any).code = 'ECONNABORTED'; // קוד שגיאה נפוץ לביטול
                throw error;
            }
            throw new Error(`axios.get unmocked for URL: ${url}`);
        }),
        isCancel: mock((error: any) => {
            // בדיקה פשוטה לביטול, ניתן להתאים לפי הצורך
            return !!(error && (error.message?.includes('aborted') || error.message?.includes('cancel') || error.code === 'ECONNABORTED'));
        }),
        // הוסף isAxiosError אם יש בו שימוש במקומות אחרים בקוד הנבדק
        isAxiosError: mock((error: any) => !!(error && error.isAxiosError)),
    };
    return {
        default: mockAxios,
        ...mockAxios // כדי לתמוך גם בייבוא ישיר של פונקציות כמו axios.isCancel
    };
});

// Mock the sendUpnpCommand function from upnpSoapClient
// ניצור spy על הפונקציה המקורית כדי שנוכל לשלוט בהחזרות שלה פר-בדיקה
const mockedSendUpnpCommand = spyOn(upnpSoapClient, 'sendUpnpCommand')
    .mockImplementation(async (controlURL, serviceType, actionName, args) => {
        logger.warn(`sendUpnpCommand called with unmocked action: ${actionName} on ${controlURL}`);
        // ברירת מחדל: החזר אובייקט ריק או זרוק שגיאה
        return Promise.resolve({});
        // throw new Error(`sendUpnpCommand unmocked for action: ${actionName}`);
    });

const logger = createModuleLogger('upnpDeviceProcessorTest');

describe('processUpnpDevice', () => {
    const mockBasicDevice: BasicSsdpDevice = {
        usn: 'uuid:12345::urn:schemas-upnp-org:device:Basic:1',
        location: 'http://localhost:1234/device.xml',
        server: 'TestServer/1.0 UPnP/1.0 TestLib/1.0',
        st: 'upnp:rootdevice',
        remoteAddress: '127.0.0.1',
        remotePort: 12345,
        timestamp: Date.now(), // הוספת שדה חובה
        messageType: 'RESPONSE', // או REQUEST לפי הצורך
        headers: {},
        cacheControlMaxAge: 1800,
    };

    const mockAbortController = new AbortController();
    const mockAbortSignal = mockAbortController.signal;

    beforeEach(() => {
        // אפס את ה-mocks לפני כל בדיקה כדי למנוע הפרעות בין בדיקות
        (axios.get as ReturnType<typeof mock>).mockClear(); // אפס קריאות קודמות
        mockedSendUpnpCommand.mockClear(); // אפס קריאות קודמות

        // הגדר מחדש את מימוש ברירת המחדל אם צריך, או הסתמך על ה-mockImplementation הגלובלי
        (axios.get as ReturnType<typeof mock>).mockImplementation(async (url: string, config?: any) => {
            logger.warn(`axios.get called with unmocked URL in test: ${url}`);
            if (config?.signal?.aborted) {
                const error = new Error(`Request aborted in test for ${url}`);
                (error as any).isAxiosError = true;
                (error as any).code = 'ECONNABORTED';
                throw error;
            }
            throw new Error(`axios.get unmocked for URL: ${url}`);
        });
        mockedSendUpnpCommand.mockImplementation(async (controlURL, serviceType, actionName, args) => {
            logger.warn(`sendUpnpCommand called with unmocked action in test: ${actionName} on ${controlURL}`);
            return Promise.resolve({});
        });
    });

    it('should return BasicSsdpDevice if detailLevel is "basic"', async () => {
        const result = await processUpnpDevice(mockBasicDevice, DiscoveryDetailLevel.Basic, mockAbortSignal);
        // כאשר detailLevel הוא Basic, הפונקציה אמורה להחזיר את basicDevice ללא שינוי.
        // השדה detailLevelAchieved אינו מתווסף במקרה זה.
        expect(result).toEqual(mockBasicDevice);
    });

    it('should fetch and parse device description if detailLevel is "description"', async () => {
        const deviceType = 'urn:schemas-upnp-org:device:TestDevice:1';
        const friendlyName = 'Test Friendly Name';
        const manufacturer = 'Test Manufacturer';
        const serviceType = 'urn:schemas-upnp-org:service:TestService:1';
        const serviceId = 'urn:upnp-org:serviceId:testService1';
        const scpdUrl = '/testService.xml';
        const controlUrl = '/control/testService1';
        const eventSubUrl = '/event/testService1';

        const mockXmlDescription = create({ version: '1.0' })
            .ele('root', { xmlns: 'urn:schemas-upnp-org:device-1-0' })
            .ele('specVersion')
            .ele('major').txt('1').up()
            .ele('minor').txt('0').up()
            .up()
            .ele('device')
            .ele('deviceType').txt(deviceType).up()
            .ele('friendlyName').txt(friendlyName).up()
            .ele('manufacturer').txt(manufacturer).up()
            .ele('UDN').txt(mockBasicDevice.usn).up()
            .ele('serviceList')
            .ele('service')
            .ele('serviceType').txt(serviceType).up()
            .ele('serviceId').txt(serviceId).up()
            .ele('SCPDURL').txt(scpdUrl).up()
            .ele('controlURL').txt(controlUrl).up()
            .ele('eventSubURL').txt(eventSubUrl).up()
            .up()
            .up()
            .up()
            .doc().toString({ prettyPrint: true });

        (axios.get as ReturnType<typeof mock>).mockResolvedValueOnce({ data: mockXmlDescription, status: 200, statusText: 'OK', headers: {}, config: {} as any });

        const result = await processUpnpDevice(mockBasicDevice, DiscoveryDetailLevel.Description, mockAbortSignal);

        expect(axios.get).toHaveBeenCalledWith(mockBasicDevice.location, {
            responseType: 'text',
            timeout: expect.any(Number), // DEFAULT_TIMEOUT_MS from upnpDeviceProcessor
            signal: mockAbortSignal,
        });
        expect(result).toBeDefined();
        if (!result) throw new Error("Result is null");

        const deviceDesc = result as DeviceDescription;
        expect(deviceDesc.UDN).toBe(mockBasicDevice.usn);
        expect(deviceDesc.friendlyName).toBe(friendlyName);
        expect(deviceDesc.manufacturer).toBe(manufacturer);
        expect(deviceDesc.deviceType).toBe(deviceType);
        expect(deviceDesc.serviceList).toBeInstanceOf(Map);
        expect(deviceDesc.serviceList?.size).toBe(1);
        const serviceFromMap = deviceDesc.serviceList!.values().next().value;
        expect(serviceFromMap).toBeDefined(); 
        if (!serviceFromMap) throw new Error("Service from map is undefined after check"); 
        expect(serviceFromMap.serviceId).toBe(serviceId);
        const expectedFullScpdUrl = new URL(scpdUrl, mockBasicDevice.location).toString();
        expect(serviceFromMap.SCPDURL).toBe(expectedFullScpdUrl);
        expect(deviceDesc.baseURL).toBe('http://localhost:1234'); 
    });

    it('should fetch and parse service descriptions if detailLevel is "services"', async () => {
        const deviceType = 'urn:schemas-upnp-org:device:TestDevice:1';
        const friendlyNameDevice = 'Test Services Device';
        const manufacturer = 'Test Manufacturer';

        const serviceType1 = 'urn:schemas-upnp-org:service:TestService:1';
        const serviceId1 = 'urn:upnp-org:serviceId:testService1';
        const scpdUrl1 = '/testService1.xml';
        const controlUrl1 = '/control/testService1';
        const eventSubUrl1 = '/event/testService1';
        const actionName1 = 'TestAction';
        const inputArgName1 = 'InputArg';
        const outputArgName1 = 'OutputArg';
        const stateVarName1 = 'TestStateVar';
        const anotherStateVarName1 = 'AnotherStateVar';

        const serviceType2 = 'urn:schemas-upnp-org:service:AnotherService:1';
        const serviceId2 = 'urn:upnp-org:serviceId:anotherService1';
        const scpdUrl2 = '/anotherService1.xml';
        const controlUrl2 = '/control/anotherService1';
        const eventSubUrl2 = '/event/anotherService1';
        const simpleVarName2 = 'SimpleVar';


        const mockDeviceXml = create({ version: '1.0' })
            .ele('root', { xmlns: 'urn:schemas-upnp-org:device-1-0' })
            .ele('specVersion')
            .ele('major').txt('1').up()
            .ele('minor').txt('0').up()
            .up()
            .ele('device')
            .ele('deviceType').txt(deviceType).up()
            .ele('friendlyName').txt(friendlyNameDevice).up()
            .ele('manufacturer').txt(manufacturer).up()
            .ele('UDN').txt(mockBasicDevice.usn).up()
            .ele('serviceList')
            .ele('service')
            .ele('serviceType').txt(serviceType1).up()
            .ele('serviceId').txt(serviceId1).up()
            .ele('SCPDURL').txt(scpdUrl1).up()
            .ele('controlURL').txt(controlUrl1).up()
            .ele('eventSubURL').txt(eventSubUrl1).up()
            .up()
            .ele('service')
            .ele('serviceType').txt(serviceType2).up()
            .ele('serviceId').txt(serviceId2).up()
            .ele('SCPDURL').txt(scpdUrl2).up()
            .ele('controlURL').txt(controlUrl2).up()
            .ele('eventSubURL').txt(eventSubUrl2).up()
            .up()
            .up()
            .up()
            .doc().toString({ prettyPrint: true });

        const scpdXmlTestService = create({ version: '1.0' })
            .ele('scpd', { xmlns: 'urn:schemas-upnp-org:service-1-0' })
            .ele('specVersion')
            .ele('major').txt('1').up()
            .ele('minor').txt('0').up()
            .up()
            .ele('actionList')
            .ele('action')
            .ele('name').txt(actionName1).up()
            .ele('argumentList')
            .ele('argument')
            .ele('name').txt(inputArgName1).up()
            .ele('direction').txt('in').up()
            .ele('relatedStateVariable').txt(stateVarName1).up()
            .up()
            .ele('argument')
            .ele('name').txt(outputArgName1).up()
            .ele('direction').txt('out').up()
            .ele('relatedStateVariable').txt(anotherStateVarName1).up()
            .up()
            .up()
            .up()
            .up()
            .ele('serviceStateTable')
            .ele('stateVariable', { sendEvents: 'no' })
            .ele('name').txt(stateVarName1).up()
            .ele('dataType').txt('string').up()
            .up()
            .ele('stateVariable', { sendEvents: 'yes' })
            .ele('name').txt(anotherStateVarName1).up()
            .ele('dataType').txt('ui4').up()
            .ele('allowedValueList')
            .ele('allowedValue').txt('1').up()
            .ele('allowedValue').txt('2').up()
            .up()
            .up()
            .up()
            .doc().toString({ prettyPrint: true });

        const scpdXmlAnotherService = create({ version: '1.0' })
            .ele('scpd', { xmlns: 'urn:schemas-upnp-org:service-1-0' })
            .ele('specVersion').ele('major').txt('1').up().ele('minor').txt('0').up().up()
            .ele('actionList') // רשימת פעולות ריקה
            .up()
            .ele('serviceStateTable')
            .ele('stateVariable', { sendEvents: 'no' })
            .ele('name').txt(simpleVarName2).up()
            .ele('dataType').txt('boolean').up()
            .ele('defaultValue').txt('0').up()
            .up()
            .up()
            .doc().toString({ prettyPrint: true });

        (axios.get as ReturnType<typeof mock>)
            .mockResolvedValueOnce({ data: mockDeviceXml, status: 200, statusText: 'OK', headers: {}, config: {} as any }) 
            .mockResolvedValueOnce({ data: scpdXmlTestService, status: 200, statusText: 'OK', headers: {}, config: {} as any }) 
            .mockResolvedValueOnce({ data: scpdXmlAnotherService, status: 200, statusText: 'OK', headers: {}, config: {} as any }); 

        const result = await processUpnpDevice(mockBasicDevice, DiscoveryDetailLevel.Services, mockAbortSignal);
        expect(result).toBeDefined();
        if (!result) throw new Error("Result is null");

        const deviceWithServices = result as DeviceWithServicesDescription;
        expect(deviceWithServices.friendlyName).toBe(friendlyNameDevice);
        expect(deviceWithServices.serviceList).toBeInstanceOf(Map);
        expect(deviceWithServices.serviceList?.size).toBe(2);

        const servicesArray = Array.from(deviceWithServices.serviceList!.values());
        const service1Result = servicesArray.find(s => s.serviceId === serviceId1);
        expect(service1Result).toBeDefined();
        expect(service1Result?.actionList?.size).toBe(1); 
        expect(Array.from(service1Result!.actionList!.values())[0].name).toBe(actionName1);
        expect(Array.from(service1Result!.actionList!.values())[0].arguments).toHaveLength(2);
        expect(Array.from(service1Result!.actionList!.values())[0].invoke).toBeUndefined(); 
        expect(service1Result?.stateVariableList?.size).toBe(2); 
        expect(Array.from(service1Result!.stateVariableList!.values())[0].name).toBe(stateVarName1);
        expect(Array.from(service1Result!.stateVariableList!.values())[0].query).toBeUndefined(); 

        const service2Result = servicesArray.find(s => s.serviceId === serviceId2);
        expect(service2Result).toBeDefined();
        expect(service2Result?.actionList?.size).toBe(0);
        expect(service2Result?.stateVariableList?.size).toBe(1);
        expect(Array.from(service2Result!.stateVariableList!.values())[0].name).toBe(simpleVarName2);

        expect(axios.get).toHaveBeenCalledTimes(3);
        expect(axios.get).toHaveBeenNthCalledWith(1, mockBasicDevice.location, {
            responseType: 'text',
            timeout: expect.any(Number),
            signal: mockAbortSignal,
        });

        const expectedScpdUrl1 = new URL(scpdUrl1, mockBasicDevice.location).toString();
        const expectedScpdUrl2 = new URL(scpdUrl2, mockBasicDevice.location).toString();

        const getCalls = (axios.get as ReturnType<typeof mock>).mock.calls;
        const scpdCalls = getCalls.slice(1).map(call => call[0]);
        expect(scpdCalls).toContain(expectedScpdUrl1);
        expect(scpdCalls).toContain(expectedScpdUrl2);
    });

    it('should fetch, parse services, and create invoke/query functions if detailLevel is "full"', async () => {
        const deviceTypeFull = 'urn:schemas-upnp-org:device:FullDevice:1';
        const friendlyNameFull = 'Test Full Device';
        const serviceTypeFull = 'urn:schemas-upnp-org:service:FullService:1';
        const serviceIdFull = 'urn:upnp-org:serviceId:fullService1';
        const scpdUrlFull = '/fullService.xml';
        const controlUrlFull = '/control/fullService1';
        const eventSubUrlFull = '/event/fullService1';
        const actionNameFull = 'DoSomething';
        const inParamName = 'InParam';
        const outParamName = 'OutParam';
        const statusVarName = 'StatusVar';
        const resultVarName = 'ResultVar';

        const mockDeviceXmlFull = create({ version: '1.0' })
            .ele('root', { xmlns: 'urn:schemas-upnp-org:device-1-0' })
            .ele('specVersion')
            .ele('major').txt('1').up()
            .ele('minor').txt('0').up()
            .up()
            .ele('device')
            .ele('deviceType').txt(deviceTypeFull).up()
            .ele('friendlyName').txt(friendlyNameFull).up()
            .ele('manufacturer').txt('Test Manufacturer').up()
            .ele('UDN').txt(mockBasicDevice.usn).up()
            .ele('serviceList')
            .ele('service')
            .ele('serviceType').txt(serviceTypeFull).up()
            .ele('serviceId').txt(serviceIdFull).up()
            .ele('SCPDURL').txt(scpdUrlFull).up()
            .ele('controlURL').txt(controlUrlFull).up()
            .ele('eventSubURL').txt(eventSubUrlFull).up()
            .up()
            .up()
            .up()
            .doc().toString({ prettyPrint: true });

        const scpdXmlFullService = create({ version: '1.0' })
            .ele('scpd', { xmlns: 'urn:schemas-upnp-org:service-1-0' })
            .ele('specVersion').ele('major').txt('1').up().ele('minor').txt('0').up().up()
            .ele('actionList')
            .ele('action')
            .ele('name').txt(actionNameFull).up()
            .ele('argumentList')
            .ele('argument')
            .ele('name').txt(inParamName).up()
            .ele('direction').txt('in').up()
            .ele('relatedStateVariable').txt(statusVarName).up()
            .up()
            .ele('argument')
            .ele('name').txt(outParamName).up()
            .ele('direction').txt('out').up()
            .ele('relatedStateVariable').txt(resultVarName).up()
            .up()
            .up()
            .up()
            .up()
            .ele('serviceStateTable')
            .ele('stateVariable', { sendEvents: 'no' })
            .ele('name').txt(statusVarName).up()
            .ele('dataType').txt('string').up()
            .up()
            .ele('stateVariable', { sendEvents: 'yes' })
            .ele('name').txt(resultVarName).up()
            .ele('dataType').txt('int').up()
            .up()
            .up()
            .doc().toString({ prettyPrint: true });

        (axios.get as ReturnType<typeof mock>)
            .mockResolvedValueOnce({ data: mockDeviceXmlFull, status: 200, statusText: 'OK', headers: {}, config: {} as any })
            .mockResolvedValueOnce({ data: scpdXmlFullService, status: 200, statusText: 'OK', headers: {}, config: {} as any });

        const mockActionResponse = { Success: true, [outParamName]: 123 };
        const mockQueryResponse = { return: 'CurrentStatus' };
        mockedSendUpnpCommand
            .mockImplementation(async (controlURL, serviceType, actionName, args) => {
                if (actionName === actionNameFull) {
                    return Promise.resolve(mockActionResponse);
                }
                if (actionName === 'QueryStateVariable' && args && (args as any).VarName === statusVarName) {
                    return Promise.resolve(mockQueryResponse);
                }
                logger.warn(`mockedSendUpnpCommand unhandled in 'full' test: ${actionName}`);
                return Promise.resolve({});
            });

        const result = await processUpnpDevice(mockBasicDevice, DiscoveryDetailLevel.Full, mockAbortSignal);
        expect(result).toBeDefined();
        if (!result) throw new Error("Result is null");

        const fullDevice = result as FullDeviceDescription;
        expect(fullDevice.friendlyName).toBe(friendlyNameFull);
        expect(fullDevice.serviceList).toBeInstanceOf(Map); 
        expect(fullDevice.serviceList?.size).toBe(1); 

        const serviceArrayFull = Array.from(fullDevice.serviceList!.values());
        const service = serviceArrayFull[0];
        expect(service).toBeDefined();
        expect(service?.serviceId).toBe(serviceIdFull);
        expect(service?.actionList?.size).toBe(1); 

        const action = service?.actionList!.values().next().value; 
        expect(action).toBeDefined();
        expect(action?.name).toBe(actionNameFull);
        expect(action?.arguments).toHaveLength(2);
        expect(action?.invoke).toBeInstanceOf(Function);

        const stateVar = service?.stateVariableList!.get(statusVarName); 
        expect(stateVar).toBeDefined();
        expect(stateVar?.query).toBeInstanceOf(Function);

        if (action?.invoke) {
            const invokeResult = await action.invoke({ [inParamName]: 'test' });
            expect(mockedSendUpnpCommand).toHaveBeenCalledWith(
                service?.controlURL,
                service?.serviceType,
                actionNameFull,
                { [inParamName]: 'test' }
            );
            expect(invokeResult).toEqual(mockActionResponse);
        } else {
            throw new Error("action.invoke is undefined");
        }

        if (stateVar?.query) {
            const queryResult = await stateVar.query();
            expect(mockedSendUpnpCommand).toHaveBeenCalledWith(
                service?.controlURL,
                service?.serviceType,
                'QueryStateVariable',
                { VarName: statusVarName }
            );
            expect(queryResult).toEqual(mockQueryResponse.return);
        } else {
            throw new Error("stateVar.query is undefined");
        }

        expect(axios.get).toHaveBeenCalledTimes(2);
        expect(axios.get).toHaveBeenNthCalledWith(1, mockBasicDevice.location, {
            responseType: 'text',
            timeout: expect.any(Number),
            signal: mockAbortSignal,
        });
        const expectedScpdUrl = new URL(scpdUrlFull, mockBasicDevice.location).toString();
        expect(axios.get).toHaveBeenNthCalledWith(2, expectedScpdUrl, {
            responseType: 'text',
            timeout: expect.any(Number),
            signal: mockAbortSignal,
        });
    });

    it('should return basic device with error if fetching device description XML fails', async () => {
        const networkError = new Error('Network Error');
        (networkError as any).isAxiosError = true; 
        (axios.get as ReturnType<typeof mock>).mockRejectedValueOnce(networkError);

        const result = await processUpnpDevice(mockBasicDevice, DiscoveryDetailLevel.Description, mockAbortSignal);
        expect(result).toBeDefined();
        expect(result!.usn).toBe(mockBasicDevice.usn); 
        expect((result as any).error).toBeDefined();
        expect((result as any).error).toContain('Failed to fetch/parse device description');
        expect(axios.get).toHaveBeenCalledWith(mockBasicDevice.location, {
            responseType: 'text',
            timeout: expect.any(Number),
            signal: mockAbortSignal,
        });
    });

    it('should return basic device with error if device description XML is invalid', async () => {
        const invalidXml = create({ version: '1.0' })
            .ele('root')
            .ele('device') 
            .up()
            .doc().toString();
        (axios.get as ReturnType<typeof mock>).mockResolvedValueOnce({ data: invalidXml, status: 200, statusText: 'OK', headers: {}, config: {} as any });

        const result = await processUpnpDevice(mockBasicDevice, DiscoveryDetailLevel.Description, mockAbortSignal);
        expect(result).toBeDefined();
        expect(result!.usn).toBe(mockBasicDevice.usn);
        expect((result as any).error).toBeDefined();
        expect((result as any).error).toContain('Failed to fetch/parse device description');
    });

    it('should return device description with error if fetching SCPD fails for a service', async () => {
        const friendlyName = 'SCPD Error Device';
        const serviceType = 'urn:schemas-upnp-org:service:ErrorService:1';
        const serviceId = 'urn:upnp-org:serviceId:errorService1';
        const scpdUrl = '/errorService.xml';
        const controlUrl = '/control/errorService1';
        const eventSubUrl = '/event/errorService1';

        const mockDeviceXml = create({ version: '1.0' })
            .ele('root', { xmlns: 'urn:schemas-upnp-org:device-1-0' })
            .ele('device')
            .ele('friendlyName').txt(friendlyName).up()
            .ele('UDN').txt(mockBasicDevice.usn).up()
            .ele('serviceList')
            .ele('service')
            .ele('serviceType').txt(serviceType).up()
            .ele('serviceId').txt(serviceId).up()
            .ele('SCPDURL').txt(scpdUrl).up()
            .ele('controlURL').txt(controlUrl).up()
            .ele('eventSubURL').txt(eventSubUrl).up()
            .up()
            .up()
            .up()
            .doc().toString({ prettyPrint: true });
        
        const scpdError = new Error('Failed to fetch SCPD for test');
        (scpdError as any).isAxiosError = true;

        (axios.get as ReturnType<typeof mock>)
            .mockResolvedValueOnce({ data: mockDeviceXml, status: 200, statusText: 'OK', headers: {}, config: {} as any }) 
            .mockRejectedValueOnce(scpdError); 

        const result = await processUpnpDevice(mockBasicDevice, DiscoveryDetailLevel.Services, mockAbortSignal);
        expect(result).toBeDefined();
        const deviceWithServices = result as DeviceWithServicesDescription;
        expect(deviceWithServices.friendlyName).toBe(friendlyName);
        expect(deviceWithServices.serviceList?.size).toBe(1);
        const serviceResult = deviceWithServices.serviceList!.values().next().value;
        expect(serviceResult).toBeDefined();
        if (!serviceResult) throw new Error("Service result is undefined in SCPD error test");
        expect(serviceResult.serviceId).toBe(serviceId);
        expect(serviceResult.scpdError).toBeDefined();
        expect(serviceResult.scpdError).toContain('Failed to fetch/parse SCPD');
        expect(serviceResult.actionList).toEqual(new Map());
        expect(serviceResult.stateVariableList).toEqual(new Map());
    });

    it('should handle invalid SCPD XML gracefully', async () => {
        const friendlyName = 'Invalid SCPD Device';
        const serviceType = 'urn:schemas-upnp-org:service:InvalidScpdService:1';
        const serviceId = 'urn:upnp-org:serviceId:invalidScpd1';
        const scpdUrl = '/invalidScpd.xml';
        const controlUrl = '/control/invalidScpd1';
        const eventSubUrl = '/event/invalidScpd1';

        const mockDeviceXml = create({ version: '1.0' })
            .ele('root', { xmlns: 'urn:schemas-upnp-org:device-1-0' })
            .ele('device')
            .ele('friendlyName').txt(friendlyName).up()
            .ele('UDN').txt(mockBasicDevice.usn).up()
            .ele('serviceList')
            .ele('service')
            .ele('serviceType').txt(serviceType).up()
            .ele('serviceId').txt(serviceId).up()
            .ele('SCPDURL').txt(scpdUrl).up()
            .ele('controlURL').txt(controlUrl).up()
            .ele('eventSubURL').txt(eventSubUrl).up()
            .up()
            .up()
            .up()
            .doc().toString({ prettyPrint: true });

        const invalidScpdXml = create({ version: '1.0' })
            .ele('scpd', { xmlns: 'urn:schemas-upnp-org:service-1-0' })
            .ele('specVersion') 
            .up()
            .doc().toString();
        (axios.get as ReturnType<typeof mock>)
            .mockResolvedValueOnce({ data: mockDeviceXml, status: 200, statusText: 'OK', headers: {}, config: {} as any })
            .mockResolvedValueOnce({ data: invalidScpdXml, status: 200, statusText: 'OK', headers: {}, config: {} as any });

        const result = await processUpnpDevice(mockBasicDevice, DiscoveryDetailLevel.Services, mockAbortSignal);
        expect(result).toBeDefined();
        const deviceWithServices = result as DeviceWithServicesDescription;
        expect(deviceWithServices.serviceList?.size).toBe(1);
        const serviceResult = deviceWithServices.serviceList!.values().next().value;
        expect(serviceResult).toBeDefined();
        if (!serviceResult) throw new Error("Service result is undefined in invalid SCPD XML test");
        expect(serviceResult.serviceId).toBe(serviceId); 
        expect(serviceResult.scpdError).toBeDefined();
        expect(serviceResult.scpdError).toContain('Failed to fetch/parse SCPD');
        expect(serviceResult.actionList).toEqual(new Map());
        expect(serviceResult.stateVariableList).toEqual(new Map());
    });

    it('should abort processing when AbortSignal is triggered during device description fetch', async () => {
        const controller = new AbortController();
        (axios.get as ReturnType<typeof mock>).mockImplementation(async (url: string, config?: any) => {
            if (url === mockBasicDevice.location) {
                controller.abort();
                const error = new Error('Request aborted');
                (error as any).isAxiosError = true;
                (error as any).code = 'ECONNABORTED'; 
                throw error;
            }
            return { data: 'unexpected data', status: 200, statusText: 'OK', headers: {}, config: {} as any };
        });

        await expect(processUpnpDevice(mockBasicDevice, DiscoveryDetailLevel.Description, controller.signal))
            .rejects
            .toThrow('Operation aborted (description fetch failed).');
    });

    it('should abort processing when AbortSignal is triggered during SCPD fetch', async () => {
        const controller = new AbortController();
        const scpdAbortUrl = '/abortScpd.xml';
        const controlAbortUrl = 'c';
        const eventSubAbortUrl = 'e';
        const serviceIdAbort = 'sIDAbort';
        const serviceTypeAbort = 'sTypeAbort';

        const mockDeviceXmlForAbort = create({ version: '1.0' })
            .ele('root', { xmlns: 'urn:schemas-upnp-org:device-1-0' })
            .ele('device')
            .ele('UDN').txt(mockBasicDevice.usn).up()
            .ele('friendlyName').txt('Abort SCPD Device').up()
            .ele('serviceList')
            .ele('service')
            .ele('SCPDURL').txt(scpdAbortUrl).up()
            .ele('controlURL').txt(controlAbortUrl).up()
            .ele('eventSubURL').txt(eventSubAbortUrl).up()
            .ele('serviceId').txt(serviceIdAbort).up()
            .ele('serviceType').txt(serviceTypeAbort).up()
            .up()
            .up()
            .up()
            .doc().toString();

        (axios.get as ReturnType<typeof mock>)
            .mockResolvedValueOnce({ data: mockDeviceXmlForAbort, status: 200, statusText: 'OK', headers: {}, config: {} as any }) 
            .mockImplementation(async (url: string, config?: any) => { 
                if (url.endsWith(scpdAbortUrl)) {
                    controller.abort();
                    const error = new Error('Request aborted during SCPD fetch by test');
                    (error as any).isAxiosError = true;
                    (error as any).code = 'ECONNABORTED';
                    throw error;
                }
                return { data: 'unexpected scpd data', status: 200, statusText: 'OK', headers: {}, config: {} as any };
            });
        
        await expect(processUpnpDevice(mockBasicDevice, DiscoveryDetailLevel.Services, controller.signal))
            .rejects
            .toThrow('Operation aborted before returning services.');

        expect(controller.signal.aborted).toBe(true);
    });
});