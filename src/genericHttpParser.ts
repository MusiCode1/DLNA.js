import { HTTPParser, HTTPParserJS } from 'http-parser-js'; // שימוש בכינוי
import { createModuleLogger } from './logger';

// ייצוא הקבועים הנדרשים
export const HTTP_REQUEST_TYPE = HTTPParser.REQUEST;
export const HTTP_RESPONSE_TYPE = HTTPParser.RESPONSE;

const logger = createModuleLogger('genericHttpParser');

export interface ParsedHttpPacket {
  method?: string;
  url?: string;
  versionMajor?: number;
  versionMinor?: number;
  headers: Record<string, string>;
  body?: Buffer; // גוף ההודעה כבאפר
  rawBodyChunks: Buffer[]; // חתיכות גולמיות של הגוף
  // עבור תגובות
  statusCode?: number;
  statusMessage?: string;
}

interface onHeadersComplete {

  method: string;
  url: string;
  versionMajor: number;
  versionMinor: number;
  headers: string[];

  statusCode: number;
  statusMessage: string;

  upgrade: boolean;
}

/**
 * @hebrew מנתח הודעת HTTP גולמית (בקשה או תגובה) באמצעות http-parser-js.
 * @param messageBuffer - הבאפר המכיל את הודעת ה-HTTP.
 * @param parserType - סוג הפרסר, REQUEST או RESPONSE.
 * @returns אובייקט ParsedHttpPacket אם הפירסור הצליח, אחרת null.
 */
export function parseHttpPacket(
  messageBuffer: Buffer,
  parserType: typeof HTTP_REQUEST_TYPE | typeof HTTP_RESPONSE_TYPE
): ParsedHttpPacket | null {
  const parser = new HTTPParser(parserType) as HTTPParserJS;

  let method: string | undefined;
  let url: string | undefined;
  let versionMajor: number | undefined;
  let versionMinor: number | undefined;
  let headers: Record<string, string> = {};
  const bodyChunks: Buffer[] = [];
  let complete = false;
  let statusCode: number | undefined;
  let statusMessage: string | undefined;

  parser[HTTPParser.kOnHeadersComplete] = (info) => {
    const rawHeaders = info.headers;
    for (let i = 0; i < rawHeaders.length; i += 2) {
      const key = rawHeaders[i].toLowerCase();
      const value = rawHeaders[i + 1];
      headers[key] = value;
    }

    if (parserType === HTTP_REQUEST_TYPE) {
      method = HTTPParser.methods[info.method];
      url = info.url;
    } else { // HTTP_RESPONSE_TYPE
      statusCode = info.statusCode;
      statusMessage = info.statusMessage;
    }
    versionMajor = info.versionMajor;
    versionMinor = info.versionMinor;
  };

  parser[HTTPParser.kOnBody] = (chunk, offset, length) => {
    bodyChunks.push(Buffer.from(chunk.slice(offset, offset + length)));
  };

  parser[HTTPParser.kOnMessageComplete] = () => {
    complete = true;
  };

  try {
    const executeResult = parser.execute(messageBuffer);
    if (executeResult instanceof Error) {
      logger.error('parseHttpPacket: parser.execute() returned an error', { error: executeResult.message, stack: executeResult.stack });
      return null;
    }

    // executeResult הוא מספר הבתים שנקראו אם אין שגיאה
    const bytesParsed = executeResult;
    if (bytesParsed !== messageBuffer.length) {
      logger.warn(`parseHttpPacket: Parser did not consume entire buffer. Parsed: ${bytesParsed}, Buffer length: ${messageBuffer.length}`);
      // זה לא בהכרח שגיאה קריטית אם complete יוגדר ל-true, אבל זה מידע חשוב ללוג.
    }

    const finishResult = parser.finish();
    if (finishResult instanceof Error) {
      logger.error('\n'+messageBuffer.toString('utf-8')+'\n')
      logger.error('parseHttpPacket: parser.finish() returned an error', { error: finishResult.message, stack: finishResult.stack });
      return null;
    }

  } catch (err: any) {
    // בלוק catch זה יתפוס שגיאות סינכרוניות אחרות שעלולות להיזרק מהקולבקים של הפרסר,
    // למרות ש-http-parser-js בדרך כלל מחזיר שגיאות דרך הערך המוחזר של execute/finish.
    logger.error('parseHttpPacket: Exception during parsing process', {
      error: err.message,
      stack: err.stack
    });
    return null;
  }

  // אם kOnMessageComplete לא נקרא, ההודעה לא הושלמה כראוי.
  if (!complete) {
    logger.warn('parseHttpPacket: Parsing did not complete (kOnMessageComplete not called).');
    return null;
  }

  const result: ParsedHttpPacket = {
    headers,
    rawBodyChunks: bodyChunks,
    versionMajor,
    versionMinor,
  };

  if (bodyChunks.length > 0) {
    result.body = Buffer.concat(bodyChunks);
  }

  if (parserType === HTTP_REQUEST_TYPE) {
    result.method = method;
    result.url = url;
  } else { // HTTP_RESPONSE_TYPE
    result.statusCode = statusCode;
    result.statusMessage = statusMessage;
  }

  return result;
}

export interface ParsedHttpStringResult extends Omit<ParsedHttpPacket, 'body' | 'rawBodyChunks'> {
  body?: Buffer; // גוף ההודעה המקורי כבאפר
  parsedBody?: string | object | Buffer; // גוף ההודעה המפונרס (טקסט, JSON, או באפר)
  parseError?: Error; // שגיאה אם התרחשה במהלך פירסור הגוף
}

/**
 * @hebrew פונקציית מעטפת נוחה לפירסור הודעת HTTP ממחרוזת.
 * מנסה לפרסר את גוף ההודעה ל-JSON או טקסט בהתאם ל-Content-Type.
 * @param httpString - הודעת ה-HTTP כמחרוזת.
 * @param parserType - סוג הפרסר, REQUEST או RESPONSE.
 * @returns אובייקט ParsedHttpStringResult או null אם הפירסור הראשוני נכשל.
 */
export function parseHttpString(
  httpString: string,
  parserType: typeof HTTP_REQUEST_TYPE | typeof HTTP_RESPONSE_TYPE
): ParsedHttpStringResult | null {
  const buffer = Buffer.from(httpString);
  const packet = parseHttpPacket(buffer, parserType);

  if (!packet) {
    return null;
  }

  const { body, rawBodyChunks, ...restOfPacket } = packet;
  const result: ParsedHttpStringResult = { ...restOfPacket };

  if (body) {
    result.body = body; // שמירת הבאפר המקורי
    const contentType = packet.headers['content-type']?.toLowerCase() || '';

    if (contentType.includes('application/json')) {
      try {
        result.parsedBody = JSON.parse(body.toString('utf-8'));
      } catch (e: any) {
        logger.warn('parseHttpString: Failed to parse JSON body, returning as string.', { error: e.message });
        result.parsedBody = body.toString('utf-8'); // החזרת הגוף כמחרוזת במקרה של שגיאת JSON
        result.parseError = e;
      }
    } else if (contentType.startsWith('text/')) {
      result.parsedBody = body.toString('utf-8');
    } else {
      // עבור סוגי תוכן אחרים (למשל, application/octet-stream, image/*), נשאיר את הגוף כבאפר
      result.parsedBody = body;
    }
  }

  return result;
}


// דוגמאות שימוש הועברו לקובץ בדיקות/דוגמאות נפרד.