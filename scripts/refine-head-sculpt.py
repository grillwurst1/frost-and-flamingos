"""Unify the derived scout face/scalp, relax moustache folds and sculpt a lip crease.

Run only on generated soldier-head JSON, never on the owner's original GLB.
Solid anatomical skin uses no pigment atlas; brows and lip shading retain their
separate semantic colours. Geometry is bounded before runtime cache uploads.
"""
import bpy,bmesh,json,sys,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from pathlib import Path
src,out=map(Path,sys.argv[sys.argv.index('--')+1:]);h=json.loads(src.read_text())
assert any(kind == 1 for kind in h['painted']), 'Expected the fresh donor-face extraction'
p=[h['positions'][i:i+3] for i in range(0,len(h['positions']),3)];faces=[h['indices'][i:i+3] for i in range(0,len(h['indices']),3)]
skin=[f for f in faces if all(h['painted'][v]!=2 for v in f)]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mesh=bpy.data.meshes.new('unified-anatomical-head');mesh.from_pydata(p,[],skin);mesh.update()
obj=bpy.data.objects.new('unified-anatomical-head',mesh);bpy.context.collection.objects.link(obj);bpy.context.view_layer.objects.active=obj;obj.select_set(True)
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
mod=obj.modifiers.new('Union closed anatomical surfaces','REMESH');mod.mode='VOXEL';mod.voxel_size=.0025;mod.adaptivity=0.;mod.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=mod.name)
group=obj.vertex_groups.new(name='upper-lip-relax')
for v in obj.data.vertices:
 x,y,z=v.co
 if abs(x)<.075 and 1.35<y<1.402 and z>.02:
  weight=max(0.,1-(abs(x)/.075)**4)*math.sin((y-1.35)/.052*math.pi)
  if weight>.001:group.add([v.index],weight,'REPLACE')
mod=obj.modifiers.new('Relax moustache ridges','SMOOTH');mod.factor=.65;mod.iterations=12;mod.vertex_group=group.name;bpy.ops.object.modifier_apply(modifier=mod.name)
obj.data.calc_loop_triangles();before=len(obj.data.loop_triangles)
mod=obj.modifiers.new('Bound face geometry','DECIMATE');mod.ratio=min(1.,6500/max(before,1));bpy.ops.object.modifier_apply(modifier=mod.name)
mesh=obj.data;mesh.update();mesh.calc_loop_triangles()
positions=[float(c) for v in mesh.vertices for c in v.co];normals=[float(c) for v in mesh.vertices for c in v.normal];indices=[v for f in mesh.loop_triangles for v in f.vertices]
flags=[0]*len(mesh.vertices);uvs=[0.]*(len(flags)*2);tints=[1.]*(len(flags)*3)
bvh=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
start=len(flags);cols=5;rows=24
for row in range(rows+1):
 t=row/rows;x=(t-.5)*.060;cy=1.345+.004*(abs(x)/.030)**2
 width=.00045+.0010*math.sin(t*math.pi)**.45
 for col in range(cols):
  across=col/(cols-1)*2-1;y=cy+across*width
  hit,normal,_,_=bvh.ray_cast(Vector((x,y,.5)),Vector((0,0,-1)),1.)
  if hit is None:raise RuntimeError('Mouth curve misses the face')
  shade=.24+.60*abs(across)**.7
  positions.extend([x,y,float(hit.z)+.00035+.00035*(1-abs(across))]);normals.extend(normal);uvs.extend([0,0]);tints.extend([shade]*3);flags.append(3)
  if row and col:
   aa=start+(row-1)*cols+col-1;bb=aa+1;cc=start+row*cols+col;dd=cc-1
   indices.extend([aa,dd,cc,aa,cc,bb])
remap={}
for face in faces:
 if not all(h['painted'][v]==2 for v in face):continue
 for v in face:
  if v not in remap:
   remap[v]=len(flags);positions.extend(p[v]);normals.extend(h['normals'][v*3:v*3+3]);uvs.extend([0,0]);tints.extend([1,1,1]);flags.append(2)
  indices.append(remap[v])
for k,a in [('positions',positions),('normals',normals),('uvs',uvs),('tints',tints)]:h[k]=[round(v,7) for v in a]
h['indices']=indices;h['painted']=flags;h['solidAnatomy']=True
out.write_text(json.dumps(h,separators=(',',':'),allow_nan=False))
print('Unified head:',len(flags),'vertices',len(indices)//3,'triangles, pre-decimation:',before)
