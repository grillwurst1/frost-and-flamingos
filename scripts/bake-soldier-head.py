"""Derive a closed, clean wardrobe head from the owner's scout sculpt.

The nose, ears and jaw retain the donor sculpt. A closed surface replaces the
overlapping scalp/face, and the upper-lip folds are relaxed offline. Skin is a
solid configurable base; geometric eyes and the lip crease provide detail.
"""
import json
import sys
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

source, output = map(Path, sys.argv[1:3])
m = json.loads(source.read_text())
assert m['key'] == 'alpine-infiltrator'
wardrobe = json.loads((output / 'alpine-infiltrator-wardrobe.json').read_text())
p = np.array(m['positions']).reshape(-1, 3)
n = np.array(m['normals']).reshape(-1, 3)
uv = np.array(m['uv']).reshape(-1, 2)
f = np.array(m['indices']).reshape(-1, 3)
regions = np.array(wardrobe['regions'])
pigment = np.array(wardrobe['pigment'])
original_rgb = np.asarray(Image.open(output/'alpine-infiltrator-basecolor.webp').convert('RGB'),dtype=np.float32)/255
xy = np.clip(np.rint(uv*2047).astype(int),0,2047)
vertex_rgb = original_rgb[xy[:,1],xy[:,0]]
# Work above the collar, below the red hat. The eye and brow surfaces are kept.
bottom, top = 1.285, 1.452
positions, normals, uvs, indices, painted = [], [], [], [], []
cut_points = []
remap = {}

def append(v, paint=True):
    point, normal, tex = v
    key = tuple(np.round(np.r_[point, normal, tex], 7))
    if paint and key in remap: return remap[key]
    index = len(positions)
    positions.append(point.tolist()); normals.append(normal.tolist()); uvs.append(tex.tolist()); painted.append(1 if paint else 0)
    if paint: remap[key] = index
    return index

def clip(poly, level, above, axis=1):
    result = []
    for a, b in zip(poly, poly[1:] + poly[:1]):
        ia = a[0][axis] >= level if above else a[0][axis] <= level
        ib = b[0][axis] >= level if above else b[0][axis] <= level
        if ia: result.append(a)
        if ia != ib:
            t = (level - a[0][axis]) / (b[0][axis] - a[0][axis])
            point = a[0] * (1 - t) + b[0] * t; point[axis] = level
            normal = a[1] * (1 - t) + b[1] * t; normal /= max(np.linalg.norm(normal), 1e-9)
            result.append((point, normal, a[2] * (1 - t) + b[2] * t))
    return result

for face in f[np.isin(regions, [1, 2])]:
    colours=vertex_rgb[face];rr,gg,bb=colours.T
    # Brown facial creases and the moustache are anatomy, not red cloth.
    # Height/depth clipping removes the hat; only the low green coat collar
    # needs a paint-based exclusion. Keep the complete sculpted face surface.
    cloth=(gg>rr*1.05)&(gg>bb*1.05)
    if p[face,1].mean()<1.33 and cloth.sum()>=2:continue
    poly = []
    for v in face:
        at = p[v].copy()
        # The donor has only a small raised moustache. Bring that surface back
        # to the upper lip, leaving the nose, mouth and eye sockets untouched.
        normal = n[v].copy()
        if 1.355 < at[1] < 1.394 and abs(at[0]) < .073 and at[2] > .035:
            blend = np.sin(np.pi * np.clip((at[1] - 1.355) / .039, 0, 1))
            lip = .050 + .018 * np.exp(-(at[0]/.022)**2)
            at[2] = at[2]*(1-blend) + min(at[2],lip)*blend
            smooth = np.array([at[0]*2, .08, 1.]); smooth /= np.linalg.norm(smooth)
            normal = normal*(1-blend) + smooth*blend;normal /= max(np.linalg.norm(normal),1e-9)
        poly.append((at, normal, uv[v]))
    poly = clip(clip(clip(poly, bottom, True), top, False), -.070, True, 2)
    if len(poly) < 3: continue
    for v in poly:
        if abs(v[0][1] - top) < 1e-6: cut_points.append(v)
    a = append(poly[0])
    for i in range(1, len(poly) - 1): indices.extend([a, append(poly[i]), append(poly[i + 1])])

# A real closed skull replaces the hidden head under the hat. Its lower front
# stays behind the preserved eye/nose/mouth sculpt; the forehead rises smoothly
# above the eyelids. No angular hat-boundary samples or cuff normals survive.
center_y, center_z, rx, ry, rz = 1.430, -.045, .110, .140, .112
levels = sorted(set(np.linspace(center_y-ry+.002,center_y+ry-.002,34).tolist()+[1.440,1.446,1.448,1.450,1.452,1.455,1.460]))
sides=64; start=len(positions);skull=[]
for row,y in enumerate(levels):
    section=np.sqrt(max(0.,1-((y-center_y)/ry)**2))
    blend=np.clip((y-1.446)/.006,0,1);blend=blend*blend*(3-2*blend)
    for col in range(sides):
        angle=col/sides*2*np.pi;front=max(0.,np.cos(angle))
        x=np.sin(angle)*rx*section
        z=center_z+np.cos(angle)*rz*section
        if np.cos(angle)>0:z-=.070*front**4*section*(1-blend)
        index=append((np.array([x,y,z]),np.array([0.,1.,0.]),np.array([0.,0.])),False);skull.append(index)
        if row:
            aa=start+(row-1)*sides+col;bb=start+(row-1)*sides+(col+1)%sides
            cc=start+row*sides+col;dd=start+row*sides+(col+1)%sides
            indices.extend([aa,bb,cc,bb,dd,cc])
