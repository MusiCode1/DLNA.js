// src/genericHttpParser.test.ts
import { describe, it, expect } from 'bun:test';
import { parseHttpPacket, parseHttpString, HTTP_REQUEST_TYPE, HTTP_RESPONSE_TYPE } from './genericHttpParser';
// import { createModuleLogger } from './logger'; // הלוגר הפנימי של המודול הנבדק ישמש

// const logger = createModuleLogger('genericHttpParserTest'); // אין צורך בלוגר נפרד לבדיקות אלו

describe('parseHttpPacket', () => {
    it('should parse a simple HTTP GET request', () => {
        const requestLines = [
            'GET /test HTTP/1.1',
            'Host: example.com',
            'User-Agent: BunTest/1.0',
            '',
            ''
        ];
        const requestBuffer = Buffer.from(requestLines.join('\r\n'));
        const result = parseHttpPacket(requestBuffer, HTTP_REQUEST_TYPE);

        expect(result).not.toBeNull();
        if (!result) return; // Type guard

        expect(result.method).toBe('GET');
        expect(result.url).toBe('/test');
        expect(result.versionMajor).toBe(1);
        expect(result.versionMinor).toBe(1);
        expect(result.headers).toEqual({ host: 'example.com', 'user-agent': 'BunTest/1.0' });
        expect(result.body === undefined || result.body.length === 0).toBe(true);
    });

    it('should parse a simple HTTP POST request with body', () => {
        const requestLines = [
            'POST /submit HTTP/1.1',
            'Host: example.com',
            'Content-Type: application/json',
            'Content-Length: 15', // תיקון אורך התוכן ל-15
            '',
            '{"key":"value"}'
        ];
        const requestBuffer = Buffer.from(requestLines.join('\r\n'));
        const result = parseHttpPacket(requestBuffer, HTTP_REQUEST_TYPE);

        expect(result).not.toBeNull();
        if (!result) return; // Type guard

        expect(result.method).toBe('POST');
        expect(result.url).toBe('/submit');
        expect(result.headers).toEqual({
            host: 'example.com',
            'content-type': 'application/json',
            'content-length': '15' // תיקון אורך התוכן בבדיקה
        });
        expect(result.body?.toString()).toBe('{"key":"value"}');
    });

    it('should parse a simple HTTP response', () => {
        const responseLines = [
            'HTTP/1.1 200 OK',
            'Content-Type: text/plain',
            'Content-Length: 12',
            '',
            'Hello World!'
        ];
        const responseBuffer = Buffer.from(responseLines.join('\r\n'));
        const result = parseHttpPacket(responseBuffer, HTTP_RESPONSE_TYPE);

        expect(result).not.toBeNull();
        if (!result) return; // Type guard

        expect(result.statusCode).toBe(200);
        expect(result.statusMessage).toBe('OK');
        expect(result.versionMajor).toBe(1);
        expect(result.versionMinor).toBe(1);
        expect(result.headers).toEqual({
            'content-type': 'text/plain',
            'content-length': '12'
        });
        expect(result.body?.toString()).toBe('Hello World!');
    });

    it('should return null for malformed request', () => {
        const malformedLines = [
            'INVALID_REQUEST_LINE', // שורת בקשה לא תקינה בעליל
            'Host: example.com',
            '',
            ''
        ];
        const malformedBuffer = Buffer.from(malformedLines.join('\r\n'));
        const result = parseHttpPacket(malformedBuffer, HTTP_REQUEST_TYPE);
        expect(result).toBeNull();
    });

    it('should correctly determine parser type for requests', () => {
        const requestLines = [
            'GET / HTTP/1.1',
            'Host: example.com',
            '',
            ''
        ];
        const requestBuffer = Buffer.from(requestLines.join('\r\n'));
        const result = parseHttpPacket(requestBuffer, HTTP_REQUEST_TYPE);

        expect(result).not.toBeNull();
        if (!result) return; // Type guard
        expect(result.method).toBe('GET');
        expect(result.statusCode).toBeUndefined();
    });

    it('should correctly determine parser type for responses', () => {
        const responseLines = [
            'HTTP/1.1 200 OK',
            'Content-Length: 0',
            '',
            ''
        ];
        const responseBuffer = Buffer.from(responseLines.join('\r\n'));
        const result = parseHttpPacket(responseBuffer, HTTP_RESPONSE_TYPE);

        expect(result).not.toBeNull();
        if (!result) return; // Type guard
        expect(result.statusCode).toBe(200);
        expect(result.method).toBeUndefined();
    });

    it('should parse a simple M-SEARCH request', () => {
        const mSearchLines = [
            'M-SEARCH * HTTP/1.1',
            'HOST: 239.255.255.250:1900',
            'MAN: "ssdp:discover"',
            'MX: 1',
            'ST: urn:schemas-upnp-org:device:MediaRenderer:1',
            '',
            ''
        ];
        const requestBuffer = Buffer.from(mSearchLines.join('\r\n'));
        const result = parseHttpPacket(requestBuffer, HTTP_REQUEST_TYPE);

        expect(result).not.toBeNull();
        if (!result) return; // Type guard

        expect(result.method).toBe('M-SEARCH');
        expect(result.url).toBe('*');
        expect(result.versionMajor).toBe(1);
        expect(result.versionMinor).toBe(1);
        expect(result.headers).toEqual({
            host: '239.255.255.250:1900',
            man: '"ssdp:discover"',
            mx: '1',
            st: 'urn:schemas-upnp-org:device:MediaRenderer:1'
        });
        expect(result.body === undefined || result.body.length === 0).toBe(true);
    });

    it('should parse a simple NOTIFY request', () => {
        const notifyLines = [
            'NOTIFY * HTTP/1.1',
            'HOST: 239.255.255.250:1900',
            'CACHE-CONTROL: max-age=1800',
            'LOCATION: http://192.168.1.100:8080/description.xml',
            'NT: urn:schemas-upnp-org:service:ConnectionManager:1',
            'NTS: ssdp:alive',
            'SERVER: Linux/3.10.0 UPnP/1.0 MyDevice/1.0',
            'USN: uuid:some-unique-id::urn:schemas-upnp-org:service:ConnectionManager:1',
            '',
            ''
        ];
        const requestBuffer = Buffer.from(notifyLines.join('\r\n'));
        const result = parseHttpPacket(requestBuffer, HTTP_REQUEST_TYPE);

        expect(result).not.toBeNull();
        if (!result) return; // Type guard

        expect(result.method).toBe('NOTIFY');
        expect(result.url).toBe('*');
        expect(result.versionMajor).toBe(1);
        expect(result.versionMinor).toBe(1);
        expect(result.headers).toEqual({
            host: '239.255.255.250:1900',
            'cache-control': 'max-age=1800',
            location: 'http://192.168.1.100:8080/description.xml',
            nt: 'urn:schemas-upnp-org:service:ConnectionManager:1',
            nts: 'ssdp:alive',
            server: 'Linux/3.10.0 UPnP/1.0 MyDevice/1.0',
            usn: 'uuid:some-unique-id::urn:schemas-upnp-org:service:ConnectionManager:1'
        });
        expect(result.body === undefined || result.body.length === 0).toBe(true);
    });
});

