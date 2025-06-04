import * as winston from 'winston';

/*
```ps
$env:LOG_MODULES = ""
$env:LOG_LEVEL = ""
```

// הגדרת משתני סביבה לדוגמה (בפועל, הם יוגדרו מחוץ לקוד)
// process.env.LOG_LEVEL = 'debug'; // הצג את כל הרמות עד debug
// process.env.LOG_TO_CONSOLE = 'true';
// process.env.LOG_TO_FILE = 'true';
// process.env.LOG_FILE_PATH = 'logs/test_run.log'; // קובץ לוג ייעודי לבדיקה זו

*/

// הגדרת רמות לוג וצבעים (אופציונלי, winston משתמש ברמות npm כברירת מחדל)
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3, // רמה נוספת שיכולה להיות שימושית לבקשות HTTP
  verbose: 4,
  debug: 5,
  silly: 6
};

// הגדרת צבעים לרמות השונות (לקונסולה)
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  silly: 'grey'
};

winston.addColors(logColors);

// --- פורמטים ---

// פורמט סינון לפי שם מודול
const filterByModuleNameFormat = winston.format((info) => {
  const logModulesEnv = process.env.LOG_MODULES;

  // אם LOG_MODULES לא מוגדר, ריק, או שווה ל-"*", אל תסנן כלום
  if (!logModulesEnv || logModulesEnv.trim() === '' || logModulesEnv.trim() === '*') {
    return info;
  }

  // אם LOG_MODULES מוגדר (ולא "*"), בצע סינון
  if (info.label) {
    const allowedModules = logModulesEnv.split(',').map(m => m.trim()).filter(m => m);
    // אם רשימת המודולים המותרים אינה ריקה והמודול הנוכחי אינו כלול בה, סנן
    if (allowedModules.length > 0 && !allowedModules.includes(info.label as string)) {
      return false;
    }
  }
  return info; // אם המודול כלול או שאין info.label (נדיר), העבר את ההודעה
});

// פורמט בסיסי להודעות טקסט, ניתן להתאמה עם label (משמש לקובץ)
const createTextFormat = (moduleLabel?: string) => winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  ...(moduleLabel ? [winston.format.label({ label: moduleLabel })] : []), // הוסף label רק אם סופק
  filterByModuleNameFormat(), // הפעלת הסינון לפי מודול
  winston.format.printf((info) => {
    const originalLevel = info[Symbol.for('level')];
    let levelString = 'UNKNOWN_LEVEL';
    if (typeof originalLevel === 'string') {
      levelString = originalLevel.toUpperCase();
    }
    // הרכבת הפורמט לקובץ: חותמת זמן [רמה_גדולה] [לייבל]: הודעה
    let logMessage = `${info.timestamp} [${levelString}]`;
    if (info.label) {
      logMessage += ` (${info.label})`; // לייבל עם סוגריים עגולים לקובץ
    }
    logMessage += `: ${info.message}`;

    const {
      level,      // נשלף כדי לא להופיע ב-otherMeta
      message,    // נשלף כדי לא להופיע ב-otherMeta
      timestamp,  // נשלף כדי לא להופיע ב-otherMeta
      label,      // נשלף כדי לא להופיע ב-otherMeta
      [Symbol.for('level')]: _levelSymbol,
      [Symbol.for('message')]: _messageSymbol,
      stack,      // נשלף כדי לטפל בו בנפרד
      ...otherMeta
    } = info;

    const filteredMeta = Object.entries(otherMeta); // כבר לא צריך לסנן stack כאן

    if (filteredMeta.length > 0 && !(info instanceof Error && info.stack)) {
      const metaString = filteredMeta
        .map(([key, value]) => {
          if (value instanceof Error) {
            return `${key}=Error: ${value.message}${value.stack ? `\nStack: ${value.stack}` : ''}`;
          } else if (typeof value === 'object' && value !== null &&
                     ('message' in value || 'code' in value || 'stack' in value || 'errno' in value || 'syscall' in value || 'address' in value || 'port' in value)
                    ) {
            let errMsg = `${key}=PotentialError: { `;
            if ('message' in value && (value as any).message) errMsg += `message: "${(value as any).message}", `;
            if ('code' in value) errMsg += `code: "${(value as any).code}", `;
            if ('errno' in value) errMsg += `errno: ${(value as any).errno}, `;
            if ('syscall' in value) errMsg += `syscall: "${(value as any).syscall}", `;
            if ('address' in value) errMsg += `address: "${(value as any).address}", `;
            if ('port' in value) errMsg += `port: ${(value as any).port}, `;
            errMsg = errMsg.replace(/, $/, ''); // הסרת פסיק אחרון אם קיים
            errMsg += ` }`;
            if ('stack' in value && (value as any).stack) {
                 errMsg += `\nStack: ${(value as any).stack}`;
            }
            return errMsg;
          }
          try {
            return `${key}=${JSON.stringify(value)}`;
          } catch (e) {
            return `${key}=[UnstringifiableObject]`;
          }
        })
        .join(' ');
      if (metaString) {
        logMessage += ` ${metaString}`;
      }
    }

    if (stack) { // שימוש ב-stack ששלפנו
      logMessage += `\n${stack}`;
    }
    return logMessage;
  })
);

