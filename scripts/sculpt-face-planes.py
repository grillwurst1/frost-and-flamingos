"""Sculpt continuous facial planes offline, preserving closed skin and palette.

Run on a fresh derived head before fitting beard/brows and comic creases.
An existing version marker prevents repeated deformation of baked assets.
"""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
path=Path(sys.argv[sys.argv.index('--')+1]);h=json.loads(path.read_text())
if h.get('facePlaneSculptVersion')==1:
 print('Facial planes already sculpted; geometry unchanged');sys.exit(0)
assert not h.get('facePlaneSculptVersion'),'Rebuild the head from its original source before changing sculpt versions'
assert h.get('solidAnatomy') and all(kind!=1 for kind in h['painted'])
def bump(a,b):return math.exp(-a*a-b*b)
def sculpt(v):
 x,y,z=v;u=max(0.,min(1.,(z-.005)/.05));front=u*u*(3-2*u)
 nose=bump(x/.028,(y-1.402)/.029)*front
 cheek=bump((abs(x)-.065)/.029,(y-1.402)/.030)*front
 brow=bump((abs(x)-.045)/.030,(y-1.453)/.016)*front
 jaw=bump(x/.10,(y-1.348)/.035)*front
 return Vector((x*(1+.22*nose+.035*jaw),y,z+.007*nose+.005*cheek+.004*brow))
def normal_at(v,n):
 eps=.00001;columns=[]
 for axis in range(3):
  a=Vector(v);b=Vector(v);a[axis]-=eps;b[axis]+=eps
  columns.append((sculpt(b)-sculpt(a))/(2*eps))
 return (Matrix(columns).transposed().inverted().transposed()@Vector(n)).normalized()
# Preserve un-focused brow samples, including on a previously baked clean head.
brow=h.get('browExpressionBase')or[[i]+h['positions'][i*3:i*3+3]+h['normals'][i*3:i*3+3]for i,k in enumerate(h['painted'])if k==2]
for i in range(len(h['painted'])):
 p=h['positions'][i*3:i*3+3];n=h['normals'][i*3:i*3+3]
 at=sculpt(p);norm=normal_at(p,n)
 h['positions'][i*3:i*3+3]=[round(float(c),7)for c in at]
 h['normals'][i*3:i*3+3]=[round(float(c),7)for c in norm]
# Give each curved brow a fuller cross-section without moving its endpoints
# off the skull. The following fitting bake restores exact skin clearance.
new_brow=[]
for start in range(0,len(brow),8):
 ring=brow[start:start+8];centre=sum((Vector(v[1:4])for v in ring),Vector())/len(ring)
 for i,x,y,z,nx,ny,nz in ring:
  raw=Vector((x,centre.y+(y-centre.y)*1.25,centre.z+(z-centre.z)*1.25))
  n=Vector((nx,ny/1.25,nz/1.25)).normalized();at=sculpt(raw);norm=normal_at(raw,n)
  row=[i]+[round(float(c),7)for c in at]+[round(float(c),7)for c in norm]
  new_brow.append(row);h['positions'][i*3:i*3+3]=row[1:4];h['normals'][i*3:i*3+3]=row[4:7]
h['browExpressionBase']=new_brow
# Recalculate the actual closed-skin normals after moving its existing vertices.
mesh=bpy.data.meshes.new('sculpted-facial-planes')
p=[h['positions'][i:i+3]for i in range(0,len(h['positions']),3)]
f=[h['indices'][i:i+3]for i in range(0,len(h['indices']),3)if all(h['painted'][v]==0 for v in h['indices'][i:i+3])]
mesh.from_pydata(p,[],f);mesh.update()
for i,kind in enumerate(h['painted']):
 if kind==0:
  h['normals'][i*3:i*3+3]=[round(float(c),7)for c in mesh.vertices[i].normal]
  # The following comic-face bake calculates one contact-lighting attribute
  # on the final sculpt. Do not multiply it by the older UV cavity bake too.
  h['uvs'][i*2:i*2+2]=[0,0]
h['facePlaneSculptVersion']=1
path.write_text(json.dumps(h,separators=(',',':'),allow_nan=False))
print('Sculpted nose, cheek, orbital and jaw planes; topology/pigment unchanged')
