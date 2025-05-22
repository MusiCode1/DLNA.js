// קובץ זה מכיל לוגיקה לשליחת בקשות SOAP להתקני UPnP.
import axios, { AxiosResponse } from 'axios';
import * as xml2js from 'xml2js'; // לניתוח התגובה
import { create } from 'xmlbuilder2'; // לבניית הבקשה
import { SoapFault, SoapResponsePayload } from './types';
import { createModuleLogger } from './logger';

const moduleLogger = createModuleLogger('upnpSoapClient');

const SOAP_ENV_NS = "http://schemas.xmlsoap.org/soap/envelope/";
const SOAP_ENC_NS = "http://schemas.xmlsoap.org/soap/encoding/";

/**
 * @hebrew בונה את החלק הפנימי של גוף בקשת SOAP באמצעות xmlbuilder2.
 * @param serviceType - סוג השירות (URN).
 * @param actionName - שם הפעולה.
 * @param args - ארגומנטים לפעולה.
 * @returns מחרוזת XML של החלק הפנימי של גוף הבקשה.
 */
function buildSoapActionBodyXml(serviceType: string, actionName: string, args: Record<string, any>): string {
    const actionObject: any = {};
    actionObject[`u:${actionName}`] = {
        '@xmlns:u': serviceType,
        ...args
    };

    const doc = create(actionObject);
    const finalXml = doc.end({
        // For a document fragment created from a JS object (not a full document with XML declaration),
        // 'headless' is not typically needed as it won't have an XML declaration by default.
        // 'prettyPrint' is the correct option for formatting.
        prettyPrint: false
    });

    moduleLogger.debug('[buildSoapActionBodyXml] Built action body XML with xmlbuilder2:', finalXml);
    return finalXml;
}

/**
 * @hebrew מנתח תגובת SOAP XML.
 * @param xmlResponse - מחרוזת ה-XML של התגובה.
 * @param actionName - שם הפעולה המקורית (לצורך חילוץ התוצאות).
 * @returns אובייקט המכיל את התוצאות המנותחות או שגיאה.
 */
async function parseSoapResponse(xmlResponse: string, actionName: string): Promise<SoapResponsePayload | SoapFault> {
    const parser = new xml2js.Parser({
        explicitArray: false,
        explicitRoot: false,
        tagNameProcessors: [xml2js.processors.stripPrefix],
        attrNameProcessors: [xml2js.processors.stripPrefix],
        valueProcessors: [xml2js.processors.parseNumbers, xml2js.processors.parseBooleans]
    });

    try {
        const parsedXml = await parser.parseStringPromise(xmlResponse);
        moduleLogger.debug('[parseSoapResponse] Parsed XML:', JSON.stringify(parsedXml, null, 2));

        const body = parsedXml.Body || parsedXml.Envelope?.Body;

        if (!body) {
            moduleLogger.warn('[parseSoapResponse] SOAP Body not found in parsed XML.');
            return {
                faultCode: 'ClientParseError',
                faultString: 'SOAP Body not found in response.',
                detail: 'Parsed XML did not contain a Body element.'
            };
        }

        if (body.Fault) {
            const fault = body.Fault;
            const soapFault: SoapFault = {
                faultCode: fault.faultcode || fault.Faultcode || 'Unknown',
                faultString: fault.faultstring || fault.Faultstring || 'Unknown SOAP Fault',
                detail: fault.detail?.toString() || fault.Detail?.toString()
            };
            if (fault.detail && fault.detail.UPnPError) {
                soapFault.upnpErrorCode = parseInt(fault.detail.UPnPError.errorCode, 10);
                soapFault.upnpErrorDescription = fault.detail.UPnPError.errorDescription;
            } else if (fault.Detail && fault.Detail.UPnPError) {
                 soapFault.upnpErrorCode = parseInt(fault.Detail.UPnPError.errorCode, 10);
                soapFault.upnpErrorDescription = fault.Detail.UPnPError.errorDescription;
            }
            moduleLogger.warn('[parseSoapResponse] SOAP Fault:', soapFault);
            return soapFault;
        }

        const actionResponseKey = `${actionName}Response`;
        if (body[actionResponseKey]) {
            const actionResponseData = body[actionResponseKey];
            const cleanedResponseData: Record<string, any> = {};
            for (const key in actionResponseData) {
                if (!key.startsWith('xmlns') && Object.prototype.hasOwnProperty.call(actionResponseData, key)) {
                    cleanedResponseData[key] = actionResponseData[key];
                }
            }
            moduleLogger.debug(`[parseSoapResponse] Action response data for ${actionResponseKey}:`, cleanedResponseData);
            return { actionResponse: cleanedResponseData, raw: parsedXml };
        }

        moduleLogger.warn(`[parseSoapResponse] Could not find '${actionResponseKey}' or 'Fault' in SOAP body. Body content:`, body);
        return {
            faultCode: 'ClientParseError',
            faultString: `Failed to parse SOAP response or find action result for ${actionName}.`,
            detail: 'Response body did not contain expected elements.'
        };

    } catch (error: any) {
        moduleLogger.error('[parseSoapResponse] Error parsing XML response:', error.message, error);
        return {
            faultCode: 'ClientParseError',
            faultString: 'Error parsing XML response.',
            detail: error.message
        };
    }
}


