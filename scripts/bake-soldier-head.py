"""Derive a closed, clean wardrobe head from the owner's scout sculpt.

The sculpted eyes, nose, ears and lips retain their original UV paint. Only the
painted moustache is shaved; a closed skull replaces the hidden area under the hat.
No donor rig or animation is needed by the runtime.
"""
import hashlib
import json
import sys
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

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

# Rasterise donor-space landmarks into its UV atlas. Hair outside the eyebrow
# band becomes clean skin, including sideburns, instead of a painted bald wig.
image = Image.open(output/'alpine-infiltrator-basecolor.webp').convert('RGB')
mask_image = Image.open(output/'alpine-infiltrator-wardrobe-mask.webp').convert('RGB').resize(image.size, Image.Resampling.BILINEAR)
rgb = np.asarray(image, dtype=np.float32)/255
mask = np.asarray(mask_image, dtype=np.float32)/255
shave = Image.new('L', image.size); draw = ImageDraw.Draw(shave)
brows = Image.new('L', image.size); brow_draw = ImageDraw.Draw(brows)
unwanted = Image.new('L', image.size); unwanted_draw = ImageDraw.Draw(unwanted)
coverage = Image.new('L', image.size); cover = ImageDraw.Draw(coverage)
eye_image = Image.new('L', image.size); eye_draw = ImageDraw.Draw(eye_image)
for face in f[np.isin(regions, [1, 2])]:
    at = p[face].mean(0)
    poly = [(float(uv[v,0])*(image.width-1), float(uv[v,1])*(image.height-1)) for v in face]
    cover.polygon(poly, fill=255)
    if at[2] > .01 and ((1.425 < at[1] < 1.451 and .020 < abs(at[0]) < .085) or (1.332 < at[1] < 1.358 and abs(at[0]) < .045)):
        eye_draw.polygon(poly, fill=255)
    # Retain eyebrows over the actual sculpted eye sockets.
    eyebrow = at[2] > .015 and 1.449 < at[1] < 1.478 and .020 < abs(at[0]) < .095
    if eyebrow: brow_draw.polygon(poly, fill=255); draw.polygon(poly,fill=255)
    moustache = at[2] > .035 and 1.355 < at[1] < 1.394 and abs(at[0]) < .073
    if moustache: draw.polygon(poly, fill=255)
    if at[2] < .015 or at[1] > 1.465: unwanted_draw.polygon(poly, fill=255)
remove = np.asarray(shave.filter(ImageFilter.MaxFilter(3)), dtype=np.float32)/255 * (rgb.mean(2)<.50)
# Hat/coat pixels inside the old height-classified head are not a complexion.
# Only the derived scalp surfaces are cleaned; the original body is untouched.
cloth = ((rgb[:,:,0] > rgb[:,:,1]*1.95) & (rgb[:,:,1] < .28)) | ((rgb[:,:,1] > rgb[:,:,0]*1.08) & (rgb[:,:,1] > rgb[:,:,2]*1.1))
remove = np.maximum(remove, np.asarray(unwanted.filter(ImageFilter.MaxFilter(5)),dtype=np.float32)/255 * cloth)
reference = np.array(wardrobe['skinReference'])
# Beard fibres are not skin wrinkles: use a low-contrast shade of the original
# complexion, preserving the real lip/nostril pigment which is outside hair.
shade = np.clip((rgb.mean(2)/max(np.mean(wardrobe['hairReference']), .05))**.12, .82, 1.08)
replacement = reference[None,None,:] * shade[:,:,None]
rgb = rgb*(1-remove[:,:,None]) + replacement*remove[:,:,None]
# Dark creases are not beard pigment. Preserve their authored colour/shading
# and tint them as skin; only the actual eyebrow band follows the hair colour.
eligible = np.asarray(coverage.filter(ImageFilter.MaxFilter(9)), dtype=np.float32)/255
protect_eye = np.asarray(eye_image.filter(ImageFilter.MaxFilter(3)), dtype=np.float32)/255
feature = (rgb.mean(2) < .22) | ((np.ptp(rgb,axis=2) < .15) & (rgb.mean(2) > .4))
protect_eye *= feature
brow = np.asarray(brows.filter(ImageFilter.MaxFilter(3)),dtype=np.float32)/255
mask[:,:,1] = np.zeros_like(mask[:,:,1])
mask[:,:,0] = eligible * (1-protect_eye) * (1-mask[:,:,1])
tints = np.ones((len(positions), 3))
for index, tex, fade in cap_edges:
    x = int(np.clip(round(tex[0]*(image.width-1)),0,image.width-1)); y = int(np.clip(round(tex[1]*(image.height-1)),0,image.height-1))
    edge_tint = np.clip(rgb[y,x] / np.maximum(reference, .01), .55, 1.35)
    tints[index] = edge_tint * (1-fade) + fade
head = {'version':1, 'sourceHash':wardrobe['sourceHash'], 'frame':m['head'],
        'positions':np.round(positions,7).reshape(-1).tolist(), 'normals':np.round(normals,7).reshape(-1).tolist(),
        'uvs':np.round(uvs,7).reshape(-1).tolist(), 'indices':indices, 'painted':painted,
        'tints':np.round(tints,6).reshape(-1).tolist(),
        'skinReference':wardrobe['skinReference'], 'hairReference':wardrobe['hairReference']}
(output/'soldier-head.json').write_text(json.dumps(head, separators=(',',':')))
# Repack only the derived head. The original rig, images and animations stay
# untouched; Blender transfers emission paint from the old UVs onto the new UVs.
with tempfile.TemporaryDirectory(prefix='ff-head-atlas-') as temporary:
    folder=Path(temporary)
    Image.fromarray(np.uint8(np.clip(rgb,0,1)*255)).save(folder/'source-paint.png')
    Image.fromarray(np.uint8(np.clip(mask,0,1)*255)).save(folder/'source-mask.png')
    subprocess.run(['blender','--background','--threads','2','--python',str(Path(__file__).with_name('bake-head-atlas.py')),
        '--',str(output/'soldier-head.json'),str(folder/'source-paint.png'),str(folder/'source-mask.png'),str(folder/'paint.png'),str(folder/'mask.png')],check=True)
    Image.open(folder/'paint.png').convert('RGB').save(output/'soldier-head-basecolor.webp',quality=95,method=6)
    Image.open(folder/'mask.png').convert('RGB').resize((512,512),Image.Resampling.BILINEAR).save(output/'soldier-head-mask.webp',lossless=True,method=6)
print('closed soldier head' , len(positions), 'vertices', len(indices)//3, 'triangles')
