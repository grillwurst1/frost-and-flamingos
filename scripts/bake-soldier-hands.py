"""Closed anatomical hands built around the owner's existing finger landmarks.

Only generated geometry is written; the source GLB and animation remain intact.
Run with Blender, sharing the existing body JSON and selected-skin material.
"""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector, kdtree

source, models, target = map(Path, sys.argv[sys.argv.index('--')+1:])
m = json.loads(source.read_text())
assert m['key'] == 'alpine-allrounder'
meta = json.loads((models/'alpine-allrounder-wardrobe.json').read_text())
bones = [dict(b, **m['rig'][b['name']]) for b in m['bones']
         if b['index'] is not None and b['index'] >= 0 and b['name'] in m['rig']]
by_name = {b['name']: b for b in bones}
points, faces, influences, creases = [], [], [], []
def position(name): return Vector(by_name[name]['position'])
def loft(centers, radii, across, front, skin, tones):
    first = len(points); sides = 16
    for row, (center, radius) in enumerate(zip(centers, radii)):
        for col in range(sides):
            angle = col/sides*math.tau
            points.append(center+across*(math.sin(angle)*radius[0])+front*(math.cos(angle)*radius[1]))
            influences.append(skin[row]); creases.append(tones[row])
            if row:
                a=first+(row-1)*sides+col; b=first+(row-1)*sides+(col+1)%sides
                c=first+row*sides+(col+1)%sides; d=first+row*sides+col
                faces.extend([(a,b,c),(a,c,d)])
    for row in [0,len(centers)-1]:
        at=len(points);points.append(centers[row]);influences.append(skin[row]);creases.append(tones[row])
        for col in range(sides):
            a=first+row*sides+col; b=first+row*sides+(col+1)%sides
            faces.append((at,b,a) if row==0 else (at,a,b))

for side in ['Left','Right']:
    name=side+'Hand'; wrist=position(name)
    knuckles=[position(name+d+'1') for d in ['Index','Middle','Ring','Pinky']]
    center=sum(knuckles,Vector())/4; along=(center-wrist).normalized()
    across=(knuckles[0]-knuckles[-1]);across=(across-along*across.dot(along)).normalized()
    front=across.cross(along).normalized()
    # Broad metacarpals, rounded heel and a slight arched back of the palm.
    palm_rows=[-.10,0,.15,.35,.6,.85,1.02]
    centers=[wrist+(center-wrist)*t+front*(.003*math.sin(max(t,0)*math.pi)) for t in palm_rows]
    width=(knuckles[0]-knuckles[-1]).length/2+.010
    radii=[(.024,.019),(.027,.021),(.034,.024),(width*.95,.026),(width,.025),(width*.98,.022),(width*.88,.017)]
    loft(centers,radii,across,front,[{by_name[name]['index']:1}]*len(centers),[.015]*len(centers))
    for digit in ['Thumb','Index','Middle','Ring','Pinky']:
        names=[name+digit+str(n) for n in [1,2,3]]
        anchors=[position(n) for n in names]
        anchors.append(anchors[2]+(anchors[2]-anchors[1])*.8)
        # Extend the digit root inside the palm so voxel union forms a real web.
        root=anchors[0]-(anchors[1]-anchors[0])*.75
        centers=[root]; skin=[{by_name[name]['index']:.5,by_name[names[0]]['index']:.5}];tones=[.015]
        base=.014 if digit=='Thumb' else (.010 if digit=='Pinky' else .012)
        radii=[(base*.95,base*.92)]
        for step in range(16):
            t=step/15*3;segment=min(2,int(t));u=t-segment
            centers.append(anchors[segment].lerp(anchors[segment+1],u))
            left=by_name[names[segment]]['index'];right=by_name[names[min(2,segment+1)]]['index']
            weights={left:1-u};weights[right]=weights.get(right,0)+u;skin.append(weights)
            tip=max(0,(step/15-.8)/.2);radius=base*(1-step/15*.23)*math.sqrt(max(.015,1-tip*tip))
            # Quiet knuckle folds are actual shape and a bounded neutral shade.
            fold=math.exp(-((t-1)/.16)**2)+math.exp(-((t-2)/.16)**2)
            radii.append((radius*(1-fold*.07),radius*.86));tones.append(.012+fold*.045)
        direction=(anchors[2]-anchors[0]).normalized()
        lateral=direction.cross(front).normalized();depth=lateral.cross(direction).normalized()
        loft(centers,radii,lateral,depth,skin,tones)

mesh=bpy.data.meshes.new('anatomical-hand-source')
mesh.from_pydata(points,[],faces);mesh.update()
obj=bpy.data.objects.new('anatomical-hands',mesh);bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
# Establish consistent outward normals before the union.
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
obj.data.remesh_voxel_size=.002
bpy.ops.object.voxel_remesh()
smooth=obj.modifiers.new('soft anatomical webs','SMOOTH');smooth.factor=.7;smooth.iterations=3
bpy.ops.object.modifier_apply(modifier=smooth.name)
tri=obj.modifiers.new('triangulate','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
decimate=obj.modifiers.new('bounded hand mesh','DECIMATE');decimate.ratio=min(1,4000/max(1,len(obj.data.polygons)))
bpy.ops.object.modifier_apply(modifier=decimate.name)
# Transfer the generated neutral anatomical weights, never donor painted skin.
kd=kdtree.KDTree(len(points))
for i,p in enumerate(points):kd.insert(p,i)
kd.balance()
positions=[];normals=[];joints=[];weights=[];uvs=[]
for vertex in obj.data.vertices:
    positions.extend(round(float(x),7) for x in vertex.co);normals.extend(round(float(x),7) for x in vertex.normal)
    near=kd.find_n(vertex.co,4); totals={};shade=0;denom=0
    for _,i,distance in near:
        factor=1/max(distance,.0002)**4;denom+=factor;shade+=creases[i]*factor
        for joint,weight in influences[i].items():totals[joint]=totals.get(joint,0)+weight*factor
    selected=sorted(totals.items(),key=lambda p:p[1],reverse=True)[:4];total=sum(w for _,w in selected)
    joints.extend([j for j,_ in selected]+[0]*(4-len(selected)))
    weights.extend([round(w/total,7) for _,w in selected]+[0]*(4-len(selected)))
    uvs.extend([round(shade/denom,7),0])
indices=[i for face in obj.data.polygons for i in face.vertices]
data=dict(version=1,sourceHash=meta['sourceHash'],positions=positions,normals=normals,uvs=uvs,
          joints=joints,weights=weights,indices=indices,regions=[5]*(len(indices)//3),bones=bones)
target.write_text(json.dumps(data,separators=(',',':'),allow_nan=False))
print('Shared closed anatomical hands:',len(positions)//3,'vertices',len(indices)//3,'triangles')
