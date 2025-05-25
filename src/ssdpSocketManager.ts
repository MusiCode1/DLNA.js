// קובץ זה מכיל את הלוגיקה לניהול סוקטי SSDP (UDP)

import * as dgram from 'node:dgram';
import * as util from 'node:util'; // הוספת import
import type { DiscoveryOptions } from './types';
import { createModuleLogger } from './logger';

const logger = createModuleLogger('ssdpSocketManager');

// קבועים רלוונטיים ל-SSDP
const SSDP_PORT = 1900;
const SSDP_MULTICAST_ADDRESS_IPV4 = "239.255.255.250";
const SSDP_MULTICAST_ADDRESS_IPV6_LINK_LOCAL = "FF02::C";
const M_SEARCH_REQUEST_START_LINE = "M-SEARCH * HTTP/1.1";
const MX_VALUE = 2; // שניות להמתנה לתגובה מהתקנים
const USER_AGENT = "Node.js/UpnpDeviceExplorer/0.1"; // User-Agent עבור בקשות SSDP

/**
 * @hebrew יוצר סוקט dgram בודד עם ההגדרות הנדרשות.
 * פונקציה פנימית.
 */
async function createSingleSocket(
  type: 'udp4' | 'udp6',
  multicastAddress: string,
  socketIdentifier: "notifyIPv4" | "msearchIPv4" | "notifyIPv6" | "msearchIPv6",
  isMSearchSocket: boolean,
  onMessageCallback: (msg: Buffer, rinfo: dgram.RemoteInfo, socketType: "notifyIPv4" | "msearchIPv4" | "notifyIPv6" | "msearchIPv6") => void,
  onErrorCallback: (err: Error, socketType: string) => void
): Promise<dgram.Socket> {
  return new Promise<dgram.Socket>((resolve, reject) => {
    const socket = dgram.createSocket({ type, reuseAddr: true });
    // @ts-ignore - הוספת המאפיין באופן דינמי לצורך זיהוי בלוגים
    socket._socketIdentifier = socketIdentifier;


    socket.on('error', (err) => {
      // ההדפסות הדיבאג הוסרו, חזרה לקריאה המקורית ללוגר
      logger.error(`Socket error for ${socketIdentifier}:`, err);
      onErrorCallback(err, socketIdentifier);
      try {
        socket.close();
      } catch (closeError) {
        logger.warn(`Error trying to close socket ${socketIdentifier} after an error:`, closeError);
      }
      reject(err);
    });

    socket.on('message', (msg, rinfo) => {
      onMessageCallback(msg, rinfo, socketIdentifier);
    });

    const portToBind = isMSearchSocket ? 0 : SSDP_PORT; 
    const bindAddress = type === 'udp4' ? '0.0.0.0' : '::';

    socket.bind(portToBind, bindAddress, () => {
      try {
        socket.setBroadcast(true); 
        // socket.setMulticastTTL(DEFAULT_MULTICAST_TTL); // לא הכרחי לרוב

        socket.addMembership(multicastAddress); 
        const actualPort = socket.address().port; 
        logger.info(`Socket ${socketIdentifier} listening on ${bindAddress}:${actualPort} and joined multicast group ${multicastAddress}`);
        resolve(socket);
      } catch (bindError: any) {
        logger.error(`Error during socket setup (post-bind) for ${socketIdentifier}:`, bindError);
        onErrorCallback(bindError, socketIdentifier);
        try {
          socket.close();
        } catch (closeError) {
          logger.warn(`Error trying to close socket ${socketIdentifier} after bind setup error:`, closeError);
        }
        reject(bindError);
      }
    });
  });
}

/**
 * @hebrew יוצר ומנהל את סוקטי ה-UDP לגילוי SSDP.
 * מטפל ביצירת סוקטים ל-IPv4, ואם נדרש, גם ל-IPv6.
 *
 * @param options - אופציות הגילוי, בעיקר `includeIPv6`.
 * @param onMessage - קולבק שיופעל עם קבלת הודעה.
 * @param onError - קולבק שיופעל במקרה של שגיאת סוקט.
 * @returns אובייקט עם מתודות לשליחת M-SEARCH (`sendMSearch`) וסגירת כל הסוקטים (`closeAll`).
 */
