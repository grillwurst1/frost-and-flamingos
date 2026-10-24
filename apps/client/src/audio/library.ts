/**
 * Procedural SFX recipes supplied by the project owner.
 *
 * This module is a typed port of the reference soundboard. Every recipe is
 * synthesised at runtime with the Web Audio API; no sample files are used.
 * Recipes for later milestones are kept here so the exact sound design is
 * preserved, but they must only be triggered once their gameplay system
 * exists. Sounds that are not represented in this library (UI, jumping,
 * landing, rolling, splashing, swimming, parachute, ambience and music)
 * remain in `synth.ts`.
 */

export type NoiseColor = 'white' | 'pink' | 'brown';

/** A bus that may expose the shared outdoor convolution send. */
export interface SfxDestination extends AudioNode {
  reverbSend?: AudioNode;
}

export interface SfxRecipe {
  readonly id: string;
  readonly cat: string;
  readonly dur: number;
  play(ctx: AudioContext, dest: SfxDestination, t: number, pitch?: number): void;
}

/** Generates a reusable noise buffer with white, pink or brown spectrum. */
export function createNoiseBuffer(
  ctx: AudioContext,
  duration = 2.0,
  type: NoiseColor = 'white',
): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * duration));
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let lastOut = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (type === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
      b6 = white * 0.115926;
    } else if (type === 'brown') {
      const out = (lastOut + 0.02 * white) / 1.02;
      lastOut = out;
      data[i] = out * 3.2;
    } else {
      data[i] = white;
    }
  }
  return buf;
}

/** Soft saturation curve for the weapon and explosion recipes. */
export function makeSaturationCurve(drive = 35): Float32Array<ArrayBuffer> {
  const n = 44100;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * (1 + drive / 10));
  }
  return curve;
}

/**
 * Outdoor mountain impulse response with early rock-wall reflections and
 * distance-dependent high-frequency absorption.
 */
export function createOutdoorImpulseResponse(
  ctx: AudioContext,
  duration = 1.4,
  decay = 3.2,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * duration);
  const ir = ctx.createBuffer(1, len, sr);
  const data = ir.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const earlyBoost =
      (Math.abs(t - 0.055) < 0.008 ? 0.65 : 0) +
      (Math.abs(t - 0.135) < 0.012 ? 0.45 : 0) +
      (Math.abs(t - 0.245) < 0.015 ? 0.3 : 0);
    const env = Math.pow(1 - i / len, decay) + earlyBoost * Math.exp(-t * 4);
    const white = Math.random() * 2 - 1;
    const damp = Math.max(0.08, 1 - (t / duration) * 0.85);
    lp = lp + damp * (white - lp);
    data[i] = lp * env * 0.45;
  }
  return ir;
}

/** Modal resonances for wood, metal and rock impacts. */
export function triggerModalResonator(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  freqs: readonly number[],
  decays: readonly number[],
  gains: readonly number[],
  type: OscillatorType = 'sine',
): void {
  freqs.forEach((f, idx) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    const dec = decays[idx] ?? decays[0] ?? 0.1;
    const amp = gains[idx] ?? gains[0] ?? 0.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dec + 0.01);
  });
}