describe('parseHttpString', () => {
    it('should parse a simple GET request string', () => {
        const requestLines = [
            'GET /test HTTP/1.1',
            'Host: example.com',
            '',
            ''
        ];
        const requestStr = requestLines.join('\r\n');
        const result = parseHttpString(requestStr, HTTP_REQUEST_TYPE);

        expect(result).not.toBeNull();
        if (!result) return; // Type guard

        expect(result.method).toBe('GET');
        expect(result.url).toBe('/test');
        expect(result.parsedBody).toBeUndefined();
    });

    it('should parse a POST request string with JSON body and parse body to object', () => {
        const requestLines = [
            'POST /submit HTTP/1.1',
            'Host: example.com',
            'Content-Type: application/json',
            'Content-Length: 15', // תיקון אורך התוכן
            '',
            '{"key":"value"}'
        ];
        const requestStr = requestLines.join('\r\n');
        const result = parseHttpString(requestStr, HTTP_REQUEST_TYPE);

        expect(result).not.toBeNull();
        if (!result) return; // Type guard

        expect(result.method).toBe('POST');
        expect(result.parsedBody).toEqual({ key: 'value' });
        expect(result.parseError).toBeUndefined();
    });

    it('should parse a POST request string with text body and keep body as string', () => {
        const requestLines = [
            'POST /submit HTTP/1.1',
            'Host: example.com',
            'Content-Type: text/plain',
            'Content-Length: 10', // תיקון אורך התוכן
            '',
            'Hello text'
        ];
        const requestStr = requestLines.join('\r\n');
        const result = parseHttpString(requestStr, HTTP_REQUEST_TYPE);

        expect(result).not.toBeNull();
        if (!result) return; // Type guard

        expect(result.parsedBody).toBe('Hello text');
        expect(result.parseError).toBeUndefined();
    });

    it('should return original body as string and set parseError if JSON parsing fails for application/json', () => {
        const requestLines = [
            'POST /submit HTTP/1.1',
            'Host: example.com',
            'Content-Type: application/json',
            'Content-Length: 15', // תיקון אורך התוכן
            '',
            '{key:"invalid"}' // JSON לא תקין
        ];
        const requestStr = requestLines.join('\r\n');
        const result = parseHttpString(requestStr, HTTP_REQUEST_TYPE);

        expect(result).not.toBeNull();
        if (!result) return; // Type guard

        expect(result.body?.toString()).toBe('{key:"invalid"}');
        expect(result.parsedBody).toBe('{key:"invalid"}'); // חוזר כמחרוזת במקרה של שגיאה
        expect(result.parseError).toBeDefined();
    });

    it('should return original body buffer for non-text/non-json content types', () => {
        const requestLines = [
            'POST /submit HTTP/1.1',
            'Host: example.com',
            'Content-Type: application/octet-stream',
            'Content-Length: 5',
            '',
            '12345'
        ];
        const requestStr = requestLines.join('\r\n');
        const result = parseHttpString(requestStr, HTTP_REQUEST_TYPE);

        expect(result).not.toBeNull();
        if (!result) return; // Type guard

        expect(result.body?.toString()).toBe('12345');
        expect(result.parsedBody).toBeInstanceOf(Buffer);
        expect((result.parsedBody as Buffer).toString()).toBe('12345');
        expect(result.parseError).toBeUndefined();
    });
});