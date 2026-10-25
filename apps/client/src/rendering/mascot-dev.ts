import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import { createDefaultCosmetics, sampleMapHeight, type MascotWireState, type PlayerProfile } from '@frost-and-flamingos/shared';
import type { AvatarPose } from './avatar';
import type { FaceCell } from './coconut-expression';
import { createShadowMaterial } from './materials';
import type { MascotFx } from './mascot-fx';
import { MascotView, type MascotReaction } from './mascot-view';

/**
 * DEV-only screenshot/playtest hook: `window.__ff.mascot` spawns "puppet"
 * mascots anywhere in the scene and drives them with synthetic gameplay
 * state on a treadmill (velocity reported, position held), so gait strips,
 * expression sheets and death poses can be captured deterministically.
 *
 *   const id = __ff.mascot.spawn('cow', 20, 14, 0)
 *   __ff.mascot.drive(id, { speed: 6.4 })      // trot
 *   __ff.mascot.freeze(true); __ff.mascot.step(id, 0.05)
 *   __ff.mascot.frame(id, 'side', 5)          // camera via __ff.look
 */

interface PuppetState {
  speed: number;
  lateral: number;
  vy: number;
  yawRate: number;
  aim: number;
  grounded: boolean;
  alive: boolean;
  dazed: boolean;
  swimming: boolean;
  launched: boolean;
  boost: boolean;
  stomp: number;
  skid: boolean;
  gallop: boolean;
  pounding: boolean;
  vitality: number;
  kills: number;
  /** Move with the velocity instead of running on a treadmill. */
  travel: boolean;
}

interface Puppet {
  id: number;
  view: MascotView;
  x: number;
  y: number;
  z: number;
  heading: number;
  state: PuppetState;
  pose: AvatarPose;
  mascot: MascotWireState;
}

const DEFAULT_STATE: PuppetState = {
  speed: 0,
  lateral: 0,
  vy: 0,
  yawRate: 0,
  aim: 0,
  grounded: true,
  alive: true,
  dazed: false,
  swimming: false,
  launched: false,
  boost: false,
  stomp: -1,
  skid: false,
  gallop: false,
  pounding: false,
  vitality: 1,
  kills: 0,
  travel: false,
};

