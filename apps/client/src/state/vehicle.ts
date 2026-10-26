import { writable } from 'svelte/store';
import type { DrivableVehicleKind, TranslationKey, WeaponId } from '@frost-and-flamingos/shared';

/** What the vehicle HUD card shows while the local player rides a vehicle. */
export interface VehicleHudState {
  kind: DrivableVehicleKind;
  nameKey: TranslationKey;
  seatKey: TranslationKey;
  seatIndex: number;
  seatCount: number;
  /** Occupied seats (crew size). */
  crew: number;
  hp: number;
  maxHp: number;
  driver: boolean;
  gunner: boolean;
  handWeapons: boolean;
  weaponId: WeaponId | null;
  /** 0 = just fired, 1 = ready. */
  weaponReady: number;
  boost: { active: boolean; ready: number } | null;
  beached: boolean;
  speedKmh: number;
}

export const vehicleHud = writable<VehicleHudState | null>(null);
