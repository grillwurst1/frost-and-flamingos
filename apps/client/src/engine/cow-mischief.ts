import { COW_TUNING, InputButton, type PlayerState, type Vec3 } from '@frost-and-flamingos/shared';

export type CowMischiefMode = 'grazing' | 'charging';
export interface CowMischiefContext {
  dt: number; enabled: boolean; grounded: boolean; swimming: boolean; busy: boolean;
  position: Vec3; heading: number; speed: number; stamina: number; selfId: number | null;
  players: readonly PlayerState[];
  canGraze(): boolean;
  visible(target: Vec3): boolean;
  safe(heading: number, distance: number): boolean;
}
const MOVEMENT = InputButton.Forward | InputButton.Backward | InputButton.Left | InputButton.Right | InputButton.Sprint;
const INTERRUPT = InputButton.Jump | InputButton.FirePrimary | InputButton.FireSecondary
  | InputButton.Skill1 | InputButton.Skill2 | InputButton.Skill3OrTaunt | InputButton.Interact;

/** Occasional short antics, sent as ordinary predicted/authoritative movement.
 * Abilities always take precedence. No new AI tick, speed bonus or damage rule.
 */
export class CowMischief {
  mode: CowMischiefMode | null = null;
  started = false;
  private next: number;
  private remaining = 0;
  private target = 0;
  private probe = 0;
  private brake = 0;
  constructor(private readonly random: () => number = Math.random) { this.next = 25 + random() * 20; }

  reset(): void {
    this.mode = null; this.target = 0; this.started = false; this.brake = 0;
    this.next = 45 + this.random() * 45;
  }

  private finish(buttons: number, context: CowMischiefContext): number {
    const wasCharging = this.mode === 'charging';
    this.reset();
    if (!wasCharging || (buttons & MOVEMENT) || context.speed < .5) return buttons;
    this.brake = context.speed / COW_TUNING.brakeDeceleration + .15;
    return (buttons & ~MOVEMENT) | InputButton.Backward;
  }

  update(buttons: number, context: CowMischiefContext): number {
    this.started = false;
    const dt = Math.min(.1, Math.max(0, context.dt));
    if (!context.enabled || context.swimming || !context.grounded || context.busy || (buttons & INTERRUPT)) {
      if (this.mode || this.brake > 0) this.reset();
      return buttons;
    }
    if (this.brake > 0) {
      this.brake -= dt;
      if (context.speed < .2 || (buttons & MOVEMENT)) this.brake = 0;
      else return (buttons & ~MOVEMENT) | InputButton.Backward;
    }
    if (!this.mode) {
      this.next -= dt;
      if (this.next > 0) return buttons;
      let nearest: PlayerState | undefined, distance = 12;
      if (context.stamina > .3) for (const person of context.players) {
        if (person.id === context.selfId || !person.alive || person.classId === 'mascot') continue;
        if (Math.abs(person.position.y - context.position.y) > 1.8) continue;
        const d = Math.hypot(person.position.x - context.position.x, person.position.z - context.position.z);
        if (d > 2 && d < distance && context.visible(person.position)) { nearest = person; distance = d; }
      }
      if (nearest && this.random() < .7) {
        this.mode = 'charging'; this.target = nearest.id; this.remaining = 2.8; this.probe = 0;
      } else if (!(buttons & MOVEMENT) && context.canGraze()) {
        this.mode = 'grazing'; this.remaining = 7;
      } else {
        this.next = 5; return buttons;
      }
      this.started = true;
    }
    this.remaining -= dt;
    if (this.remaining <= 0) return this.finish(buttons, context);
    if (this.mode === 'grazing') {
      if (buttons & MOVEMENT) { this.reset(); return buttons; }
      return (buttons & ~MOVEMENT) | InputButton.Crouch;
    }
    if (buttons & (InputButton.Left | InputButton.Right | InputButton.Backward)) { this.reset(); return buttons; }
    const target = context.players.find(person => person.id === this.target && person.alive && person.classId !== 'mascot');
    if (!target) return this.finish(buttons, context);
    const dx = target.position.x - context.position.x, dz = target.position.z - context.position.z;
    if (Math.hypot(dx, dz) > 16) return this.finish(buttons, context);
    const wanted = Math.atan2(dx, dz), turn = Math.atan2(Math.sin(wanted - context.heading), Math.cos(wanted - context.heading));
    this.probe -= dt;
    if (this.probe <= 0) {
      this.probe = .15;
      const stoppingDistance = context.speed ** 2 / (2 * COW_TUNING.brakeDeceleration) + context.speed * .2 + 1.5;
      if (!context.safe(context.heading, Math.max(3, stoppingDistance))) return this.finish(buttons, context);
    }
    // Turn at the existing motor's rate before accelerating: never spin a cow
    // instantly or gallop sideways over a ledge to acquire a target.
    let forced = buttons & ~MOVEMENT;
    if (Math.abs(turn) > .10) forced |= turn > 0 ? InputButton.Right : InputButton.Left;
    if (Math.abs(turn) < .65) forced |= InputButton.Forward | InputButton.Sprint;
    return forced;
  }
}
