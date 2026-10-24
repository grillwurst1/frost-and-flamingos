/**
 * Procedural cartoon gibberish. No samples, no words: a short sequence of
 * vowel-like formant bursts with consonant noise. The pitch parameter is the
 * same 0.8–1.25 range used by the wardrobe voice preview.
 */

interface Vowel {
  readonly formants: readonly [number, number, number];
  readonly open: number;
}

const VOWELS: readonly Vowel[] = [
  { formants: [730, 1090, 2440], open: 0.9 },
  { formants: [530, 1840, 2480], open: 1 },
  { formants: [270, 2290, 3010], open: 0.82 },
  { formants: [570, 840, 2410], open: 0.88 },
  { formants: [440, 1020, 2240], open: 0.78 },
  { formants: [660, 1720, 2410], open: 0.92 },
  { formants: [380, 1960, 2800], open: 0.74 },
];

const CONSONANT_CENTRES: readonly number[] = [2200, 3200, 1500, 4200, 2600];

function clampPitch(pitch: number): number {
  return Math.min(1.25, Math.max(0.8, pitch));
}

function makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Schedules one gibberish phrase and returns its length in seconds. The caller
 * owns the destination (normally the voice bus) and the AudioContext.
 */
export function scheduleGibberish(
  ctx: AudioContext,
  destination: AudioNode,
  pitch: number,
  when = ctx.currentTime,
  noiseBuffer?: AudioBuffer,
): number {
  const voicePitch = clampPitch(pitch);
  const syllables = 4 + Math.floor(Math.random() * 4);
  const noise = noiseBuffer ?? makeNoiseBuffer(ctx, 0.35);
  let cursor = when;

  for (let index = 0; index < syllables; index += 1) {
    const vowel = VOWELS[Math.floor(Math.random() * VOWELS.length)] ?? VOWELS[0];
    if (!vowel) continue;
    const duration = 0.075 + Math.random() * 0.075;
    const base = (104 + Math.random() * 34) * voicePitch;
    const contour = 0.86 + Math.random() * 0.34;

    // Consonant: a very short filtered noise tick before the vowel.
    if (Math.random() > 0.28) {
      const consonant = ctx.createBufferSource();
      consonant.buffer = noise;
      const consonantFilter = ctx.createBiquadFilter();
      consonantFilter.type = 'bandpass';
      consonantFilter.frequency.value =
        (CONSONANT_CENTRES[Math.floor(Math.random() * CONSONANT_CENTRES.length)] ?? 2600) * voicePitch;
      consonantFilter.Q.value = 1.2 + Math.random() * 2;
      const consonantGain = ctx.createGain();
      consonantGain.gain.setValueAtTime(0.0001, cursor);
      consonantGain.gain.exponentialRampToValueAtTime(0.075, cursor + 0.008);
      consonantGain.gain.exponentialRampToValueAtTime(0.0001, cursor + 0.035);
      consonant.connect(consonantFilter);
      consonantFilter.connect(consonantGain);
      consonantGain.connect(destination);
      consonant.start(cursor, Math.random() * 0.2);
      consonant.stop(cursor + 0.05);
    }

    const output = ctx.createGain();
    output.gain.setValueAtTime(0.0001, cursor);
    output.gain.exponentialRampToValueAtTime(0.11 * vowel.open, cursor + 0.014);
    output.gain.setValueAtTime(0.11 * vowel.open, cursor + duration * 0.55);
    output.gain.exponentialRampToValueAtTime(0.0001, cursor + duration);
    output.connect(destination);

    const oscillators: OscillatorNode[] = [];
    for (let harmonic = 0; harmonic < 2; harmonic += 1) {
      const oscillator = ctx.createOscillator();
      oscillator.type = harmonic === 0 ? 'sawtooth' : 'square';
      oscillator.frequency.setValueAtTime(base * (harmonic === 0 ? 1 : 1.005), cursor);
      oscillator.frequency.exponentialRampToValueAtTime(base * contour * (harmonic === 0 ? 1 : 1.005), cursor + duration);
      oscillator.detune.value = harmonic === 0 ? 0 : 7;
      oscillators.push(oscillator);
    }

    for (let formantIndex = 0; formantIndex < vowel.formants.length; formantIndex += 1) {
      const centre = vowel.formants[formantIndex] ?? 900;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = centre * (0.94 + voicePitch * 0.08);
      filter.Q.value = 7 + formantIndex * 3;
      const formantGain = ctx.createGain();
      formantGain.gain.value = formantIndex === 0 ? 1 : formantIndex === 1 ? 0.65 : 0.35;
      for (const oscillator of oscillators) oscillator.connect(filter);
      filter.connect(formantGain);
      formantGain.connect(output);
    }

    for (const oscillator of oscillators) {
      oscillator.start(cursor);
      oscillator.stop(cursor + duration + 0.03);
    }

    cursor += duration + 0.02 + Math.random() * 0.035;
  }

  return Math.max(0.25, cursor - when);
}