/**
 * @hebrew שולח פקודת UPnP (בקשת SOAP) להתקן.
 * @param controlURL - כתובת ה-URL של נקודת הבקרה של השירות.
 * @param serviceType - ה-URN של סוג השירות.
 * @param actionName - שם הפעולה לביצוע.
 * @param args - אובייקט המכיל את הארגומנטים לפעולה.
 * @returns הבטחה שתתממש עם אובייקט המכיל את תוצאות הפעולה, או תידחה עם שגיאה.
 */
export async function sendUpnpCommand(
    controlURL: string,
    serviceType: string,
    actionName: string,
    args: Record<string, any> = {}
): Promise<Record<string, any>> {
    moduleLogger.info(`[sendUpnpCommand] Sending command: Action='${actionName}', Service='${serviceType}', URL='${controlURL}'`);
    moduleLogger.debug(`[sendUpnpCommand] Arguments:`, args);

    const soapActionHeader = `"${serviceType}#${actionName}"`;
    const soapActionBodyXmlString = buildSoapActionBodyXml(serviceType, actionName, args);

    // בניית כל מעטפת ה-SOAP באמצעות xmlbuilder2
    const soapEnvelopeObject = {
        's:Envelope': {
            '@xmlns:s': SOAP_ENV_NS,
            '@s:encodingStyle': SOAP_ENC_NS,
            's:Body': {
                // כאן נשתמש ב-raw() כדי להכניס את מחרוזת ה-XML של גוף הפעולה
                // xmlbuilder2 לא תומך ישירות ב-raw() בתוך אובייקט JSON,
                // אז נבנה את זה בצורה פרוגרמטית:
            }
        }
    };

    const root = create({ version: '1.0', encoding: 'utf-8' })
        .ele('s:Envelope', { 'xmlns:s': SOAP_ENV_NS, 's:encodingStyle': SOAP_ENC_NS });
    root.ele('s:Body').ele(soapActionBodyXmlString); // ele() can parse an XML string and append its nodes, as per local documentation.

    const soapEnvelopeXmlString = root.end({
        prettyPrint: false // This is correct for formatting the output of the full document.
    });


    moduleLogger.debug('[sendUpnpCommand] SOAP Envelope:', soapEnvelopeXmlString);

    try {
        const response: AxiosResponse<string> = await axios.post(controlURL, soapEnvelopeXmlString, {
            headers: {
                'Content-Type': 'text/xml; charset="utf-8"',
                'SOAPAction': soapActionHeader,
                'Connection': 'close',
                'User-Agent': 'Node.js/UpnpDeviceExplorer/0.1'
            },
            timeout: 10000
        });

        moduleLogger.debug(`[sendUpnpCommand] Received SOAP response (Status ${response.status}):`, response.data);

        const parsedResult = await parseSoapResponse(response.data, actionName);

        if ('faultCode' in parsedResult) {
            moduleLogger.error(`[sendUpnpCommand] SOAP Fault for action ${actionName}:`, parsedResult);
            const error = new Error(`SOAP Fault: ${parsedResult.faultString} (Code: ${parsedResult.faultCode}, UPnP Code: ${parsedResult.upnpErrorCode || 'N/A'})`);
            (error as any).soapFault = parsedResult;
            throw error;
        } else {
            moduleLogger.info(`[sendUpnpCommand] Successfully executed action ${actionName}. Result:`, parsedResult.actionResponse);
            return parsedResult.actionResponse || {};
        }

    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            moduleLogger.error(`[sendUpnpCommand] Axios error sending SOAP request for action ${actionName} to ${controlURL}:`, error.message);
            if (error.response && typeof error.response.data === 'string') {
                moduleLogger.error('[sendUpnpCommand] Axios error response data:', error.response.data);
                moduleLogger.error('[sendUpnpCommand] Axios error response status:', error.response.status);
                try {
                    const parsedFault = await parseSoapResponse(error.response.data, actionName);
                    if ('faultCode' in parsedFault) {
                        const soapError = new Error(`SOAP Fault from error response: ${parsedFault.faultString} (Code: ${parsedFault.faultCode}, UPnP Code: ${parsedFault.upnpErrorCode || 'N/A'})`);
                        (soapError as any).soapFault = parsedFault;
                        throw soapError;
                    }
                } catch (parseErr) {
                    moduleLogger.warn('[sendUpnpCommand] Failed to parse SOAP fault from Axios error response:', parseErr);
                }
            }
            const networkError = new Error(`Network or HTTP error for action ${actionName}: ${error.message}`);
            (networkError as any).originalError = error;
            if (error.response) (networkError as any).statusCode = error.response.status;
            throw networkError;
        } else if (error.soapFault) {
            throw error;
        } else {
            moduleLogger.error(`[sendUpnpCommand] Generic error sending SOAP request for action ${actionName} to ${controlURL}:`, error.message, error);
            const genericError = new Error(`Generic error for action ${actionName}: ${error.message}`);
            (genericError as any).originalError = error;
            throw genericError;
        }
    }
}