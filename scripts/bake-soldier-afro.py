"""Reuse the owner's sculpted curls with any face/hat, in the shared head frame.

The original black paint becomes a bounded vertex shade, not a fixed hair colour.
No extra texture, material or draw is needed for another selected hair colour.
"""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image

source, output = map(Path,sys.argv[1:3])
m=json.loads(source.read_text());assert m['key']=='lagoon-allrounder'
metadata=json.loads((output/'lagoon-allrounder-wardrobe.json').read_text())
h=json.loads((output/'soldier-head.json').read_text())
p=np.array(m['positions']).reshape(-1,3);n=np.array(m['normals']).reshape(-1,3);uv=np.array(m['uv']).reshape(-1,2)
f=np.array(m['indices']).reshape(-1,3);pigment=np.array(metadata['pigment']);regions=np.array(metadata['regions'])
faces=f[np.array(metadata['afroFaces'],dtype=int)]
used=np.unique(faces);remap=np.full(len(p),-1,dtype=int);remap[used]=np.arange(len(used))
paint=np.asarray(Image.open(output/'lagoon-allrounder-basecolor.webp').convert('RGB'),dtype=np.float32)/255
xy=np.clip(np.rint(uv[used]*2047).astype(int),0,2047);rgb=paint[xy[:,1],xy[:,0]]
shade=np.clip((rgb.mean(1)/max(np.mean(metadata['hairReference']),.01))**.45,.55,1.25)
positions=p[used].copy();scale=.125/.15
positions[:,0]*=scale;positions[:,1]=h['frame']['y']+(positions[:,1]-m['head']['y'])*scale
positions[:,2]=h['frame']['z']+(positions[:,2]-m['head']['z'])*scale
# Keep the actual curl paint, not just one shade per vertex. The face and hair
# share one atlas/sampler pair; their pigment masks remain separate layers.
face_paint=Image.open(output/'soldier-head-basecolor.webp').convert('RGB')
face_mask=Image.open(output/'soldier-head-mask.webp').convert('RGB')
reference=np.array(h['hairReference'],dtype=np.float32)
hair_shade=np.clip((paint.mean(2)/max(np.mean(metadata['hairReference']),.01))**.45,.35,1.35)
hair_paint=Image.fromarray(np.uint8(np.clip(hair_shade[:,:,None]*reference[None,None,:],0,1)*255))
# Eight-pixel gutters stop mipmaps mixing the two atlas regions.
def tile(image):
    data=np.asarray(image.resize((1008,1008),Image.Resampling.LANCZOS))
    return Image.fromarray(np.pad(data,((8,8),(8,8),(0,0)),mode='edge'))
atlas=Image.new('RGB',(1024,2048));atlas.paste(tile(face_paint),(0,0));atlas.paste(tile(hair_paint),(0,1024))
mask_atlas=Image.new('RGB',(1024,2048));mask_atlas.paste(tile(face_mask),(0,0));mask_atlas.paste(Image.new('RGB',(1024,1024),(0,255,0)),(0,1024))
atlas.save(output/'soldier-head-basecolor.webp',quality=95,method=6)
mask_atlas.resize((512,1024),Image.Resampling.BILINEAR).save(output/'soldier-head-mask.webp',lossless=True,method=6)
for v,kind in enumerate(h['painted']):
    if kind==1:
        h['uvs'][v*2]=round((h['uvs'][v*2]*1008+8)/1024,7)
        h['uvs'][v*2+1]=round((h['uvs'][v*2+1]*1008+8)/2048,7)
afro_uv=uv[used].copy();afro_uv[:,0]=(afro_uv[:,0]*1008+8)/1024;afro_uv[:,1]=(afro_uv[:,1]*1008+1032)/2048
h['afro']={'sourceHash':metadata['sourceHash'],'positions':np.round(positions,7).reshape(-1).tolist(),
 'normals':np.round(n[used],7).reshape(-1).tolist(),'uvs':np.round(afro_uv,7).reshape(-1).tolist(),
 'indices':remap[faces].reshape(-1).tolist(),'shades':np.round(shade,6).tolist()}
(output/'soldier-head.json').write_text(json.dumps(h,separators=(',',':'),allow_nan=False))
print('Reusable authored afro:',len(used),'vertices',len(faces),'triangles')
