/**
 * Optional painted art under `apps/client/public/art/` (provenance in
 * CREDITS.md, "Painted world art"). Every file is optional: the look falls back
 * to its procedural version when a file is missing. Files are probed with a
 * HEAD request first and only accepted when the server answers with an image
 * content type (the Vite dev server answers unknown paths with its SPA HTML
 * page, which is rejected here). On a static host without that fallback a
 * missing file shows up as a 404 in the network log; the game still runs.
 *
 * Contract (paths relative to art/), all loaded by scene-look.ts and
 * detail-textures.ts:
 *   sky/horizon-panorama.jpg   4096x1024 cylindrical horizon band, seamless
 *                              left/right; u = azimuth from +Z (north)
 *                              clockwise to +X (east); v = 0 top; horizon at
 *                              v = PANORAMA_HORIZON_V.
 *   clouds/cloud-01..08.png    painted cumulus with alpha (1024 px wide), one
 *                              per billboard slot on the cloud ring.
 *   tex/<name>.jpg             512x512 seamless, mid-grey neutral detail tiles:
 *                              snow, sand, grass, rock, wood_planks, log_wall,
 *                              shingles, cobblestone.
 *   tex/water_foam.png         512x512 seamless foam mask (RGB white, alpha =
 *                              foam) for open-water crest streaks.
 */
export const ART_BASE = `${import.meta.env.BASE_URL ?? '/'}art/`;

/** Panorama horizon line in texture v (0 = top). Match this to the delivered art. */
export const PANORAMA_HORIZON_V = 0.717;

/**
 * Vertical angle per unit of panorama v. Square pixels would be PI / 2 (1024 px
 * = 90 degrees), which makes the painted alps tower to ~30 degrees and wall off
 * the sky; 0.85 rad keeps the highest painted peak (v 0.384) near 16 degrees,
 * behind the map's own mountains, and puts the top of the band at ~35 degrees.
 */
export const PANORAMA_RADIANS_PER_V = 0.85;

const probes = new Map<string, Promise<boolean>>();

export function artUrl(path: string): string {
  return `${ART_BASE}${path}`;
}

export function probeArt(path: string): Promise<boolean> {
  const cached = probes.get(path);
  if (cached) return cached;
  const probe = (async () => {
    if (typeof fetch === 'undefined') return false;
    try {
      const response = await fetch(artUrl(path), { method: 'HEAD', cache: 'no-cache' });
      if (!response.ok) return false;
      const type = response.headers.get('content-type') ?? '';
      return type.startsWith('image/');
    } catch {
      return false;
    }
  })();
  probes.set(path, probe);
  return probe;
}

/** Loads an optional art image; resolves null when it is absent or broken. */
export async function loadArtImage(path: string): Promise<HTMLImageElement | null> {
  if (!(await probeArt(path))) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = artUrl(path);
  });
}

/**
 * Loads an image that a manifest lists (so it is expected to exist) without
 * the HEAD probe; resolves null when it is missing or not decodable.
 */
export function loadListedArtImage(path: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image.naturalWidth > 0 ? image : null);
    image.onerror = () => resolve(null);
    image.src = artUrl(path);
  });
}
