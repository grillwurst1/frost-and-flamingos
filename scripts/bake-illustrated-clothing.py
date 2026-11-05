"""Preserve authored clothing paint/rig while trimming and lining open seams.

Offline mesh processing only. Original GLBs are never changed. A thin inner
lining and stitched boundary surfaces keep the actual sculpted cloth, rather
than remeshing an open garment into disconnected fragments.
python3 scripts/bake-illustrated-clothing.py source.json metadata.json out.json 3|6
"""
import json,math,sys
from pathlib import Path
from collections import defaultdict,Counter
import numpy as np
args=sys.argv[1:]
if '--' in args:args=args[args.index('--')+1:]
source,metadata,output=map(Path,args[:3]);region=int(args[3]) if len(args)>3 else 6
m=json.loads(source.read_text());w=json.loads(metadata.read_text())
assert m['key']=='alpine-allrounder' and region in [3,6]
p=np.array(m['positions']).reshape(-1,3);n=np.array(m['normals']).reshape(-1,3)
u=np.array(m['uv']).reshape(-1,2);j=np.array(m['joints']).reshape(-1,4);weights=np.array(m['weights']).reshape(-1,4)
f=np.array(m['indices']).reshape(-1,3)
def normal(v):
    length=np.linalg.norm(v);return v/length if length>1e-9 else np.array([0.,1.,0.])
def original(v):return {'p':p[v].copy(),'n':normal(n[v]),'uv':u[v].copy(),'w':{int(b):float(q) for b,q in zip(j[v],weights[v]) if q>0},'skin':float(w['pigment'][v]==1)}
def blend(a,b,t):
    out={k:a[k]*(1-t)+b[k]*t for k in ['p','n','uv','skin']}
    out['n']=normal(out['n']);out['w']={bone:a['w'].get(bone,0)*(1-t)+b['w'].get(bone,0)*t for bone in a['w'].keys()|b['w'].keys()}
    return out
triangles=[];seen=set()
for fi,face in enumerate(f):
    if w['regions'][fi]!=region:continue
    poly=[original(v) for v in face]
    if region==6:
        # Clothing sits over the independent anatomical leg. Donor knee/skin
        # surfaces would intersect it and produce the owner's triangle scraps.
        for measure in [lambda v:.5-v['skin'],lambda v:v['p'][1]-.56]:
            clipped=[]
            for a,b in zip(poly,poly[1:]+poly[:1]):
                da,db=measure(a),measure(b);inside=da>=0;other=db>=0
                if inside:clipped.append(a)
                if inside!=other:clipped.append(blend(a,b,da/(da-db)))
            poly=clipped
            if not poly:break
    for q in range(1,len(poly)-1):
        tri=[poly[0],poly[q],poly[q+1]]
        if np.linalg.norm(np.cross(tri[1]['p']-tri[0]['p'],tri[2]['p']-tri[0]['p']))<1e-10:continue
        key=tuple(sorted(tuple(np.round(v['p'],6)) for v in tri))
        if key in seen:continue
        seen.add(key);triangles.append(tri)
# Welded coordinate keys preserve UV islands while identifying the real cloth edge.
def coord(v):return tuple(round(float(q),6) for q in v['p'])
edge_uses=defaultdict(list);smooth=defaultdict(lambda:np.zeros(3))
for tri in triangles:
    for v in tri:smooth[coord(v)]+=v['n']
    for a,b in zip(tri,tri[1:]+tri[:1]):edge_uses[tuple(sorted([coord(a),coord(b)]))].append((a,b))
for k in smooth:smooth[k]=normal(smooth[k])
res={k:[] for k in ['positions','normals','uvs','joints','weights','indices','pigment']};cache={}
def vertex(v,inside=False,wall_normal=None):
    point=np.array(coord(v));norm=normal(v['n']);thickness=.0015
    if inside:point=point-smooth[coord(v)]*thickness;norm=-norm
    if wall_normal is not None:norm=wall_normal
    best=sorted(v['w'].items(),key=lambda q:q[1],reverse=True)[:4]
    while len(best)<4:best.append((0,0.))
    total=sum(q[1] for q in best);assert total>.01
    values=[*point,*norm,*v['uv'],*[q[0] for q in best],*[q[1]/total for q in best],int(v['skin']>.5)]
    key=tuple(round(float(q),7) for q in values)
    if key in cache:return cache[key]
    index=len(res['pigment']);cache[key]=index
    res['positions'].extend(round(float(q),7) for q in point);res['normals'].extend(round(float(q),7) for q in norm)
    res['uvs'].extend(round(float(q),7) for q in v['uv']);res['joints'].extend(q[0] for q in best)
    res['weights'].extend(round(q[1]/total,7) for q in best);res['pigment'].append(int(v['skin']>.5))
    return index
for tri in triangles:
    res['indices'].extend(vertex(v) for v in tri)
    res['indices'].extend(vertex(v,True) for v in reversed(tri))
for uses in edge_uses.values():
    if len(uses)!=1:continue
    a,b=uses[0];wall=normal(np.cross(b['p']-a['p'],smooth[coord(a)]))
    aa,bb,cc,dd=vertex(a,False,wall),vertex(b,False,wall),vertex(b,True,wall),vertex(a,True,wall)
    res['indices'].extend([aa,cc,bb,aa,dd,cc])
res['sourceHash']=w['sourceHash'];res['version']=1
output.write_text(json.dumps(res,separators=(',',':'),allow_nan=False))
area=sum(np.linalg.norm(np.cross(tri[1]['p']-tri[0]['p'],tri[2]['p']-tri[0]['p']))/2 for tri in triangles)
print('Authored lined clothing',region,'outer area',round(float(area),4),'m2;',len(res['indices'])//3,'triangles;',len(res['pigment']),'vertices')