/** Metallic breech/trigger click used by the firearm recipes. */
export function triggerMechClick(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  freq1 = 3200,
  freq2 = 5400,
  amp = 0.25,
): void {
  const n = ctx.createBufferSource();
  n.buffer = createNoiseBuffer(ctx, 0.025);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq1;
  bp.Q.value = 4.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(amp, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
  n.connect(bp).connect(g).connect(dest);
  n.start(t);
  n.stop(t + 0.02);

  triggerModalResonator(ctx, dest, t, [freq1 * 0.8, freq2], [0.022, 0.015], [amp * 0.5, amp * 0.35], 'triangle');
}

/**
 * Complete recipe table. Categories are internal identifiers, not UI copy.
 */
export const SFX_LIBRARY = [
  // --- SEKTION 2: SLAPSTICK & KNOCKOUT (MIT REALISTISCHER METALL-/PHYSIK-TEXTUR) ---
  {
    id: 'SFX_HELMET_POP_PLING', cat: '2. Slapstick & Knockout', dur: 0.9,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // 1. Hartes Projektil-Aufprall-Klicken auf Stahl
      triggerMechClick(ctx, dest, t, 4200, 6800, 0.55);
      // 2. Modale Gusseisen-/Stahlhelm-Resonanz (6 unharmonische Teilfrequenzen statt nur 2 Töne)
      triggerModalResonator(
        ctx, dest, t,
        [890, 1850, 2780, 3920, 5340, 7100],
        [0.45, 0.65, 0.58, 0.35, 0.22, 0.12],
        [0.25, 0.40, 0.35, 0.20, 0.12, 0.08],
        'sine'
      );
      if (dest.reverbSend) {
        triggerModalResonator(ctx, dest.reverbSend, t, [1850, 2780], [0.65, 0.55], [0.3, 0.25], 'sine');
      }
      // 3. Aerodynamisches Wegflug-Sirren des rotierenden Helms (gefiltertes Rauschen + Doppler-Ton)
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 0.5, 'pink');
      bp.type = 'bandpass'; bp.Q.value = 6;
      bp.frequency.setValueAtTime(1100, t + 0.05);
      bp.frequency.exponentialRampToValueAtTime(3100, t + 0.42);
      ng.gain.setValueAtTime(0.001, t + 0.05);
      ng.gain.linearRampToValueAtTime(0.35, t + 0.12);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
      n.connect(bp).connect(ng).connect(dest);
      n.start(t + 0.05); n.stop(t + 0.5);
    }
  },
  {
    id: 'SFX_PINBALL_BOING', cat: '2. Slapstick & Knockout', dur: 0.7,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Satter Gummi-Aufprall-Transient (PVC-Ball / Bauch-Wumms)
      const thud = ctx.createOscillator(), tg = ctx.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(150, t);
      thud.frequency.exponentialRampToValueAtTime(48, t + 0.09);
      tg.gain.setValueAtTime(0.85, t);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      thud.connect(tg).connect(dest);
      thud.start(t); thud.stop(t + 0.11);

      // Elastische Gummi-Membran-Schwingung mit realistischer Dämpfung
      const osc = ctx.createOscillator(), lfo = ctx.createOscillator(), lfoG = ctx.createGain();
      const bp = ctx.createBiquadFilter(), g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(115, t);
      osc.frequency.exponentialRampToValueAtTime(340, t + 0.07);
      osc.frequency.exponentialRampToValueAtTime(145, t + 0.55);
      lfo.frequency.value = 11; lfoG.gain.setValueAtTime(45, t);
      lfoG.gain.exponentialRampToValueAtTime(4, t + 0.5);
      lfo.connect(lfoG).connect(osc.frequency);
      bp.type = 'lowpass'; bp.frequency.setValueAtTime(1400, t);
      bp.frequency.exponentialRampToValueAtTime(380, t + 0.55);
      g.gain.setValueAtTime(0.65, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.58);
      osc.connect(bp).connect(g).connect(dest);
      osc.start(t); lfo.start(t); osc.stop(t + 0.6); lfo.stop(t + 0.6);
    }
  },
  {
    id: 'SFX_BLAST_LAUNCH_WHISTLE', cat: '2. Slapstick & Knockout', dur: 1.65,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // 1. Druckvoller Explosions-Kick + Luft-Rauschen
      const kick = ctx.createOscillator(), kg = ctx.createGain();
      kick.frequency.setValueAtTime(135, t);
      kick.frequency.exponentialRampToValueAtTime(30, t + 0.22);
      kg.gain.setValueAtTime(0.9, t);
      kg.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      kick.connect(kg).connect(dest);
      kick.start(t); kick.stop(t + 0.25);

      // 2. Aerodynamisches Raketen-/Luft-Heulen (Kombination aus Wind-Turbulenz + Pfeif-Resonanz)
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 1.35, 'pink');
      bp.type = 'bandpass'; bp.Q.value = 12;
      bp.frequency.setValueAtTime(2200, t + 0.12);
      bp.frequency.exponentialRampToValueAtTime(460, t + 1.38);
      ng.gain.setValueAtTime(0.01, t + 0.12);
      ng.gain.linearRampToValueAtTime(0.65, t + 0.22);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      n.connect(bp).connect(ng).connect(dest);
      if (dest.reverbSend) ng.connect(dest.reverbSend);
      n.start(t + 0.12); n.stop(t + 1.42);

      // 3. Entferntes Aufblitz-Pling am Horizont
      triggerModalResonator(ctx, dest, t + 1.42, [2950, 4420], [0.16, 0.12], [0.18, 0.12], 'sine');
    }
  },
  {
    id: 'SFX_ELEMENTAL_FREEZE_SHATTER', cat: '2. Slapstick & Knockout', dur: 1.0,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Phase 1: Echtes Zufrieren (Knirschende Eis-Spannung + kristalline Obertöne)
      for (let i = 0; i < 12; i++) {
        const st = t + i * 0.022;
        triggerMechClick(ctx, dest, st, 2400 + i * 220, 4800 + i * 300, 0.22);
      }
      // Phase 2: Schweres Zerspringen in massive Eisbrocken (Modal Glass/Ice Shatter)
      const impact = ctx.createOscillator(), ig = ctx.createGain();
      impact.frequency.setValueAtTime(140, t + 0.3);
      impact.frequency.exponentialRampToValueAtTime(38, t + 0.42);
      ig.gain.setValueAtTime(0.6, t + 0.3);
      ig.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
      impact.connect(ig).connect(dest);
      impact.start(t + 0.3); impact.stop(t + 0.45);

      for (let i = 0; i < 22; i++) {
        const st = t + 0.3 + Math.pow(Math.random(), 1.4) * 0.52;
        const baseF = 1800 + Math.random() * 4200;
        triggerModalResonator(ctx, dest, st, [baseF, baseF * 1.48], [0.065, 0.04], [0.22, 0.14], 'sine');
      }
    }
  },
  {
    id: 'SFX_ELEMENTAL_ASH_PUFF', cat: '2. Slapstick & Knockout', dur: 0.75,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Trockenes Zusammenfallen eines Aschehaufens (Pink/Brown Noise mit sanfter Textur)
      const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 0.5, 'pink');
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(950, t);
      lp.frequency.exponentialRampToValueAtTime(220, t + 0.42);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.65, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      n.connect(lp).connect(g).connect(dest);
      n.start(t); n.stop(t + 0.46);

      // Dumpfes Landen des Hutes auf Asche
      triggerModalResonator(ctx, dest, t + 0.46, [95, 185], [0.09, 0.05], [0.45, 0.2], 'triangle');
    }
  },
  {
    id: 'SFX_CUCKOO_CLOCK_POP', cat: '2. Slapstick & Knockout', dur: 0.75,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Mechanisches Holz-Tür-Aufspringen + Spiralfeder
      triggerModalResonator(ctx, dest, t, [220, 480, 1150], [0.06, 0.08, 0.12], [0.4, 0.3, 0.2], 'triangle');
      // Echtes hölzernes Orgelpfeifen-"Kuck-uck!" (mit Anblas-Luftgeräusch!)
      [[784, t + 0.12, 0.13], [622.25, t + 0.32, 0.24]].forEach(([freq, st, d]) => {
        // Anblas-Hauch (Chiff)
        const chiff = ctx.createBufferSource(), cbp = ctx.createBiquadFilter(), cg = ctx.createGain();
        chiff.buffer = createNoiseBuffer(ctx, 0.05, 'pink');
        cbp.type = 'bandpass'; cbp.frequency.value = freq * 2; cbp.Q.value = 3;
        cg.gain.setValueAtTime(0.25, st);
        cg.gain.exponentialRampToValueAtTime(0.001, st + 0.035);
        chiff.connect(cbp).connect(cg).connect(dest);
        chiff.start(st); chiff.stop(st + 0.04);

        // Gedackte Holzpfeife (Grundton + leise Duodezime)
        triggerModalResonator(ctx, dest, st, [freq, freq * 3], [d, d * 0.5], [0.45, 0.08], 'sine');
      });
    }
  },
  {
    id: 'SFX_COMIC_HIT_THWACK', cat: '2. Slapstick & Knockout', dur: 0.22,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Satter physischer Körper-Treffer (Leder/Kleidung-Impact + tiefer Brust-Thud)
      const sub = ctx.createOscillator(), sg = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(165, t);
      sub.frequency.exponentialRampToValueAtTime(42, t + 0.075);
      sg.gain.setValueAtTime(0.85, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
      sub.connect(sg).connect(dest);
      sub.start(t); sub.stop(t + 0.09);

      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ws = ctx.createWaveShaper(), ng = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 0.08, 'pink');
      bp.type = 'bandpass'; bp.frequency.value = 950; bp.Q.value = 1.2;
      ws.curve = makeSaturationCurve(25);
      ng.gain.setValueAtTime(0.75, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      n.connect(bp).connect(ws).connect(ng).connect(dest);
      n.start(t); n.stop(t + 0.06);
    }
  },

  // --- SEKTION 3.1: CORE FIREARMS (REALISTISCHE BALLISTIK & MECHANIK) ---
  {
    id: 'SFX_WEAPON_SNIPER', cat: '3.1 Core Firearms (Realistic)', dur: 1.85,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // 1. SUPERSONIC BALLISTIC CRACK (0.000s - extrem scharfer Überschall-Impuls, KEIN Laser-Sweep!)
      const crack = ctx.createBufferSource(), cHp = ctx.createBiquadFilter(), cWs = ctx.createWaveShaper(), cG = ctx.createGain();
      crack.buffer = createNoiseBuffer(ctx, 0.03, 'white');
      cHp.type = 'bandpass'; cHp.frequency.value = 3800; cHp.Q.value = 1.1;
      cWs.curve = makeSaturationCurve(80);
      cG.gain.setValueAtTime(1.0, t);
      cG.gain.exponentialRampToValueAtTime(0.01, t + 0.012);
      crack.connect(cHp).connect(cWs).connect(cG).connect(dest);
      crack.start(t); crack.stop(t + 0.015);

      // 2. MUZZLE BLAST & CHEST THUMP (0.002s - Explosions-Druckwelle aus dem Lauf)
      const punch = ctx.createOscillator(), pWs = ctx.createWaveShaper(), pG = ctx.createGain();
      punch.type = 'sine';
      punch.frequency.setValueAtTime(135, t);
      punch.frequency.exponentialRampToValueAtTime(28, t + 0.065);
      pWs.curve = makeSaturationCurve(45);
      pG.gain.setValueAtTime(0.95, t);
      pG.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      punch.connect(pWs).connect(pG).connect(dest);
      punch.start(t); punch.stop(t + 0.095);

      // Breitbandige Pulver-Detonation (Pink/Brown Noise mit dynamischem Tiefpass)
      const blast = ctx.createBufferSource(), bLp = ctx.createBiquadFilter(), bWs = ctx.createWaveShaper(), bG = ctx.createGain();
      blast.buffer = createNoiseBuffer(ctx, 0.45, 'pink');
      bLp.type = 'lowpass';
      bLp.frequency.setValueAtTime(4800, t);
      bLp.frequency.exponentialRampToValueAtTime(320, t + 0.28);
      bWs.curve = makeSaturationCurve(50);
      bG.gain.setValueAtTime(0.95, t + 0.002);
      bG.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      blast.connect(bLp).connect(bWs).connect(bG).connect(dest);
      if (dest.reverbSend) bG.connect(dest.reverbSend);
      blast.start(t); blast.stop(t + 0.35);

      // 3. NATÜRLICHES GEBIRGS-ECHO (Diffuse Felswand-Reflexionen statt Roboter-Delay)
      const tail = ctx.createBufferSource(), tBp = ctx.createBiquadFilter(), tG = ctx.createGain();
      tail.buffer = createNoiseBuffer(ctx, 1.5, 'brown');
      tBp.type = 'lowpass';
      tBp.frequency.setValueAtTime(1200, t + 0.06);
      tBp.frequency.exponentialRampToValueAtTime(240, t + 1.45);
      tG.gain.setValueAtTime(0.001, t);
      tG.gain.linearRampToValueAtTime(0.42, t + 0.08);
      tG.gain.setValueAtTime(0.32, t + 0.22); // Zweite Bergwand-Reflexion
      tG.gain.exponentialRampToValueAtTime(0.0008, t + 1.5);
      tail.connect(tBp).connect(tG).connect(dest);
      if (dest.reverbSend) tG.connect(dest.reverbSend);
      tail.start(t); tail.stop(t + 1.52);

      // 4. BOLT-ACTION REPETIEREN (0.65s: Kammerstängel auf -> Hülse raus -> Kammer zu)
      triggerMechClick(ctx, dest, t + 0.65, 2900, 5200, 0.28); // Entriegeln
      triggerMechClick(ctx, dest, t + 0.76, 3600, 6100, 0.32); // Zurückziehen
      triggerModalResonator(ctx, dest, t + 0.85, [5100, 7400], [0.08, 0.06], [0.12, 0.08], 'sine'); // Messinghülse
      triggerMechClick(ctx, dest, t + 0.98, 2600, 4800, 0.35); // Verriegeln
    }
  },
  {
    id: 'SFX_WEAPON_SMG', cat: '3.1 Core Firearms (Realistic)', dur: 0.28,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      const p = 1 + (Math.random() * 0.06 - 0.03);
      // Knackiger 9mm Mündungsknall
      const sub = ctx.createOscillator(), sg = ctx.createGain();
      sub.frequency.setValueAtTime(155 * p, t);
      sub.frequency.exponentialRampToValueAtTime(48 * p, t + 0.038);
      sg.gain.setValueAtTime(0.7, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      sub.connect(sg).connect(dest);
      sub.start(t); sub.stop(t + 0.05);

      const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), ws = ctx.createWaveShaper(), ng = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 0.14, 'pink');
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(5200 * p, t);
      lp.frequency.exponentialRampToValueAtTime(600, t + 0.09);
      ws.curve = makeSaturationCurve(40);
      ng.gain.setValueAtTime(0.75, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      n.connect(lp).connect(ws).connect(ng).connect(dest);
      if (dest.reverbSend) ng.connect(dest.reverbSend);
      n.start(t); n.stop(t + 0.11);

      // Metallischer Verschluss (Bolt Snap)
      triggerMechClick(ctx, dest, t + 0.015, 3800, 6200, 0.28);
    }
  },
  {
    id: 'SFX_WEAPON_SHOTGUN', cat: '3.1 Core Firearms (Realistic)', dur: 0.85,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // 12-Gauge Brustkorb-Druckwelle
      const sub = ctx.createOscillator(), ws = ctx.createWaveShaper(), sg = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(115, t);
      sub.frequency.exponentialRampToValueAtTime(26, t + 0.12);
      ws.curve = makeSaturationCurve(55);
      sg.gain.setValueAtTime(0.95, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      sub.connect(ws).connect(sg).connect(dest);
      sub.start(t); sub.stop(t + 0.16);

      // Breiter Schrot-Mündungsknall
      const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), ng = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 0.35, 'pink');
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(4200, t);
      lp.frequency.exponentialRampToValueAtTime(280, t + 0.28);
      ng.gain.setValueAtTime(0.9, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      n.connect(lp).connect(ng).connect(dest);
      if (dest.reverbSend) ng.connect(dest.reverbSend);
      n.start(t); n.stop(t + 0.32);

      // Realistisches Pump-Action Nachladen ("Tschk-Tschack!" mit Gleitschienen-Reibung)
      [t + 0.38, t + 0.52].forEach((st, idx) => {
        const slide = ctx.createBufferSource(), sbp = ctx.createBiquadFilter(), sg2 = ctx.createGain();
        slide.buffer = createNoiseBuffer(ctx, 0.08, 'white');
        sbp.type = 'bandpass'; sbp.frequency.value = idx === 0 ? 2100 : 2750; sbp.Q.value = 3.5;
        sg2.gain.setValueAtTime(0.01, st);
        sg2.gain.linearRampToValueAtTime(0.42, st + 0.015);
        sg2.gain.exponentialRampToValueAtTime(0.001, st + 0.065);
        slide.connect(sbp).connect(sg2).connect(dest);
        slide.start(st); slide.stop(st + 0.07);
        triggerMechClick(ctx, dest, st + 0.04, idx === 0 ? 2800 : 3500, 5800, 0.4);
      });
    }
  },
  {
    id: 'SFX_WEAPON_LMG', cat: '3.1 Core Firearms (Realistic)', dur: 0.3,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Schwerer, metallisch-wuchtiger Kaliber-.308 Schuss
      const sub = ctx.createOscillator(), sg = ctx.createGain();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(125, t);
      sub.frequency.exponentialRampToValueAtTime(38, t + 0.055);
      sg.gain.setValueAtTime(0.85, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
      sub.connect(sg).connect(dest);
      sub.start(t); sub.stop(t + 0.07);

      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ws = ctx.createWaveShaper(), ng = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 0.18, 'pink');
      bp.type = 'lowpass';
      bp.frequency.setValueAtTime(3800, t);
      bp.frequency.exponentialRampToValueAtTime(420, t + 0.14);
      ws.curve = makeSaturationCurve(45);
      ng.gain.setValueAtTime(0.8, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      n.connect(bp).connect(ws).connect(ng).connect(dest);
      if (dest.reverbSend) ng.connect(dest.reverbSend);
      n.start(t); n.stop(t + 0.16);

      // Patronengurt-Rasseln & Messinghülse
      triggerMechClick(ctx, dest, t + 0.02, 3100, 4900, 0.35);
      triggerModalResonator(ctx, dest, t + 0.08, [4850, 7100, 9200], [0.07, 0.05, 0.03], [0.16, 0.12, 0.08], 'sine');
    }
  },
  {
    id: 'SFX_WEAPON_BAZOOKA', cat: '3.1 Core Firearms (Realistic)', dur: 0.95,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Hohler Rohr-Rückstoß (Tube Thump)
      triggerModalResonator(ctx, dest, t, [88, 176, 290], [0.14, 0.12, 0.08], [0.7, 0.4, 0.25], 'triangle');
      // Feststoffraketen-Triebwerk ("FWOOSH!" mit Turbulenz)
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ws = ctx.createWaveShaper(), g = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 0.85, 'pink');
      bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(280, t);
      bp.frequency.exponentialRampToValueAtTime(1500, t + 0.14);
      bp.frequency.exponentialRampToValueAtTime(420, t + 0.8);
      ws.curve = makeSaturationCurve(30);
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.85, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.82);
      n.connect(bp).connect(ws).connect(g).connect(dest);
      if (dest.reverbSend) g.connect(dest.reverbSend);
      n.start(t); n.stop(t + 0.85);
    }
  },
  {
    id: 'SFX_WEAPON_SILENCED_PISTOL', cat: '3.1 Core Firearms (Realistic)', dur: 0.2,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Echter Schalldämpfer: Komprimiertes Gas-Zischen + kräftiges Verschluss-Klacken (kein Cartoon-"Pew"!)
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 0.08, 'white');
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2400, t);
      bp.frequency.exponentialRampToValueAtTime(900, t + 0.055);
      bp.Q.value = 1.8;
      g.gain.setValueAtTime(0.65, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      n.connect(bp).connect(g).connect(dest);
      n.start(t); n.stop(t + 0.065);

      const thump = ctx.createOscillator(), tg = ctx.createGain();
      thump.frequency.setValueAtTime(180, t);
      thump.frequency.exponentialRampToValueAtTime(65, t + 0.035);
      tg.gain.setValueAtTime(0.5, t);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      thump.connect(tg).connect(dest);
      thump.start(t); thump.stop(t + 0.045);

      triggerMechClick(ctx, dest, t + 0.018, 3900, 6400, 0.42);
    }
  },
  {
    id: 'SFX_WEAPON_MELEE_SWING', cat: '3.1 Core Firearms (Realistic)', dur: 0.35,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Schwerer, scharfer Luft-Schwung einer Hellebarde/Klinge
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 0.25, 'pink');
      bp.type = 'bandpass'; bp.Q.value = 2.2;
      bp.frequency.setValueAtTime(180, t);
      bp.frequency.exponentialRampToValueAtTime(1150, t + 0.09);
      bp.frequency.exponentialRampToValueAtTime(260, t + 0.22);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.75, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.23);
      n.connect(bp).connect(g).connect(dest);
      n.start(t); n.stop(t + 0.24);
    }
  },

  // --- SEKTION 3.2: GIMMICK WAFFEN ---
  {
    id: 'SFX_GIMMICK_SNOW_CANNON', cat: '3.2 Gimmick Weapons', dur: 1.1,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Hochdruck-Luftdüse + Eiskristall-Prasseln
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 1.05, 'pink');
      bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.2;
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.65, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      n.connect(bp).connect(g).connect(dest);
      n.start(t); n.stop(t + 1.02);

      // Dezentes Gebläse-Summen im Hintergrund
      const turb = ctx.createOscillator(), tlp = ctx.createBiquadFilter(), tg = ctx.createGain();
      turb.type = 'triangle';
      turb.frequency.setValueAtTime(160, t);
      turb.frequency.exponentialRampToValueAtTime(480, t + 0.25);
      tlp.type = 'lowpass'; tlp.frequency.value = 600;
      tg.gain.setValueAtTime(0.18, t);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 0.98);
      turb.connect(tlp).connect(tg).connect(dest);
      turb.start(t); turb.stop(t + 1.0);
    }
  },
  {
    id: 'SFX_GIMMICK_SAND_FLAMER', cat: '3.2 Gimmick Weapons', dur: 1.0,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Tiefes, turbulentes Gasbrenner-Fauchen (Brown/Pink Noise mit Druck-Modulation)
      const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), ws = ctx.createWaveShaper(), g = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 0.95, 'brown');
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(650, t);
      lp.frequency.exponentialRampToValueAtTime(340, t + 0.9);
      ws.curve = makeSaturationCurve(30);
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.85, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.92);
      n.connect(lp).connect(ws).connect(g).connect(dest);
      n.start(t); n.stop(t + 0.95);
    }
  },
  {
    id: 'SFX_GIMMICK_CROSSBOW_HARPOON', cat: '3.2 Gimmick Weapons', dur: 0.75,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Trockenes Wurfarm-Schnalzen + Stahlseil-Freigabe
      triggerModalResonator(ctx, dest, t, [145, 290, 620], [0.12, 0.08, 0.05], [0.65, 0.35, 0.25], 'triangle');
      triggerMechClick(ctx, dest, t, 3400, 5800, 0.45);
      // Realistische mechanische Seilwinden-Ratsche
      for (let i = 0; i < 14; i++) {
        const st = t + 0.1 + i * 0.032;
        triggerMechClick(ctx, dest, st, 2400 + i * 60, 4800, 0.22);
      }
    }
  },
  {
    id: 'SFX_GIMMICK_UMBRELLA', cat: '3.2 Gimmick Weapons', dur: 0.65,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Straffes Stoff-Aufspannen ("FLUMP!")
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 0.16, 'pink');
      bp.type = 'bandpass'; bp.frequency.setValueAtTime(420, t); bp.frequency.exponentialRampToValueAtTime(160, t + 0.12);
      g.gain.setValueAtTime(0.85, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      n.connect(bp).connect(g).connect(dest);
      n.start(t); n.stop(t + 0.15);
      triggerMechClick(ctx, dest, t + 0.06, 2900, 5100, 0.35); // Schirm-Arretierung

      // Echter Querschläger-Abpraller (Ricochet)
      [t + 0.22, t + 0.38].forEach((st, idx) => {
        triggerMechClick(ctx, dest, st, 4500, 7200, 0.35);
        const ric = ctx.createOscillator(), rg = ctx.createGain();
        ric.type = 'sine';
        ric.frequency.setValueAtTime(idx === 0 ? 2800 : 3400, st);
        ric.frequency.exponentialRampToValueAtTime(950, st + 0.16);
        rg.gain.setValueAtTime(0.28, st);
        rg.gain.exponentialRampToValueAtTime(0.001, st + 0.17);
        ric.connect(rg).connect(dest);
        ric.start(st); ric.stop(st + 0.18);
      });
    }
  },
  {
    id: 'SFX_GIMMICK_ALPHORN_SONIC', cat: '3.2 Gimmick Weapons', dur: 1.85,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Warmes, holziges Naturhorn-Ensemble mit Formant-Filter und echtem Gebirgs-Hall
      [55, 110, 164.81, 220, 277.18].forEach((freq, idx) => {
        const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = idx === 0 ? 'sine' : 'sawtooth';
        o.frequency.setValueAtTime(freq * 0.98, t);
        o.frequency.linearRampToValueAtTime(freq, t + 0.25); // Natürliches Einschwingen der Lippen
        lp.type = 'lowpass'; lp.frequency.value = 680;
        bp.type = 'peaking'; bp.frequency.value = 340; bp.gain.value = 8; // Holz-Korpus-Formant
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.28, t + 0.45);
        g.gain.setValueAtTime(0.32, t + 0.9);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 1.75);
        o.connect(bp).connect(lp).connect(g).connect(dest);
        if (dest.reverbSend) g.connect(dest.reverbSend);
        o.start(t); o.stop(t + 1.8);
      });
    }
  },

  // --- SEKTION 4: REALISTISCHE SCHRITTE (FOLEY) & WIDGETS ---
  {
    id: 'SFX_FOOTSTEP_SNOW', cat: '4. Realistic Footsteps & Widgets', dur: 0.45,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Doppelschritt im tiefen Schnee (Granulares Eiskristall-Knirschen + dumpfe Schneeverdichtung)
      [0, 0.22].forEach((stepOff, sIdx) => {
        const st = t + stepOff;
        // 1. Dumpfe Schuhsohlen-Verdichtung im Pulverschnee
        const thud = ctx.createOscillator(), tg = ctx.createGain();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(115, st);
        thud.frequency.exponentialRampToValueAtTime(48, st + 0.08);
        tg.gain.setValueAtTime(0.35, st);
        tg.gain.exponentialRampToValueAtTime(0.001, st + 0.09);
        thud.connect(tg).connect(dest);
        thud.start(st); thud.stop(st + 0.1);

        // 2. Granulares Schnee-Knirschen (18 asynchrone Mikro-Körner über Ferse -> Zehenballen)
        for (let g = 0; g < 18; g++) {
          const gt = st + (g / 18) * 0.13 + Math.random() * 0.008;
          // Doppel-Peak Hüllkurve (Ferse stark, kurzes Tal, Zehenballen mittel)
          const phase = g / 18;
          const env = (Math.exp(-Math.pow((phase - 0.2) * 5, 2)) + 0.65 * Math.exp(-Math.pow((phase - 0.75) * 4, 2))) * (sIdx === 0 ? 1 : 0.88);
          const grain = ctx.createBufferSource(), bp1 = ctx.createBiquadFilter(), gg = ctx.createGain();
          grain.buffer = createNoiseBuffer(ctx, 0.022, 'pink');
          bp1.type = 'bandpass';
          bp1.frequency.value = 1250 + Math.random() * 1900;
          bp1.Q.value = 2.8;
          gg.gain.setValueAtTime(0.42 * env, gt);
          gg.gain.exponentialRampToValueAtTime(0.001, gt + 0.018);
          grain.connect(bp1).connect(gg).connect(dest);
          grain.start(gt); grain.stop(gt + 0.02);
        }
      });
    }
  },
  {
    id: 'SFX_FOOTSTEP_SAND', cat: '4. Realistic Footsteps & Widgets', dur: 0.45,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Doppelschritt im trockenen Strandsand (Weicher Fersen-Impact + gleitende Sandkorn-Reibung)
      [0, 0.22].forEach(stepOff => {
        const st = t + stepOff;
        const thud = ctx.createOscillator(), tg = ctx.createGain();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(92, st);
        thud.frequency.exponentialRampToValueAtTime(42, st + 0.065);
        tg.gain.setValueAtTime(0.4, st);
        tg.gain.exponentialRampToValueAtTime(0.001, st + 0.07);
        thud.connect(tg).connect(dest);
        thud.start(st); thud.stop(st + 0.075);

        const sand = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), sg = ctx.createGain();
        sand.buffer = createNoiseBuffer(ctx, 0.16, 'pink');
        bp.type = 'bandpass'; bp.Q.value = 1.4;
        bp.frequency.setValueAtTime(520, st);
        bp.frequency.linearRampToValueAtTime(1050, st + 0.055);
        bp.frequency.linearRampToValueAtTime(640, st + 0.14);
        lp.type = 'lowpass'; lp.frequency.value = 2200;
        sg.gain.setValueAtTime(0.001, st);
        sg.gain.linearRampToValueAtTime(0.55, st + 0.018);
        sg.gain.setValueAtTime(0.28, st + 0.06);
        sg.gain.linearRampToValueAtTime(0.42, st + 0.095); // Abrollen über die Zehen
        sg.gain.exponentialRampToValueAtTime(0.001, st + 0.145);
        sand.connect(bp).connect(lp).connect(sg).connect(dest);
        sand.start(st); sand.stop(st + 0.15);
      });
    }
  },
  {
    id: 'SFX_FOOTSTEP_WOOD', cat: '4. Realistic Footsteps & Widgets', dur: 0.45,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Realistischer Stiefelschritt auf Holzplanken (Kein Sinus-Piepen! Modale Planken-Resonanz + Sohlen-Klick)
      [0, 0.22].forEach((stepOff, idx) => {
        const st = t + stepOff;
        const p = idx === 0 ? 1.0 : 0.94;
        // 1. Fersen-Aufprall (Heel Strike)
        const sole = ctx.createBufferSource(), sbp = ctx.createBiquadFilter(), sg = ctx.createGain();
        sole.buffer = createNoiseBuffer(ctx, 0.03, 'pink');
        sbp.type = 'bandpass'; sbp.frequency.value = 950 * p; sbp.Q.value = 2.0;
        sg.gain.setValueAtTime(0.65, st);
        sg.gain.exponentialRampToValueAtTime(0.001, st + 0.022);
        sole.connect(sbp).connect(sg).connect(dest);
        sole.start(st); sole.stop(st + 0.025);

        // Hohle Holzplanken-Moden (Stark gedämpft!)
        triggerModalResonator(ctx, dest, st, [108 * p, 232 * p, 485 * p], [0.055, 0.04, 0.025], [0.55, 0.32, 0.18], 'triangle');

        // 2. Zehenballen-Abrollen (Toe Tap +45ms später)
        triggerModalResonator(ctx, dest, st + 0.045, [135 * p, 310 * p], [0.035, 0.022], [0.28, 0.16], 'triangle');
      });
    }
  },
  {
    id: 'SFX_FOOTSTEP_FLIPPERS', cat: '4. Realistic Footsteps & Widgets', dur: 0.45,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Nasse Gummiflossen-Schritte (Breiter Gummi-Klatscher auf Boden + kurzes Neopren-Reiben)
      [0, 0.22].forEach((stepOff, idx) => {
        const st = t + stepOff;
        // Breiter Gummi-Slap
        const slap = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), sg = ctx.createGain();
        slap.buffer = createNoiseBuffer(ctx, 0.07, 'pink');
        bp.type = 'bandpass'; bp.frequency.setValueAtTime(680, st); bp.frequency.exponentialRampToValueAtTime(1450, st + 0.045);
        bp.Q.value = 2.2;
        sg.gain.setValueAtTime(0.75, st);
        sg.gain.exponentialRampToValueAtTime(0.001, st + 0.055);
        slap.connect(bp).connect(sg).connect(dest);
        slap.start(st); slap.stop(st + 0.06);

        // Dezentes, organisches Gummi-Reib-Quietschen
        const rub = ctx.createOscillator(), rbp = ctx.createBiquadFilter(), rg = ctx.createGain();
        rub.type = 'triangle';
        const f = idx === 0 ? 580 : 640;
        rub.frequency.setValueAtTime(f, st + 0.02);
        rub.frequency.exponentialRampToValueAtTime(f * 1.55, st + 0.075);
        rbp.type = 'bandpass'; rbp.frequency.value = 1100; rbp.Q.value = 4;
        rg.gain.setValueAtTime(0.28, st + 0.02);
        rg.gain.exponentialRampToValueAtTime(0.001, st + 0.08);
        rub.connect(rbp).connect(rg).connect(dest);
        rub.start(st + 0.02); rub.stop(st + 0.085);
      });
    }
  },
  {
    id: 'SFX_ICE_SLIDE', cat: '4. Realistic Footsteps & Widgets', dur: 0.75,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Scharfes Schlittschuh-/Sohlen-Schaben auf blankem Eis
      const ice = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
      ice.buffer = createNoiseBuffer(ctx, 0.7, 'white');
      bp.type = 'bandpass'; bp.Q.value = 3.5;
      bp.frequency.setValueAtTime(2600, t);
      bp.frequency.exponentialRampToValueAtTime(4200, t + 0.35);
      bp.frequency.exponentialRampToValueAtTime(2100, t + 0.68);
      hp.type = 'highpass'; hp.frequency.value = 1800;
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.45, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.68);
      ice.connect(bp).connect(hp).connect(g).connect(dest);
      ice.start(t); ice.stop(t + 0.7);
    }
  },
  {
    id: 'SFX_WRENCH_REPAIR', cat: '4. Realistic Footsteps & Widgets', dur: 1.0,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // 1. Echter Schraubenschlüssel-Schlag auf Stahlbolzen (Modale Metall-Resonanz)
      [0, 0.28].forEach((off, idx) => {
        const st = t + off;
        const p = idx === 0 ? 1.0 : 1.12;
        triggerMechClick(ctx, dest, st, 3500 * p, 6100 * p, 0.5);
        triggerModalResonator(ctx, dest, st, [720 * p, 1480 * p, 2910 * p, 4650 * p], [0.14, 0.11, 0.08, 0.05], [0.35, 0.28, 0.2, 0.12], 'sine');
      });
      // 2. Schwerer Holzhammer-Schlag auf Balken
      [0.55, 0.76].forEach(off => {
        const st = t + off;
        triggerModalResonator(ctx, dest, st, [115, 245, 520], [0.09, 0.06, 0.035], [0.65, 0.4, 0.25], 'triangle');
      });
    }
  },
  {
    id: 'SFX_SNACK_HEAL', cat: '4. Realistic Footsteps & Widgets', dur: 0.85,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Knackiges Abbeißen & Schlürfen mit organischer Filterung
      [0, 0.22, 0.44].forEach(off => {
        const st = t + off;
        const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        n.buffer = createNoiseBuffer(ctx, 0.12, 'pink');
        bp.type = 'bandpass'; bp.frequency.setValueAtTime(650, st); bp.frequency.exponentialRampToValueAtTime(1400, st + 0.09);
        bp.Q.value = 2.5;
        g.gain.setValueAtTime(0.55, st);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.1);
        n.connect(bp).connect(g).connect(dest);
        n.start(st); n.stop(st + 0.11);
      });
    }
  },

  // --- SEKTION 5: REALISTISCHE ZERSTÖRUNG, BRÄNDE & EXPLOSIONEN ---
  {
    id: 'SFX_EXPLOSION_CRATER', cat: '5. Destruction & Explosions', dur: 1.7,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Layer 1: Subsonische Druckwelle (Shockwave)
      const sub = ctx.createOscillator(), ws = ctx.createWaveShaper(), sg = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(98, t);
      sub.frequency.exponentialRampToValueAtTime(22, t + 0.55);
      ws.curve = makeSaturationCurve(50);
      sg.gain.setValueAtTime(1.0, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      sub.connect(ws).connect(sg).connect(dest);
      sub.start(t); sub.stop(t + 0.68);

      // Layer 2: Breitbandige Detonation + Rumpeln
      const det = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), dWs = ctx.createWaveShaper(), dg = ctx.createGain();
      det.buffer = createNoiseBuffer(ctx, 1.55, 'brown');
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(4200, t);
      lp.frequency.exponentialRampToValueAtTime(140, t + 1.45);
      dWs.curve = makeSaturationCurve(65);
      dg.gain.setValueAtTime(0.95, t);
      dg.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      det.connect(lp).connect(dWs).connect(dg).connect(dest);
      if (dest.reverbSend) dg.connect(dest.reverbSend);
      det.start(t); det.stop(t + 1.55);

      // Layer 3: Herabprasselnde Erd- und Gesteinsbrocken (Debris)
      for (let i = 0; i < 16; i++) {
        const dt = t + 0.25 + Math.random() * 1.1;
        triggerModalResonator(ctx, dest, dt, [140 + Math.random() * 350, 600 + Math.random() * 900], [0.05, 0.03], [0.22, 0.12], 'triangle');
      }
    }
  },
  {
    id: 'SFX_BUILDING_FIRE_LOOP', cat: '5. Destruction & Explosions', dur: 1.4,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Tiefes Flammen-Wummern (Brown Noise) + echtes stochastisches Holz-Knacken
      const rumble = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), rg = ctx.createGain();
      rumble.buffer = createNoiseBuffer(ctx, 1.35, 'brown');
      lp.type = 'lowpass'; lp.frequency.value = 260;
      rg.gain.setValueAtTime(0.55, t);
      rg.gain.exponentialRampToValueAtTime(0.01, t + 1.3);
      rumble.connect(lp).connect(rg).connect(dest);
      rumble.start(t); rumble.stop(t + 1.35);

      for (let i = 0; i < 18; i++) {
        const ct = t + Math.random() * 1.25;
        triggerMechClick(ctx, dest, ct, 1800 + Math.random() * 2200, 4500, 0.28);
      }
    }
  },
  {
    id: 'SFX_BUILDING_COLLAPSE', cat: '5. Destruction & Explosions', dur: 1.8,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Berstende Holzbalken + einstürzendes Mauerwerk + Staubwolke
      [0, 0.18, 0.42, 0.75].forEach((off, idx) => {
        const st = t + off;
        triggerModalResonator(ctx, dest, st, [75 + idx * 15, 165, 340], [0.25, 0.18, 0.12], [0.7, 0.45, 0.3], 'triangle');
        for (let k = 0; k < 6; k++) {
          triggerMechClick(ctx, dest, st + k * 0.025, 1200 + Math.random() * 1800, 3200, 0.4);
        }
      });
      const dust = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), dg = ctx.createGain();
      dust.buffer = createNoiseBuffer(ctx, 1.7, 'brown');
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(160, t + 1.65);
      dg.gain.setValueAtTime(0.7, t + 0.1);
      dg.gain.exponentialRampToValueAtTime(0.001, t + 1.7);
      dust.connect(lp).connect(dg).connect(dest);
      dust.start(t); dust.stop(t + 1.75);
    }
  },
  {
    id: 'SFX_TREE_TIMBER', cat: '5. Destruction & Explosions', dur: 1.35,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Realistisches Holzfaser-Reißen (Granulare Knack-Impulse statt Sägezahn-Ton!)
      for (let i = 0; i < 14; i++) {
        const ct = t + i * 0.032 + Math.random() * 0.01;
        triggerModalResonator(ctx, dest, ct, [110 + (i % 3) * 35, 280, 850], [0.045, 0.03, 0.02], [0.45, 0.3, 0.2], 'triangle');
      }
      // Rauschender Kronen-Sturz durch die Luft
      const swish = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), sg = ctx.createGain();
      swish.buffer = createNoiseBuffer(ctx, 0.55, 'pink');
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(950, t + 0.45);
      bp.frequency.exponentialRampToValueAtTime(240, t + 0.92);
      sg.gain.setValueAtTime(0.01, t + 0.45);
      sg.gain.linearRampToValueAtTime(0.65, t + 0.72);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
      swish.connect(bp).connect(sg).connect(dest);
      swish.start(t + 0.45); swish.stop(t + 0.96);

      // Massiver Stamm-Aufschlag am Boden
      const thud = ctx.createOscillator(), tg = ctx.createGain();
      thud.frequency.setValueAtTime(95, t + 0.92);
      thud.frequency.exponentialRampToValueAtTime(26, t + 1.25);
      tg.gain.setValueAtTime(0.95, t + 0.92);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 1.28);
      thud.connect(tg).connect(dest);
      thud.start(t + 0.92); thud.stop(t + 1.3);
    }
  },

  // --- SEKTION 6: FAHRZEUGE & MAP-SPIELZEUGE ---
  {
    id: 'SFX_VEHICLE_POOL_FLAMINGO', cat: '6. Vehicles & Map Toys', dur: 1.4,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Stöpsel-Plopp + echtes Hochdruck-Wasserblubbern
      triggerModalResonator(ctx, dest, t, [240, 580], [0.06, 0.04], [0.6, 0.4], 'sine');
      const turb = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lfoG = ctx.createGain(), g = ctx.createGain();
      turb.buffer = createNoiseBuffer(ctx, 1.2, 'pink');
      bp.type = 'bandpass'; bp.frequency.value = 550; bp.Q.value = 3.5;
      lfo.frequency.value = 22; lfoG.gain.value = 320;
      lfo.connect(lfoG).connect(bp.frequency);
      g.gain.setValueAtTime(0.65, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.25);
      turb.connect(bp).connect(g).connect(dest);
      turb.start(t + 0.08); lfo.start(t + 0.08); turb.stop(t + 1.28); lfo.stop(t + 1.28);
    }
  },
  {
    id: 'SFX_VEHICLE_FONDUE_CRAWLER', cat: '6. Vehicles & Map Toys', dur: 1.1,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Schwerer Diesel-Zylinder-Takt + metallisches Ketten-Rasseln + dickflüssiges Käse-Blubbern
      for (let i = 0; i < 8; i++) {
        const st = t + i * 0.12;
        triggerModalResonator(ctx, dest, st, [58, 116], [0.09, 0.06], [0.55, 0.35], 'triangle');
        triggerMechClick(ctx, dest, st + 0.04, 2400, 4200, 0.2); // Panzerkette
      }
      [0.15, 0.38, 0.62, 0.85].forEach(off => {
        const b = ctx.createOscillator(), bg = ctx.createGain();
        b.type = 'sine';
        const f = 220 + Math.random() * 140;
        b.frequency.setValueAtTime(f, t + off);
        b.frequency.exponentialRampToValueAtTime(f * 1.65, t + off + 0.075);
        bg.gain.setValueAtTime(0.42, t + off);
        bg.gain.exponentialRampToValueAtTime(0.001, t + off + 0.085);
        b.connect(bg).connect(dest);
        b.start(t + off); b.stop(t + off + 0.09);
      });
    }
  },
  {
    id: 'SFX_VEHICLE_COCONUT_TANK', cat: '6. Vehicles & Map Toys', dur: 0.6,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Wuchtiger Bambus-Mörser-Abschuss ("THUMP-PLONK!")
      const sub = ctx.createOscillator(), sg = ctx.createGain();
      sub.frequency.setValueAtTime(145, t);
      sub.frequency.exponentialRampToValueAtTime(36, t + 0.16);
      sg.gain.setValueAtTime(0.9, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      sub.connect(sg).connect(dest);
      sub.start(t); sub.stop(t + 0.19);
      // Hohle Bambus-/Kokos-Resonanz
      triggerModalResonator(ctx, dest, t + 0.015, [285, 420, 810], [0.18, 0.14, 0.08], [0.55, 0.45, 0.25], 'sine');
    }
  },
  {
    id: 'SFX_VEHICLE_CABLE_CAR_BRAKE', cat: '6. Vehicles & Map Toys', dur: 1.0,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Kreischende Stahlbacken-Notbremse am Tragseil + massiver Anschlag-"KLANGGG!"
      const n = ctx.createBufferSource(), bp1 = ctx.createBiquadFilter(), bp2 = ctx.createBiquadFilter(), ws = ctx.createWaveShaper(), g = ctx.createGain();
      n.buffer = createNoiseBuffer(ctx, 0.55, 'white');
      bp1.type = 'bandpass'; bp1.frequency.value = 2150; bp1.Q.value = 18;
      bp2.type = 'bandpass'; bp2.frequency.value = 3180; bp2.Q.value = 18;
      ws.curve = makeSaturationCurve(50);
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.01, t + 0.52);
      n.connect(bp1).connect(ws); n.connect(bp2).connect(ws); ws.connect(g).connect(dest);
      n.start(t); n.stop(t + 0.54);

      triggerModalResonator(ctx, dest, t + 0.5, [440, 895, 1620, 2840], [0.45, 0.38, 0.28, 0.18], [0.5, 0.4, 0.3, 0.2], 'triangle');
    }
  },
  {
    id: 'SFX_VEHICLE_SIDECAR_HORN', cat: '6. Vehicles & Map Toys', dur: 0.95,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Authentische 1930er Klaxon-Membranhupe ("AAH-OOO-GAH!" mit 2-Formanten-Trichter)
      const o = ctx.createOscillator(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), ws = ctx.createWaveShaper(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(340, t);
      o.frequency.linearRampToValueAtTime(490, t + 0.24);
      o.frequency.linearRampToValueAtTime(295, t + 0.78);
      f1.type = 'bandpass'; f1.frequency.value = 780; f1.Q.value = 3.5;
      f2.type = 'bandpass'; f2.frequency.value = 1650; f2.Q.value = 4.0;
      ws.curve = makeSaturationCurve(25);
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.65, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      o.connect(f1).connect(ws); o.connect(f2).connect(ws); ws.connect(g).connect(dest);
      o.start(t); o.stop(t + 0.88);
    }
  },
  {
    id: 'SFX_VEHICLE_ALPINE_COW_RAMPAGE', cat: '6. Vehicles & Map Toys', dur: 1.5,
    play(ctx: AudioContext, dest: SfxDestination, t: number): void {
      // Organisches Kuh-Muhen (3-Formanten-Vokaltrakt) + geschmiedete Schweizer Treichel-Kuhglocken
      const m = ctx.createOscillator(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), mg = ctx.createGain();
      m.type = 'sawtooth';
      m.frequency.setValueAtTime(125, t);
      m.frequency.linearRampToValueAtTime(178, t + 0.28);
      m.frequency.linearRampToValueAtTime(112, t + 0.75);
      f1.type = 'bandpass'; f1.frequency.value = 420; f1.Q.value = 3.5;
      f2.type = 'bandpass'; f2.frequency.value = 980; f2.Q.value = 4.0;
      lp.type = 'lowpass'; lp.frequency.value = 1400;
      mg.gain.setValueAtTime(0.01, t);
      mg.gain.linearRampToValueAtTime(0.75, t + 0.08);
      mg.gain.exponentialRampToValueAtTime(0.001, t + 0.82);
      m.connect(f1).connect(lp); m.connect(f2).connect(lp); lp.connect(mg).connect(dest);
      m.start(t); m.stop(t + 0.85);

      // Echte geschmiedete Alpen-Kuhglocken (Modale Bronze-/Stahl-Teilfrequenzen statt Rechteck-Piepen)
      for (let i = 0; i < 6; i++) {
        const st = t + 0.58 + i * 0.13;
        const p = i % 2 === 0 ? 1.0 : 0.92;
        triggerModalResonator(ctx, dest, st, [585 * p, 865 * p, 1420 * p, 2180 * p], [0.18, 0.15, 0.09, 0.05], [0.35, 0.3, 0.15, 0.08], 'sine');
      }
    }
  },

  // --- SEKTION 7: ORGANISCHER VOKALTRAKT-KAUDERWELSCH-GENERATOR ---
  {
    id: 'VOICE_GIPFEL_GARDE_YODEL', cat: '7. Organic Gibberish Voices', dur: 1.15,
    play(ctx: AudioContext, dest: SfxDestination, t: number, pitch = 1.0): void {
      // Glottal-Impuls + 3-Formanten-Filter + Kehllaut-Konsonanten ("Chrr")
      const vowels = [
        [720, 1240, 2500], // /a/
        [450, 880, 2400],  // /o/
        [320, 1950, 2600], // /i/
        [580, 1550, 2450], // /ä/
        [350, 780, 2350]   // /u/
      ];
      const yodelNotes = [1.0, 1.25, 1.66, 1.0, 1.5, 1.88, 1.25];
      let cur = t;
      for (let i = 0; i < 7; i++) {
        const dur = 0.095;
        const [f1, f2, f3] = vowels[i % vowels.length];
        // Kurzer Kehl-/Konsonanten-Anlaut am Silbenbeginn
        if (i % 2 === 0) {
          const ch = ctx.createBufferSource(), cbp = ctx.createBiquadFilter(), cg = ctx.createGain();
          ch.buffer = createNoiseBuffer(ctx, 0.025, 'pink');
          cbp.type = 'bandpass'; cbp.frequency.value = 1650; cbp.Q.value = 3;
          cg.gain.setValueAtTime(0.25, cur);
          cg.gain.exponentialRampToValueAtTime(0.001, cur + 0.02);
          ch.connect(cbp).connect(cg).connect(dest);
          ch.start(cur); ch.stop(cur + 0.022);
        }
        const o = ctx.createOscillator(), lp = ctx.createBiquadFilter();
        const bf1 = ctx.createBiquadFilter(), bf2 = ctx.createBiquadFilter(), bf3 = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth';
        const baseF = 148 * pitch * yodelNotes[i];
        o.frequency.setValueAtTime(baseF * 0.96, cur);
        o.frequency.linearRampToValueAtTime(baseF, cur + 0.02);
        lp.type = 'lowpass'; lp.frequency.value = 3200; // Natürliche Stimmband-Dämpfung
        bf1.type = 'bandpass'; bf1.frequency.value = f1; bf1.Q.value = 4.5;
        bf2.type = 'bandpass'; bf2.frequency.value = f2; bf2.Q.value = 5.0;
        bf3.type = 'bandpass'; bf3.frequency.value = f3; bf3.Q.value = 6.0;
        g.gain.setValueAtTime(0.001, cur);
        g.gain.linearRampToValueAtTime(0.55, cur + 0.015);
        g.gain.exponentialRampToValueAtTime(0.01, cur + dur);
        o.connect(lp);
        lp.connect(bf1).connect(g); lp.connect(bf2).connect(g); lp.connect(bf3).connect(g);
        g.connect(dest);
        o.start(cur); o.stop(cur + dur + 0.005);
        cur += dur + 0.022;
      }
    }
  },
  {
    id: 'VOICE_LAGUNEN_LIGA_PIRATE', cat: '7. Organic Gibberish Voices', dur: 1.15,
    play(ctx: AudioContext, dest: SfxDestination, t: number, pitch = 1.0): void {
      const vowels = [[680, 1150], [460, 920], [380, 820], [740, 1320]];
      let cur = t;
      for (let i = 0; i < 6; i++) {
        const dur = 0.115;
        const [f1, f2] = vowels[i % vowels.length];
        const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), bf1 = ctx.createBiquadFilter(), bf2 = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(128 * pitch, cur);
        o.frequency.linearRampToValueAtTime(158 * pitch, cur + dur * 0.6);
        o.frequency.linearRampToValueAtTime(122 * pitch, cur + dur);
        lp.type = 'lowpass'; lp.frequency.value = 2800;
        bf1.type = 'bandpass'; bf1.frequency.value = f1; bf1.Q.value = 4.0;
        bf2.type = 'bandpass'; bf2.frequency.value = f2; bf2.Q.value = 4.5;
        g.gain.setValueAtTime(0.001, cur);
        g.gain.linearRampToValueAtTime(0.55, cur + 0.018);
        g.gain.exponentialRampToValueAtTime(0.01, cur + dur);
        o.connect(lp); lp.connect(bf1).connect(g); lp.connect(bf2).connect(g); g.connect(dest);
        o.start(cur); o.stop(cur + dur + 0.005);
        cur += dur + 0.025;
      }
    }
  },
  {
    id: 'VOICE_DEATH_SCREAM_CANYON', cat: '7. Organic Gibberish Voices', dur: 1.55,
    play(ctx: AudioContext, dest: SfxDestination, t: number, pitch = 1.0): void {
      // Organischer Sturz-Schrei mit Stimmband-Rauheit, Formant-Sweep (/a/ -> /o/) & Gebirgs-Hall
      const o = ctx.createOscillator(), vib = ctx.createOscillator(), vibG = ctx.createGain();
      const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(390 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(135 * pitch, t + 1.45);
      vib.frequency.value = 7.5; vibG.gain.value = 12;
      vib.connect(vibG).connect(o.frequency);
      f1.type = 'bandpass'; f1.frequency.setValueAtTime(780, t); f1.frequency.exponentialRampToValueAtTime(420, t + 1.4); f1.Q.value = 3.5;
      f2.type = 'bandpass'; f2.frequency.setValueAtTime(1350, t); f2.frequency.exponentialRampToValueAtTime(850, t + 1.4); f2.Q.value = 4.0;
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(2900, t); lp.frequency.exponentialRampToValueAtTime(650, t + 1.45);
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.7, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 1.48);
      o.connect(lp); lp.connect(f1).connect(g); lp.connect(f2).connect(g);
      g.connect(dest);
      if (dest.reverbSend) g.connect(dest.reverbSend);
      o.start(t); vib.start(t); o.stop(t + 1.5); vib.stop(t + 1.5);
    }
  }
] satisfies readonly SfxRecipe[];
