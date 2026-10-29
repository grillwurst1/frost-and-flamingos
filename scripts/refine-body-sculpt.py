"""Close and smooth only generated arm geometry; transfer neutral skin/weights."""
import json
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector, kdtree
source,target=map(Path,sys.argv[sys.argv.index('--')+1:])
d=json.loads(source.read_text());p=list(zip(*[iter(d['positions'])]*3))
faces=list(zip(*[iter(d['indices'])]*3))
mesh=bpy.data.meshes.new('derived-anatomical-arms');mesh.from_pydata(p,[],faces);mesh.update()
obj=bpy.data.objects.new('closed-arm-sculpt',mesh);bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
bm=bmesh.new();bm.from_mesh(mesh)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00005)
boundary=[e for e in bm.edges if e.is_boundary]
if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
# A narrow solid core fills the donor's internal cavities and thin ragged
# sheets. It stays inside the sculpt except where a hole needs closing.
cores=[]
for side in ['Left','Right']:
    anchors=[Vector(d['bind'][side+name]) for name in ['Arm','ForeArm','Hand']]
    radii=[.048,.040,.026]
    for at,radius in zip(anchors,radii):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=radius,location=at)
        cores.append(bpy.context.object)
    for i in range(2):
        a,b=anchors[i:i+2];direction=b-a
        bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=radii[i],radius2=radii[i+1],depth=direction.length,
            location=(a+b)*.5,rotation=direction.to_track_quat('Z','Y').to_euler())
        cores.append(bpy.context.object)
for selected in bpy.context.selected_objects:selected.select_set(False)
obj.select_set(True)
for core in cores:core.select_set(True)
bpy.context.view_layer.objects.active=obj;bpy.ops.object.join()
obj.data.remesh_voxel_size=.008;bpy.ops.object.voxel_remesh()
# Disconnected scraps are not anatomy. Keep the connected arm on each side.
bm=bmesh.new();bm.from_mesh(obj.data);unseen=set(bm.verts);groups={True:[],False:[]}
while unseen:
    seed=unseen.pop();component={seed};stack=[seed]
    while stack:
        for edge in stack.pop().link_edges:
            for vertex in edge.verts:
                if vertex in unseen:unseen.remove(vertex);component.add(vertex);stack.append(vertex)
    groups[sum(v.co.x for v in component)>0].append(component)
keep=set().union(*(max(parts,key=len) for parts in groups.values() if parts))
bmesh.ops.delete(bm,geom=[v for v in bm.verts if v not in keep],context='VERTS')
bm.to_mesh(obj.data);bm.free()
obj.data.update()
print('Arm topology before simplify:',len(obj.data.vertices),len(obj.data.edges),len(obj.data.polygons),flush=True)
smooth=obj.modifiers.new('soften cut seams','SMOOTH');smooth.factor=.5;smooth.iterations=2
bpy.ops.object.modifier_apply(modifier=smooth.name)
tri=obj.modifiers.new('triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
dec=obj.modifiers.new('bounded sculpt','DECIMATE');dec.ratio=min(1,2500/max(1,len(obj.data.polygons)));dec.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier=dec.name)
assert len(obj.data.polygons)<3000, f'Unbounded arm sculpt: {len(obj.data.polygons)}'
kd=kdtree.KDTree(len(p))
for i,point in enumerate(p):kd.insert(Vector(point),i)
kd.balance()
out=dict(d,positions=[],normals=[],uvs=[],joints=[],weights=[])
for v in obj.data.vertices:
    out['positions'].extend(round(float(n),7) for n in v.co);out['normals'].extend(round(float(n),7) for n in v.normal)
    totals={};shade=0;denom=0
    for _,i,distance in kd.find_n(v.co,4):
        factor=1/max(distance,.0002)**4;denom+=factor;shade+=d['uvs'][i*2]*factor
        for k in range(4):
            at=i*4+k;weight=d['weights'][at]
            if weight>0:totals[d['joints'][at]]=totals.get(d['joints'][at],0)+weight*factor
    selected=sorted(totals.items(),key=lambda item:item[1],reverse=True)[:4];total=sum(w for _,w in selected)
    out['joints'].extend([j for j,_ in selected]+[0]*(4-len(selected)))
    out['weights'].extend([round(w/total,7) for _,w in selected]+[0]*(4-len(selected)))
    out['uvs'].extend([round(shade/denom,7),0])
assert all(len(f.vertices)==3 for f in obj.data.polygons)
out['indices']=[i for face in obj.data.polygons for i in face.vertices]
target.write_text(json.dumps(out,separators=(',',':'),allow_nan=False))
print('Closed arm sculpt:',len(out['positions'])//3,'vertices',len(out['indices'])//3,'triangles')
