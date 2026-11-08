"""Fit an original closed beard to the derived head in Blender, offline.

No ray queries, texture generation or separate beard draw during play.
Run after refine-head-sculpt.py; the owner's source GLBs stay untouched.
"""
import bpy, bmesh, json, math, sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

path = Path(sys.argv[sys.argv.index('--') + 1])
h = json.loads(path.read_text())
points = [h['positions'][i:i+3] for i in range(0, len(h['positions']), 3)]
skin = [h['indices'][i:i+3] for i in range(0, len(h['indices']), 3)
        if all(h['painted'][v] == 0 for v in h['indices'][i:i+3])]
bvh = BVHTree.FromPolygons(points, skin, all_triangles=True)
p, faces, shade, shades = [], [], [], []

def vertex(at, cavity=0, pigment=1):
    p.append(list(at)); shade.append(cavity); shades.append(pigment); return len(p)-1

rows, sides = 20, 44
for layer in range(2):
    for row in range(rows+1):
        t = row/rows
        for col in range(sides+1):
            angle = -1.85 + 3.7*col/sides
            side = abs(math.sin(angle))
            # Long sideburns flow into a full rounded chin, rather than a
            # thin bowl with a horizontal rim across both cheeks.
            upper = 1.340 + .080*side**2.4
            lower = 1.248 + .030*side**4
            y = lower + (upper-lower)*t
            direction = Vector((math.sin(angle), 0, math.cos(angle)))
            origin = Vector((0, max(y, 1.302), -.030)) + direction*.5
            hit, _, _, _ = bvh.ray_cast(origin, -direction, 1.)
            if hit is None: raise RuntimeError('Beard misses the closed jaw')
            skin_radius = max(.02, (hit-Vector((0, max(y, 1.302), -.030))).dot(direction))
            taper = .55 + .45*math.sin(min(1.,t/.48)*math.pi/2)
            # Swept locks share one closed surface. Their broad ridges remain
            # legible when minified, with no loose strips or sharp hair cards.
            flow = angle*19 + 2.6*(1-t)**1.6*math.sin(angle*1.8)
            ridge = .5+.5*math.cos(flow)
            groove = (.0023*math.cos(flow)+.0006*math.cos(flow*2+.5))*math.sin(math.pi*t)**.65
            radius = skin_radius*taper + .008 + .022*math.sin(math.pi*t)**.7 + groove
            radius = max(radius,.082*(1-t)**2)
            # Short highlights break up each lock; full-height bright bands
            # made the first browser version look like uniform corrugation.
            streak=max(0.,math.sin(t*math.pi*1.7+.7*math.sin(angle*4)))
            pigment = .80+.17*ridge+.10*streak*ridge**4-.09*(1-t)**2
            if layer:
                # A jaw-following inner surface replaces the old single fan
                # vertex. Its rounded bottom closes the beard under the chin
                # without a diagonal flap or fan-distorted rim normals.
                radius=max(.018,skin_radius-.012)
                y+=.008*(1-t)
                pigment=.68
            vertex((math.sin(angle)*radius, y, -.030+math.cos(angle)*radius),
                   .025+.045*(1-t)+.035*(1-ridge)*math.sin(math.pi*t),pigment)
            if row and col:
                a = layer*(rows+1)*(sides+1)+(row-1)*(sides+1)+col-1
                b, c, d = a+1, a+sides+2, a+sides+1
                fs = [[a,b,c],[a,c,d]]
                faces.extend([list(reversed(f)) if layer else f for f in fs])
loop = list(range(sides+1)) + [r*(sides+1)+sides for r in range(1,rows+1)]
loop += [rows*(sides+1)+c for c in range(sides-1,-1,-1)]
loop += [r*(sides+1) for r in range(rows-1,0,-1)]
inner=(rows+1)*(sides+1)
for a,b in zip(loop,loop[1:]+loop[:1]):
    faces.extend([[a,b,b+inner],[a,b+inner,a+inner]])

# Curved tapered moustache locks leave the lips and nose free.
for sign in [-1,1]:
    first=len(p); steps=20; sections=12
    for row in range(steps+1):
        t=row/steps; x=sign*(.003+.064*t); y=1.380-.037*t+.009*math.sin(math.pi*t)
        hit,_,_,_=bvh.ray_cast(Vector((x,y,.5)),Vector((0,0,-1)),1.)
        if hit is None: raise RuntimeError('Moustache misses upper lip')
        radius=.0015+.0125*math.sin(math.pi*(.10+.88*t))**.7
        for col in range(sections):
            a=col/sections*2*math.pi
            # A softly lobed cross section and neutral painted highlights
            # follow the curved lock, without fixing the chosen hair colour.
            r=radius*(1+.075*math.cos(a*4+t*3))
            vertex((x,y+math.sin(a)*r,hit.z+.008+math.cos(a)*r*.7),.025,
                   .78+.26*max(0.,math.cos(a-.6))+.04*math.cos(a*4+t*3))
            if row:
                aa=first+(row-1)*sections+col;bb=first+(row-1)*sections+(col+1)%sections
                cc=first+row*sections+(col+1)%sections;dd=first+row*sections+col
                faces.extend([[aa,bb,cc],[aa,cc,dd]])
    for col in range(1,sections-1):
        faces.append([first,first+col+1,first+col])
        last=first+steps*sections; faces.append([last,last+col,last+col+1])

mesh=bpy.data.meshes.new('fitted-beard');mesh.from_pydata(p,[],faces);mesh.update()
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
mesh.calc_loop_triangles()
h['beard']={'positions':[round(float(c),7) for v in mesh.vertices for c in v.co],
 'normals':[round(float(c),7) for v in mesh.vertices for c in v.normal],
 'indices':[v for f in mesh.loop_triangles for v in f.vertices], 'cavities':[round(s,6) for s in shade],
 'shades':[round(s,6) for s in shades]}
# Preserve the donor brow samples so repeated bakes never accumulate a frown.
# Fit the focused brow back onto the closed skin after lowering its inner end.
if 'browExpressionBase' not in h:
    h['browExpressionBase']=[[i]+h['positions'][i*3:i*3+3]+h['normals'][i*3:i*3+3]
                             for i,kind in enumerate(h['painted']) if kind==2]
for i,x,y,z,nx,ny,nz in h['browExpressionBase']:
    delta=.008*min(1.,abs(x)/.083)-.007
    old,_,_,_=bvh.ray_cast(Vector((x,y,.5)),Vector((0,0,-1)),1.)
    new,_,_,_=bvh.ray_cast(Vector((x,y+delta,.5)),Vector((0,0,-1)),1.)
    if old is None or new is None:raise RuntimeError('Focused brow misses closed skin')
    h['positions'][i*3:i*3+3]=[round(x,7),round(y+delta,7),round(float(new.z)+z-float(old.z),7)]
    normal=Vector((nx-(.008/.083)*(1 if x>=0 else -1)*ny,ny,nz)).normalized()
    h['normals'][i*3:i*3+3]=[round(float(v),7)for v in normal]

path.write_text(json.dumps(h,separators=(',',':'),allow_nan=False))
print('Fitted closed beard:',len(mesh.vertices),'vertices',len(mesh.loop_triangles),'triangles')
