const textEncoder = new TextEncoder();

const POSITION_SCALE = 80;
const VELOCITY_SCALE = 128;

/** Little-endian, growable binary writer used for every realtime packet. */
export class BinaryWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset = 0;

  constructor(initialSize = 512) {
    this.buffer = new ArrayBuffer(initialSize);
    this.view = new DataView(this.buffer);
  }

  private ensure(bytes: number): void {
    const required = this.offset + bytes;
    if (required <= this.buffer.byteLength) return;
    let nextSize = this.buffer.byteLength;
    while (nextSize < required) nextSize *= 2;
    const next = new ArrayBuffer(nextSize);
    new Uint8Array(next).set(new Uint8Array(this.buffer));
    this.buffer = next;
    this.view = new DataView(next);
  }

  writeUint8(value: number): this {
    this.ensure(1);
    this.view.setUint8(this.offset, value & 0xff);
    this.offset += 1;
    return this;
  }

  writeInt8(value: number): this {
    this.ensure(1);
    this.view.setInt8(this.offset, Math.max(-128, Math.min(127, Math.round(value))));
    this.offset += 1;
    return this;
  }

  writeUint16(value: number): this {
    this.ensure(2);
    this.view.setUint16(this.offset, value & 0xffff, true);
    this.offset += 2;
    return this;
  }

  writeInt16(value: number): this {
    this.ensure(2);
    const clamped = Math.max(-32768, Math.min(32767, Math.round(value)));
    this.view.setInt16(this.offset, clamped, true);
    this.offset += 2;
    return this;
  }

  writeUint32(value: number): this {
    this.ensure(4);
    this.view.setUint32(this.offset, value >>> 0, true);
    this.offset += 4;
    return this;
  }

  writeFloat32(value: number): this {
    this.ensure(4);
    this.view.setFloat32(this.offset, value, true);
    this.offset += 4;
    return this;
  }

  writeFloat64(value: number): this {
    this.ensure(8);
    this.view.setFloat64(this.offset, value, true);
    this.offset += 8;
    return this;
  }

  writePosition(value: { x: number; y: number; z: number }): this {
    this.writeInt16(value.x * POSITION_SCALE);
    this.writeInt16(value.y * POSITION_SCALE);
    this.writeInt16(value.z * POSITION_SCALE);
    return this;
  }

  writeVelocity(value: { x: number; y: number; z: number }): this {
    this.writeInt16(value.x * VELOCITY_SCALE);
    this.writeInt16(value.y * VELOCITY_SCALE);
    this.writeInt16(value.z * VELOCITY_SCALE);
    return this;
  }

  /** Encodes an angle in radians as a 16-bit normalized turn. */
  writeAngle(radians: number): this {
    const twoPi = Math.PI * 2;
    const normalized = ((radians % twoPi) + twoPi) % twoPi;
    this.writeUint16(Math.round((normalized / twoPi) * 65535));
    return this;
  }

  writeString(value: string): this {
    const encoded = textEncoder.encode(value);
    const length = Math.min(255, encoded.byteLength);
    this.writeUint8(length);
    this.ensure(length);
    new Uint8Array(this.buffer, this.offset, length).set(encoded.subarray(0, length));
    this.offset += length;
    return this;
  }

  writeBytes(bytes: Uint8Array): this {
    this.ensure(bytes.byteLength);
    new Uint8Array(this.buffer, this.offset, bytes.byteLength).set(bytes);
    this.offset += bytes.byteLength;
    return this;
  }

  finish(): ArrayBuffer {
    return this.buffer.slice(0, this.offset);
  }

  get length(): number {
    return this.offset;
  }
}

export const POSITION_QUANTIZATION = POSITION_SCALE;
export const VELOCITY_QUANTIZATION = VELOCITY_SCALE;
