import { createModuleLogger } from './logger';

const defaultLogger = createModuleLogger('Utils');

/**
 * @hebrew פונקציית עזר להמתנה (sleep).
 * @param ms - זמן המתנה במילישניות.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @hebrew מריץ פונקציה אסינכרונית עם מנגנון ניסיונות חוזרים.
 * @param fn - הפונקציה האסינכרונית להרצה. הפונקציה צריכה לזרוק שגיאה במקרה של כישלון.
 * @param options - אפשרויות התנהגות.
 * @param options.retries - מספר הניסיונות החוזרים. ברירת מחדל: 3.
 * @param options.delayMs - זמן המתנה בין ניסיונות במילישניות. ברירת מחדל: 1000.
 * @param options.logger - לוגר אופציונלי לתיעוד הניסיונות.
 * @param options.onRetry - פונקציית קולבק אופציונלית שנקראת לפני כל ניסיון חוזר.
 * @returns - מחזיר את תוצאת הפונקציה המוצלחת.
 * @throws - זורק את השגיאה האחרונה אם כל הניסיונות נכשלו.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delayMs?: number;
    logger?: typeof defaultLogger;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    retries = 3,
    delayMs = 1000,
    logger = defaultLogger,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`Attempt ${attempt} of ${retries} failed: ${lastError.message}`);

      if (onRetry) {
        try {
          onRetry(lastError, attempt);
        } catch (callbackError: any) {
          logger.error(`Error in onRetry callback: ${callbackError.message}`);
        }
      }

      if (attempt < retries) {
        logger.info(`Waiting ${delayMs}ms before next retry...`);
        await delay(delayMs);
      }
    }
  }

  logger.error(`All ${retries} attempts failed. Last error: ${lastError!.message}`);
  throw lastError;
}