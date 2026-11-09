"""Derive the owner's actual sculpted beard, with a closed rounded cut surface.

Use after the shared head/curl/body bakes, before the shared hair paint bake.
No source GLB or source paint is modified. All operations are offline.
"""
import hashlib,json,sys,subprocess,tempfile
from pathlib import Path
import numpy as np

def build(source,models):
 import bpy,bmesh
 m=json.loads(source.read_text());assert m['key']=='alpine-heavy'
 meta=json.loads((models/'alpine-heavy-wardrobe.json').read_text())
 p=np.array(m['positions']).reshape(-1,3);uv=np.array(m['uv']).reshape(-1,2);faces=np.array(m['indices']).reshape(-1,3)
 image=np.load(models/'native-beard-paint.npy')
 xy=np.clip(np.rint(uv*[image.shape[1]-1,image.shape[0]-1]).astype(int),0,[image.shape[1]-1,image.shape[0]-1]);col=image[xy[:,1],xy[:,0]]
 canon=p.copy();canon[:,0]*=.75;canon[:,1]=(p[:,1]-1.3273)*.66+1.438;canon[:,2]=(p[:,2]-.182)*.66+.05
 chosen=[]
 for f,region in zip(faces,meta['regions']):
  at=p[f].mean(0);c=col[f].mean(0);point=canon[f].mean(0)
  copper=c[0]>c[1]*1.25 and c[2]<c[1]*.66
  dark=c[0]<.45 and c[0]>c[1]*1.3 and c[2]<c[1]*.75
  bounds=canon[f]
  if region in (1,2) and 1.005<at[1]<1.31 and abs(at[0])<.18 and point[2]>-.025 and (copper or dark) and np.all(abs(bounds[:,0])<.14) and bounds[:,1].max()<1.435:
   chosen.append(f.tolist())
 assert len(chosen)>400,'Original beard extraction is incomplete'
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 mesh=bpy.data.meshes.new('native-sculpted-beard');mesh.from_pydata(canon.tolist(),[],chosen);mesh.update()
 obj=bpy.data.objects.new('native-sculpted-beard',mesh);bpy.context.collection.objects.link(obj);bpy.context.view_layer.objects.active=obj;obj.select_set(True)
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
 bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=8)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
 # Even offsets amplify the original locks' acute corners into long spikes.
 mod=obj.modifiers.new('Rounded closed beard thickness','SOLIDIFY');mod.thickness=.012;mod.offset=0;mod.use_even_offset=False;bpy.ops.object.modifier_apply(modifier=mod.name)
 mod=obj.modifiers.new('Fuse original locks','REMESH');mod.mode='VOXEL';mod.voxel_size=.0016;mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 mod=obj.modifiers.new('Smooth cut edges','SMOOTH');mod.factor=.35;mod.iterations=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 obj.data.calc_loop_triangles();mod=obj.modifiers.new('Bounded original detail','DECIMATE');mod.ratio=min(1.,4200/len(obj.data.loop_triangles));bpy.ops.object.modifier_apply(modifier=mod.name)
 mesh=obj.data;bm=bmesh.new();bm.from_mesh(mesh)
 assert all(e.is_manifold for e in bm.edges),'Beard must have a complete closed surface'
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update();mesh.calc_loop_triangles()
 assert all(abs(v.co.x)<.15 and 1.20<v.co.y<1.45 for v in mesh.vertices),'Beard thickness produced a silhouette spike'
 hpath=models/'soldier-head.json';h=json.loads(hpath.read_text())
 h['beard']={'positions':[round(float(c),7)for v in mesh.vertices for c in v.co],
  'normals':[round(float(c),7)for v in mesh.vertices for c in v.normal],
  'indices':[v for f in mesh.loop_triangles for v in f.vertices],
  'cavities':[.035]*len(mesh.vertices),'shades':[1.]*len(mesh.vertices),
  'sourceHash':meta['sourceHash'],'nativeSculpt':True}
 hpath.write_text(json.dumps(h,separators=(',',':'),allow_nan=False))
 print('Original sculpted beard:',len(chosen),'source triangles,',len(mesh.vertices),'closed vertices,',len(mesh.loop_triangles),'triangles',flush=True)

if __name__=='__main__':
 if '--worker'in sys.argv:
  at=sys.argv.index('--worker');build(*map(Path,sys.argv[at+1:at+3]))
 else:
  from PIL import Image
  import shutil
  source,models=map(Path,sys.argv[1:3])
  exported=json.loads(source.read_text());metadata=json.loads((models/'alpine-heavy-wardrobe.json').read_text())
  assert exported['key']=='alpine-heavy' and metadata['vertexCount']==len(exported['positions'])//3 and metadata['indexCount']==len(exported['indices'])
  assert metadata['sourceHash']==hashlib.sha256((models/'alpine-heavy.glb').read_bytes()).hexdigest(),'Source geometry and metadata must match'
  with tempfile.TemporaryDirectory(prefix='ff-native-beard-')as name:
   temp=Path(name)
   for filename in ['alpine-heavy-wardrobe.json','soldier-head.json']:shutil.copyfile(models/filename,temp/filename)
   np.save(temp/'native-beard-paint.npy',np.asarray(Image.open(models/'alpine-heavy-basecolor.webp').convert('RGB'),dtype=np.float32)/255)
   subprocess.run(['blender','--background','--factory-startup','--threads','2','--python',str(Path(__file__).resolve()),'--','--worker',str(source.resolve()),str(temp)],check=True)
   shutil.copyfile(temp/'soldier-head.json',models/'soldier-head.json')