low=append((np.array([0.,center_y-ry,center_z]),np.array([0.,-1.,0.]),np.array([0.,0.])),False)
high=append((np.array([0.,center_y+ry,center_z]),np.array([0.,1.,0.]),np.array([0.,0.])),False)
skull.extend([low,high])
for col in range(sides):
    indices.extend([low,start+(col+1)%sides,start+col])
    last=start+(len(levels)-1)*sides
    indices.extend([last+col,last+(col+1)%sides,high])
# Average geometric normals on the continuous skull. Artist face normals remain.
points=np.array(positions);sums=np.zeros_like(points)
for face in np.array(indices).reshape(-1,3):
    if all(painted[v]==0 for v in face):
        normal=np.cross(points[face[1]]-points[face[0]],points[face[2]]-points[face[0]])
        for v in face:sums[v]+=normal
for v in skull:normals[v]=(sums[v]/max(np.linalg.norm(sums[v]),1e-9)).tolist()
cap_edges=[]

# The hat hid part of the upper forehead. Build a continuous bald scalp from
# above the preserved eyelids and sculpt two rounded brows on it; do not retain
# the cloth cuff as a flesh-coloured helmet.
hair_vertices = []
for sign in [-1,1]:
    start_brow=len(positions); segments=16; cross=8
    for row in range(segments+1):
        t=row/segments; x=sign*(.018+.065*t)
        y=1.456+.007*t+.005*np.sin(np.pi*t)
        z=.065-.012*(abs(x)/.09)**2
        radius=.0015+.005*np.sin(np.pi*t)**.5
        for col in range(cross):
            a=col/cross*2*np.pi
            normal=np.array([0.,np.sin(a),np.cos(a)])
            index=append((np.array([x,y+np.sin(a)*radius,z+np.cos(a)*radius*.65]),normal,np.array([0.,0.])),False)
            painted[index]=2;hair_vertices.append(index)
            if row:
                aa=start_brow+(row-1)*cross+col;bb=start_brow+(row-1)*cross+(col+1)%cross
                cc=start_brow+row*cross+col;dd=start_brow+row*cross+(col+1)%cross
                if sign>0:indices.extend([aa,cc,bb,bb,cc,dd])
                else:indices.extend([aa,bb,cc,bb,dd,cc])
    # Closed ends prevent a back-view pinhole.
    for col in range(1,cross-1):
        face=[start_brow,start_brow+col+1,start_brow+col]
        last=start_brow+segments*cross
        end=[last,last+col,last+col+1]
        if sign<0: face.reverse();end.reverse()
        indices.extend(face+end)

# A single closed anatomical surface replaces overlapping face/scalp layers.
# Its skin has no donor hue, raster pupils or flattened moustache paint.
head = {'version':1, 'sourceHash':wardrobe['sourceHash'], 'frame':m['head'],
        'positions':np.round(positions,7).reshape(-1).tolist(), 'normals':np.round(normals,7).reshape(-1).tolist(),
        'uvs':np.round(uvs,7).reshape(-1).tolist(), 'indices':indices, 'painted':painted,
        'tints':np.ones((len(positions),3)).reshape(-1).tolist(),
        'skinReference':wardrobe['skinReference'], 'hairReference':wardrobe['hairReference']}
head_file=output/'soldier-head.json'
head_file.write_text(json.dumps(head,separators=(',',':'),allow_nan=False))
subprocess.run(['blender','--background','--threads','2','--python',str(Path(__file__).with_name('refine-head-sculpt.py')),
    '--',str(head_file),str(head_file)],check=True)
subprocess.run(['blender','--background','--threads','2','--python',str(Path(__file__).with_name('bake-head-details.py')),
    '--',str(head_file)],check=True)
# Temporary face tiles keep the subsequent hair/arm packing step simple. The
# final pack discards them: every skin vertex is now colour-independent anatomy.
Image.new('RGB',(1024,1024),tuple(round(c*255) for c in wardrobe['skinReference'])).save(output/'soldier-head-basecolor.webp',quality=95,method=6)
Image.new('RGB',(512,512),(255,0,0)).save(output/'soldier-head-mask.webp',lossless=True,method=6)
refined=json.loads(head_file.read_text())
print('Unified soldier head',len(refined['painted']),'vertices',len(refined['indices'])//3,'triangles')
