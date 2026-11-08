"""Project the owner's original Heavy beard paint onto the closed wardrobe beard.

Offline only. The existing shared hair atlas gains a 512x256 beard tile beside
its original curl tile; both retain selectable pigments through a neutral mask.
Usage: python3 scripts/bake-beard-paint.py exported-heavy.json public/models
"""
import hashlib, json, math, subprocess, sys, tempfile
from pathlib import Path
import numpy as np


def project(source, models, temporary):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from mathutils.geometry import barycentric_transform
    m=json.loads(source.read_text());meta=json.loads((models/'alpine-heavy-wardrobe.json').read_text())
    p=np.array(m['positions']).reshape(-1,3);uv=np.array(m['uv']).reshape(-1,2)
    f=np.array(m['indices']).reshape(-1,3);rgb=np.load(temporary/'source-paint.npy')
    def sample(tex):
        x,y=np.clip(np.rint(np.array(tex)*[rgb.shape[1]-1,rgb.shape[0]-1]).astype(int),0,[rgb.shape[1]-1,rgb.shape[0]-1])
        return rgb[y,x]
    colours=np.array([sample(t)for t in uv]);hair=[]
    for face,region in zip(f,meta['regions']):
        at=p[face].mean(0);c=colours[face].mean(0)
        if region in (1,2) and 1.005<at[1]<1.31 and abs(at[0])<.18 and at[2]>-.07 and c[0]>c[1]*1.25 and c[2]<c[1]*.57:
            hair.append(face.tolist())
    assert len(hair)>500,'Missing original beard surface'
    reference=float(np.dot(np.median(colours[np.unique(hair)],axis=0),[.299,.587,.114]))
    p[:,0]*=.75;p[:,1]=(p[:,1]-1.3273)*.66+1.438;p[:,2]=(p[:,2]-.182)*.66+.05
    bvh=BVHTree.FromPolygons(p.tolist(),hair,all_triangles=True)
    # Match texel density to the short beard's circumference/height. A tall
    # 1024-row tile made isotropic mip selection erase horizontal strand detail.
    rows,cols=240,496;shades=np.ones((rows,cols),np.float32);hits=0
    for row in range(rows):
        y=1.445-row/(rows-1)*.225;centre=Vector((0,y,-.03))
        for col in range(cols):
            angle=(col/(cols-1)-.5)*2*math.pi;direction=Vector((math.sin(angle),0,math.cos(angle)))
            hit,_,fi,_=bvh.ray_cast(centre+direction*.6,-direction,1.2)
            if hit is None:
                hit,_,fi,distance=bvh.find_nearest(centre+direction*.11)
                if hit is None or distance>.045:continue
            face=hair[fi]
            tex=barycentric_transform(hit,*[Vector(p[i])for i in face],*[Vector((uv[i][0],uv[i][1],0))for i in face])
            colour=sample(tex.xy)
            # Exclude fur/skin texels at the donor's cut edges, never bake their hue.
            if colour[0]<colour[1]*1.15 or colour[2]>colour[1]*.75:continue
            shades[row,col]=np.clip((np.dot(colour,[.299,.587,.114])/max(reference,.01))**.9,.48,1.4);hits+=1
    assert hits>rows*cols*.35,'Original beard projection has insufficient coverage'
    np.save(temporary/'beard-shades.npy',shades)
    print('Original beard paint projected:',len(hair),'source triangles,',hits,'texels',flush=True)


def bake(source, models):
    from PIL import Image
    m=json.loads(source.read_text());assert m['key']=='alpine-heavy'
    meta=json.loads((models/'alpine-heavy-wardrobe.json').read_text())
    source_hash=hashlib.sha256((models/'alpine-heavy.glb').read_bytes()).hexdigest()
    assert meta['sourceHash']==source_hash and meta['vertexCount']==len(m['positions'])//3
    assert meta['indexCount']==len(m['indices'])
    head_path=models/'soldier-head.json';h=json.loads(head_path.read_text());assert h.get('beard')and h.get('afro')
    assert all(kind!=1 for kind in h['painted']),'Hair-only atlas requires solid anatomical skin'
    with tempfile.TemporaryDirectory(prefix='ff-beard-paint-')as name:
        temporary=Path(name)
        np.save(temporary/'source-paint.npy',np.asarray(Image.open(models/'alpine-heavy-basecolor.webp').convert('RGB'),dtype=np.float32)/255)
        subprocess.run(['blender','--background','--factory-startup','--threads','2','--python',str(Path(__file__).resolve()),'--','--worker',str(source.resolve()),str(models.resolve()),str(temporary)],check=True)
        shades=np.load(temporary/'beard-shades.npy')
    # Neutral grey carries painted value; runtime applies the chosen hair colour.
    reference=np.array([.5,.5,.5],np.float32)
    beard=Image.fromarray(np.uint8(np.clip(shades[:,:,None]*reference,0,1)*255))
    beard=Image.fromarray(np.pad(np.asarray(beard),((8,8),(8,8),(0,0)),mode='edge'))
    # Recreate the original curl recipe without resampling a previous WebP.
    afro_meta=json.loads((models/'lagoon-allrounder-wardrobe.json').read_text())
    afro_rgb=np.asarray(Image.open(models/'lagoon-allrounder-basecolor.webp').convert('RGB'),dtype=np.float32)/255
    curl=np.clip((afro_rgb.mean(2)/max(np.mean(afro_meta['hairReference']),.01))**.45,.35,1.35)
    afro=Image.fromarray(np.uint8(np.clip(curl[:,:,None]*reference,0,1)*255)).resize((1008,1008),Image.Resampling.LANCZOS)
    afro=Image.fromarray(np.pad(np.asarray(afro),((8,8),(8,8),(0,0)),mode='edge')).resize((512,1024),Image.Resampling.LANCZOS)
    atlas=Image.new('RGB',(1024,1024),(127,127,127));atlas.paste(beard,(0,0));atlas.paste(afro,(512,0))
    atlas.save(models/'soldier-head-basecolor.webp',quality=95,method=6)
    # All painted vertices are hair; skin is separate solid anatomy. A single
    # lossless green texel provides the same mask at every mip and saves VRAM.
    Image.new('RGB',(1,1),(0,255,0)).save(models/'soldier-head-mask.webp',lossless=True,method=6)
    # Packed UVs are repeatable, including when the shape was rebaked separately.
    already_packed=h.get('beardPaintAtlas')==1
    for i in range(0,len(h['afro']['uvs']),2):
        u=h['afro']['uvs'][i];h['afro']['uvs'][i]=round(u if already_packed else .5+u*.5,7)
    tex=[]
    for x,y,z in np.array(h['beard']['positions']).reshape(-1,3):
        u=.5+math.atan2(x,z+.03)/(2*math.pi);v=np.clip((1.445-y)/.225,0,1)
        tex.extend([round((8+u*495)/1024,7),round((8+v*239)/1024,7)])
    h['beard']['uvs']=tex;h['beard']['sourceHash']=source_hash;h['beardPaintAtlas']=1;h['hairReference']=reference.tolist()
    head_path.write_text(json.dumps(h,separators=(',',':'),allow_nan=False))
    print('Packed shared hair atlas: 1024x1024, no additional sampler pair',flush=True)


if __name__=='__main__':
    if '--worker'in sys.argv:
        at=sys.argv.index('--worker');project(*map(Path,sys.argv[at+1:at+4]))
    else:
        bake(*map(Path,sys.argv[1:3]))
