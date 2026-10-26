/**
 * Game event wire codes stay unique across the merged packages (3H critters
 * at 32+, 3G drifter, 4V vehicles at 24-27, the M4 combat range) and every
 * event type round-trips through the binary event codec.
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

  test('the package ranges keep their codes (vehicles 24-27, critters 32)', () => {
    expect(GameEventCode.VEHICLE_DAMAGED).toBe(24);
    expect(GameEventCode.VEHICLE_DESTROYED).toBe(25);
    expect(GameEventCode.VEHICLE_HORN).toBe(26);
    expect(GameEventCode.VEHICLE_SEAT).toBe(27);
    expect(GameEventCode.CRITTER_KILLED).toBe(32);
  });

  test('every event type round-trips through the codec', () => {
    for (const [eventType] of entries) {
      const event = { eventType, actorId: 513, targetId: 7, paramX: -1234, paramZ: 4321, paramValue: 65535 };
      expect(decodeGameEvent(encodeGameEvent(event))).toEqual(event);
    }
  });
});