// פורמט לקונסולה
export const consoleFormat = (moduleLabel?: string) => winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.padLevels(),
  ...(moduleLabel ? [winston.format.label({ label: moduleLabel })] : []),
  filterByModuleNameFormat(), // הפעלת הסינון לפי מודול
  // ההערות לגבי colorize נשארו כפי שהיו, נטפל בעיצוב הצבעים בנפרד אם צריך
  //winston.format.colorize({ colors: logColors }),
  winston.format.printf((info) => {
    // בהנחה ש-info.level מגיע לא צבוע כאן, כי colorize({all:true}) יבוא בסוף
    // וה-colorize הרגיל (שורה 90) כרגע בהערה.
    // אם נחזיר את colorize הרגיל, נצטרך להתאים את השורה הבאה.
    let logMessage = `${info.timestamp} [${info.level.toUpperCase()}]`;
    if (info.label) {
      logMessage += ` (${info.label})`;
    }
    logMessage += `: ${info.message}`;

    const {
      level, message, timestamp, label, // משתנים שכבר השתמשנו בהם
      [Symbol.for('level')]: _levelSym, [Symbol.for('message')]: _msgSym,
      stack, // נשלף כדי לא להדפיס אותו עם שאר ה-rest
      ...rest
    } = info;

    const filteredRest = Object.entries(rest);
    if (filteredRest.length > 0) {
      const metaString = filteredRest
        .map(([key, value]) => {
          if (value instanceof Error) {
            return `${key}=Error: ${value.message}${value.stack ? `\nStack: ${value.stack}` : ''}`;
          } else if (typeof value === 'object' && value !== null &&
                     ('message' in value || 'code' in value || 'stack' in value || 'errno' in value || 'syscall' in value || 'address' in value || 'port' in value)
                    ) {
            let errMsg = `${key}=PotentialError: { `;
            if ('message' in value && (value as any).message) errMsg += `message: "${(value as any).message}", `;
            if ('code' in value) errMsg += `code: "${(value as any).code}", `;
            if ('errno' in value) errMsg += `errno: ${(value as any).errno}, `;
            if ('syscall' in value) errMsg += `syscall: "${(value as any).syscall}", `;
            if ('address' in value) errMsg += `address: "${(value as any).address}", `;
            if ('port' in value) errMsg += `port: ${(value as any).port}, `;
            errMsg = errMsg.replace(/, $/, ''); // הסרת פסיק אחרון אם קיים
            errMsg += ` }`;
            if ('stack' in value && (value as any).stack) {
                 errMsg += `\nStack: ${(value as any).stack}`;
            }
            return errMsg;
          }
          try {
            return `${key}=${JSON.stringify(value)}`;
          } catch (e) {
            return `${key}=[UnstringifiableObject]`;
          }
        })
        .join(' ');
      if (metaString) {
        logMessage += ` ${metaString}`;
      }
    }

    // הוספת stack trace אם קיים
    if (stack) {
      logMessage += `\n${stack}`;
    }
    return logMessage;
  }),
  // הסרת ה-colorize שהיה כאן בסוף, הוא צריך להיות לפני ה-printf
  winston.format.colorize({ colors: logColors, message: true, level: true, all: true }),

);

