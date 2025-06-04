import createModuleLogger from './logger';

// הגדרת משתני סביבה לדוגמה (בפועל, הם יוגדרו מחוץ לקוד)
// process.env.LOG_LEVEL = 'debug'; // הצג את כל הרמות עד debug
// process.env.LOG_TO_CONSOLE = 'true';
// process.env.LOG_TO_FILE = 'true';
// process.env.LOG_FILE_PATH = 'logs/test_run.log'; // קובץ לוג ייעודי לבדיקה זו

const logger = createModuleLogger('TestLoggerModule');

logger.error('This is a test error message.', { additionalInfo: 'some error details' });
logger.warn('This is a test warning message.');
logger.info('This is a test info message.', { userId: 123, action: 'login' });
logger.http('This is a test HTTP message (e.g., incoming request).'); // אם רמת הלוג מאפשרת
logger.verbose('This is a test verbose message.'); // אם רמת הלוג מאפשרת
logger.debug('This is a test debug message.', { data: { key: 'value' } }); // אם רמת הלוג מאפשרת
logger.silly('This is a test silly message.'); // אם רמת הלוג מאפשרת

// בדיקת הדפסת אובייקט שגיאה
try {
  throw new Error('Intentional error for stack trace testing');
} catch (e: any) {
  logger.error('Caught an error:', e);
}

console.log("\nLogger test finished.");
console.log("If LOG_TO_CONSOLE=true (or not set), you will see logs in the console.");
console.log("If LOG_TO_FILE=true, logs will be saved to a file (default: logs/app.log or as set by LOG_FILE_PATH).");
console.log("You can change LOG_LEVEL to see more or fewer messages.");
console.log("For example, try running with: LOG_LEVEL=debug LOG_TO_FILE=true node dist/testLogger.js");
console.log("Or: LOG_LEVEL=warn LOG_TO_CONSOLE=true node dist/testLogger.js");