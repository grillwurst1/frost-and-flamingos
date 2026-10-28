"""Extract the owner's sculpted bare arms for the existing configurable rigs.

Skin is a semantic base layer; donor complexion never becomes the player's skin
colour. The visible cloth paint stays on its own surfaces in the shared atlas.
"""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter

source,output=map(Path,sys.argv[1:3])
m=json.loads(source.read_text());assert m['key']=='lagoon-heavy'
meta=json.loads((output/'lagoon-heavy-wardrobe.json').read_text())
p=np.array(m['positions']).reshape(-1,3);n=np.array(m['normals']).reshape(-1,3);uv=np.array(m['uv']).reshape(-1,2)
j=np.array(m['joints'],dtype=int).reshape(-1,4);w=np.array(m['weights']).reshape(-1,4);f=np.array(m['indices'],dtype=int).reshape(-1,3)
faces=f[np.array(meta['regions'])==4]
# Bone-majority regions include a few donor hand triangles. Clip at each
# actual wrist so the configurable hand is the only hand on that forearm.
# Interpolate paint, normals and skin weights at the cut, not whole faces.
points=p.tolist();normal_values=n.tolist();tex_values=uv.tolist();joint_values=j.tolist();weight_values=w.tolist()
clipped=[];crossings={};wrist_margin=.004
for face in faces:
    side='Left' if p[face,0].mean()>0 else 'Right'
    wrist=np.array(m['bind'][side+'Hand']);forearm=np.array(m['bind'][side+'ForeArm'])
    axis=wrist-forearm;axis/=np.linalg.norm(axis)
    distances=(p[face]-wrist)@axis-wrist_margin
    poly=[]
    for k in range(3):
        a=int(face[k]);b=int(face[(k+1)%3]);da=float(distances[k]);db=float(distances[(k+1)%3])
        if da<=0:poly.append(a)
        if (da<=0)!=(db<=0):
            key=(side,min(a,b),max(a,b))
            if key not in crossings:
                t=da/(da-db);at=len(points);crossings[key]=at
                points.append((p[a]*(1-t)+p[b]*t).tolist())
                normal=n[a]*(1-t)+n[b]*t;length=np.linalg.norm(normal)
                normal_values.append((normal/length if length>1e-8 else n[a]).tolist())
                tex_values.append((uv[a]*(1-t)+uv[b]*t).tolist())
                influences={}
                for v,factor in [(a,1-t),(b,t)]:
                    for bone,weight in zip(j[v],w[v]):
                        if weight>0:influences[int(bone)]=influences.get(int(bone),0.)+float(weight)*factor
                strongest=sorted(influences.items(),key=lambda item:item[1],reverse=True)[:4]
                total=sum(weight for _,weight in strongest)
                joint_values.append([bone for bone,_ in strongest]+[0]*(4-len(strongest)))
                weight_values.append([weight/total for _,weight in strongest]+[0.]*(4-len(strongest)))
            poly.append(crossings[key])
    for k in range(1,len(poly)-1):clipped.append([poly[0],poly[k],poly[k+1]])
p=np.array(points);n=np.array(normal_values);uv=np.array(tex_values)
j=np.array(joint_values,dtype=int);w=np.array(weight_values);faces=np.array(clipped,dtype=int)
used=np.unique(faces);remap=np.full(len(p),-1,dtype=int);remap[used]=np.arange(len(used))
paint=Image.open(output/'lagoon-heavy-basecolor.webp').convert('RGB')
mask=Image.new('RGB',paint.size);draw=ImageDraw.Draw(mask)
for face in faces:
    draw.polygon([(float(uv[v,0])*(paint.width-1),float(uv[v,1])*(paint.height-1))for v in face],fill=(255,0,0))
mask=mask.filter(ImageFilter.MaxFilter(9))
# Keep the face's full original tile. Curls and arms share the lower half,
# avoiding an extra texture allocation or a larger scene-wide GPU footprint.
old_paint=Image.open(output/'soldier-head-basecolor.webp').convert('RGB');old_mask=Image.open(output/'soldier-head-mask.webp').convert('RGB')
assert old_paint.size==(1024,2048)
def padded(image):
    raw=np.asarray(image.resize((496,1008),Image.Resampling.LANCZOS))
    return Image.fromarray(np.pad(raw,((8,8),(8,8),(0,0)),mode='edge'))
atlas=old_paint.copy();atlas.paste(old_paint.crop((0,1024,1024,2048)).resize((512,1024),Image.Resampling.LANCZOS),(0,1024));atlas.paste(padded(paint),(512,1024))
mask_atlas=old_mask.resize((1024,2048),Image.Resampling.BILINEAR)
mask_atlas.paste(mask_atlas.crop((0,1024,1024,2048)).resize((512,1024),Image.Resampling.BILINEAR),(0,1024));mask_atlas.paste(padded(mask),(512,1024))
atlas.save(output/'soldier-head-basecolor.webp',quality=95,method=6)
mask_atlas.resize((512,1024),Image.Resampling.BILINEAR).save(output/'soldier-head-mask.webp',lossless=True,method=6)
h=json.loads((output/'soldier-head.json').read_text())
if h.get('afro'):
    for v in range(len(h['afro']['uvs'])//2):h['afro']['uvs'][v*2]=round(h['afro']['uvs'][v*2]*.5,7)
(output/'soldier-head.json').write_text(json.dumps(h,separators=(',',':'),allow_nan=False))
body_uv=uv[used].copy();body_uv[:,0]=(body_uv[:,0]*496+520)/1024;body_uv[:,1]=(body_uv[:,1]*1008+1032)/2048
body={'version':1,'sourceHash':meta['sourceHash'],'positions':np.round(p[used],7).reshape(-1).tolist(),
 'normals':np.round(n[used],7).reshape(-1).tolist(),'uvs':np.round(body_uv,7).reshape(-1).tolist(),
 'indices':remap[faces].reshape(-1).tolist(),'regions':[4]*len(faces),'joints':j[used].reshape(-1).tolist(),'weights':np.round(w[used],7).reshape(-1).tolist(),
 'bones':[dict(b,**m['rig'][b['name']])for b in m['bones']if b['index'] is not None and b['index']>=0 and b['name']in m['rig']]}
(output/'soldier-body.json').write_text(json.dumps(body,separators=(',',':'),allow_nan=False))
print('Shared anatomical arms:',len(used),'vertices',len(faces),'triangles')
