import { POSITION_QUANTIZATION, VELOCITY_QUANTIZATION } from './writer.js';

const textDecoder = new TextDecoder();

/** Bounds-checked little-endian reader for untrusted network packets. */
export class BinaryReader {
  private readonly view: DataView;
  private offset = 0;

  constructor(source: ArrayBuffer | ArrayBufferView) {
    if (source instanceof ArrayBuffer) {
      this.view = new DataView(source);
    } else {
      this.view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    }
  }

  private require(bytes: number): void {
    if (this.offset + bytes > this.view.byteLength) {
      throw new RangeError('Packet ended unexpectedly.');
    }
  }

  readUint8(): number {
    this.require(1);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readInt8(): number {
    this.require(1);
    const value = this.view.getInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint16(): number {
    this.require(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readInt16(): number {
    this.require(2);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readUint32(): number {
    this.require(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readFloat32(): number {
    this.require(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readFloat64(): number {
    this.require(8);
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readPosition(): { x: number; y: number; z: number } {
    return {
      x: this.readInt16() / POSITION_QUANTIZATION,
      y: this.readInt16() / POSITION_QUANTIZATION,
      z: this.readInt16() / POSITION_QUANTIZATION,
    };
  }

  readVelocity(): { x: number; y: number; z: number } {
    return {
      x: this.readInt16() / VELOCITY_QUANTIZATION,
      y: this.readInt16() / VELOCITY_QUANTIZATION,
      z: this.readInt16() / VELOCITY_QUANTIZATION,
    };
  }

  readAngle(): number {
    return (this.readUint16() / 65535) * Math.PI * 2;
  }

  readString(maxLength = 255): string {
    const length = this.readUint8();
    if (length > maxLength) throw new RangeError('String exceeds the permitted length.');
    this.require(length);
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return textDecoder.decode(bytes);
  }

  readBytes(length: number): Uint8Array {
    this.require(length);
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return bytes.slice();
  }

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }
}