export async function createSocketManager(
  options: Pick<DiscoveryOptions, "includeIPv6">, // הצטמצמו הפרמטרים שבאמת בשימוש כאן
  onMessage: (
    msg: Buffer,
    rinfo: dgram.RemoteInfo,
    socketType: "notifyIPv4" | "msearchIPv4" | "notifyIPv6" | "msearchIPv6"
  ) => void,
  onError: (err: Error, socketType: string) => void
): Promise<{
  sendMSearch: (target: string, ipVersion: 4 | 6) => Promise<void>;
  closeAll: () => Promise<PromiseSettledResult<void>[]>;
}> {
  const sockets: dgram.Socket[] = [];
  let msearchIPv4Socket: dgram.Socket | undefined;
  let msearchIPv6Socket: dgram.Socket | undefined;

  // יצירת סוקטי IPv4
  try {
    const notifyIPv4Socket = await createSingleSocket(
      'udp4',
      SSDP_MULTICAST_ADDRESS_IPV4,
      "notifyIPv4",
      false, // isMSearchSocket
      onMessage,
      onError // onError כבר נקרא מתוך createSingleSocket במקרה של reject
    );
    sockets.push(notifyIPv4Socket);
  } catch (err) {
    // השגיאה כבר טופלה (נרשמה והועברה ל-onError) בתוך createSingleSocket
    // ונדחתה משם. כאן אנחנו רק תופסים אותה כדי למנוע unhandled rejection.
    logger.warn(`createSingleSocket for notifyIPv4 rejected by its promise. Error should have been handled by onError callback. Error:`, err);
    // אין צורך לקרוא ל-onError שוב, זה כבר נעשה בתוך createSingleSocket.
  }

  try {
    const msearchSockIPv4 = await createSingleSocket(
      'udp4',
      SSDP_MULTICAST_ADDRESS_IPV4,
      "msearchIPv4",
      true, // isMSearchSocket
      onMessage,
      onError
    );
    sockets.push(msearchSockIPv4);
    msearchIPv4Socket = msearchSockIPv4;
  } catch (err) {
    logger.warn(`createSingleSocket for msearchIPv4 rejected by its promise. Error should have been handled by onError callback. Error:`, err);
  }

  // יצירת סוקטי IPv6 (אם נדרש)
  if (options.includeIPv6) {
    try {
      const notifyIPv6Socket = await createSingleSocket(
        'udp6',
        SSDP_MULTICAST_ADDRESS_IPV6_LINK_LOCAL,
        "notifyIPv6",
        false, // isMSearchSocket
        onMessage,
        onError
      );
      sockets.push(notifyIPv6Socket);
    } catch (err) {
      logger.warn(`createSingleSocket for notifyIPv6 rejected by its promise. Error should have been handled by onError callback. Error:`, err);
    }

    try {
      const msearchSockIPv6 = await createSingleSocket(
        'udp6',
        SSDP_MULTICAST_ADDRESS_IPV6_LINK_LOCAL,
        "msearchIPv6",
        true, // isMSearchSocket
        onMessage,
        onError
      );
      sockets.push(msearchSockIPv6);
      msearchIPv6Socket = msearchSockIPv6;
    } catch (err) {
      logger.warn(`createSingleSocket for msearchIPv6 rejected by its promise. Error should have been handled by onError callback. Error:`, err);
    }
  }

  const sendMSearch = async (target: string, ipVersion: 4 | 6): Promise<void> => {
    const host = ipVersion === 4 ? SSDP_MULTICAST_ADDRESS_IPV4 : SSDP_MULTICAST_ADDRESS_IPV6_LINK_LOCAL;
    const message =
      `${M_SEARCH_REQUEST_START_LINE}\r\n` +
      `HOST: ${host}:${SSDP_PORT}\r\n` +
      `MAN: "ssdp:discover"\r\n` +
      `MX: ${MX_VALUE}\r\n` +
      `ST: ${target}\r\n` +
      `USER-AGENT: ${USER_AGENT}\r\n` +
      `\r\n`;

    const buffer = Buffer.from(message);
    const selectedSocket = ipVersion === 4 ? msearchIPv4Socket : msearchIPv6Socket;

    if (!selectedSocket) {
      const errorMsg = `M-Search socket for IPv${ipVersion} is not available.`;
      logger.error(errorMsg);
      return Promise.reject(new Error(errorMsg));
    }

    return new Promise<void>((resolve, reject) => {
      selectedSocket.send(buffer, 0, buffer.length, SSDP_PORT, host, (err) => {
        if (err) {
          logger.error(`Error sending M-SEARCH over IPv${ipVersion} to ${host}:${SSDP_PORT} for target ${target}`, err);
          onError(err, `sendMSearchIPv${ipVersion}`);
          reject(err);
        } else {
          logger.debug(`M-SEARCH sent over IPv${ipVersion} to ${host}:${SSDP_PORT} for target ${target}`);
          resolve();
        }
      });
    });
  };

  const closeAll = async (): Promise<PromiseSettledResult<void>[]> => {
    logger.debug(`Closing ${sockets.length} sockets...`);
    const closePromises = sockets.map(socket => {
      return new Promise<void>((resolve) => { // Removed reject as we resolve even on error
        try {
          // @ts-ignore
          const id = socket._socketIdentifier || 'unknown';
          socket.close(() => {
            logger.debug(`Socket ${id} closed.`);
            resolve();
          });
        } catch (err) {
            // @ts-ignore
            const id = socket._socketIdentifier || 'unknown';
            logger.warn(`Error trying to initiate close for socket ${id}. It might already be closed or in an error state.`, err);
            resolve(); // Resolve even if closing fails, as the socket might be unusable
        }
      });
    });
    return Promise.allSettled(closePromises);
  };

  return {
    sendMSearch,
    closeAll,
  };
}