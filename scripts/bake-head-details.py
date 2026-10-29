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
p, faces, shade = [], [], []

def vertex(at, cavity=0):
    p.append(list(at)); shade.append(cavity); return len(p)-1

rows, sides = 12, 40
for layer in range(1):
    for row in range(rows+1):
        t = row/rows
        for col in range(sides+1):
            angle = -1.85 + 3.7*col/sides
            side = abs(math.sin(angle))
            upper = 1.356 + .073*side**2
            lower = 1.260 + .063*side**1.6
            y = lower + (upper-lower)*t
            direction = Vector((math.sin(angle), 0, math.cos(angle)))
            origin = Vector((0, max(y, 1.302), -.030)) + direction*.5
            hit, _, _, _ = bvh.ray_cast(origin, -direction, 1.)
            if hit is None: raise RuntimeError('Beard misses the closed jaw')
            radius = max(.02, (hit-Vector((0, max(y, 1.302), -.030))).dot(direction))
            taper = min(1., max(.28, (y-1.260)/.045))
            groove = .0017*math.cos(angle*23+t*1.6)*math.sin(math.pi*t)
            radius = radius*taper + .006 + .007*math.sin(math.pi*t) + groove - layer*.009
            vertex((math.sin(angle)*radius, y, -.030+math.cos(angle)*radius),
                   .025 + .065*(1-t) + .035*(1-math.cos(angle*23))*math.sin(math.pi*t))
            if row and col:
                a = layer*(rows+1)*(sides+1)+(row-1)*(sides+1)+col-1
                b, c, d = a+1, a+sides+2, a+sides+1
                fs = [[a,b,c],[a,c,d]]
                faces.extend([list(reversed(f)) if layer else f for f in fs])
loop = list(range(sides+1)) + [r*(sides+1)+sides for r in range(1,rows+1)]
loop += [rows*(sides+1)+c for c in range(sides-1,-1,-1)]
loop += [r*(sides+1) for r in range(rows-1,0,-1)]
back = vertex((0, 1.341, -.045), .03)
for a,b in zip(loop,loop[1:]+loop[:1]): faces.append([a,back,b])

# Curved tapered moustache locks leave the lips and nose free.
for sign in [-1,1]:
    first=len(p); steps=14; sections=8
    for row in range(steps+1):
        t=row/steps; x=sign*(.003+.053*t); y=1.370-.013*t+.002*math.sin(math.pi*t)
        hit,_,_,_=bvh.ray_cast(Vector((x,y,.5)),Vector((0,0,-1)),1.)
        if hit is None: raise RuntimeError('Moustache misses upper lip')
        radius=.0013+.005*math.sin(math.pi*(.12+.84*t))**.7
        for col in range(sections):
            a=col/sections*2*math.pi
            vertex((x,y+math.sin(a)*radius,hit.z+.004+math.cos(a)*radius),.03)
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
 'indices':[v for f in mesh.loop_triangles for v in f.vertices], 'cavities':[round(s,6) for s in shade]}
path.write_text(json.dumps(h,separators=(',',':'),allow_nan=False))
print('Fitted closed beard:',len(mesh.vertices),'vertices',len(mesh.loop_triangles),'triangles')
