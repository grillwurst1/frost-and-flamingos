/** Own only transient nodes; shared buses must remain connected. */
export class AudioLifetime {
  private readonly destinations = new WeakMap<AudioNode, number>();

  ownDestination(node: AudioNode): void {
    this.destinations.set(node, 0);
    // Some composite cues choose another voice and never use their panner.
    queueMicrotask(() => { if (this.destinations.get(node) === 0) node.disconnect(); });
  }

  retainDestination(node?: AudioNode): () => void {
    if (!node || !this.destinations.has(node)) return () => {};
    this.destinations.set(node, this.destinations.get(node)! + 1);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const remaining = this.destinations.get(node)! - 1;
      if (remaining === 0) node.disconnect();
      this.destinations.set(node, remaining);
    };
  }

  finishWith(source: AudioScheduledSourceNode, nodes: readonly AudioNode[], destination?: AudioNode): void {
    const release = this.retainDestination(destination);
    source.addEventListener('ended', () => {
      for (const node of nodes) node.disconnect();
      release();
    }, { once: true });
  }
}

/** Replace an old interpolation instead of building a future automation queue. */
export function smoothAudioParam(param: AudioParam, value: number, now: number, seconds: number): void {
  param.cancelAndHoldAtTime(now);
  param.setTargetAtTime(value, now, seconds);
}

/** A browser audio failure must not escape into Babylon's render callback.
 * Babylon schedules the next frame only after that callback returns.
 */
export function resilientAudio<T extends object>(engine: T,
  report: (method: string, error: unknown) => void = (method, error) => console.error(`[audio] ${method} failed`, error)): T {
  const methods = new Map<PropertyKey, unknown>(), reported = new Set<PropertyKey>();
  return new Proxy(engine, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function' || key === 'constructor') return value;
      if (!methods.has(key)) methods.set(key, (...args: unknown[]) => {
        try { return value.apply(target, args); }
        catch (error) {
          if (!reported.has(key)) { reported.add(key); report(String(key), error); }
          return undefined;
        }
      });
      return methods.get(key);
    },
  });
}