// פורמט לקובץ (ללא צבעים) - משתמש ב-createTextFormat המייצר רמה באותיות גדולות וסוגריים
export const fileFormat = (moduleLabel?: string) => createTextFormat(moduleLabel);


// --- טרנספורטים ---
export const consoleTransport = new winston.transports.Console({
  // הפורמט יוגדר דינמית בפונקציה createModuleLogger
  // או שניתן להגדיר פורמט דיפולטיבי כאן אם רוצים
});

export const fileTransport = (filePath?: string, moduleLabel?: string) => new winston.transports.File({
  filename: filePath || process.env.LOG_FILE_PATH || 'logs/app.log',
  format: fileFormat(moduleLabel), // שימוש בפורמט הקובץ שהוגדר
  maxsize: 5242880, // 5MB
  maxFiles: 5,
  tailable: true,
});


// --- פונקציה ליצירת לוגר ---
const createModuleLogger = (moduleName: string): winston.Logger => {
  const activeTransports = [];

  // טרנספורט לקונסולה
  if (process.env.LOG_TO_CONSOLE === 'true' || process.env.LOG_TO_CONSOLE === undefined) {
    // יצירת מופע חדש של הטרנספורט עם הפורמט המותאם למודול
    const specificConsoleTransport = new winston.transports.Console({
      format: consoleFormat(moduleName) // העברת שם המודול לפורמט
    });
    activeTransports.push(specificConsoleTransport);
  }

  // טרנספורט לקובץ
  if (process.env.LOG_TO_FILE === 'true') {
    // יצירת מופע חדש של הטרנספורט עם הפורמט המותאם למודול
    const specificFileTransport = new winston.transports.File({
      filename: process.env.LOG_FILE_PATH || 'logs/app.log',
      format: fileFormat(moduleName), // העברת שם המודול לפורמט
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true,
    });
    activeTransports.push(specificFileTransport);
  }

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels: logLevels,
    format: winston.format.errors({ stack: true }), // חשוב להדפסת stack traces
    transports: activeTransports,
    exceptionHandlers: [
      new winston.transports.File({
        filename: process.env.LOG_EXCEPTIONS_PATH || 'logs/exceptions.log',
        format: fileFormat('ExceptionHandler') // שימוש בפורמט הקובץ הקיים
      })
    ],
    rejectionHandlers: [
      new winston.transports.File({
        filename: process.env.LOG_REJECTIONS_PATH || 'logs/rejections.log',
        format: fileFormat('RejectionHandler') // שימוש בפורמט הקובץ הקיים
      })
    ],
    exitOnError: false, // חשוב - לא לצאת מהתהליך במקרה של שגיאה בלוגר עצמו או ב-exception handler
  });
};

export default createModuleLogger;

// ייצוא נוסף של הפורמטים והטרנספורטים הבסיסיים לשימוש חיצוני אם נדרש
// (למרות שהטרנספורטים עצמם כבר מיוצאים למעלה, כאן זה יותר להמחשה של הפורמטים)
export { createTextFormat, createModuleLogger };
// שימו לב: consoleTransport ו-fileTransport כבר מיוצאים למעלה.
// fileTransport היא פונקציה, אז השימוש בה יהיה fileTransport()