/**
 * Game event wire codes stay unique across the merged packages (3H critters
 * at 32+, 3G drifter, 4V vehicles at 24-27, 4T PROFILE_NOTICE at 28, the M4
 * combat range) and every event type round-trips through the binary event
 * codec.
 *
 *   bun test apps/server/test/event-codes.test.ts
 */
import { describe, expect, test } from 'bun:test';
import { GameEventCode, decodeGameEvent, encodeGameEvent, type GameEventType } from '@frost-and-flamingos/shared';

const entries = Object.entries(GameEventCode) as Array<[GameEventType, number]>;

describe('game event codes', () => {
  test('every event code is unique and fits the u8 wire slot', () => {
    const codes = entries.map(([, code]) => code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const [name, code] of entries) {
      expect(Number.isInteger(code)).toBe(true);
      expect(code, name).toBeGreaterThan(0);
      expect(code, name).toBeLessThanOrEqual(255);
    }
  });

  test('the package ranges keep their codes (vehicles 24-27, profile notice 28, critters 32)', () => {
    expect(GameEventCode.VEHICLE_DAMAGED).toBe(24);
    expect(GameEventCode.VEHICLE_DESTROYED).toBe(25);
    expect(GameEventCode.VEHICLE_HORN).toBe(26);
    expect(GameEventCode.VEHICLE_SEAT).toBe(27);
    // 4T shipped it as 24 on its own branch; the merged protocol 9 moves it clear of the vehicles.
    expect(GameEventCode.PROFILE_NOTICE).toBe(28);
    expect(GameEventCode.CRITTER_KILLED).toBe(32);
    // Conquest tower ownership keeps the M4 slot.
    expect(GameEventCode.TURRET_CAPTURED).toBe(7);
  });

  test('a PROFILE_NOTICE decodes as itself, not as a vehicle event', () => {
    const notice = { eventType: 'PROFILE_NOTICE' as const, actorId: 4, targetId: 0, paramX: 1, paramZ: 0, paramValue: 2 };
    const bytes = new Uint8Array(encodeGameEvent(notice));
    // Opcode byte, then the event code.
    expect(bytes[1]).toBe(28);
    expect(decodeGameEvent(bytes.buffer)).toEqual(notice);
  });

  test('every event type round-trips through the codec', () => {
    for (const [eventType] of entries) {
      const event = { eventType, actorId: 513, targetId: 7, paramX: -1234, paramZ: 4321, paramValue: 65535 };
      expect(decodeGameEvent(encodeGameEvent(event))).toEqual(event);
    }
  });
});
