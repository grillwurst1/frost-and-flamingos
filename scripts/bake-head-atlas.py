"""Blender batch step: repack the sculpt's tiny UV islands and bake clean paint.

Run through bake-soldier-head.py, never on the owner's original GLB files.
"""
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

head_file, source_paint, source_mask, target_paint, target_mask = map(Path, sys.argv[sys.argv.index('--')+1:])
h = json.loads(head_file.read_text())
p = [h['positions'][i:i+3] for i in range(0,len(h['positions']),3)]
n = [h['normals'][i:i+3] for i in range(0,len(h['normals']),3)]
uv = [h['uvs'][i:i+2] for i in range(0,len(h['uvs']),2)]
f = [h['indices'][i:i+3] for i in range(0,len(h['indices']),3)]
painted_faces = [face for face in f if all(h['painted'][v] == 1 for v in face)]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
mesh = bpy.data.meshes.new('wardrobe-face-atlas')
mesh.from_pydata(p, [], painted_faces); mesh.update()
obj = bpy.data.objects.new('wardrobe-face-atlas', mesh)
bpy.context.collection.objects.link(obj); bpy.context.view_layer.objects.active = obj; obj.select_set(True)
source_uv = mesh.uv_layers.new(name='source')
for polygon, face in zip(mesh.polygons, painted_faces):
    polygon.use_smooth = True
    for loop, v in zip(polygon.loop_indices, face): source_uv.data[loop].uv = (uv[v][0], 1-uv[v][1])
# Weld geometry while preserving UVs on the face corners. Repacking unconnected
# triangles would reproduce the old thousands-of-islands problem.
bm = bmesh.new(); bm.from_mesh(mesh)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.000001)
bmesh.ops.dissolve_degenerate(bm, dist=0.0000001, edges=list(bm.edges))
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(mesh); bm.free(); mesh.update()
atlas = mesh.uv_layers.new(name='atlas'); mesh.uv_layers.active = atlas; atlas.active_render = True
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=.018, area_weight=0., correct_aspect=True, scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')
mesh = obj.data; mesh.update(); atlas = mesh.uv_layers['atlas']
assert all(math.isfinite(c) for loop in atlas.data for c in loop.uv), 'Non-finite packed UV'
material = bpy.data.materials.new('original-pigment-transfer'); material.use_nodes = True
nodes = material.node_tree.nodes; nodes.clear()
output = nodes.new('ShaderNodeOutputMaterial'); emission = nodes.new('ShaderNodeEmission')
old_uv = nodes.new('ShaderNodeUVMap'); old_uv.uv_map='source'
source = nodes.new('ShaderNodeTexImage'); source.interpolation='Linear'
target = nodes.new('ShaderNodeTexImage'); target.select=True; nodes.active=target
links = material.node_tree.links
links.new(old_uv.outputs['UV'], source.inputs['Vector']); links.new(source.outputs['Color'], emission.inputs['Color']); links.new(emission.outputs[0],output.inputs['Surface'])
obj.data.materials.append(material)
scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=1
scene.render.threads_mode='FIXED'; scene.render.threads=2
scene.render.bake.margin=12; scene.render.bake.margin_type='EXTEND'; scene.render.bake.use_clear=True
scene.view_settings.view_transform='Standard'
for source_path, target_path, is_mask in [(source_paint,target_paint,False),(source_mask,target_mask,True)]:
    source.image=bpy.data.images.load(str(source_path),check_existing=False)
    source.image.colorspace_settings.name='Non-Color' if is_mask else 'sRGB'
    image=bpy.data.images.new('clean-head-mask' if is_mask else 'clean-head-paint', width=1024,height=1024,alpha=False)
    image.colorspace_settings.name='Non-Color' if is_mask else 'sRGB'
    target.image=image; nodes.active=target
    bpy.ops.object.bake(type='EMIT')
    image.filepath_raw=str(target_path); image.file_format='PNG'; image.save()
# Preserve the artist's normals across UV seams; only the UV coordinates change.
normal_lookup={}
for point, normal in zip(p,n): normal_lookup.setdefault(tuple(round(c,6) for c in point),[]).append(Vector(normal))
positions=[]; normals=[]; uvs=[]; indices=[]; flags=[]; tints=[]; remap={}
for polygon in mesh.polygons:
    face=[]
    for loop_index in polygon.loop_indices:
        v=mesh.loops[loop_index].vertex_index; point=mesh.vertices[v].co
        tex=atlas.data[loop_index].uv
        key=(v,round(tex.x,7),round(tex.y,7))
        if key not in remap:
            remap[key]=len(flags)
            ns=normal_lookup.get(tuple(round(c,6) for c in point),[mesh.vertices[v].normal])
            normal=sum(ns,Vector()).normalized()
            positions.extend(point); normals.extend(normal); uvs.extend([tex.x,1-tex.y]); flags.append(1);tints.extend([1,1,1])
        face.append(remap[key])
    for i in range(1,len(face)-1):indices.extend([face[0],face[i],face[i+1]])
cap_remap={}
for face in f:
    if any(h['painted'][v] == 1 for v in face):continue
    for v in face:
        if v not in cap_remap:
            cap_remap[v]=len(flags);positions.extend(p[v]);normals.extend(n[v]);uvs.extend([0,0]);flags.append(h['painted'][v]);tints.extend(h['tints'][v*3:v*3+3])
        indices.append(cap_remap[v])
for key,value in [('positions',positions),('normals',normals),('uvs',uvs),('tints',tints)]:h[key]=[round(float(x),7) for x in value]
h['indices']=indices;h['painted']=flags
head_file.write_text(json.dumps(h,separators=(',',':'),allow_nan=False))
print('Repacked head atlas:',len(mesh.polygons),'painted faces;',len(flags),'stored vertices')
