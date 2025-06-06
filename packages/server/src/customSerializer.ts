// packages/server/src/customSerializer.ts

/**
 * פונקציית replacer עבור JSON.stringify להתאמה אישית של סריאליזציה.
 * - Map עם מפתחות מחרוזת בלבד יומר לאובייקט עם __type לזיהוי.
 * - Map עם מפתחות אחרים יומר למערך זוגות [key, value] עם __type.
 * - Set יומר למערך עם __type.
 * - Date יומר למחרוזת ISO עם __type.
 * - undefined יומר לאובייקט עם __type: 'Undefined'.
 * - BigInt יומר לאובייקט עם __type: 'BigInt' ומחרוזת ערך.
 */
export function customJsonReplacer(key: string, value: any): any {
    if (value instanceof Map) {
        let allKeysAreStrings = true;
        for (const k of value.keys()) {
            if (typeof k !== 'string') {
                allKeysAreStrings = false;
                break;
            }
        }

        if (allKeysAreStrings) {
            return Object.fromEntries(value);
        } else {
            return { __type: 'MapMixedKeys', value: Array.from(value.entries()) };
        }
    }

    if (value instanceof Set) {
        return { __type: 'Set', value: Array.from(value) };
    }

    if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() };
    }

    if (value === undefined) {
        // JSON.stringify משמיט שדות עם undefined באובייקטים,
        // או ממיר אותם ל-null במערכים. טיפול זה ישמר אותם.
        return { __type: 'Undefined' };
    }

    if (typeof value === 'bigint') {
        return { __type: 'BigInt', value: value.toString() };
    }

    return value;
}

/**
 * פונקציית reviver עבור JSON.parse לשחזור טיפוסים מיוחדים.
 */
export function customJsonReviver(key: string, value: any): any {
    if (typeof value === 'object' && value !== null) {
        if (value.__type) { // בודקים אם יש לנו שדה __type
            switch (value.__type) {
                case 'MapStringKeys':
                    return new Map(Object.entries(value.value));
                case 'MapMixedKeys':
                    return new Map(value.value);
                case 'Set':
                    return new Set(value.value);
                case 'Date':
                    return new Date(value.value);
                case 'Undefined':
                    return undefined;
                case 'BigInt':
                    return BigInt(value.value);
                default:
                    // אם __type לא מוכר, נחזיר את האובייקט כפי שהוא
                    return value;
            }
        }
    }
    return value;
}