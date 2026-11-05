"""Add fitted ink-like facial anatomy to the derived head, never source GLBs.

Offline BVH fitting follows the actual closed skin. The tiny ribbons join the
existing skinned head draw; no decals, runtime raycasts or new textures.
Usage: blender -b -t 2 -P scripts/sculpt-comic-face.py -- head.json
"""
import json, math, sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

path=Path(sys.argv[sys.argv.index('--')+1]); h=json.loads(path.read_text())
if 'comicDetailBase' in h:
    v,f=h['comicDetailBase']
    for k,dim in [('positions',3),('normals',3),('tints',3),('uvs',2),('painted',1)]:h[k]=h[k][:v*dim]
    h['indices']=h['indices'][:f]
h['comicDetailBase']=[len(h['painted']),len(h['indices'])]
p=[h['positions'][i:i+3] for i in range(0,len(h['positions']),3)]
f=[h['indices'][i:i+3] for i in range(0,len(h['indices']),3)]
faces=[face for face in f if all(h['painted'][v]==0 for v in face)]
bvh=BVHTree.FromPolygons(p,faces,all_triangles=True)

def stroke(points,width=.0008,dark=.27):
    # Quadratic Bezier, taper both ends and feather cross-section into the skin.
    start=len(h['painted']); steps=9; cols=3
    for r in range(steps+1):
        t=r/steps; u=1-t
        x=u*u*points[0][0]+2*u*t*points[1][0]+t*t*points[2][0]
        y=u*u*points[0][1]+2*u*t*points[1][1]+t*t*points[2][1]
        dx=2*u*(points[1][0]-points[0][0])+2*t*(points[2][0]-points[1][0])
        dy=2*u*(points[1][1]-points[0][1])+2*t*(points[2][1]-points[1][1])
        length=math.hypot(dx,dy) or 1
        w=width*(.12+.88*math.sin(math.pi*t)**.6)
        for c in range(cols):
            a=c-1; xx=x-dy/length*w*a; yy=y+dx/length*w*a
            hit,n,_,_=bvh.ray_cast(Vector((xx,yy,.5)),Vector((0,0,-1)),1.)
            if hit is None:raise RuntimeError('Comic anatomy misses face: '+str((xx,yy)))
            at=hit+n*.00055
            h['positions'].extend(round(float(v),7) for v in at)
            h['normals'].extend(round(float(v),7) for v in n)
            h['uvs'].extend([0,0]); h['painted'].append(3)
            shade=dark if c==1 else .96
            h['tints'].extend([shade,shade*.96,shade*.90])
            if r and c:
                aa=start+(r-1)*cols+c-1;bb=aa+1;cc=start+r*cols+c;dd=cc-1
                # Bezier direction is arbitrary: choose an outward winding.
                for tri in [[aa,bb,cc],[aa,cc,dd]]:
                    v=[Vector(h['positions'][i*3:i*3+3]) for i in tri]
                    if (v[1]-v[0]).cross(v[2]-v[0]).dot(n)<0:tri.reverse()
                    h['indices'].extend(tri)

for sign in [-1,1]:
    def curve(coords,w=.0008,d=.28):stroke([(sign*x,y) for x,y in coords],w,d)
    curve([(.027,1.437),(.046,1.448),(.069,1.437)],.00105,.19) # upper orbital lid
    curve([(.029,1.432),(.050,1.425),(.068,1.434)],.00065,.42)
    curve([(.073,1.438),(.080,1.441),(.086,1.440)],.00065,.40)
    curve([(.075,1.432),(.081,1.431),(.087,1.428)],.0006,.44)
    curve([(.017,1.409),(.025,1.395),(.024,1.384)],.0008,.34) # nasal side plane
    curve([(.015,1.380),(.025,1.375),(.030,1.382)],.0010,.22) # nostril
    curve([(.032,1.378),(.047,1.366),(.050,1.349)],.0008,.38) # cheek/mouth transition
    curve([(.062,1.407),(.076,1.405),(.085,1.398)],.0007,.48)
    curve([(.098,1.438),(.108,1.427),(.102,1.409)],.00085,.36) # ear cartilage
# Two quiet forehead arcs; these are skin-relative, never a fixed skin-colour cap.
stroke([(-.037,1.490),(0,1.497),(.038,1.490)],.00065,.59)
stroke([(-.026,1.505),(0,1.510),(.028,1.505)],.00050,.67)

# Bake soft contact shadows from the actual closed sculpt. A scalar lighting
# attribute preserves every selected skin pigment and needs no runtime rays,
# extra texture, post pass or change to head topology.
occlusion=[]
for vertex,paint in enumerate(h['painted']):
    if paint not in (0,1):
        occlusion.append(0.);continue
    at=Vector(h['positions'][vertex*3:vertex*3+3]); n=Vector(h['normals'][vertex*3:vertex*3+3]).normalized()
    axis=Vector((0.,1.,0.)) if abs(n.y)<.9 else Vector((1.,0.,0.))
    tangent=n.cross(axis).normalized();bitangent=n.cross(tangent).normalized()
    shade=0.;samples=32
    for ray in range(samples):
        radius=math.sqrt((ray+.5)/samples);angle=ray*2.39996323
        direction=tangent*(math.cos(angle)*radius)+bitangent*(math.sin(angle)*radius)+n*math.sqrt(1-radius*radius)
        hit,_,_,distance=bvh.ray_cast(at+n*.0007,direction,.045)
        if hit is not None:shade+=1-(distance/.045)**.55
    occlusion.append(min(.48,shade/samples*1.65))

# Smooth only across skin neighbours, preventing Monte Carlo speckles on a
# moving cheek. Hair/ink vertices have their own colour and remain untouched.
neighbours=[set() for _ in occlusion]
for face in f:
    for vertex in face:
        if h['painted'][vertex] not in (0,1):continue
        neighbours[vertex].update(other for other in face if other!=vertex and h['painted'][other] in (0,1))
for _ in range(2):
    occlusion=[value*.5+sum(occlusion[j] for j in neighbours[i])/len(neighbours[i])*.5 if neighbours[i] else value
        for i,value in enumerate(occlusion)]
h['ambientOcclusion']=[round(value,5) for value in occlusion]
path.write_text(json.dumps(h,separators=(',',':'),allow_nan=False))
print('Comic facial anatomy:',(len(h['indices'])-h['comicDetailBase'][1])//3,'triangles, fitted to closed skin')
print('Baked skin contact shade:',len(occlusion),'vertices, peak',round(max(occlusion),3))
