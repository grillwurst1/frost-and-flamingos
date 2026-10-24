import { InputButton } from '@frost-and-flamingos/shared';

export interface InputHandlers {
  onMouseMove: (deltaX: number, deltaY: number) => void;
  onWheel: (delta: number) => void;
  onSwapShoulder: () => void;
  onToggleDebug: () => void;
  onPointerLockChange: (locked: boolean) => void;
  onPointerLockError: () => void;
  onEscape: () => void;
}

/**
 * Keyboard, wheel and pointer-lock input. Movement state is sampled by the
 * fixed-step simulation; mouse deltas are forwarded to the camera immediately.
 */
export class InputController {
  private readonly canvas: HTMLCanvasElement;
  private readonly handlers: InputHandlers;
  private readonly pressed = new Set<string>();
  private locked = false;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, handlers: InputHandlers) {
    this.canvas = canvas;
    this.handlers = handlers;

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('visibilitychange', this.handleVisibility);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.handleContextMenu);
    canvas.addEventListener('mousedown', this.handleMouseDown);
  }

  get isLocked(): boolean {
    return this.locked;
  }

  requestPointerLock(): void {
    if (this.locked) return;
    try {
      const result = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          this.handlers.onPointerLockError();
        });
      }
    } catch {
      this.handlers.onPointerLockError();
    }
  }

  releasePointerLock(): void {
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  buttons(): number {
    let mask = 0;
    if (this.pressed.has('KeyW') || this.pressed.has('ArrowUp')) mask |= InputButton.Forward;
    if (this.pressed.has('KeyS') || this.pressed.has('ArrowDown')) mask |= InputButton.Backward;
    if (this.pressed.has('KeyA') || this.pressed.has('ArrowLeft')) mask |= InputButton.Left;
    if (this.pressed.has('KeyD') || this.pressed.has('ArrowRight')) mask |= InputButton.Right;
    if (this.pressed.has('Space')) mask |= InputButton.Jump;
    if (this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight')) mask |= InputButton.Sprint;
    return mask;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.releasePointerLock();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'F1') {
      event.preventDefault();
      this.handlers.onToggleDebug();
      return;
    }
    if (event.code === 'KeyC' && !event.repeat) {
      this.handlers.onSwapShoulder();
      return;
    }
    if (event.code === 'Escape') {
      this.handlers.onEscape();
      return;
    }
    if (event.code === 'Space' || event.code.startsWith('Arrow')) {
      event.preventDefault();
    }
    this.pressed.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return;
    this.handlers.onMouseMove(event.movementX, event.movementY);
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.locked) return;
    event.preventDefault();
    this.handlers.onWheel(event.deltaY);
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (event.button === 0 && !this.locked) {
      this.requestPointerLock();
    }
  };

  private readonly handlePointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.canvas;
    this.locked = locked;
    if (!locked) this.pressed.clear();
    this.handlers.onPointerLockChange(locked);
  };

  private readonly handlePointerLockError = (): void => {
    this.handlers.onPointerLockError();
  };

  private readonly handleBlur = (): void => {
    this.pressed.clear();
  };

  private readonly handleVisibility = (): void => {
    if (document.hidden) this.pressed.clear();
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
}
