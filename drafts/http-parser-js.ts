import { HTTPParser, } from "http-parser-js";
import type { HeaderObject } from "http-parser-js";



function parseRequest(input: Buffer) {
    const parser = new HTTPParser(HTTPParser.REQUEST);
    let complete = false;
    let shouldKeepAlive;
    let upgrade;
    let method;
    let url;
    let versionMajor;
    let versionMinor;
    let headers: HeaderObject = [];
    let trailers = [];
    let bodyChunks: Buffer[] = [];

    parser[HTTPParser.kOnHeadersComplete] = function (req) {
        shouldKeepAlive = req.shouldKeepAlive;
        upgrade = req.upgrade;
        method = HTTPParser.methods[req.method];
        url = req.url;
        versionMajor = req.versionMajor;
        versionMinor = req.versionMinor;
        headers = req.headers;
    };

    parser[HTTPParser.kOnBody] = function (chunk, offset, length) {
        bodyChunks.push(chunk.slice(offset, offset + length));
    };

    // This is actually the event for trailers, go figure.
    parser[HTTPParser.kOnHeaders] = function (t) {
        trailers = t;
    };

    parser[HTTPParser.kOnMessageComplete] = function () {
        complete = true;
    };

    // Since we are sending the entire Buffer at once here all callbacks above happen synchronously.
    // The parser does not do _anything_ asynchronous.
    // However, you can of course call execute() multiple times with multiple chunks, e.g. from a stream.
    // But then you have to refactor the entire logic to be async (e.g. resolve a Promise in kOnMessageComplete and add timeout logic).
    parser.execute(input);
    parser.finish();

    if (!complete) {
        throw new Error("Could not parse request");
    }

    let body = Buffer.concat(bodyChunks);

    return {
        shouldKeepAlive,
        upgrade,
        method,
        url,
        versionMajor,
        versionMinor,
        headers,
        body,
        trailers,
    };
}

function parseResponse(input: Buffer) {
    const parser = new HTTPParser(HTTPParser.RESPONSE);
    let complete = false;
    let shouldKeepAlive;
    let upgrade;
    let statusCode;
    let statusMessage;
    let versionMajor;
    let versionMinor;
    let headers: HeaderObject = [];
    let trailers = [];
    let bodyChunks: Buffer[] = [];

    parser[HTTPParser.kOnHeadersComplete] = function (res) {
        shouldKeepAlive = res.shouldKeepAlive;
        upgrade = res.upgrade;
        statusCode = res.statusCode;
        statusMessage = res.statusMessage;
        versionMajor = res.versionMajor;
        versionMinor = res.versionMinor;
        headers = res.headers;
    };

    parser[HTTPParser.kOnBody] = function (chunk, offset, length) {
        bodyChunks.push(chunk.slice(offset, offset + length));
    };

    // This is actually the event for trailers, go figure.
    parser[HTTPParser.kOnHeaders] = function (t) {
        trailers = t;
    };

    parser[HTTPParser.kOnMessageComplete] = function () {
        complete = true;
    };

    // Since we are sending the entire Buffer at once here all callbacks above happen synchronously.
    // The parser does not do _anything_ asynchronous.
    // However, you can of course call execute() multiple times with multiple chunks, e.g. from a stream.
    // But then you have to refactor the entire logic to be async (e.g. resolve a Promise in kOnMessageComplete and add timeout logic).
    parser.execute(input);
    parser.finish();

    if (!complete) {
        throw new Error("Could not parse");
    }

    let body = Buffer.concat(bodyChunks);

    return {
        shouldKeepAlive,
        upgrade,
        statusCode,
        statusMessage,
        versionMajor,
        versionMinor,
        headers,
        body,
        trailers,
    };
}

const postStr = `POST /memes HTTP/1.1
Host: www.example.com
Content-Length: 7
Content-Type: text/plain

foo bar
`, notifyStr = `NOTIFY * HTTP/1.1
HOST: 239.255.255.250:1900
NT: urn:microsoft.com:service:X_MS_MediaReceiverRegistrar:1
NTS: ssdp:alive
SERVER: Linux/3.4 DLNADOC/1.50 UPnP/1.0 DMS/1.0
USN: uuid:9c219fd1-b9e5-637b-480c-88bf4eb39ed4::urn:microsoft.com:service:X_MS_MediaReceiverRegistrar:1
CACHE-CONTROL: max-age=25
LOCATION: http://10.100.102.106:7879/rootDesc.xml

`, mSearch = `M-SEARCH * HTTP/1.1
HOST: 239.255.255.250:1900
MAN: "ssdp:discover"
MX: 3
ST: ssdp:all
USER-AGENT: EnhancedSSDPDiscoverer/0.1 Node.js/v22.6.0

`;


let parsed;


parsed = parseRequest(
    Buffer.from(postStr)
);
console.log(parsed);

parsed = parseRequest(Buffer.from(notifyStr));

console.log(parsed);

parsed = parseRequest(
    Buffer.from(postStr)
);
console.log(parsed);
