import { InputButton, type WeaponSlot } from '@frost-and-flamingos/shared';

export interface InputHandlers {
  onMouseMove: (deltaX: number, deltaY: number) => void;
  onWheel: (delta: number) => void;
  onSwapShoulder: () => void;
  onToggleDebug: () => void;
  onTaunt: () => void;
  onPointerLockChange: (locked: boolean) => void;
  onPointerLockError: () => void;
  onEscape: () => void;
}

/**
 * Keyboard, wheel and pointer-lock input. Movement state is sampled by the
 * fixed-step simulation; mouse deltas are forwarded to the camera immediately.
 *
 * The button mask follows the shared 16-bit contract in
 * packages/shared/src/types/index.ts.
 */
export class InputController {
  private readonly canvas: HTMLCanvasElement;
  private readonly handlers: InputHandlers;
  private readonly pressed = new Set<string>();
  private readonly mouseButtons = new Set<number>();
  private locked = false;
  private crouchToggle = false;
  private crouchPulseUntil = 0;
  private weaponSlot: WeaponSlot = 1;
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
    document.addEventListener('mouseup', this.handleMouseUp);
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

  currentWeaponSlot(): WeaponSlot {
    return this.weaponSlot;
  }

  buttons(): number {
    let mask = 0;
    if (this.pressed.has('KeyW') || this.pressed.has('ArrowUp')) mask |= InputButton.Forward;
    if (this.pressed.has('KeyS') || this.pressed.has('ArrowDown')) mask |= InputButton.Backward;
    if (this.pressed.has('KeyA') || this.pressed.has('ArrowLeft')) mask |= InputButton.Left;
    if (this.pressed.has('KeyD') || this.pressed.has('ArrowRight')) mask |= InputButton.Right;
    if (this.pressed.has('Space')) mask |= InputButton.Jump;
    if (
      this.pressed.has('ControlLeft') ||
      this.pressed.has('ControlRight') ||
      this.crouchToggle ||
      performance.now() < this.crouchPulseUntil
    ) {
      mask |= InputButton.Crouch;
    }
    if (this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight')) {
      mask |= InputButton.Sprint;
    }
    if (this.mouseButtons.has(0)) mask |= InputButton.FirePrimary;
    if (this.mouseButtons.has(2)) mask |= InputButton.FireSecondary;
    if (this.pressed.has('KeyR')) mask |= InputButton.Reload;
    if (this.pressed.has('KeyF')) mask |= InputButton.Interact;
    if (this.pressed.has('KeyQ')) mask |= InputButton.Skill1;
    if (this.pressed.has('KeyE')) mask |= InputButton.Skill2;
    if (this.pressed.has('KeyT')) mask |= InputButton.Skill3OrTaunt;
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
    document.removeEventListener('mouseup', this.handleMouseUp);
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
    if (event.code === 'KeyV' && !event.repeat) {
      this.handlers.onSwapShoulder();
      return;
    }
    if (event.code === 'KeyG' && !event.repeat) {
      this.handlers.onTaunt();
      return;
    }
    if (event.code === 'KeyC' && !event.repeat) {
      const sprinting = this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight');
      const forward = this.pressed.has('KeyW') || this.pressed.has('ArrowUp');
      if (sprinting && forward) {
        // A crouch tap during a forward sprint is the dodge-roll gesture.
        this.crouchPulseUntil = performance.now() + 130;
      } else {
        this.crouchToggle = !this.crouchToggle;
      }
      return;
    }
    if (event.code === 'Escape') {
      this.handlers.onEscape();
      return;
    }
    if (event.code === 'Digit1') {
      this.weaponSlot = 1;
      return;
    }
    if (event.code === 'Digit2') {
      this.weaponSlot = 2;
      return;
    }
    if (event.code === 'Digit3') {
      this.weaponSlot = 3;
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
    if (event.altKey) {
      this.handlers.onWheel(event.deltaY);
      return;
    }
    const direction = event.deltaY > 0 ? 1 : -1;
    const next = this.weaponSlot + direction;
    this.weaponSlot = (next > 3 ? 1 : next < 1 ? 3 : next) as WeaponSlot;
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (event.button === 0 && !this.locked) {
      this.requestPointerLock();
      return;
    }
    if (!this.locked) return;
    event.preventDefault();
    this.mouseButtons.add(event.button);
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    this.mouseButtons.delete(event.button);
  };

  private readonly handlePointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.canvas;
    this.locked = locked;
    if (!locked) {
      this.pressed.clear();
      this.mouseButtons.clear();
      this.crouchToggle = false;
      this.crouchPulseUntil = 0;
    }
    this.handlers.onPointerLockChange(locked);
  };

  private readonly handlePointerLockError = (): void => {
    this.handlers.onPointerLockError();
  };

  private readonly handleBlur = (): void => {
    this.pressed.clear();
    this.mouseButtons.clear();
  };

  private readonly handleVisibility = (): void => {
    if (document.hidden) {
      this.pressed.clear();
      this.mouseButtons.clear();
    }
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
}