export function installMascotDevHandle(scene: Scene, fx: MascotFx | null): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  const puppets = new Map<number, Puppet>();
  let serial = 0;
  let frozen = false;
  let observer: Observer<Scene> | null = null;

  const apply = (puppet: Puppet, dt: number): void => {
    const state = puppet.state;
    puppet.heading += state.yawRate * dt;
    const sin = Math.sin(puppet.heading);
    const cos = Math.cos(puppet.heading);
    if (state.travel) {
      puppet.x += (sin * state.speed + cos * state.lateral) * dt;
      puppet.z += (cos * state.speed - sin * state.lateral) * dt;
      if (state.grounded) puppet.y = sampleMapHeight(puppet.x, puppet.z);
      else puppet.y += state.vy * dt;
    }
    const pose = puppet.pose;
    pose.position.x = puppet.x;
    pose.position.y = puppet.y;
    pose.position.z = puppet.z;
    pose.velocity.x = sin * state.speed + cos * state.lateral;
    pose.velocity.y = state.vy;
    pose.velocity.z = cos * state.speed - sin * state.lateral;
    pose.yaw = puppet.heading + state.aim;
    pose.heading = puppet.heading;
    pose.grounded = state.grounded;
    pose.alive = state.alive;
    pose.dazed = state.dazed;
    pose.swimming = state.swimming;
    pose.launchSeconds = state.launched ? 0.5 : 0;
    pose.vitality = state.vitality;
    pose.kills = state.kills;
    const mascot = puppet.mascot;
    mascot.heading = puppet.heading;
    mascot.boostSeconds = state.boost ? 1.5 : 0;
    mascot.actionSeconds = state.stomp >= 0 ? Math.max(0.0001, (1 - state.stomp) * 0.32) : 0;
    mascot.skidding = state.skid;
    mascot.galloping = state.gallop;
    mascot.pounding = state.pounding;
    puppet.view.update(dt, pose);
    // Stars (and birds) over knocked-out or dazed puppets, like MascotClient does for players.
    const show = !state.alive || state.dazed;
    const height = !state.alive && puppet.view.form === 'cow' ? 1.5 : !state.alive ? 1.2 : puppet.view.headHeight;
    fx?.setDizzy(100000 + puppet.id, show ? { x: puppet.x, y: puppet.y + height, z: puppet.z } : null);
  };

  const ensureObserver = (): void => {
    if (observer) return;
    observer = scene.onBeforeRenderObservable.add(() => {
      if (frozen) return;
      const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
      for (const puppet of puppets.values()) apply(puppet, dt);
    });
  };

  const handle = {
    spawn(form: 'cow' | 'coconut', x: number, z: number, heading = 0, y?: number): number {
      serial += 1;
      const faction = form === 'cow' ? 'alpine' : 'lagoon';
      const cosmetics = createDefaultCosmetics('mascot');
      const profile = { displayName: `puppet-${serial}`, faction, cosmetics } as unknown as PlayerProfile;
      const view = new MascotView(scene, createShadowMaterial(scene, `puppet-shadow-${serial}`), profile, fx);
      const ground = y ?? sampleMapHeight(x, z);
      const puppet: Puppet = {
        id: serial,
        view,
        x,
        y: ground,
        z,
        heading,
        state: { ...DEFAULT_STATE },
        pose: { position: { x, y: ground, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: heading, grounded: true, alive: true },
        mascot: {
          heading,
          yawRate: 0,
          stamina: 1,
          boostSeconds: 0,
          actionSeconds: 0,
          hopSeconds: 0,
          coyoteSeconds: 0,
          cooldownTicks: [0, 0, 0],
          pounding: false,
          skidding: false,
          galloping: false,
          exhausted: false,
          jumpsUsed: 0,
        },
      };
      puppet.pose.mascot = puppet.mascot;
      view.setYaw(heading, true);
      puppets.set(serial, puppet);
      ensureObserver();
      apply(puppet, 1 / 60);
      return serial;
    },
    drive(id: number, partial: Partial<PuppetState>): PuppetState | null {
      const puppet = puppets.get(id);
      if (!puppet) return null;
      Object.assign(puppet.state, partial);
      return puppet.state;
    },
    move(id: number, x: number, z: number, heading?: number, y?: number): void {
      const puppet = puppets.get(id);
      if (!puppet) return;
      puppet.x = x;
      puppet.z = z;
      puppet.y = y ?? sampleMapHeight(x, z);
      if (heading !== undefined) {
        puppet.heading = heading;
        puppet.view.setYaw(heading, true);
      }
    },
    freeze(value: boolean): void {
      frozen = value;
    },
    /** Advances puppets synchronously in 1/60 s steps (all when id is 0). */
    step(id: number, seconds: number): void {
      let remaining = seconds;
      while (remaining > 1e-6) {
        const dt = Math.min(1 / 60, remaining);
        for (const [key, puppet] of puppets) if (id === 0 || key === id) apply(puppet, dt);
        remaining -= dt;
      }
      fx?.update(0);
    },
    /** Shuts the cow's eyes / makes the coconut blink right now. */
    blink(id: number): void {
      puppets.get(id)?.view.forceBlink();
    },
    expr(id: number, cell: number | null): void {
      puppets.get(id)?.view.forceExpression(cell === null ? null : (cell as FaceCell));
    },
    react(id: number, reaction: MascotReaction): void {
      puppets.get(id)?.view.react(reaction);
    },
    clip(id: number, enabled: boolean): void {
      puppets.get(id)?.view.setClipWalk(enabled);
    },
    info(id: number): Record<string, unknown> | null {
      const puppet = puppets.get(id);
      if (!puppet) return null;
      const meshes = puppet.view.root.getChildMeshes(false).filter((mesh) => mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices() > 0);
      return {
        rig: puppet.view.rigKind,
        cadence: puppet.view.gaitCadence,
        clipWalk: puppet.view.clipWalk,
        lids: puppet.view.lidProbe,
        drawCalls: meshes.reduce((sum, mesh) => sum + (mesh.subMeshes?.length ?? 1), 0),
        meshes: meshes.map((mesh) => `${mesh.name}:${mesh.getTotalVertices()}`),
      };
    },
    /** Frames a puppet with the __ff.look camera override: side / front / back / 34. */
    frame(id: number, view: 'side' | 'front' | 'back' | '34' = 'side', distance = 5, height = 0.9): boolean {
      const puppet = puppets.get(id);
      const look = (window as unknown as { __ff?: { look?: { setCameraOverride?: (...v: number[]) => void } } }).__ff?.look;
      if (!puppet || !look?.setCameraOverride) return false;
      const offset = view === 'side' ? Math.PI / 2 : view === 'front' ? 0 : view === 'back' ? Math.PI : Math.PI / 4;
      const angle = puppet.heading + offset;
      const tx = puppet.x;
      const ty = puppet.y + height;
      const tz = puppet.z;
      look.setCameraOverride(tx + Math.sin(angle) * distance, ty + 0.25, tz + Math.cos(angle) * distance, tx, ty, tz);
      return true;
    },
    remove(id: number): void {
      puppets.get(id)?.view.dispose();
      puppets.delete(id);
    },
    clear(): void {
      for (const puppet of puppets.values()) puppet.view.dispose();
      puppets.clear();
    },
    pos(id: number): { x: number; y: number; z: number; heading: number } | null {
      const puppet = puppets.get(id);
      return puppet ? { x: puppet.x, y: puppet.y, z: puppet.z, heading: puppet.heading } : null;
    },
    ground(x: number, z: number): number {
      return sampleMapHeight(x, z);
    },
    /** Camera override at (x, y, z) looking at (tx, ty, tz). */
    look(x: number, y: number, z: number, tx: number, ty: number, tz: number): boolean {
      const look = (window as unknown as { __ff?: { look?: { setCameraOverride?: (...v: number[]) => void } } }).__ff?.look;
      if (!look?.setCameraOverride) return false;
      look.setCameraOverride(x, y, z, tx, ty, tz);
      return true;
    },
    /** Scene/engine counters for leak hunting. */
    stats(): Record<string, number> {
      const engine = scene.getEngine() as unknown as { _compiledEffects?: Record<string, unknown> };
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return {
        effects: Object.keys(engine._compiledEffects ?? {}).length,
        meshes: scene.meshes.length,
        materials: scene.materials.length,
        textures: scene.textures.length,
        skeletons: scene.skeletons.length,
        transformNodes: scene.transformNodes.length,
        heapMB: memory ? Math.round(memory.usedJSHeapSize / 1048576) : -1,
      };
    },
    /** Hides the HUD layer for clean captures. */
    hud(visible: boolean): void {
      const root = document.querySelector<HTMLElement>('.hud-root');
      if (root) root.style.visibility = visible ? '' : 'hidden';
    },
    ids(): number[] {
      return [...puppets.keys()];
    },
  };
  const holder = window as unknown as { __ff?: Record<string, unknown> };
  holder.__ff = { ...(holder.__ff ?? {}), mascot: handle };
}
