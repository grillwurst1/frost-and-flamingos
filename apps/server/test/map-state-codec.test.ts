import { expect, test } from 'bun:test';
import { BinaryWriter, Opcode, decodeMapStateSync, encodeMapStateSync, type MapStateSync } from '@frost-and-flamingos/shared';

test('map sync preserves HP and burning independently of structural stage, alongside craters and bridges',()=>{
  const state:MapStateSync={destructibles:[{id:3,stage:0,hp:500,burning:true},{id:8,stage:2,hp:275,burning:false}],
    bridges:[{id:4,stage:'patched',hp:300}],craters:[{x:2,z:4,radius:3,depth:.5}]};
  expect(decodeMapStateSync(encodeMapStateSync(state))).toEqual(state);
});

test('legacy-shaped map dumps retain their historical stage defaults and empty packets keep their prefix',()=>{
  const old=new BinaryWriter(32).writeUint8(Opcode.S2C_MAP_STATE_SYNC).writeUint16(2)
    .writeUint16(3).writeUint8(2).writeUint16(8).writeUint8(0).writeUint16(0).writeUint16(0).finish();
  expect(decodeMapStateSync(old)).toEqual({destructibles:[{id:3,stage:2,hp:0,burning:true},{id:8,stage:0,hp:100,burning:false}],bridges:[],craters:[]});
  const empty=encodeMapStateSync({destructibles:[],bridges:[],craters:[]});expect(empty.byteLength).toBe(7);
});

test('truncated, mismatched and invalid fire-detail trailers fail safely',()=>{
  const data=new Uint8Array(encodeMapStateSync({destructibles:[{id:3,stage:0,hp:500,burning:true}],bridges:[],craters:[]}));
  expect(decodeMapStateSync(data.subarray(0,data.length-1))).toBeNull();
  for(const [offset,value] of [[data.length-6,2],[data.length-5,0],[data.length-1,2]]) {
    const bad=data.slice();bad[offset!]=value!;expect(decodeMapStateSync(bad)).toBeNull();
  }
});
