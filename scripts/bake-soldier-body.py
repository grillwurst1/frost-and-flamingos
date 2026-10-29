"""Closed sculpted arms with an outfit-independent, texture-free skin base.

Only derived data changes. Curl paint retains its tile density in a smaller
shared atlas; original owner models, source paint and animations are untouched.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path
import numpy as np
from PIL import Image
from wrist_surface import clip_limb_plane,clip_wrist

source,output=map(Path,sys.argv[1:3])
m=json.loads(source.read_text());assert m['key']=='lagoon-heavy'
meta=json.loads((output/'lagoon-heavy-wardrobe.json').read_text())
f=np.array(m['indices'],dtype=int).reshape(-1,3)
faces=f[np.isin(np.array(meta['regions']),[4,5])]
def attributes(p,n,uv,j,w):
    return dict(m,positions=p.reshape(-1).tolist(),normals=n.reshape(-1).tolist(),uv=uv.reshape(-1).tolist(),
                joints=j.reshape(-1).tolist(),weights=w.reshape(-1).tolist())
p,n,uv,j,w,faces=clip_wrist(m,faces)
# Remove inner torso/skirt fragments inherited by the source's arm labels.
p,n,uv,j,w,faces=clip_limb_plane(attributes(p,n,uv,j,w),faces,joint='Arm',medial=True,margin=.035)
# Blend the bulky donor cuff down to an anatomical wrist before closing it.
for side in ['Left','Right']:
    wrist=np.array(m['bind'][side+'Hand']);axis=wrist-np.array(m['bind'][side+'ForeArm']);axis/=np.linalg.norm(axis)
    used=np.unique(faces);used=used[(p[used,0]>0)==(side=='Left')]
    delta=p[used]-wrist;along=delta@axis;across=delta-along[:,None]*axis
    radius=np.linalg.norm(across,axis=1)
    ring=radius[(np.abs(along-.004)<.001)&(radius>1e-5)]
    if len(ring):
        ratio=min(1,.035/float(np.median(ring)))
        t=np.clip((along+.12)/.124,0,1);blend=t*t*(3-2*t)
        p[used]+=across*((ratio-1)*blend)[:,None]
# Source labels included cloth/torso points weighted even to hips and head.
# Bound the source to a real limb envelope before union, not a garment skirt.
for side in ['Left','Right']:
    anchors=np.array([m['bind'][side+name] for name in ['Arm','ForeArm','Hand']])
    used=np.unique(faces);used=used[(p[used,0]>0)==(side=='Left')]
    delta=p[used,None,:]-anchors[None,:2,:];axis=np.diff(anchors,axis=0)
    t=np.clip((delta*axis).sum(2)/(axis*axis).sum(1),0,1)
    centers=anchors[None,:2,:]+t[:,:,None]*axis
    offsets=p[used,None,:]-centers;radii=np.linalg.norm(offsets,axis=2)
    nearest=radii.argmin(1);row=np.arange(len(used));u=t[row,nearest]
    limit=np.where(nearest==0,np.interp(u,[0,.35,1],[.095,.085,.055]),np.interp(u,[0,.25,1],[.055,.065,.033]))
    over=radii[row,nearest]>limit
    p[used[over]]=centers[row[over],nearest[over]]+offsets[row[over],nearest[over]]*(limit[over]/radii[row[over],nearest[over]])[:,None]
used=np.unique(faces);remap=np.full(len(p),-1,dtype=int);remap[used]=np.arange(len(used))
paint=np.asarray(Image.open(output/'lagoon-heavy-basecolor.webp').convert('RGB'),dtype=np.float32)/255
xy=np.clip(np.rint(uv[used]*[paint.shape[1]-1,paint.shape[0]-1]).astype(int),[0,0],[paint.shape[1]-1,paint.shape[0]-1])
lum=paint[xy[:,1],xy[:,0]].mean(1);reference=max(float(np.mean(meta['skinReference'])),.05)
cavity=np.clip((.7-lum/reference)*.18,0,.09)
raw=dict(bind=m['bind'],positions=np.round(p[used],7).reshape(-1).tolist(),normals=np.round(n[used],7).reshape(-1).tolist(),
         uvs=np.c_[cavity,np.zeros(len(used))].reshape(-1).tolist(),indices=remap[faces].reshape(-1).tolist(),
         joints=j[used].reshape(-1).tolist(),weights=w[used].reshape(-1).tolist())
with tempfile.TemporaryDirectory(prefix='ff-arm-sculpt-') as temporary:
    incoming=Path(temporary)/'arms.json';refined=Path(temporary)/'closed.json'
    incoming.write_text(json.dumps(raw,separators=(',',':'),allow_nan=False))
    subprocess.run(['blender','--background','--factory-startup','--threads','2','--python',str(Path(__file__).with_name('refine-body-sculpt.py')),'--',str(incoming),str(refined)],check=True)
    d=json.loads(refined.read_text())
# Voxel union may move an end by a voxel; restore the exact capped wrist plane.
p,n,uv,j,w,faces=clip_wrist(dict(m,positions=d['positions'],normals=d['normals'],uv=d['uvs'],joints=d['joints'],weights=d['weights']),np.array(d['indices'],dtype=int).reshape(-1,3))
p,n,uv,j,w,faces=clip_limb_plane(attributes(p,n,uv,j,w),faces,joint='Arm',medial=True,margin=.035)
assert len(faces)<3400, f'Arm triangle budget exceeded: {len(faces)}'
from collections import Counter
edge_counts=Counter(tuple(sorted((int(a),int(b)))) for face in faces for a,b in zip(face,np.roll(face,-1)))
assert all(count==2 for count in edge_counts.values()), 'Arm sculpt has an open/non-manifold boundary'

used=np.unique(faces);remap=np.full(len(p),-1,dtype=int);remap[used]=np.arange(len(used))
# Smooth anatomical weights exclude the donor's unrelated torso/leg joints.
# This also keeps the closed shoulder cap together during weapon poses.
index={b['name']:b['index'] for b in m['bones']}
for v in used:
    side='Left' if p[v,0]>0 else 'Right'
    anchors=np.array([m['bind'][side+name] for name in ['Arm','ForeArm','Hand']])
    axis=np.diff(anchors,axis=0);length=np.linalg.norm(axis,axis=1)
    t=np.clip(((p[v]-anchors[:2])*axis).sum(1)/(length*length),0,1)
    centers=anchors[:2]+t[:,None]*axis;segment=int(np.linalg.norm(p[v]-centers,axis=1).argmin())
    distance=float(t[segment]*length[segment]+(length[0] if segment else 0))
    bend=np.clip((distance-length[0]+.045)/.09,0,1);bend=bend*bend*(3-2*bend)
    wrist=np.clip((distance-length.sum()+.025)/.025,0,1);wrist=wrist*wrist*(3-2*wrist)
    j[v]=[index[side+'Arm'],index[side+'ForeArm'],index[side+'Hand'],0]
    w[v]=[(1-bend)*(1-wrist),bend*(1-wrist),wrist,0]
body=dict(version=1,sourceHash=meta['sourceHash'],solidAnatomy=True,
    positions=np.round(p[used],7).reshape(-1).tolist(),normals=np.round(n[used],7).reshape(-1).tolist(),uvs=np.round(uv[used],7).reshape(-1).tolist(),
    indices=remap[faces].reshape(-1).tolist(),regions=[4]*len(faces),joints=j[used].reshape(-1).tolist(),weights=np.round(w[used],7).reshape(-1).tolist(),
    bones=[dict(b,**m['rig'][b['name']])for b in m['bones']if b['index'] is not None and b['index']>=0 and b['name']in m['rig']])
if len(sys.argv)>3:body['hands']=json.loads(Path(sys.argv[3]).read_text())
(output/'soldier-body.json').write_text(json.dumps(body,separators=(',',':'),allow_nan=False))
# Only curls still need paint. Keep their old 512x1024 tile, discard arm paint.
old_paint=Image.open(output/'soldier-head-basecolor.webp').convert('RGB')
old_mask=Image.open(output/'soldier-head-mask.webp').convert('RGB')
assert old_paint.size==(1024,2048)
h=json.loads((output/'soldier-head.json').read_text());assert h.get('solidAnatomy') and all(kind!=1 for kind in h['painted'])
old_paint.crop((0,1024,1024,2048)).resize((512,1024),Image.Resampling.LANCZOS).save(output/'soldier-head-basecolor.webp',quality=95,method=6)
old_mask.resize((1024,2048),Image.Resampling.BILINEAR).crop((0,1024,1024,2048)).resize((256,512),Image.Resampling.BILINEAR).save(output/'soldier-head-mask.webp',lossless=True,method=6)
if h.get('afro'):
    for v in range(len(h['afro']['uvs'])//2):h['afro']['uvs'][v*2+1]=round(h['afro']['uvs'][v*2+1]*2-1,7)
(output/'soldier-head.json').write_text(json.dumps(h,separators=(',',':'),allow_nan=False))
print('Closed solid anatomical arms:',len(used),'vertices',len(faces),'triangles')
