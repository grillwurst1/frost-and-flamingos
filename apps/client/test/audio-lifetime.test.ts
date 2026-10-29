import { expect, test } from 'bun:test';
import { AudioEngine } from '../src/audio/engine';
import { resilientAudio } from '../src/audio/lifetime';

function mixer() {
  const nodes: Node[] = [], stopped: Node[] = [];
  let automation = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
    cancelAndHoldAtTime() { automation = 0; }, setTargetAtTime() { automation++; } });
  class Node {
    connected = false;
    gain = param(); frequency = param(); Q = param();
    positionX = param(); positionY = param(); positionZ = param();
    listeners: Array<() => void> = [];
    connect() { this.connected = true; return this; }
    disconnect() { this.connected = false; }
    start() {}
    stop() { stopped.push(this); }
    addEventListener(_name: string, callback: () => void) { this.listeners.push(callback); }
  }
  const make = () => { const node = new Node(); nodes.push(node); return node; };
  const ctx = { state: 'running', currentTime: 0, createOscillator: make, createGain: make, createBiquadFilter: make,
    createPanner: make, createBufferSource: make,
    listener: Object.fromEntries(['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ'].map(k => [k, param()])) };
  const engine = new AudioEngine();
  Object.assign(engine, { ctx, noiseBuffer: {}, sfxGain: new Node(), voiceGain: new Node(), vehicleGain: new Node() });
  return { engine, ctx, nodes, automation: () => automation,
    async finish() { for (const node of stopped.splice(0)) for (const callback of node.listeners.splice(0)) callback(); await Promise.resolve(); } };
}

test('repeated cow abilities and crawler cannon cues release their complete transient graphs', async () => {
  const m = mixer(), position = { x: 1, y: 2, z: 3 };
  for (let round = 0; round < 100; round++) {
    for (const slot of [1, 2, 3]) m.engine.playMascotMove('cow', slot, position);
    m.engine.playMascotImpact('cow', position);
    m.engine.playMascotRam('cow', position, true);
    m.engine.playBoing(position);
    m.engine.playVehicleGun('tank', position);
    await m.finish();
    expect(m.nodes.filter(n => n.connected)).toHaveLength(0);
  }
});

test('suspended audio creates no new cow/cannon/engine voices and queues no driving automation', async () => {
  const m = mixer(), position = { x: 1, y: 2, z: 3 };
  m.engine.setVehicleEngine(1, 'tank', position, .5);
  expect(m.nodes.some(n => n.connected)).toBe(true);
  m.ctx.state = 'suspended';
  const count = m.nodes.length;
  for (let frame = 0; frame < 10000; frame++) {
    m.engine.setVehicleEngine(1, 'tank', position, 1);
    m.engine.updateListener(position, position);
    m.engine.playMascotMove('cow', frame % 3 + 1, position);
    m.engine.playVehicleGun('tank', position);
  }
  await m.finish();
  expect(m.nodes).toHaveLength(count);
  expect(m.nodes.filter(n => n.connected)).toHaveLength(0);
  m.ctx.state = 'running';
  for (let frame = 0; frame < 10000; frame++) m.engine.setVehicleEngine(1, 'tank', position, frame % 10 / 10);
  expect(m.automation()).toBe(1);
});

test('a Chrome audio exception cannot break the render callback or suppress later healthy cues', () => {
  let cues = 0, reports = 0, frames = 0;
  const engine = resilientAudio({ play() { if (cues++ < 3) throw new Error('audio device interrupted'); } }, () => { reports++; });
  for (let frame = 0; frame < 10; frame++) { engine.play(); frames++; }
  expect(frames).toBe(10); expect(cues).toBe(10); expect(reports).toBe(1);
  expect(engine.play).toBe(engine.play);
});
