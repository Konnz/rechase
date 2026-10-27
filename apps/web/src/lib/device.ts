import type { DeviceInfo } from '@rechase/core';

/** Was Browser über Gerät und Akku verraten. Fehlt eine Schnittstelle (Safari, Firefox), kommt null. */

interface UADataLike {
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?(hints: string[]): Promise<{ model?: string; platformVersion?: string }>;
}

interface BatteryLike {
  level: number;
  charging: boolean;
}

/** Gerätemodell über User-Agent Client Hints; Chrome auf Android nennt es im User-Agent nicht mehr. */
export async function deviceInfo(): Promise<DeviceInfo | null> {
  const ua = (navigator as Navigator & { userAgentData?: UADataLike }).userAgentData;
  if (!ua) return null;
  try {
    const hi = (await ua.getHighEntropyValues?.(['model', 'platformVersion'])) ?? {};
    return {
      ...(hi.model ? { model: hi.model } : {}),
      ...(ua.platform ? { platform: ua.platform } : {}),
      ...(hi.platformVersion ? { platformVersion: hi.platformVersion } : {}),
      ...(ua.mobile != null ? { mobile: ua.mobile } : {}),
    };
  } catch {
    return null;
  }
}

/** Akkustand 0–1 und ob das Gerät lädt (Battery Status API, nur Chromium). */
export async function battery(): Promise<BatteryLike | null> {
  const get = (navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }).getBattery;
  if (!get) return null;
  try {
    const b = await get.call(navigator);
    return { level: b.level, charging: b.charging };
  } catch {
    return null;
  }
}
