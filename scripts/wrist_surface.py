"""Clip the derived arm/hand anatomy at a true wrist plane and close the cut.

Original source data is read-only. Attribute interpolation preserves up to four
normalised bone influences; inverse cuts provide matching arm/hand surfaces.
"""
import numpy as np

def clip_limb_plane(m, faces, keep_arm=True, margin=.004, joint='Hand', base='ForeArm', medial=False):
    def plane(side):
        center=np.array(m['bind'][side+joint])
        axis=np.array([-1.,0,0] if side=='Left' else [1.,0,0]) if medial else center-np.array(m['bind'][side+base])
        return center,axis/np.linalg.norm(axis)
    p=np.array(m['positions']).reshape(-1,3);n=np.array(m['normals']).reshape(-1,3);uv=np.array(m['uv']).reshape(-1,2)
    j=np.array(m['joints'],dtype=int).reshape(-1,4);w=np.array(m['weights']).reshape(-1,4)
    points=p.tolist();normal_values=n.tolist();tex_values=uv.tolist();joint_values=j.tolist();weight_values=w.tolist()
    clipped=[];crossings={};wrist_margin=margin;direction=1 if keep_arm else -1
    for face in faces:
        side='Left' if p[face,0].mean()>0 else 'Right'
        wrist,axis=plane(side)
        distances=((p[face]-wrist)@axis)*direction-wrist_margin
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
    # Follow the actual boundary, rather than sorting vertices by angle. Bent
    # or concave cuts can have several loops; angular sorting leaves cracks.
    from collections import Counter
    edges=[(int(a),int(b)) for face in faces for a,b in zip(face,np.roll(face,-1))]
    counts=Counter(tuple(sorted(edge)) for edge in edges)
    caps=[]
    for side in ['Left','Right']:
        wrist,axis=plane(side)
        boundary=[(a,b) for a,b in edges if counts[tuple(sorted((a,b)))]==1
            and all((p[v,0]>0)==(side=='Left') and abs(((p[v]-wrist)@axis)*direction-wrist_margin)<1e-6 for v in [a,b])]
        remaining=set(boundary)
        while remaining:
            first=remaining.pop();loop=[first];end=first[1]
            while end!=first[0]:
                edge=next((edge for edge in remaining if edge[0]==end),None)
                if edge is None:break
                remaining.remove(edge);loop.append(edge);end=edge[1]
            if end!=first[0] or len(loop)<3:continue
            ring=[edge[0] for edge in loop];center=p[ring].mean(0)
            at=len(points);points.append(center.tolist());normal_values.append((axis*direction).tolist());tex_values.append(uv[ring].mean(0).tolist())
            influences={}
            for v in ring:
                for bone,weight in zip(j[v],w[v]):
                    if weight>0:influences[int(bone)]=influences.get(int(bone),0.)+float(weight)/len(ring)
            strongest=sorted(influences.items(),key=lambda item:item[1],reverse=True)[:4];total=sum(weight for _,weight in strongest)
            joint_values.append([bone for bone,_ in strongest]+[0]*(4-len(strongest)))
            weight_values.append([weight/total for _,weight in strongest]+[0.]*(4-len(strongest)))
            caps.extend([at,b,a] for a,b in loop)
    p=np.array(points);n=np.array(normal_values);uv=np.array(tex_values)
    j=np.array(joint_values,dtype=int);w=np.array(weight_values)
    if caps:faces=np.concatenate([faces,np.array(caps,dtype=int)])
    return p,n,uv,j,w,faces

def clip_wrist(m, faces, keep_arm=True, margin=.004):
    return clip_limb_plane(m,faces,keep_arm,margin)
