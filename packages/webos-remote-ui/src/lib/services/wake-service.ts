import { resolveProxyPath } from '$utils/env';

export type PowerStatus = 'unknown' | 'checking' | 'waking' | 'awake' | 'offline' | 'error';

export interface WakeResponseBody {
  status?: string;
  message?: string;
}

export interface WakeResult {
  status: PowerStatus;
  message: string;
}

export class WakeService {
  private async sendWakeRequest(payload: Record<string, unknown>): Promise<WakeResponseBody> {
    const response = await fetch(resolveProxyPath('/api/wake'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    try {
      return JSON.parse(text) as WakeResponseBody;
    } catch (error) {
      console.warn('Wake API returned non-JSON body', { text });
      if (!response.ok) {
        throw new Error(`Wake API error (${response.status})`);
      }
      return {};
    }
  }

  private toResult(body: WakeResponseBody, fallbackStatus: PowerStatus, fallbackMessage: string): WakeResult {
    switch (body.status) {
      case 'awake':
        return { status: 'awake', message: body.message ?? 'המסך כרגע דולק' };
      case 'offline':
        return { status: 'offline', message: body.message ?? 'המסך כבוי או לא מגיב' };
      case 'timeout':
        return { status: 'error', message: body.message ?? 'הפעולה חרגה ממגבלת הזמן.' };
      default:
        return { status: fallbackStatus, message: body.message ?? fallbackMessage };
    }
  }

  async checkPower(ipAddress: string, macAddress: string): Promise<WakeResult> {
    try {
      const body = await this.sendWakeRequest({
        ipAddress,
        macAddress,
        waitBeforePingSeconds: 0,
        pingTotalTimeoutSeconds: 6,
        pingIntervalSeconds: 1,
        pingSingleTimeoutSeconds: 1,
        dryRun: true
      });
      return this.toResult(body, 'error', 'שגיאה בבדיקת מצב המסך');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'שגיאת רשת';
      return { status: 'error', message };
    }
  }

  async wake(ipAddress: string, macAddress: string): Promise<WakeResult> {
    try {
      const body = await this.sendWakeRequest({
        ipAddress,
        macAddress,
        waitBeforePingSeconds: 5,
        pingTotalTimeoutSeconds: 45,
        pingIntervalSeconds: 3,
        pingSingleTimeoutSeconds: 3,
        dryRun: false
      });
      return this.toResult(body, 'error', 'שליחת Wake-on-LAN נכשלה.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'שגיאת רשת';
      return { status: 'error', message };
    }
  }
}

export const wakeService = new WakeService();
