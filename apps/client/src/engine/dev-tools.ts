/**
 * DEV-only map probes exposed as `window.__ffMap` (never installed in
 * production builds). Used by the headless capture tool to teleport the local
 * player through the authoritative server, pin the camera for overview shots
 * and read draw-call statistics.
 */
import { Vector3 } from '@babylonjs/core/Maths/math';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { Scene } from '@babylonjs/core/scene';
import type { MapVisuals } from '../rendering/map';

export interface DevCameraOverride {
  position: Vector3;
  target: Vector3;
}

export interface MapDevHost {
  scene(): Scene | null;
  engine(): AbstractEngine | null;
  localId(): number | null;
  visuals(): MapVisuals | null;
  frameDrawCalls(): number;
  setCameraOverride(override: DevCameraOverride | null): void;
  /** Painted-art boot steps in ms (reported by stats() as `boot_<step>`). */
  bootTimings?(): Record<string, number>;
}

export interface MapDevTools {
  teleport(x: number, z: number, y?: number): Promise<unknown>;
  camera(px: number, py: number, pz: number, tx: number, ty: number, tz: number): void;
  releaseCamera(): void;
  stats(): Record<string, number>;
  /** Active meshes this frame grouped by name prefix (draw-call budgeting). */
  activeMeshGroups(): Record<string, number>;
  /** Comma-free helpers for the capture tool: `view('px py pz tx ty tz')`, `go('x z [y]')`. */
  view(spec: string): void;
  go(spec: string): Promise<unknown>;
}

declare global {
  interface Window {
    __ffMap?: MapDevTools;
  }
}

export function uninstallMapDevTools(): void {
  delete window.__ffMap;
}

export function installMapDevTools(host: MapDevHost): void {
  window.__ffMap = {
    async teleport(x: number, z: number, y?: number) {
      const id = host.localId();
      if (id === null) return { ok: false, reason: 'not connected' };
      const query = new URLSearchParams({ player: String(id), x: String(x), z: String(z) });
      if (y !== undefined) query.set('y', String(y));
      const response = await fetch(`/api/dev/teleport?${query.toString()}`, { method: 'POST' });
      return response.json();
    },
    camera(px: number, py: number, pz: number, tx: number, ty: number, tz: number) {
      host.setCameraOverride({ position: new Vector3(px, py, pz), target: new Vector3(tx, ty, tz) });
    },
    releaseCamera() {
      host.setCameraOverride(null);
    },
    view(spec: string) {
      const [px = 0, py = 0, pz = 0, tx = 0, ty = 0, tz = 0] = spec.trim().split(/\s+/).map(Number);
      host.setCameraOverride({ position: new Vector3(px, py, pz), target: new Vector3(tx, ty, tz) });
    },
    go(spec: string) {
      const [x = 0, z = 0, y] = spec.trim().split(/\s+/).map(Number);
      return this.teleport(x, z, y);
    },
    activeMeshGroups() {
      const groups: Record<string, number> = {};
      const active = host.scene()?.getActiveMeshes();
      if (!active) return groups;
      for (let index = 0; index < active.length; index += 1) {
        const name = active.data[index]?.name ?? '?';
        const key = name.replace(/[-_]?[0-9].*$/, '').replace(/-(?:alpine|lagoon)$/, '');
        groups[key] = (groups[key] ?? 0) + 1;
      }
      return groups;
    },
    stats() {
      const scene = host.scene();
      const visuals = host.visuals();
      return {
        drawCalls: host.frameDrawCalls(),
        activeMeshes: scene?.getActiveMeshes().length ?? 0,
        meshes: scene?.meshes.length ?? 0,
        materials: scene?.materials.length ?? 0,
        mapVertices: visuals?.vertexCount ?? 0,
        destructibleMeshes: visuals?.destructibleMeshes.size ?? 0,
        destructibleSprites: visuals?.destructibleSprites.size ?? 0,
        fps: Math.round(host.engine()?.getFps() ?? 0),
        ...Object.fromEntries(Object.entries(host.bootTimings?.() ?? {}).map(([step, ms]) => [`boot_${step}`, ms])),
      };
    },
  };
}
