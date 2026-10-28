"""Bake semantic paint masks for the owner's existing soldier meshes.

Input is the runtime loader's bind geometry (including its stable hat split).
RGB paint is never modified. Masks classify only anatomically eligible regions;
leather, eyes, weapons and shirt paint cannot be recoloured as skin globally.
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

mesh_path, output_dir = map(Path, sys.argv[1:3])
m = json.loads(mesh_path.read_text())
key = m['key']
p = np.array(m['positions']).reshape(-1, 3)
uv = np.array(m['uv']).reshape(-1, 2)
j = np.array(m['joints'], dtype=int).reshape(-1, 4)
w = np.array(m['weights']).reshape(-1, 4)
faces = np.array(m['indices'], dtype=int).reshape(-1, 3)
names = {b['index']: b['name'] for b in m['bones']}
parents = {b['name']: b.get('parent') for b in m['bones']}
bind = m['bind']
head = m['head']
paint = Image.open(output_dir / f'{key}-basecolor.webp').convert('RGB')
size = paint.size
rgb = np.asarray(paint, dtype=np.float32) / 255

# 1 hat, 2 head/neck, 3 torso, 4 arms, 5 hands, 6 legs, 7 footwear.
def family(name):
    if 'Hand' in name: return 5
    if 'ForeArm' in name or name.endswith('Arm') or 'Shoulder' in name: return 4
    if 'Foot' in name or 'Toe' in name: return 7
    if 'Leg' in name: return 6
    ancestor = name
    while ancestor:
        if ancestor in ('Head', 'Neck'): return 2
        ancestor = parents.get(ancestor)
    return 3

families = np.array([family(names.get(int(n), '')) for n in j.reshape(-1)]).reshape(-1, 4)
tex_x = np.clip(np.rint(uv[:, 0] * (size[0] - 1)).astype(int), 0, size[0] - 1)
tex_y = np.clip(np.rint(uv[:, 1] * (size[1] - 1)).astype(int), 0, size[1] - 1)
vertex_rgb = rgb[tex_y, tex_x]
vr, vg, vb = vertex_rgb.T
head_vertices = ((families == 2) * w).sum(axis=1) > .5
# The historical height-only hat split also included some foreheads. Locate
# the actual brim from its material pigment before assigning skin/hair masks.
hat_candidate = np.zeros(len(p), dtype=bool)
if key == 'alpine-allrounder': hat_candidate = (vg > vr * 1.08) & (vg > vb * 1.25)
elif key == 'alpine-heavy': hat_candidate = (np.ptp(vertex_rgb, axis=1) < .12) & (vertex_rgb.mean(axis=1) > .12) & (vertex_rgb.mean(axis=1) < .65)
elif key == 'alpine-infiltrator': hat_candidate = (vr > vg * 1.9) & (vr > vb * 1.7)
elif key == 'lagoon-infiltrator': hat_candidate = (vr > .45) & (vg > .3) & (vb < vg * .55)
hat_candidate &= head_vertices & (p[:, 1] > head['y'] + .03)
hat_cut = float(np.quantile(p[hat_candidate, 1], .03)) if hat_candidate.sum() > 20 else head['y'] + head['radius'] * .85
vertex_family = np.zeros(len(p), dtype=np.uint8)
for v in range(len(p)):
    totals = np.bincount(families[v], weights=w[v], minlength=8)
    region = int(np.argmax(totals))
    side = 'Left' if p[v, 0] > 0 else 'Right'
    knee = bind.get(side + 'Leg', [0, .45, 0])[1]
    if region == 6 and p[v, 1] < knee - .045: region = 7
    if region == 3 and p[v, 1] < bind['Hips'][1] + .045: region = 6
    vertex_family[v] = region

regions = []
for n, face in enumerate(faces):
    region = int(np.bincount(vertex_family[face], minlength=8).argmax())
    if key == 'alpine-allrounder' and region == 7:
        # This sculpt has separate ankle boots (top < .25 m) and calves/socks
        # (bottom > .30 m). The old knee-based split called both footwear,
        # bypassing skin colour and leaving old socks on mixed long trousers.
        at = p[face].mean(0); side = 'Left' if at[0] > 0 else 'Right'
        if at[1] > bind[side + 'Foot'][1] + .12: region = 6
    if m['hatSplit'] and region == 2 and p[face, 1].mean() >= hat_cut: region = 1
    regions.append(region)

def clipped_forehead(face):
    # The loader's hat split labels whole triangles. Clip genuine forehead
    # pigment eligibility in 3D, rather than discarding the skin half with a hat.
    poly=[(p[v].copy(),uv[v].copy()) for v in face]
    limits=[(1,head['y']+head['radius']*.65,False),
            (0,-head['radius']*.85,True),(0,head['radius']*.85,False),
            (2,head['z']+head['radius']*.25,True),(2,head['z']+head['radius']*1.10,False)]
    for axis,level,above in limits:
        result=[]
        for a,b in zip(poly,poly[1:]+poly[:1]):
            ia=a[0][axis]>=level if above else a[0][axis]<=level
            ib=b[0][axis]>=level if above else b[0][axis]<=level
            if ia:result.append(a)
            if ia!=ib:
                t=(level-a[0][axis])/(b[0][axis]-a[0][axis])
                result.append((a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t))
        poly=result
        if not poly:break
    return [(float(tex[0])*(size[0]-1),float(tex[1])*(size[1]-1)) for _,tex in poly]

# Rasterise eligibility in the original UV atlas, not a screen projection.
# Channels: exposed skin; head hair/beard; white torso cloth for the green vest.
eligibility = [Image.new('L', size) for _ in range(3)]
draws = [ImageDraw.Draw(image) for image in eligibility]
afro_image=Image.new('L',size);afro_draw=ImageDraw.Draw(afro_image);afro_faces=[]
for face_index, (face, region) in enumerate(zip(faces, regions)):
    points = [(float(uv[v, 0]) * (size[0] - 1), float(uv[v, 1]) * (size[1] - 1)) for v in face]
    at = p[face].mean(axis=0)
    side = 'Left' if at[0] > 0 else 'Right'
    knee = bind.get(side + 'Leg', [0, .45, 0])[1]
    forearm = sum(w[v, k] for v in face for k in range(4) if 'ForeArm' in names.get(int(j[v, k]), '')) / 3
    arm_skin = region == 4 and (key in ('alpine-allrounder','lagoon-heavy') or forearm > .35)
    if region == 1 and key.startswith('alpine-'):
        forehead=clipped_forehead(face)
        if len(forehead)>=3:draws[0].polygon(forehead,fill=255)
    if region in (2, 5) or (region == 6 and at[1] < knee + .065) or arm_skin:
        draws[0].polygon(points, fill=255)
    if region == 2:
        draws[1].polygon(points, fill=255)
        if key == 'lagoon-allrounder':
            outer=at[1]>1.575 or (abs(at[0])>.135 and at[1]>1.35) or (at[2]<-.09 and at[1]>1.35) or (at[1]>1.48 and at[2]<.065)
            colour=vertex_rgb[face].mean(0);rr,gg,bb=colour
            hair_colour=max(colour)<.5 and rr<=gg*1.5+.025 and gg<=bb*1.7+.025 and rr>=bb*.5-.01 and rr>=gg*.7-.01
            if outer and hair_colour:
                afro_draw.polygon(points,fill=255);afro_faces.append(face_index)
    if region == 3 and at[1] < bind['Neck'][1] - .025:
        # Preserve the shirt placket and collar through the green waistcoat.
        if abs(at[0]) > .035 or at[2] < bind['Spine2'][2] or at[1] < bind['Spine1'][1] + .015:
            draws[2].polygon(points, fill=255)

r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
warm = (r > g * 1.08) & (g > b * 1.08) & (g > .06) & (b > .025)
# UV-island gutters need the same pigment eligibility as their edge texels.
# Without padding, mipmaps mix skin masks with zero and leave pale islands on
# dark faces, even though the original colour atlas already has padded paint.
eligible_skin = np.asarray(eligibility[0].filter(ImageFilter.MaxFilter(9))) > 0
eligible_head = np.asarray(eligibility[1].filter(ImageFilter.MaxFilter(9))) > 0
head_pixels = rgb[warm & eligible_head][::23]
centers = np.array([[.85, .65, .50], [.28, .16, .08]], dtype=np.float32)
if len(head_pixels) > 20:
    centers = np.quantile(head_pixels, [.25, .75], axis=0).astype(np.float32)
    for _ in range(12):
        labels = ((head_pixels[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2).argmin(axis=1)
        for k in range(2):
            if (labels == k).any(): centers[k] = head_pixels[labels == k].mean(axis=0)
skin_cluster = int((centers[:, 0] / np.maximum(centers[:, 1], .01)).argmin())
d0 = ((rgb - centers[skin_cluster]) ** 2).sum(axis=2)
d1 = ((rgb - centers[1 - skin_cluster]) ** 2).sum(axis=2)
body_skin = (r < g * 1.72) & (g < b * 2.25)
skin = warm & eligible_skin & ((~eligible_head & body_skin) | (eligible_head & (d0 <= d1)))
hair = warm & eligible_head & (d1 < d0)
if key == 'lagoon-allrounder':
    afro_area=np.asarray(afro_image.filter(ImageFilter.MaxFilter(9)))>0
    afro_hair=afro_area & (r<.50) & (r<=g*1.5+.025) & (g<=b*1.7+.025) & (r>=b*.5-.01) & (r>=g*.7-.01)
    # Restore facial creases previously mistaken for warm hair. The black afro
    # is a distinct spatial pigment, not a dark-skin colour cluster.
    skin |= hair & ~afro_hair
    hair=afro_hair
    skin &= ~afro_hair
white_cloth = ((rgb.max(axis=2) - rgb.min(axis=2)) < .16) & (rgb.mean(axis=2) > .38)
mask = np.stack([skin, hair, white_cloth], axis=2).astype(np.uint8) * 255
Image.fromarray(mask).resize((1024, 1024), Image.Resampling.BILINEAR).save(output_dir / f'{key}-wardrobe-mask.webp', lossless=True, method=6)

def reference(where, fallback):
    pixels = rgb[where]
    if len(pixels) < 10: return fallback
    # Pick the light-painted half, retaining authored creases in the shader.
    order = np.argsort(pixels.mean(axis=1))
    return np.median(pixels[order[int(len(order) * .55):int(len(order) * .85)]], axis=0).round(6).tolist()

votes = np.zeros((len(p), 8), dtype=np.int32)
for face, region in zip(faces, regions): votes[face, region] += 1
vertex_region = votes.argmax(axis=1)
skin_vertices = skin[tex_y, tex_x] & np.isin(vertex_region, [1, 2, 4, 5, 6])
hair_vertices = hair[tex_y, tex_x] & (vertex_region == 2)
pigment = np.where(skin_vertices, 1, np.where(hair_vertices, 2, 0)).tolist()
metadata = {
    'version': 1, 'sourceHash': hashlib.sha256((output_dir / f'{key}.glb').read_bytes()).hexdigest(),
    'vertexCount': len(p), 'indexCount': len(faces) * 3, 'regions': regions, 'pigment': pigment,
    'skinReference': reference(skin, [.90, .68, .53]), 'hairReference': reference(hair, [.30, .15, .07]),
}
if key == 'lagoon-allrounder':metadata['afroFaces']=afro_faces
(output_dir / f'{key}-wardrobe.json').write_text(json.dumps(metadata, separators=(',', ':')))
print(key, 'regions', dict(zip(*[a.tolist() for a in np.unique(regions, return_counts=True)])), 'skin/hair pixels', int(skin.sum()), int(hair.sum()))
