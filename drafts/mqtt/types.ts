export type DevicesSnapshot = Record<string, DeviceEntry>;

export interface DeviceEntry {
  online: boolean;
  sensors: Record<string, string>;
  relays: Record<string, string>;
  properties: DeviceProperties;
  isTarget: boolean;
  lastUpdate: string;
}

export interface DeviceProperties {
  // מצב כללי/טלמטריה
  Time?: string;
  Uptime?: string;
  UptimeSec?: number;
  Heap?: number;
  SleepMode?: string;
  Sleep?: number;
  LoadAvg?: number;
  MqttCount?: number;

  // זיהוי ורשת
  Hostname?: string;
  IPAddress?: string;
  ip?: string; // כתובת IP (קצר)
  dn?: string; // display name / שם ידידותי
  mac?: string; // כתובת MAC ללא מפרידים
  MAC?: string; // כתובת MAC באותיות גדולות/אחרת
  t?: string; // topic בסיסי (לדוגמה tasmota_XXXX)
  ft?: string; // פורמט topic (לדוגמה "%prefix%/%topic%/")
  tp?: string[]; // prefix סדרתי (cmnd/stat/tele)

  // לוגיקה/קונפיג
  fn?: Array<string | null>; // FriendlyName לכל ערוץ
  md?: string; // Model / דגם
  ty?: number; // סוג חומרה (מזהה מספרי)
  if?: number; // ממשק/פלטפורמה (קוד מספרי של Tasmota)
  ofln?: string; // טקסט Offline
  onln?: string; // טקסט Online
  state?: string[]; // רשימת מצבי פקודות (OFF/ON/TOGGLE/HOLD...)
  sw?: string; // גרסת קושחה (Software)
  rl?: number[]; // מפה של ערוצי Relay (1/0 לכל ערוץ)
  swc?: number[]; // Switch Configuration (קידוד מצבים/מצבי הפעלה)
  swn?: Array<string | null>; // שמות חיישני Switch
  btn?: number[]; // הגדרות כפתורים (Button config array)
  so?: Record<string, number>; // SetOption ממויין לפי מספר (לדוגמה 4,11,13...)
  lk?: number; // Link Count / ספירת חיבורים
  lt_st?: number; // Last Trigger State / סטטוס טריגר אחרון
  bat?: number; // מצב סוללה (אם קיים)
  dslp?: number; // Deep Sleep (שניות/דגל)
  sho?: unknown[]; // Shelly options/אחר (שדות עזר של Tasmota)
  sht?: unknown[]; // Shelly thresholds/אחר (שדות עזר של Tasmota)
  ver?: number; // גרסת פורמט ה-discovery

  // מודולי משנה
  Berry?: {
    HeapUsed?: number;
    Objects?: number;
  };

  Wifi?: {
    AP?: number;
    SSId?: string;
    BSSId?: string;
    Channel?: number;
    Mode?: string;
    RSSI?: number;
    Signal?: number;
    LinkCount?: number;
    Downtime?: string;
  };

  sn?: {
    Time?: string;
    ENERGY?: {
      TotalStartTime?: string;
      Total?: number;
      Yesterday?: number;
      Today?: number;
      Power?: number;
      ApparentPower?: number;
      ReactivePower?: number;
      Factor?: number;
      Voltage?: number;
      Current?: number;
    };
    Switch1?: string;
    Switch2?: string;
  };

  // כל מפתח נוסף שנקבל
  [key: string]: unknown;
}
