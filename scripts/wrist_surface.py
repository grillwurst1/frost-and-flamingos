"""Clip the derived arm/hand anatomy at a true wrist plane and close the cut.

Original source data is read-only. Attribute interpolation preserves up to four
normalised bone influences; inverse cuts provide matching arm/hand surfaces.
"""
import numpy as np

def clip_wrist(m, faces, keep_arm=True, margin=.004):
    p=np.array(m['positions']).reshape(-1,3);n=np.array(m['normals']).reshape(-1,3);uv=np.array(m['uv']).reshape(-1,2)
    j=np.array(m['joints'],dtype=int).reshape(-1,4);w=np.array(m['weights']).reshape(-1,4)
    points=p.tolist();normal_values=n.tolist();tex_values=uv.tolist();joint_values=j.tolist();weight_values=w.tolist()
    clipped=[];crossings={};wrist_margin=margin;direction=1 if keep_arm else -1
    for face in faces:
        side='Left' if p[face,0].mean()>0 else 'Right'
        wrist=np.array(m['bind'][side+'Hand']);forearm=np.array(m['bind'][side+'ForeArm'])
        axis=wrist-forearm;axis/=np.linalg.norm(axis)
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
    # Hand-weighted faces can begin behind the wrist. Keep that entire cross-section
    # before clipping, then close the cut so a bent wrist never exposes an open arm.
    caps=[]
    for side in ['Left','Right']:
        wrist=np.array(m['bind'][side+'Hand']);axis=wrist-np.array(m['bind'][side+'ForeArm']);axis/=np.linalg.norm(axis)
        candidates=[v for v in np.unique(faces) if (p[v,0]>0)==(side=='Left') and abs(((p[v]-wrist)@axis)*direction-wrist_margin)<1e-6]
        unique={tuple(np.round(p[v],6)):v for v in candidates};ring=list(unique.values())
        if len(ring)<3:continue
        center=p[ring].mean(0);across=p[ring[0]]-center;across/=np.linalg.norm(across);front=np.cross(axis*direction,across)
        ring.sort(key=lambda v:np.arctan2((p[v]-center)@front,(p[v]-center)@across))
        at=len(points);points.append(center.tolist());normal_values.append((axis*direction).tolist());tex_values.append(uv[ring].mean(0).tolist())
        influences={}
        for v in ring:
            for bone,weight in zip(j[v],w[v]):
                if weight>0:influences[int(bone)]=influences.get(int(bone),0.)+float(weight)/len(ring)
        strongest=sorted(influences.items(),key=lambda item:item[1],reverse=True)[:4];total=sum(weight for _,weight in strongest)
        joint_values.append([bone for bone,_ in strongest]+[0]*(4-len(strongest)))
        weight_values.append([weight/total for _,weight in strongest]+[0.]*(4-len(strongest)))
        for k,v in enumerate(ring):caps.append([at,v,ring[(k+1)%len(ring)]])
    p=np.array(points);n=np.array(normal_values);uv=np.array(tex_values)
    j=np.array(joint_values,dtype=int);w=np.array(weight_values);faces=np.concatenate([faces,np.array(caps,dtype=int)])
    return p,n,uv,j,w,faces
