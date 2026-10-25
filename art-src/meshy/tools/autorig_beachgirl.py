"""
Auto-rig + retarget pipeline for the Meshy "Hot Beach Girl" (static GLB).

Run (headless, ~30 s): Blender as a Python module (pip install bpy==5.2.3 scipy numpy pillow in a
Python 3.13 venv), then from the repository root:
  <venv>/bin/python -I art-src/meshy/tools/autorig_beachgirl.py
Reads the static Meshy export and two Meshy donor rigs from art-src/meshy/, writes
art-src/meshy/meshy-lagoon-beachgirl.glb (byte-identical on re-runs) and scratch files to
$AUTORIG_OUT (default .autorig/). Meshy's own auto-rigger breaks on this model.

Stages (all in one run, fully re-runnable, writes only into AUTORIG):
  1. import + normalise the static mesh (1.72 m, feet on the floor, centred, faces -Y in
     Blender == +Z in glTF), weld UV seams into a topology copy, split shells
     (body / hair / flower / eyes / bikini strings / flip-flops)
  2. fit every Mixamo joint to landmarks of the body shell (cross-section loops)
  3. build the armature from the Meshy ghost-girl donor (same 28 joint names, same rolls,
     each bone re-aimed by a minimal rotation onto the fitted joints)
  4. skin: Blender bone heat on the welded body shell, then repairs (geodesic arm masks,
     left/right leg masks, smoothing, 4-influence clamp); accessories by shell rules
     (eyes/flower rigid on Head; hair Head above the chin, below it Neck/Spine2 with a capped
     shoulder share only for strands on the shoulders, smoothed along the strands)
  5. retarget Walking / Walk_Backward (ghost girl) and Cheer_with_Both_Hands_1 (lagoon
     allrounder) by world-space orientation mapping, then per clip:
       - loops: detect a missing closing key and append it (Walk_Backward), strip root travel
         over the true cycle length, centre the sway
       - Walking: left arm = mirrored right arm half a cycle later (the donor's left hand
         sweeps across the belly)
       - foot calibration: one constant Foot / ToeBase pitch per side so the stance sole is as
         flat as in the target's rest (the Meshy donors' rest feet are ~8.5 deg steeper than
         their own flat stance -> toe-down heels before)
       - Walk_Backward posture: 30% of the mean forward torso lean and of the stance-leg crouch
         removed (lean pivots at Spine, crouch by a hips lift the leg IK absorbs)
       - Cheer: while the right fist is raised the left arm follows the mirrored right arm
         (2 frames later), both arms spread outward until the hands stay >= 22 cm apart and
         >= 1.5 cm off the head
       - one constant hips offset (keeps the donor bob) + leg IK contact. Walk cycles: contact =
         sole near the floor AND moving with the treadmill (stance) velocity (< 0.4 m/s off), so a
         landing toe that still swings backwards is swing, not stance; in contact the lowest sole
         point sits on the floor and every touching sole point is pinned to the treadmill (toe-
         first landings pivot on the toe); in swing the sole is lifted >= 6/12/18 mm (by frames
         from contact); unreachable run ends are trimmed (or, if the only support, a local 5-frame
         hips dip). The stationary Cheer locks both ankles horizontally, soles on the floor
       - collision-aware arm abduction against the wider hips
       - playback-sync speed = the pinned sole speed (game move speed for zero foot slide)
     animations are reordered in the GLB to Idle, Walking, Walk_Backward, Cheer (autoplay = [0])
     bake a procedural Idle: relaxed arms (adducted, soft elbows, palms to the thighs),
     contrapposto (straight standing leg, tilted pelvis, soft free knee, counter-tilted
     shoulders), breathing, slow weight shift; seamless 4 s loop
  6. export GLB (base colour 2048 kept, metallicRoughness dropped) + validation report
"""
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

MESHY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # art-src/meshy
ROOT = os.path.dirname(os.path.dirname(MESHY))
AUTORIG = os.environ.get("AUTORIG_OUT", os.path.join(ROOT, ".autorig"))  # scratch: .blend, report, renders
os.makedirs(AUTORIG, exist_ok=True)
SRC = os.path.join(MESHY, "meshy-lagoon-beachgirl-static.glb")
GHOST = os.path.join(MESHY, "meshy-alpine-ghostgirl.glb")
ALLROUNDER = os.path.join(MESHY, "meshy-lagoon-allrounder.glb")
OUT = os.path.join(MESHY, "meshy-lagoon-beachgirl.glb")
BLEND = f"{AUTORIG}/beachgirl-rigged.blend"
REPORT = f"{AUTORIG}/report.json"
HEIGHT = 1.72
FPS = 30
WB_POSTURE = dict(lean_blend=0.3, crouch_blend=0.3)  # Walk_Backward: remove 30% of the mean forward lean / crouch
CHEER_BOTH_ARMS = True  # Cheer: left arm follows the mirrored right arm while it is raised
ANIM_ORDER = ("Idle", "Walking", "Walk_Backward", "Cheer")  # glTF animations[] order (loaders autoplay [0])
KEEP_NORMAL_MAP = True  # the normal map is used by the material (and by the game's GLB material)

P = "mixamorig:"
L, R = "Left", "Right"
NON_DEFORM = {P + "HeadTop_End", "headfront", P + "LeftHandMiddle4", P + "RightHandMiddle4", P + "LeftToe_End", P + "RightToe_End"}
report = {}


def log(*a):
    print("[autorig]", *a, flush=True)


# ----------------------------------------------------------------------------- 1. mesh
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
bpy.ops.import_scene.gltf(filepath=SRC)
girl = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
girl.name = "BeachGirl"
girl.data.name = "BeachGirl"
me = girl.data
Vraw = np.array([v.co[:] for v in me.vertices])
s = HEIGHT / (Vraw[:, 2].max() - Vraw[:, 2].min())
off = np.array([-(Vraw[:, 0].max() + Vraw[:, 0].min()) / 2, 0.0, -Vraw[:, 2].min()])
V0 = (Vraw + off) * s
me.calc_loop_triangles()
T = np.array([t.vertices[:] for t in me.loop_triangles])

# weld UV-seam duplicates -> topology
key = np.round(V0 / 1e-5).astype(np.int64)
_, inv = np.unique(key, axis=0, return_inverse=True)
inv = inv.ravel()
NW = inv.max() + 1
F = inv[T]
F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
Ed = np.unique(np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1), axis=0)
ncomp, lab = connected_components(coo_matrix((np.ones(len(Ed)), (Ed[:, 0], Ed[:, 1])), shape=(NW, NW)), directed=False)
counts = np.bincount(lab)


def wpos(V):
    W = np.zeros((NW, 3))
    W[inv] = V
    return W


W = wpos(V0)
spans = [(W[lab == c, 2].max() - W[lab == c, 2].min()) for c in range(ncomp)]
body_c = int(np.argmax(spans))  # the only shell that spans head to feet
log("shells", ncomp, "body", counts[body_c])

# final placement: centre the ankles under the origin (y) - computed after the leg fit below
FB = F[lab[F[:, 0]] == body_c]


def section(Wp, Fs, p, n):
    """Cross-section loops of the triangle set Fs with plane (p, n)."""
    d = (Wp - p) @ n
    dt = d[Fs]
    pos = dt >= 0
    cross = ~(pos.all(1) | (~pos).all(1))
    segs, ek = [], []
    for tri, dd in zip(Fs[cross], dt[cross]):
        pts, keys = [], []
        for a, b in ((0, 1), (1, 2), (2, 0)):
            if (dd[a] >= 0) != (dd[b] >= 0):
                t = dd[a] / (dd[a] - dd[b])
                pts.append(Wp[tri[a]] + t * (Wp[tri[b]] - Wp[tri[a]]))
                keys.append((min(tri[a], tri[b]), max(tri[a], tri[b])))
        if len(pts) == 2:
            segs.append(pts)
            ek.append(keys)
    if not segs:
        return []
    kid = {}
    for k in ek:
        for kk in k:
            kid.setdefault(kk, len(kid))
    rows = [kid[k[0]] for k in ek]
    cols = [kid[k[1]] for k in ek]
    m, l2 = connected_components(coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(len(kid), len(kid))), directed=False)
    segs = np.array(segs)
    sl = l2[np.array(rows)]
    out = []
    for c in range(m):
        S = segs[sl == c]
        Ls = np.linalg.norm(S[:, 1] - S[:, 0], axis=1)
        mid = S.mean(1)
        Pp = S.reshape(-1, 3)
        out.append(dict(c=(mid * Ls[:, None]).sum(0) / max(Ls.sum(), 1e-9), per=Ls.sum(), mn=Pp.min(0), mx=Pp.max(0)))
    return out


ZN = np.array([0.0, 0.0, 1.0])


def hsec(z):
    return section(W, FB, np.array([0, 0, z]), ZN)


# ----------------------------------------------------------------------------- 2. joint fit
BV = np.unique(FB)  # body vertex ids (welded)
BW = W[BV]

# legs: left leg loop = the separate loop with 0 < x and no crossing of the midline
leg = {}
for z in np.arange(0.05, 0.95, 0.01):
    ls = [l for l in hsec(z) if l["mn"][0] > -0.003 and l["mx"][0] < 0.24]
    if ls:
        leg[round(z, 2)] = min(ls, key=lambda l: l["c"][0])
crotch_z = max(z for z in leg if z < 0.95 and all(round(zz, 2) in leg for zz in np.arange(0.3, z, 0.01)))
crotch_z = round(crotch_z + 0.005, 3)
zs = [z for z in leg if 0.07 <= z <= 0.15]
z_narrow = min(zs, key=lambda z: leg[z]["per"])
ankle_z = z_narrow - 0.01
la = leg[round(ankle_z, 2)]["c"]
ankle = np.array([la[0], la[1], ankle_z])
hip_z = crotch_z + 0.085
ht = leg[round(crotch_z - 0.035, 2)]["c"]
hipj = np.array([ht[0], ht[1], hip_z])
knee_z = ankle_z + 0.47 * (hip_z - ankle_z)
kc = leg[round(knee_z, 2)]["c"]
knee = np.array([kc[0], kc[1], knee_z])
foot = BW[(BW[:, 2] < 0.07) & (BW[:, 0] > 0.0)]
toe_y, heel_y = foot[:, 1].min(), foot[:, 1].max()
sole_z = foot[:, 2].min()
ball_y = heel_y + 0.73 * (toe_y - heel_y)
near_ball = foot[np.abs(foot[:, 1] - ball_y) < 0.012]
ball = np.array([near_ball[:, 0].mean(), ball_y, sole_z + 0.022])
near_toe = foot[foot[:, 1] < toe_y + 0.015]
toe = np.array([near_toe[:, 0].mean(), toe_y, sole_z + 0.016])
log("legs crotch", crotch_z, "ankle", ankle.round(3), "knee", knee.round(3), "hip", hipj.round(3), "ball", ball.round(3), "toe", toe.round(3))

# arms: outermost separate loop on the +x side
arm = {}
for z in np.arange(0.70, 1.40, 0.01):
    ls = [l for l in hsec(z) if l["mn"][0] > 0.10]
    if ls:
        if z < 0.95:  # hand / fingers can split into several loops: merge them
            per = sum(l["per"] for l in ls)
            c = sum(l["c"] * l["per"] for l in ls) / per
            arm[round(z, 2)] = dict(c=c, per=per)
        else:
            l = max(ls, key=lambda l: l["c"][0])
            arm[round(z, 2)] = dict(c=l["c"], per=l["per"])
armpit_z = max(z for z in arm if z > 1.0 and all(round(zz, 2) in arm for zz in np.arange(1.0, z, 0.01)))
hand_v = BW[(BW[:, 0] > 0.2) & (BW[:, 2] < 1.0)]
tip = hand_v[np.argmin(hand_v[:, 2])]
zw = [z for z in arm if tip[2] + 0.12 <= z <= tip[2] + 0.24]
wrist_z = min(zw, key=lambda z: arm[z]["per"])
wrist = np.array([*arm[wrist_z]["c"][:2], wrist_z])
# upper-arm axis line from the loops just below the armpit
ua = np.array([[*arm[z]["c"][:2], z] for z in arm if armpit_z - 0.10 <= z <= armpit_z - 0.01])
A = np.c_[ua[:, 2], np.ones(len(ua))]
cx = np.linalg.lstsq(A, ua[:, 0], rcond=None)[0]
cy = np.linalg.lstsq(A, ua[:, 1], rcond=None)[0]
sh_band = BW[(BW[:, 0] > 0.12) & (BW[:, 0] < 0.17) & (np.abs(BW[:, 1] - 0.015) < 0.06) & (BW[:, 2] > 1.3) & (BW[:, 2] < 1.5)]
acromion_z = sh_band[:, 2].max()
sj_z = acromion_z - 0.045
shoulderj = np.array([np.clip(cx[0] * sj_z + cx[1], 0.12, 0.17), cy[0] * sj_z + cy[1], sj_z])
ze = [z for z in arm if wrist_z + 0.40 * (sj_z - wrist_z) <= z <= wrist_z + 0.56 * (sj_z - wrist_z)]
pers = np.array([arm[z]["per"] for z in ze])
pers = np.convolve(pers, np.ones(3) / 3, mode="same")
elbow_z = ze[int(np.argmin(pers[1:-1])) + 1]
elbow = np.array([*arm[elbow_z]["c"][:2], elbow_z])
# middle fingertip: farthest hand vertex along wrist->hand direction
hd = arm[min(arm, key=lambda z: abs(z - (tip[2] + 0.02)))]["c"] - wrist
hd = hd / np.linalg.norm(hd)
hv = BW[(BW[:, 0] > 0.18) & (BW[:, 2] < wrist_z)]
tipm = hv[np.argmax((hv - wrist) @ hd)]
knuck = wrist + 0.47 * (tipm - wrist)
log("arms armpit", armpit_z, "shoulder", shoulderj.round(3), "elbow", elbow.round(3), "wrist", wrist.round(3), "tip", tipm.round(3), "acromion", round(acromion_z, 3))

# torso / neck / head
def torso(z):
    ls = [l for l in hsec(z) if l["mn"][0] < 0 < l["mx"][0]]
    return max(ls, key=lambda l: l["per"]) if ls else None


def spine_y(z):
    t = torso(z)
    return t["c"][1] + 0.2 * (t["mx"][1] - t["c"][1])


hips_z = hip_z + 0.10
neck_z = acromion_z + 0.02
nz = [round(z, 2) for z in np.arange(neck_z + 0.01, neck_z + 0.10, 0.01)]
neck_mid = min(nz, key=lambda z: torso(z)["per"])
# chin: first level above the neck where the front edge jumps forward
chin_z = None
prev = torso(neck_mid)["mn"][1]
for z in np.arange(neck_mid + 0.01, neck_mid + 0.10, 0.005):
    t = torso(z)
    if t is not None and t["mn"][1] < prev - 0.03:
        chin_z = z
        break
chin_z = chin_z if chin_z is not None else neck_mid + 0.04
head_z = chin_z + 0.035
top_z = BW[np.abs(BW[:, 0]) < 0.03][:, 2].max()
J = {}
J["Hips"] = np.array([0, spine_y(hips_z), hips_z])
for name, fr in (("Spine", 0.281), ("Spine1", 0.564), ("Spine2", 0.856)):
    z = hips_z + fr * (neck_z - hips_z)
    J[name] = np.array([0, spine_y(z), z])
J["Neck"] = np.array([0, torso(neck_z)["c"][1], neck_z])
J["Head"] = np.array([0, torso(neck_mid)["c"][1] + 0.008, head_z])
hc = torso(head_z + 0.06)["c"]
J["HeadTop_End"] = np.array([0, hc[1], top_z])
J["headfront"] = J["Head"] + np.array([0, -0.115, 0])
J["LeftShoulder"] = np.array([0.03, J["Neck"][1] - 0.012, sj_z + 0.02])
J["LeftArm"] = shoulderj
J["LeftForeArm"] = elbow
J["LeftHand"] = wrist
J["LeftHandMiddle4"] = knuck
J["LeftUpLeg"] = hipj
J["LeftLeg"] = knee
J["LeftFoot"] = ankle
J["LeftToeBase"] = ball
J["LeftToe_End"] = toe
TIPS = {"LeftHandMiddle4": tipm}
for k in list(J):
    if k.startswith("Left"):
        J["Right" + k[4:]] = J[k] * np.array([-1, 1, 1])
for k in list(TIPS):
    TIPS["Right" + k[4:]] = TIPS[k] * np.array([-1, 1, 1])

# centre the feet under the origin
y_shift = -ankle[1]
for k in J:
    J[k] = J[k] + np.array([0, y_shift, 0])
for k in TIPS:
    TIPS[k] = TIPS[k] + np.array([0, y_shift, 0])
V0 = V0 + np.array([0, y_shift, 0])
W = wpos(V0)
BW = W[BV]
report["joints"] = {k: [round(float(x), 4) for x in v] for k, v in J.items()}
report["landmarks"] = dict(crotch=crotch_z, armpit=armpit_z, acromion=float(acromion_z), chin=float(chin_z), neck_mid=neck_mid, top=float(top_z))

# ----------------------------------------------------------------------------- 3. armature
for v, co in zip(me.vertices, V0):
    v.co = co
me.update()

_acts_before = set(bpy.data.actions)
bpy.ops.import_scene.gltf(filepath=GHOST)
ghost_arm = [o for o in bpy.context.selected_objects if o.type == "ARMATURE"][0]
for a in [a for a in bpy.data.actions if a not in _acts_before]:
    bpy.data.actions.remove(a)
if ghost_arm.animation_data:
    for tr in list(ghost_arm.animation_data.nla_tracks):
        ghost_arm.animation_data.nla_tracks.remove(tr)
for o in list(bpy.context.selected_objects):
    if o.type == "MESH":
        bpy.data.objects.remove(o, do_unlink=True)
ghost_arm.name = "DonorGhost"

CHILD = {}  # bone -> the joint its tail aims at
for side in (L, R):
    CHILD.update({
        f"{side}Shoulder": f"{side}Arm", f"{side}Arm": f"{side}ForeArm", f"{side}ForeArm": f"{side}Hand",
        f"{side}Hand": f"{side}HandMiddle4", f"{side}UpLeg": f"{side}Leg", f"{side}Leg": f"{side}Foot",
        f"{side}Foot": f"{side}ToeBase", f"{side}ToeBase": f"{side}Toe_End"})
CHILD.update({"Hips": "Spine", "Spine": "Spine1", "Spine1": "Spine2", "Spine2": "Neck", "Neck": "Head", "Head": "HeadTop_End"})


def jname(bone_name):
    return bone_name[len(P):] if bone_name.startswith(P) else bone_name


def target_tail(n):
    if n in CHILD:
        return J[CHILD[n]]
    if n in TIPS:
        return TIPS[n]
    if n == "HeadTop_End":
        return J[n] + (J[n] - J["Head"]) / np.linalg.norm(J[n] - J["Head"]) * 0.1
    if n == "headfront":
        return J[n] + np.array([0, -0.11, 0])
    if n.endswith("Toe_End"):
        d = J[n] - J[n.replace("Toe_End", "ToeBase")]
        return J[n] + d / np.linalg.norm(d) * 0.04
    raise KeyError(n)


tgt_data = ghost_arm.data.copy()
tgt_data.name = "BeachGirlRig"
rig = bpy.data.objects.new("Armature", tgt_data)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
for o in bpy.context.selected_objects:
    o.select_set(False)
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
donor_rest = {b.name: (b.matrix_local.copy()) for b in ghost_arm.data.bones}
for eb in tgt_data.edit_bones:
    eb.use_connect = False
for eb in tgt_data.edit_bones:
    n = jname(eb.name)
    head = Vector(J[n])
    tail = Vector(target_tail(n))
    M = donor_rest[eb.name]
    ddir = (M.to_3x3() @ Vector((0, 1, 0))).normalized()
    tdir = (tail - head).normalized()
    q = ddir.rotation_difference(tdir)
    rot = (q.to_matrix() @ M.to_3x3()).normalized()
    eb.matrix = Matrix.Translation(head) @ rot.to_4x4()
    eb.length = (tail - head).length
for eb in tgt_data.edit_bones:
    eb.use_deform = eb.name not in NON_DEFORM
bpy.ops.object.mode_set(mode="OBJECT")
log("armature bones", len(tgt_data.bones))

# ----------------------------------------------------------------------------- 4. skinning
bones = [b.name for b in tgt_data.bones]
bidx = {b: i for i, b in enumerate(bones)}
deform = [b for b in bones if b not in NON_DEFORM]

# 4a. bone heat on the welded body shell
bm_body = bpy.data.meshes.new("BodyWeld")
remap = -np.ones(NW, int)
remap[BV] = np.arange(len(BV))
bm_body.from_pydata([tuple(p) for p in BW], [], [tuple(f) for f in remap[FB]])
bm_body.update()
body_obj = bpy.data.objects.new("BodyWeld", bm_body)
scene.collection.objects.link(body_obj)
for o in bpy.context.selected_objects:
    o.select_set(False)
body_obj.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
Hw = np.zeros((len(BV), len(bones)))
for vg in body_obj.vertex_groups:
    if vg.name not in bidx:
        continue
    j = bidx[vg.name]
    for i in range(len(BV)):
        try:
            Hw[i, j] = vg.weight(i)
        except RuntimeError:
            pass
Hheat_raw = np.zeros((NW, len(bones)))
Hheat_raw[BV] = Hw
empty = (Hw.sum(1) < 1e-6).sum()
log("bone heat done; vertices without weights:", int(empty))
report["heat_unweighted_vertices"] = int(empty)

# 4b. geodesic / side masks
Eb = np.unique(np.sort(np.concatenate([FB[:, [0, 1]], FB[:, [1, 2]], FB[:, [2, 0]]]), axis=1), axis=0)
Eb = remap[Eb]
el = np.linalg.norm(BW[Eb[:, 0]] - BW[Eb[:, 1]], axis=1)
G = coo_matrix((np.r_[el, el], (np.r_[Eb[:, 0], Eb[:, 1]], np.r_[Eb[:, 1], Eb[:, 0]])), shape=(len(BV), len(BV))).tocsr()
kd_body = cKDTree(BW)
geo = {}
armzone = {}
for side, sg in ((L, 1), (R, -1)):
    seeds = np.where((BW[:, 0] * sg > 0.2) & (BW[:, 2] < J[side + "Hand"][2]))[0]
    g = dijkstra(G, indices=seeds, min_only=True)
    geo[side] = g
    thr = g[kd_body.query(J[side + "Arm"])[1]] + 0.10
    armzone[side] = g < thr
    report[f"geo_threshold_{side}"] = float(thr)
    elbow_g = g[kd_body.query(J[side + "ForeArm"])[1]]
    armzone[side + "_low"] = g < elbow_g  # forearm + hand: arm-chain bones only
mask = np.ones_like(Hw, bool)
leaks = {}
for side, sg in ((L, 1), (R, -1)):
    chain = [P + side + n for n in ("Arm", "ForeArm", "Hand", "HandMiddle4")]
    for b in chain:
        j = bidx[b]
        bad = ~armzone[side] & (Hw[:, j] > 0.005)
        leaks[b] = int(bad.sum())
        mask[~armzone[side], j] = False
    j = bidx[P + side + "Shoulder"]
    mask[BW[:, 2] < armpit_z - 0.15, j] = False
    low = armzone[side + "_low"]
    for b in bones:
        if b not in chain:
            mask[low, bidx[b]] = False
    for n in ("UpLeg", "Leg", "Foot", "ToeBase"):
        j = bidx[P + side + n]
        wrong_side = BW[:, 0] * sg < -0.012
        bad = (wrong_side | armzone[L] | armzone[R]) & (Hw[:, j] > 0.005)
        leaks[P + side + n] = int(bad.sum())
        mask[wrong_side | armzone[L] | armzone[R], j] = False
for b in NON_DEFORM:
    mask[:, bidx[b]] = False
report["leaks_removed_vertices"] = {k: v for k, v in leaks.items() if v}
log("leaks", report["leaks_removed_vertices"])


def nearest_allowed(Wm, Msk, Pts):
    """Fallback for vertices left without weight: closest allowed bone segment."""
    out = Wm.copy()
    heads = np.array([J[jname(b)] for b in bones])
    tails = np.array([target_tail(jname(b)) for b in bones])
    for i in np.where(out.sum(1) < 1e-6)[0]:
        p = Pts[i]
        ab = tails - heads
        t = np.clip(((p - heads) * ab).sum(1) / (ab * ab).sum(1), 0, 1)
        d = np.linalg.norm(heads + ab * t[:, None] - p, axis=1)
        d[~Msk[i]] = 1e9
        out[i, int(np.argmin(d))] = 1.0
    return out


Hw = Hw * mask
Hw = nearest_allowed(Hw, mask, BW)
Hw /= Hw.sum(1, keepdims=True)
# 4c. light Laplacian smoothing on the surface graph (keeps masks)
A = coo_matrix((np.ones(2 * len(Eb)), (np.r_[Eb[:, 0], Eb[:, 1]], np.r_[Eb[:, 1], Eb[:, 0]])), shape=(len(BV), len(BV))).tocsr()
deg = np.asarray(A.sum(1)).ravel()
for _ in range(3):
    Hw = 0.5 * Hw + 0.5 * (A @ Hw) / np.maximum(deg, 1)[:, None]
    Hw *= mask
    Hw /= np.maximum(Hw.sum(1, keepdims=True), 1e-9)


def clamp4(Wm):
    Wm = Wm.copy()
    Wm[Wm < 0.01] = 0
    order = np.argsort(-Wm, axis=1)
    keep = np.zeros_like(Wm, bool)
    np.put_along_axis(keep, order[:, :4], True, axis=1)
    Wm[~keep] = 0
    return Wm / Wm.sum(1, keepdims=True)


Hw = clamp4(Hw)

# 4d. accessory shells
Wall = np.zeros((NW, len(bones)))
Wall[BV] = Hw
head_allowed = np.zeros(len(bones), bool)  # hair: no Spine1, shoulders only capped (see below)
for b in ("Head", "Neck", "Spine2", "LeftShoulder", "RightShoulder"):
    head_allowed[bidx[P + b]] = True
SH_IDX = [bidx[P + "LeftShoulder"], bidx[P + "RightShoulder"]]
HAIR_SHOULDER_CAP = 0.3   # max shoulder share on hair strands lying on the shoulders
HAIR_SHOULDER_Z = (1.40, 1.32)  # shoulder share ramps in from 0 (above z0) to the cap (below z1)
HAIR_SMOOTH_ITERS = 25


def shell_adjacency(vid):
    loc = -np.ones(NW, int)
    loc[vid] = np.arange(len(vid))
    Fs = F[lab[F[:, 0]] == lab[vid[0]]]
    Es = np.unique(np.sort(np.concatenate([Fs[:, [0, 1]], Fs[:, [1, 2]], Fs[:, [2, 0]]]), axis=1), axis=0)
    Es = loc[Es]
    Asp = coo_matrix((np.ones(2 * len(Es)), (np.r_[Es[:, 0], Es[:, 1]], np.r_[Es[:, 1], Es[:, 0]])), shape=(len(vid), len(vid))).tocsr()
    return Asp, np.maximum(np.asarray(Asp.sum(1)).ravel(), 1)
no_arm = np.ones(len(bones), bool)
for b in bones:
    if any(k in b for k in ("Arm", "Hand")) or b in NON_DEFORM:
        no_arm[b == np.array(bones)] = False
shell_info = {}
for c in range(ncomp):
    if c == body_c:
        continue
    vid = np.where(lab == c)[0]
    Pc = W[vid]
    dist, nn = kd_body.query(Pc, k=4)
    wts = 1.0 / np.maximum(dist, 1e-4)
    trans = (Hw[nn] * wts[:, :, None]).sum(1) / wts.sum(1)[:, None]
    zc = Pc[:, 2].mean()
    if zc > J["Spine2"][2]:  # hair, flower, eyes
        headonly = np.zeros((len(vid), len(bones)))
        headonly[:, bidx[P + "Head"]] = 1
        t = np.clip((J["Head"][2] - 0.04 - Pc[:, 2]) / 0.10, 0, 1)[:, None]  # 0 above the chin
        t = t * t * (3 - 2 * t)
        if t.max() <= 0:  # eyes, flower: rigid on the head
            kind = "head-rigid"
            wv = headonly
        else:  # hair reaching below the chin
            kind = "hair"
            tr = trans * head_allowed
            tr_sum = tr.sum(1, keepdims=True)
            tr = np.where(tr_sum > 1e-6, tr / np.maximum(tr_sum, 1e-9), 0)
            tr[tr_sum[:, 0] <= 1e-6, bidx[P + "Spine2"]] = 1
            # shoulder share only for strands lying on the shoulders, capped; the rest goes to Spine2
            z0, z1 = HAIR_SHOULDER_Z
            r = np.clip((z0 - Pc[:, 2]) / (z0 - z1), 0, 1)
            cap = HAIR_SHOULDER_CAP * r * r * (3 - 2 * r)
            ssum = tr[:, SH_IDX].sum(1)
            scale = np.where(ssum > cap, cap / np.maximum(ssum, 1e-9), 1.0)
            excess = ssum * (1 - scale)
            tr[:, SH_IDX] *= scale[:, None]
            tr[:, bidx[P + "Spine2"]] += excess
            wv = (1 - t) * headonly + t * tr
            # smooth along the strands (shell connectivity) so neighbouring strand vertices move together
            Ah, degh = shell_adjacency(vid)
            fixed = t[:, 0] <= 0
            for _ in range(HAIR_SMOOTH_ITERS):
                wv = 0.5 * wv + 0.5 * (Ah @ wv) / degh[:, None]
                wv[fixed] = headonly[fixed]
            wv /= wv.sum(1, keepdims=True)
    else:  # bikini strings, flip-flops
        kind = "lower"
        wv = trans * no_arm
        wv /= np.maximum(wv.sum(1, keepdims=True), 1e-9)
    Wall[vid] = clamp4(wv)
    shell_info[int(c)] = dict(kind=kind, verts=int(len(vid)), zmin=round(float(Pc[:, 2].min()), 3), zmax=round(float(Pc[:, 2].max()), 3))
report["shells"] = shell_info

np.savez(f"{AUTORIG}/debug_weights.npz", W=W, lab=lab, body=body_c, Wall=Wall, bones=np.array(bones), Hheat=Hheat_raw)
# 4e. write vertex groups on the original (unwelded) mesh
bpy.data.objects.remove(body_obj, do_unlink=True)
Worig = Wall[inv]
girl.vertex_groups.clear()
vgs = {b: girl.vertex_groups.new(name=b) for b in deform}
for b in deform:
    j = bidx[b]
    col = Worig[:, j]
    nz = np.where(col > 0)[0]
    vg = vgs[b]
    for i in nz:
        vg.add([int(i)], float(col[i]), "REPLACE")
girl.parent = rig
mod = girl.modifiers.new("Armature", "ARMATURE")
mod.object = rig
infl = (Worig > 0).sum(1)
report["max_influences"] = int(infl.max())
report["weight_sum_range"] = [float(Worig.sum(1).min()), float(Worig.sum(1).max())]
log("skin: max influences", infl.max(), "sum range", Worig.sum(1).min(), Worig.sum(1).max())

# ----------------------------------------------------------------------------- material
mat = me.materials[0]
nt = mat.node_tree
bsdf = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
for n in list(nt.nodes):
    if n.type == "SEPARATE_COLOR":
        img_node = [l.from_node for l in nt.links if l.to_node == n][0]
        nt.nodes.remove(n)
        nt.nodes.remove(img_node)
    elif n.type == "NORMAL_MAP" and not KEEP_NORMAL_MAP:
        img_node = [l.from_node for l in nt.links if l.to_node == n][0]
        nt.nodes.remove(n)
        nt.nodes.remove(img_node)
bsdf.inputs["Metallic"].default_value = 0.0
bsdf.inputs["Roughness"].default_value = 0.8
used = {n.image.name for n in nt.nodes if n.type == "TEX_IMAGE" and n.image}
for img in list(bpy.data.images):
    if img.name not in used:
        bpy.data.images.remove(img)
report["images"] = [(i.name, list(i.size)) for i in bpy.data.images]

# ----------------------------------------------------------------------------- 5. animation
rest_rot = {b.name: b.matrix_local.to_quaternion() for b in tgt_data.bones}
rest_head = {b.name: b.matrix_local.to_translation() for b in tgt_data.bones}
parent = {b.name: (b.parent.name if b.parent else None) for b in tgt_data.bones}
order = sorted(bones, key=lambda b: len(tgt_data.bones[b].parent_recursive))
HIPS = P + "Hips"


def fk_positions(Rw, hips_pos):
    pos = {}
    for b in order:
        p = parent[b]
        if p is None:
            pos[b] = hips_pos
        else:
            off = rest_rot[p].inverted() @ (rest_head[b] - rest_head[p])
            pos[b] = pos[p] + Rw[p] @ off
    return pos


def fill_missing(Rw):
    for b in order:
        if b not in Rw:
            p = parent[b]
            Rw[b] = Rw[p] @ (rest_rot[p].inverted() @ rest_rot[b]) if p else rest_rot[b].copy()
    return Rw


def new_action(name, frames):
    """frames: list of (Rw dict, hips_pos Vector). Writes linear keys on the rig."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    n = len(frames)
    data = {b: np.zeros((n, 4)) for b in bones}
    loc = np.zeros((n, 3))
    for fi, (Rw, hp) in enumerate(frames):
        for b in bones:
            p = parent[b]
            if p is None:
                q = rest_rot[b].inverted() @ Rw[b]
            else:
                q = (rest_rot[p].inverted() @ rest_rot[b]).inverted() @ (Rw[p].inverted() @ Rw[b])
            q.normalize()
            if fi and np.dot(data[b][fi - 1], q[:]) < 0:
                q = -q
            data[b][fi] = q[:]
        loc[fi] = (rest_rot[HIPS].inverted() @ (hp - rest_head[HIPS]))[:]
    for b in bones:
        pb = rig.pose.bones[b]
        pb.rotation_mode = "QUATERNION"
        for i in range(4):
            fc = act.fcurve_ensure_for_datablock(rig, f'pose.bones["{b}"].rotation_quaternion', index=i, group_name=b)
            fc.keyframe_points.add(n)
            co = np.c_[np.arange(n), data[b][:, i]].ravel()
            fc.keyframe_points.foreach_set("co", co)
            fc.keyframe_points.foreach_set("interpolation", [1] * n)  # LINEAR
            fc.update()
    for i in range(3):
        fc = act.fcurve_ensure_for_datablock(rig, f'pose.bones["{HIPS}"].location', index=i, group_name=HIPS)
        fc.keyframe_points.add(n)
        fc.keyframe_points.foreach_set("co", np.c_[np.arange(n), loc[:, i]].ravel())
        fc.keyframe_points.foreach_set("interpolation", [1] * n)
        fc.update()
    return act


def skin_pts(Pts, Ws, Rw, pos):
    """Linear-blend skin rest points Pts (n,3) with weights Ws (n,bones) under pose (Rw, pos)."""
    out = np.zeros((len(Pts), 3))
    for j in np.where(Ws.sum(0) > 0)[0]:
        b = bones[j]
        A = np.array((Rw[b] @ rest_rot[b].inverted()).to_matrix())
        t = np.array(pos[b]) - A @ np.array(rest_head[b])
        out += Ws[:, j:j + 1] * (Pts @ A.T + t)
    return out


def skin_points(ids, Rw, pos):  # body-shell vertices (ids into BW / Hw)
    return skin_pts(BW[ids], Hw[ids], Rw, pos)


# ---- sole vertices (body foot bottom + flip-flops), used for contact-based foot calibration and grounding
LOW_IDS = np.where(W[:, 2] < 0.05)[0]  # welded ids, all shells
SOLE = {}
for _s, _sg in ((L, 1), (R, -1)):
    ids = LOW_IDS[W[LOW_IDS, 0] * _sg > 0]
    ids = ids[W[ids, 2] < 0.025]
    y = W[ids, 1]
    yb, yf = y.max(), y.min()  # heel (+y, back), toe tip (-y, front)
    yball = J[_s + "ToeBase"][1]  # the toe joint (ball of the foot)
    heel, ball, tip = ids[y > yb - 0.2 * (yb - yf)], ids[np.abs(y - yball) < 0.012], ids[y < yf + 0.1 * (yb - yf)]
    SOLE[_s] = dict(ids=ids, heel=heel, ball=ball, tip=tip,
                    L_hb=float(W[heel, 1].mean() - yball), L_bt=float(yball - W[tip, 1].mean()))


def sole_metrics(Rw, hp, side):
    pos = fk_positions(Rw, hp)
    S = SOLE[side]
    Pp = skin_pts(W[S["ids"]], Wall[S["ids"]], Rw, pos)
    z = dict(zip(S["ids"], Pp[:, 2]))
    zmin = lambda ids: min(z[i] for i in ids)
    return dict(all=Pp[:, 2].min(), heel=zmin(S["heel"]), ball=zmin(S["ball"]), tip=zmin(S["tip"]),
                ankle=np.array(pos[P + side + "Foot"][:]))


REST_SOLE = {s: sole_metrics(dict(rest_rot), rest_head[HIPS], s) for s in (L, R)}


SUBTREE = {a: [b for b in bones if b == a or a in [x.name for x in tgt_data.bones[b].parent_recursive]] for a in bones}


def rotate_subtree(Rw, bone, ang, axis_world=Vector((1, 0, 0))):
    """Rotate `bone` and its descendants about the bone's own (rest-lateral) axis by ang (rad)."""
    a_loc = (rest_rot[bone].inverted() @ axis_world).normalized()
    Q = Rw[bone] @ Quaternion(a_loc, ang) @ Rw[bone].inverted()
    out = dict(Rw)
    for b in SUBTREE[bone]:
        out[b] = Q @ Rw[b]
    return out


def stance_masks(frames):
    """A foot is in stance when it is (one of) the lowest foot of the frame: at least one foot carries the
    body in every frame of these clips, independent of the clip's vertical bob."""
    m = {s: np.array([sole_metrics(Rw, hp, s)["all"] for Rw, hp in frames]) for s in (L, R)}
    lo = np.minimum(m[L], m[R])
    return {s: (m[s] - lo < 0.012) & (m[s] - m[s].min() < 0.05) for s in (L, R)}, m


def calibrate_feet(frames, loop=False):
    """Root-cause fix for the toe-down stance: the Meshy donors' rest feet are pitched ~8.5 deg steeper than
    their own flat-on-ground stance, so copying the rest-relative foot orientation leaves the target's foot
    toe-down whenever the donor's foot is flat. Solve one constant pitch correction per Foot and ToeBase so
    that, over the stance frames, heel/ball/tip stand in the same height relation as in the target's rest."""
    out = frames
    info = {}
    if loop:  # walk cycles: only true contact frames (height + treadmill velocity), not a toe skimming the floor
        masks, _ = contact_masks(frames)
        masks = {s: np.r_[masks[s], masks[s][0]] for s in (L, R)}
    else:
        masks, _ = stance_masks(frames)
    for side in (L, R):
        stance = np.where(masks[side])[0]
        rs = REST_SOLE[side]
        for bone, (k0, k1, Ln) in ((P + side + "Foot", ("heel", "ball", "L_hb")), (P + side + "ToeBase", ("ball", "tip", "L_bt"))):
            if bone.endswith("ToeBase"):  # toes: only flat-foot frames (heel down), not heel-off / push-off
                mt = [sole_metrics(*out[fi], side) for fi in stance]
                flat = [fi for fi, m in zip(stance, mt) if m["heel"] - m["all"] < 0.008]
                stance = np.array(flat) if len(flat) >= 3 else stance

            def err(ang):
                es = []
                for fi in stance:
                    Rw, hp = out[fi]
                    m = sole_metrics(rotate_subtree(Rw, bone, ang) if ang else Rw, hp, side)
                    es.append(math.atan2((m[k0] - m[k1]) - (rs[k0] - rs[k1]), SOLE[side][Ln]))
                return float(np.median(es))
            e0 = err(0.0)
            a, e = 0.0, e0
            if abs(e0) > math.radians(0.5):
                a1 = e0
                e1 = err(a1)
                a = -e0 * a1 / (e1 - e0) if abs(e1 - e0) > 1e-6 else 0.0
                a = float(np.clip(a, -math.radians(25), math.radians(25)))
                e = err(a)
                if abs(e) > math.radians(0.5):  # one more secant step
                    a2 = a - e * (a - a1) / (e - e1) if abs(e - e1) > 1e-6 else a
                    a2 = float(np.clip(a2, -math.radians(25), math.radians(25)))
                    e2 = err(a2)
                    if abs(e2) < abs(e):
                        a, e = a2, e2
                out = [(rotate_subtree(Rw, bone, a), hp) for Rw, hp in out]
            info[jname(bone)] = dict(stance_frames=len(stance), pitch_error_before_deg=round(math.degrees(e0), 2),
                                     correction_deg=round(math.degrees(a), 2), pitch_error_after_deg=round(math.degrees(e), 2))
    return out, info


def ground(frames):
    """One constant vertical offset (keeps the donor's hips bob): the median frame has its lowest skinned sole
    vertex on the floor. The per-foot contact is then fixed by leg IK (plant_feet / plant_feet_loop); moving
    the hips per frame instead makes the body dip ~2 cm at every heel strike."""
    lows = []
    for Rw, hp in frames:
        pos = fk_positions(Rw, hp)
        lows.append(skin_pts(W[LOW_IDS], Wall[LOW_IDS], Rw, pos)[:, 2].min())
    shift = float(np.clip(-np.median(lows), -0.08, 0.08))
    return [(Rw, hp + Vector((0, 0, shift))) for Rw, hp in frames], shift


def leg_ik(Rw, hp, side, a_t):
    """Two-bone IK: move the ankle to a_t, keep the knee's bend plane and the foot's world orientation."""
    up, lo, ft = P + side + "UpLeg", P + side + "Leg", P + side + "Foot"
    pos = fk_positions(Rw, hp)
    H, K, A = pos[up], pos[lo], pos[ft]
    a, b = (K - H).length, (A - K).length
    dv = a_t - H
    d = min(dv.length, a + b - 1e-4)
    u = dv.normalized()
    v = (K - H) - u * (K - H).dot(u)
    v = v.normalized() if v.length > 1e-6 else Vector((0, -1, 0))
    x = (a * a - b * b + d * d) / (2 * d)
    K2 = H + u * x + v * math.sqrt(max(a * a - x * x, 0))
    Rw = dict(Rw)
    Rw[up] = (K - H).rotation_difference(K2 - H) @ Rw[up]
    Rw[lo] = (A - K).rotation_difference(H + u * d - K2) @ Rw[lo]
    return Rw


CONTACT_DV = 0.4          # m/s: a foot is in contact only while its lowest sole point moves with the treadmill
CONTACT_LOW = 0.025       # m above the foot's lowest height in the clip
CONTACT_Z = 0.004         # m: sole vertices this close to the floor count as touching
SWING_CLEAR = (0.018, 0.006)  # swing sole clearance: cap, ramp per frame away from the nearest contact frame


def sole_track(frames, side):
    """Skinned sole points (frames, k, 3) and ankle positions (frames, 3)."""
    S = SOLE[side]
    pts, an = [], []
    for Rw, hp in frames:
        pos = fk_positions(Rw, hp)
        pts.append(skin_pts(W[S["ids"]], Wall[S["ids"]], Rw, pos))
        an.append(np.array(pos[P + side + "Foot"][:]))
    return np.array(pts), np.array(an)


def clean_cyclic(c, gap=2):
    """Keep the longest cyclic run of True (after filling holes of <= gap frames)."""
    c = np.array(c, bool)
    if c.all() or not c.any():
        return c
    per = len(c)
    s = int(np.where(~c)[0][0])
    r = np.roll(c, -s)  # r[0] is False
    runs, i = [], 0
    while i < per:
        if r[i]:
            j = i
            while j < per and r[j]:
                j += 1
            runs.append([i, j])
            i = j
        else:
            i += 1
    merged = [runs[0]]
    for a, b in runs[1:]:
        if a - merged[-1][1] <= gap:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    if len(merged) > 1 and (per - merged[-1][1]) + merged[0][0] <= gap:  # wrap-around hole
        merged[0] = [merged[-1][0], merged[0][1] + per]
        merged.pop()
    a, b = max(merged, key=lambda x: x[1] - x[0])
    out = np.zeros(per, bool)
    out[np.arange(a, b) % per] = True
    return np.roll(out, s)


def contact_masks(frames):
    """Walk cycles (closed loop, last frame == first): a foot is in contact when its lowest sole point is near
    the foot's lowest height AND moves with the stance (treadmill) velocity, i.e. its world-space speed with the
    root motion put back is < CONTACT_DV. Height alone is not enough: in Walk_Backward the landing toe skims the
    floor while it still swings backwards at 2-3 m/s."""
    per = len(frames) - 1
    nx, pv = (np.arange(per) + 1) % per, (np.arange(per) - 1) % per
    m, vf, vb = {}, {}, {}
    for s in (L, R):
        Pp = sole_track(frames, s)[0][:per]
        z = Pp[:, :, 2]
        i = z.argmin(1)
        m[s] = z.min(1)
        vf[s] = (Pp[nx, i, :2] - Pp[np.arange(per), i, :2]) * FPS  # lowest point, forward difference
        vb[s] = (Pp[np.arange(per), i, :2] - Pp[pv, i, :2]) * FPS  # backward difference
    vs = np.median(np.vstack([np.r_[vf[s], vb[s]][np.r_[m[s], m[s]] - m[s].min() < 0.008] for s in (L, R)]), 0)
    for _ in range(3):
        masks = {}
        for s in (L, R):
            ok = np.minimum(np.linalg.norm(vf[s] - vs, axis=1), np.linalg.norm(vb[s] - vs, axis=1)) < CONTACT_DV
            masks[s] = clean_cyclic((m[s] - m[s].min() < CONTACT_LOW) & ok)
        vs = np.median(np.vstack([vf[s][masks[s] & masks[s][nx]] for s in (L, R)]), 0)
    return masks, vs


def run_order(mask):
    """Contact frames of a cyclic mask in time order, starting at the touchdown frame."""
    per = len(mask)
    if mask.all():
        return list(range(per))
    s = next(f for f in range(per) if mask[f] and not mask[f - 1])
    return [(s + j) % per for j in range(int(mask.sum()))]


def cyclic_fill(mask, vals):
    """Smoothstep interpolation of per-frame corrections across the cyclic swing gap between contact runs."""
    per = len(mask)
    out = np.array(vals, float)
    idx = np.where(mask)[0]
    for a, b in zip(idx, np.roll(idx, -1)):
        gap = (b - a) % per or per
        for j in range(1, gap):
            t = j / gap
            t = t * t * (3 - 2 * t)
            out[(a + j) % per] = (1 - t) * vals[a] + t * vals[b]
    return out


def contact_distance(mask):
    per = len(mask)
    idx = np.where(mask)[0]
    d = np.abs(np.arange(per)[:, None] - idx[None, :])
    return np.minimum(d, per - d).min(1)


def plant_pass(frames, masks, vs):
    per = len(frames) - 1
    out = frames
    for side in (L, R):
        Pp, an = sole_track(out, side)
        Pp, an = Pp[:per], an[:per]
        z = Pp[:, :, 2]
        m = z.min(1)
        c = masks[side]
        dz = np.where(c, -m, 0.0)
        dxy = np.zeros((per, 2))
        run = run_order(c)
        for fa, fb in zip(run[:-1], run[1:]):  # pin the touching sole points to the treadmill
            za, zb = z[fa] + dz[fa], z[fb] + dz[fb]
            sel = np.maximum(za, zb) < CONTACT_Z
            if not sel.any():
                sel = za < za.min() + 0.002
            dxy[fb] = dxy[fa] + vs / FPS - (Pp[fb, sel, :2] - Pp[fa, sel, :2]).mean(0)
        dxy[run] -= dxy[run].mean(0)
        dz = cyclic_fill(c, dz)
        dxy = np.c_[cyclic_fill(c, dxy[:, 0]), cyclic_fill(c, dxy[:, 1])]
        cl = np.minimum(SWING_CLEAR[0], SWING_CLEAR[1] * contact_distance(c))
        dz = np.where(c, dz, np.maximum(dz, cl - m))  # swing: lift the sole clear of the floor
        tgt = an + np.c_[dxy, dz]
        tgt = np.vstack([tgt, tgt[:1]])
        out = [(leg_ik(Rw, hp, side, Vector(t)), hp) for (Rw, hp), t in zip(out, tgt)]
    return out


def contact_velocities(frames, side):
    """Reviewer metric: mean horizontal velocity of the sole points below CONTACT_Z in two consecutive frames."""
    Pp = sole_track(frames, side)[0]
    rows = []
    for f in range(len(frames) - 1):
        sel = (Pp[f, :, 2] < CONTACT_Z) & (Pp[f + 1, :, 2] < CONTACT_Z)
        if sel.sum() >= 3:
            rows.append((f, *((Pp[f + 1, sel, :2] - Pp[f, sel, :2]).mean(0) * FPS)))
    return np.array(rows).reshape(-1, 3)


def plant_feet_loop(frames):
    """Walk cycles: contact by height AND treadmill velocity; in contact the lowest sole point sits on the floor
    and every touching sole point moves with the stance velocity (touchdown on the toe pins the toe while the
    heel rolls down); in swing the sole is lifted to >= SWING_CLEAR (ramped near touchdown / lift-off); the
    corrections are blended across the swing and applied with leg IK (2 passes for the skinning residual)."""
    masks, vs = contact_masks(frames)
    per = len(frames) - 1
    trimmed = {L: [], R: []}
    dip = np.zeros(per)  # local hips dip for a support frame no leg can reach
    kern = np.array([0.3, 0.8, 1.0, 0.8, 0.3])
    for _ in range(8):
        env = np.array([max(dip[(f + k) % per] * kern[k + 2] for k in range(-2, 3)) for f in range(per)])
        env = np.r_[env, env[0]]
        out = [(Rw, hp - Vector((0, 0, float(e)))) for (Rw, hp), e in zip(frames, env)]
        for _ in range(2):
            out = plant_pass(out, masks, vs)
        # a touchdown / lift-off frame the leg cannot reach (straight leg, foot far in front / behind): if the
        # other foot carries the body there, it is simply not a contact frame (trim it from the run); if it is
        # the only support, lower the hips locally (smooth 5-frame dip) instead of the whole clip
        changed = False
        for side in (L, R):
            o = R if side == L else L
            m2 = sole_track(out, side)[0][:-1, :, 2].min(1)
            run = run_order(masks[side])
            for f in (run[0], run[-1]):
                if len(run) > 4 and m2[f] > 0.002:
                    if masks[o][f]:
                        masks[side] = masks[side].copy()
                        masks[side][f] = False
                        trimmed[side].append(int(f))
                    else:
                        dip[f] += m2[f]
                    changed = True
        if not changed:
            break
    info = {}
    per = len(out) - 1
    vhat = vs / np.linalg.norm(vs)
    for side in (L, R):
        Pp = sole_track(out, side)[0][:per]
        m2 = Pp[:, :, 2].min(1)
        c = masks[side]
        cv = contact_velocities(out, side)
        dev = np.linalg.norm(cv[:, 1:] - vs, axis=1) if len(cv) else np.zeros(1)
        along = cv[:, 1:] @ vhat if len(cv) else np.zeros(1)
        info[side] = dict(contact_frames=int(c.sum()), touchdown_frame=int(run_order(c)[0]), liftoff_frame=int(run_order(c)[-1]),
                          stance_sole_min_m=[round(float(m2[c].min()), 4), round(float(m2[c].max()), 4)],
                          swing_sole_min_m=round(float(m2[~c].min()), 4) if (~c).any() else None,
                          sole_min_any_frame_m=round(float(m2.min()), 4),
                          touching_pairs=int(len(cv)), touching_speed_mps=[round(float(along.min()), 3), round(float(along.max()), 3)],
                          touching_velocity_error_max_mps=round(float(dev.max()), 3), unreachable_frames_trimmed=trimmed[side])
    info["stance_velocity_mps"] = round(float(np.linalg.norm(vs)), 3)
    info["support_dip_m"] = dict(frames=[int(f) for f in np.where(dip > 0)[0]], max=round(float(dip.max()), 4))
    both = np.minimum(*[sole_track(out, s)[0][:-1, :, 2].min(1) for s in (L, R)])
    info["lowest_sole_any_frame_m"] = [round(float(both.min()), 4), round(float(both.max()), 4)]  # max > 0: a flight frame
    return out, info


def plant_feet(frames):
    """Stationary clips: lock each ankle horizontally at its mean position and keep each foot's lowest sole
    point on the floor in every frame (the donor feet slide 2-4 cm and one sole floated)."""
    info = {}
    out = frames
    for side in (L, R):
        ms = [sole_metrics(Rw, hp, side) for Rw, hp in out]
        an = np.array([m["ankle"] for m in ms])
        drops = np.array([m["all"] for m in ms])  # per frame: the foot's lowest point onto the floor (heel raises kept)
        tgt_xy = an[:, :2].mean(0)
        out = [(leg_ik(Rw, hp, side, Vector((tgt_xy[0], tgt_xy[1], a[2] - dr))), hp) for (Rw, hp), a, dr in zip(out, an, drops)]
        ms2 = [sole_metrics(Rw, hp, side) for Rw, hp in out]
        an2 = np.array([m["ankle"] for m in ms2])
        info[side] = dict(ankle_drift_before_m=round(float(np.ptp(an[:, :2], 0).max()), 4), ankle_drift_after_m=round(float(np.ptp(an2[:, :2], 0).max()), 4),
                          sole_lowered_m=[round(float(drops.min()), 4), round(float(drops.max()), 4)],
                          sole_min_after_m=[round(float(min(m["all"] for m in ms2)), 4), round(float(max(m["all"] for m in ms2)), 4)])
    return out, info


def mirror_arm(frames, src, dst):
    """Replace the dst arm by the mirror image of the src arm half a cycle later (relative to the chest)."""
    n = len(frames)
    per = n - 1  # closed loop: last frame == first frame
    sp = P + "Spine2"
    chain = [P + "%s" + nm for nm in ("Shoulder", "Arm", "ForeArm", "Hand", "HandMiddle4")]

    def K(fr, b):
        Rw = fr[0]
        return (Rw[sp] @ rest_rot[sp].inverted()).inverted() @ (Rw[b] @ rest_rot[b].inverted())

    out = []
    for f, (Rw, hp) in enumerate(frames):
        g = (f + per / 2.0) % per
        g0 = int(math.floor(g))
        al = g - g0
        Rw2 = dict(Rw)
        Dsp = Rw[sp] @ rest_rot[sp].inverted()
        for c in chain:
            bs, bd = c % src, c % dst
            k = K(frames[g0], bs).slerp(K(frames[g0 + 1], bs), al)
            km = Quaternion((k.w, k.x, -k.y, -k.z))  # reflection across the x=0 (sagittal) plane
            Rw2[bd] = Dsp @ km @ rest_rot[bd]
        out.append((Rw2, hp))
    return out


# ---- collision-aware arm clearance (retarget correction for a wider-hipped target)
ARMCHAIN = {s: [P + s + n for n in ("Arm", "ForeArm", "Hand", "HandMiddle4")] for s in (L, R)}
_hand_sets = {}
for _s in (L, R):
    _hand_sets[_s] = np.where(Hw[:, [bidx[b] for b in ARMCHAIN[_s][1:]]].sum(1) > 0.5)[0]  # forearm + hand
_armw = Hw[:, [bidx[b] for s in (L, R) for b in ARMCHAIN[s]]].sum(1)
_obst = np.where((_armw < 0.02) & (BW[:, 2] < 1.15))[0]  # hips, belly, thighs


def clearance(frames, side):
    dmin = 1e9
    for Rw, hp in frames:
        pos = fk_positions(Rw, hp)
        hand = skin_points(_hand_sets[side], Rw, pos)
        obst = skin_points(_obst, Rw, pos)
        dmin = min(dmin, cKDTree(obst).query(hand)[0].min())
    return dmin


def abduct(frames, side, deg_):
    out = []
    sg = 1 if side == L else -1
    for Rw, hp in frames:
        Rw = dict(Rw)
        fwd = (Rw[P + "Spine2"] @ rest_rot[P + "Spine2"].inverted()) @ Vector((0, -1, 0))
        q = Quaternion(fwd, sg * math.radians(deg_))
        for b in ARMCHAIN[side]:
            Rw[b] = q @ Rw[b]
        out.append((Rw, hp))
    return out


def clear_arms(frames, need=0.05, max_deg=14):
    applied = {}
    for side in (L, R):
        d0 = clearance(frames, side)
        a = 0
        while a < max_deg and clearance(abduct(frames, side, a), side) < need:
            a += 2
        frames = abduct(frames, side, a) if a else frames
        applied[side] = dict(abduction_deg=a, clearance_before=round(float(d0), 4), clearance_after=round(float(clearance(frames, side)), 4))
    return frames, applied


# ---- posture helpers (Walk_Backward: less crouch / forward lean) and the two-handed Cheer
def torso_lean(Rw, hp):
    pos = fk_positions(Rw, hp)
    t = pos[P + "Neck"] - pos[HIPS]
    return math.atan2(-t.y, t.z)  # forward (-Y) lean of hips->neck, rad


def ease_lean(blend):
    """Remove `blend` of the clip's mean forward torso lean (relative to the rest pose), pivoting at Spine."""
    def f(frames):
        th0 = torso_lean(dict(rest_rot), rest_head[HIPS])
        th = np.array([torso_lean(Rw, hp) for Rw, hp in frames])
        d = blend * float(th.mean() - th0)
        out = []
        for Rw, hp in frames:
            Rw = dict(Rw)
            Q = Quaternion(Vector((1, 0, 0)), -d)  # +x rotation tilts +Z towards -Y (forward): -d leans back
            for b in SUBTREE[P + "Spine"]:
                Rw[b] = Q @ Rw[b]
            out.append((Rw, hp))
        th2 = np.array([torso_lean(Rw, hp) for Rw, hp in out])
        return out, dict(torso_lean_rest_deg=round(math.degrees(th0), 2), torso_lean_mean_deg=[round(math.degrees(th.mean()), 2), round(math.degrees(th2.mean()), 2)])
    return f


def raise_hips(frames, blend):
    """Hips lift that removes `blend` of the stance leg's mean crouch (hip-ankle distance vs the rest leg)."""
    crouch = []
    for Rw, hp in frames:
        pos = fk_positions(Rw, hp)
        s = min((L, R), key=lambda x: pos[P + x + "Foot"].z)
        l0 = (rest_head[P + s + "UpLeg"] - rest_head[P + s + "Foot"]).length
        crouch.append(l0 - (pos[P + s + "UpLeg"] - pos[P + s + "Foot"]).length)
    return blend * max(0.0, float(np.mean(crouch)))


ARM5 = ("Shoulder", "Arm", "ForeArm", "Hand", "HandMiddle4")
CHEER_BOTH = dict(src=R, dst=L, delay=2, ramp=8, raised_above_shoulder_m=0.10, min_hand_sep_m=0.22, min_head_clear_m=0.015,
                  max_spread_deg=30)


def abduct_pf(frames, side, degs):
    out = []
    sg = 1 if side == L else -1
    for (Rw, hp), d in zip(frames, degs):
        Rw = dict(Rw)
        fwd = (Rw[P + "Spine2"] @ rest_rot[P + "Spine2"].inverted()) @ Vector((0, -1, 0))
        q = Quaternion(fwd, sg * math.radians(d))
        for b in ARMCHAIN[side]:
            Rw[b] = q @ Rw[b]
        out.append((Rw, hp))
    return out


def both_arms_up(frames):
    """Cheer_with_Both_Hands_1 only pumps the right fist; the left hand stays at the chest. While the right arm
    is raised, blend the left arm onto the mirrored right arm (a couple of frames later), then spread both arms
    just enough that the hands stay apart over the head."""
    cfg = CHEER_BOTH
    n = len(frames)
    sp = P + "Spine2"
    src, dst = cfg["src"], cfg["dst"]
    pos = [fk_positions(Rw, hp) for Rw, hp in frames]
    up = np.array([p[P + src + "Hand"].z - p[P + src + "Shoulder"].z > cfg["raised_above_shoulder_m"] for p in pos])
    i0, i1 = int(np.where(up)[0][0]), int(np.where(up)[0][-1])
    r = cfg["ramp"]
    w = np.zeros(n)
    for f in range(n):
        t = 1.0 if i0 <= f <= i1 else max(0.0, 1 - (i0 - f) / r) if f < i0 else max(0.0, 1 - (f - i1) / r)
        w[f] = t * t * (3 - 2 * t)

    def K(fr, b):
        Rw = fr[0]
        return (Rw[sp] @ rest_rot[sp].inverted()).inverted() @ (Rw[b] @ rest_rot[b].inverted())

    out = []
    for f, (Rw, hp) in enumerate(frames):
        Rw2 = dict(Rw)
        if w[f] > 0:
            g = min(max(f - cfg["delay"], 0), n - 1)
            Dsp = Rw[sp] @ rest_rot[sp].inverted()
            for nm in ARM5:
                bs, bd = P + src + nm, P + dst + nm
                k = K(frames[g], bs)
                tq = Dsp @ Quaternion((k.w, k.x, -k.y, -k.z)) @ rest_rot[bd]
                if tq.dot(Rw[bd]) < 0:
                    tq = -tq
                Rw2[bd] = Rw[bd].slerp(tq, float(w[f]))
        out.append((Rw2, hp))

    head_ids = np.where(Hw[:, [bidx[P + "Head"], bidx[P + "Neck"]]].sum(1) > 0.5)[0]

    def spread(fr, a):
        """Rotate each arm by a deg about the chest's forward axis, in the direction that moves its hand outward."""
        Rw, hp = fr
        for side in (L, R):
            sg = 1 if side == L else -1
            Rt, _ = abduct_pf([(Rw, hp)], side, [1.0])[0]
            dx = fk_positions(Rt, hp)[P + side + "Hand"].x - fk_positions(Rw, hp)[P + side + "Hand"].x
            Rw, hp = abduct_pf([(Rw, hp)], side, [a if dx * sg > 0 else -a])[0]
        return Rw, hp

    def ok(fr):
        Rw, hp = fr
        p = fk_positions(Rw, hp)
        sep = min((p[P + "Left" + b] - p[P + "Right" + b]).length for b in ("Hand", "HandMiddle4"))
        hd = cKDTree(skin_points(head_ids, Rw, p))
        clear = min(hd.query(skin_points(_hand_sets[s2], Rw, p))[0].min() for s2 in (L, R))
        return sep >= cfg["min_hand_sep_m"] and clear >= cfg["min_head_clear_m"]
    need = np.zeros(n)
    for f in range(n):
        if w[f] <= 0:
            continue
        need[f] = next((a for a in range(0, cfg["max_spread_deg"] + 1) if ok(spread(out[f], a))), cfg["max_spread_deg"])
    # temporal smoothing that keeps the peaks (running max over +-3 frames, then a 5-tap blur)
    ext = np.array([need[max(0, f - 3):f + 4].max() for f in range(n)])
    sm = np.convolve(np.r_[[ext[0]] * 2, ext, [ext[-1]] * 2], np.ones(5) / 5, mode="valid")
    out = [spread(fr, float(a)) for fr, a in zip(out, sm)]
    hd_clear = []
    for Rw, hp in out:
        p = fk_positions(Rw, hp)
        hd = cKDTree(skin_points(head_ids, Rw, p))
        hd_clear.append(min(hd.query(skin_points(_hand_sets[s2], Rw, p))[0].min() for s2 in (L, R)))
    hs = [min((p[P + "Left" + b] - p[P + "Right" + b]).length for b in ("Hand", "HandMiddle4")) for p in [fk_positions(Rw, hp) for Rw, hp in out]]
    lh = [fk_positions(Rw, hp)[P + dst + "Hand"].z for Rw, hp in out]
    return out, dict(mirrored_frames=[max(0, i0 - r), min(n - 1, i1 + r)], full_mirror_frames=[i0, i1], delay_frames=cfg["delay"],
                     spread_deg=[round(float(sm.min()), 1), round(float(sm.max()), 1)], min_hand_sep_m=round(float(min(hs)), 3),
                     min_hand_head_clearance_m=round(float(min(hd_clear)), 4),
                     left_hand_peak_z_m=round(float(max(lh)), 3))


def retarget(donor_path, action_name, out_name, loop, skip_bones=(), mirror=None, post_pose=None, raise_blend=0.0):
    before = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=donor_path)
    donor_acts = {}
    for a in [a for a in bpy.data.actions if a not in before]:
        base = a.name
        if "." in base and base.rsplit(".", 1)[1].isdigit():
            base = base.rsplit(".", 1)[0]
        a.name = "DONOR_" + base
        donor_acts[base] = a
    objs = list(bpy.context.selected_objects)
    darm = [o for o in objs if o.type == "ARMATURE"][0]
    for o in objs:
        if o.type == "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    for o in list(scene.objects):
        if o.name.startswith("Icosphere"):
            bpy.data.objects.remove(o, do_unlink=True)
    act = donor_acts[action_name]
    for tr in list(darm.animation_data.nla_tracks):
        darm.animation_data.nla_tracks.remove(tr)
    darm.animation_data.action = act
    if len(act.slots):
        darm.animation_data.action_slot = act.slots[0]
    f0, f1 = int(round(act.frame_range[0])), int(round(act.frame_range[1]))
    # per-bone constant correction C_b = R_ref^-1 R_t_rest, R_ref = donor rest re-aimed onto our bone axis
    C = {}
    mapped = []
    for b in bones:
        if b in skip_bones or b not in darm.data.bones:
            continue
        Md = darm.data.bones[b].matrix_local
        ddir = (Md.to_3x3() @ Vector((0, 1, 0))).normalized()
        tdir = (rest_rot[b] @ Vector((0, 1, 0))).normalized()
        Rref = ddir.rotation_difference(tdir) @ Md.to_quaternion()
        C[b] = Rref.inverted() @ rest_rot[b]
        mapped.append(b)
    d_hips_rest = darm.data.bones[HIPS].matrix_local.to_translation()
    k = rest_head[HIPS].z / d_hips_rest.z
    raw = []
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        Rw = {}
        for b in mapped:
            Rw[b] = darm.pose.bones[b].matrix.to_quaternion() @ C[b]
        Rw = fill_missing(Rw)
        dh = darm.pose.bones[HIPS].matrix.to_translation() - d_hips_rest
        raw.append((Rw, np.array(dh[:]) * k))
    H = np.array([r[1] for r in raw])
    n = len(H)
    closing = None
    if loop:
        # does the donor clip carry a closing key (last pose == first pose)? compare hips-relative joints
        rel = [fk_positions(Rw, Vector((0, 0, 0))) for Rw, _ in raw]
        dpose = lambda a, b: max((rel[a][x] - rel[b][x]).length for x in bones)
        steps = [dpose(i, i + 1) for i in range(n - 1)]
        d_close = dpose(0, n - 1)
        closed = d_close < 0.25 * float(np.median(steps))
        closing = dict(first_last_m=round(d_close, 4), median_step_m=round(float(np.median(steps)), 4), closed=bool(closed))
        if closed:
            per = n - 1
            travel = H[-1, :2] - H[0, :2]
        else:  # the cycle is n frames long: frame n would be frame 0 again -> append it as the closing key
            per = n
            travel = (H[-1, :2] - H[0, :2]) * n / (n - 1)
            raw.append(raw[0])
            H = np.vstack([H, H[0] + np.r_[travel, 0.0]])
            closing["appended_closing_key"] = True
        tt = np.arange(len(H)) / per
        H[:, :2] -= np.outer(tt, travel)  # strip horizontal root travel
        H[:, :2] -= H[:-1, :2].mean(0)  # centre the sway under the feet
    else:
        per = n - 1
        travel = H[-1, :2] - H[0, :2]
        H[:, :2] -= np.outer(np.linspace(0, 1, n), travel)
    frames = [(Rw, rest_head[HIPS] + Vector(h)) for (Rw, _), h in zip(raw, H)]
    if mirror:
        frames = mirror_arm(frames, *mirror)
    if post_pose:
        frames, post_info = post_pose(frames)
    frames, foot_cal = calibrate_feet(frames, loop)
    frames, shift = ground(frames)
    planter = plant_feet if not loop else plant_feet_loop
    key = "sole_min_after_m" if not loop else "stance_sole_min_m"
    extra = float(raise_hips(frames, raise_blend)) if raise_blend else 0.0  # posture: straighten the crouch
    raised = extra
    for _ in range(4):  # a straight stance leg cannot reach down: lower the hips by the residual float
        fr2, plant = planter([(Rw, hp + Vector((0, 0, extra))) for Rw, hp in frames])
        resid = max(plant[s2][key][1] for s2 in (L, R))
        if resid <= 0.002:
            break
        extra -= resid
    frames = fr2
    shift += extra
    frames, arm_fix = clear_arms(frames)
    # clean up the donor
    darm.animation_data.action = None
    bpy.data.objects.remove(darm, do_unlink=True)
    for a in donor_acts.values():
        bpy.data.actions.remove(a)
    actn = new_action(out_name, frames)
    nf = len(frames)
    info = dict(source=os.path.basename(donor_path), clip=action_name, frames=nf, duration=round((nf - 1) / FPS, 3),
                travel_removed_per_cycle_m=[round(float(x), 3) for x in travel],
                ground_shift_m=round(shift, 4),
                mapped_bones=len(mapped), arm_clearance=arm_fix, foot_calibration=foot_cal)
    if closing:
        info["loop"] = closing
    if plant:
        info["foot_plant"] = plant
    if mirror:
        info["arm_mirrored"] = f"{mirror[1]} arm = mirrored {mirror[0]} arm, half a cycle later"
    if post_pose:
        info["post_pose"] = post_info
    if raise_blend:
        info["hips_raise_m"] = dict(asked=round(raised, 4), kept=round(extra, 4))
    if loop:
        info["root_travel_speed_mps"] = round(float(np.linalg.norm(travel)) / (per / FPS), 3)
        # move speed at which the planted sole points stand still on the ground (pinned by plant_feet_loop)
        info["playback_sync_speed_mps"] = plant["stance_velocity_mps"]
    log("retarget", out_name, info)
    return info


IDLE = dict(abduction_deg=5.0, elbow_flex_deg=16.0, pronation_deg=(10.0, 45.0, 15.0),  # Arm / ForeArm / Hand twist
            stand=L, pelvis_tilt_deg=2.5, pelvis_shift_m=0.015, stand_knee_flex_deg=4.0, clearance_m=0.012)


def frontal_abduction(u):
    return math.degrees(math.atan2(abs(u.x), -u.z))


def relaxed_base(abd):
    """World rest rotations with the arms relaxed: brought in to abd_deg, elbows softly flexed, forearms
    pronated so the palms face the thighs (the bind A-pose has the palms facing forward)."""
    RB = dict(rest_rot)
    fwd = Vector((0, -1, 0))
    for side, sg in ((L, 1), (R, -1)):
        A, Fa, Hd = (P + side + n for n in ("Arm", "ForeArm", "Hand"))

        def pos():
            return fk_positions(fill_missing({b: RB[b] for b in bones}), rest_head[HIPS])

        def turn(bone, q):
            for b in SUBTREE[bone]:
                RB[b] = q @ RB[b]

        abd_deg = abd[side]
        p = pos()
        u = p[Fa] - p[A]
        # 1. adduct in the frontal plane (rotation about the forward axis)
        da = math.radians(frontal_abduction(u) - abd_deg)
        q = min((Quaternion(fwd, da), Quaternion(fwd, -da)), key=lambda q: abs(frontal_abduction(q @ u) - abd_deg))
        turn(A, q)
        # 2. upper-arm internal rotation, 3. elbow flexion in the sagittal plane, 4. forearm/hand pronation
        tw_a, tw_f, tw_h = (math.radians(x) for x in IDLE["pronation_deg"])
        palm = Vector((0, -1, 0))  # bind palms face forward

        def medial_sign(axis):
            return 1 if (Quaternion(axis, 0.5) @ palm).x * sg < 0 else -1

        p = pos()
        u = (p[Fa] - p[A]).normalized()
        turn(A, Quaternion(u, medial_sign(u) * tw_a))
        for _ in range(4):  # flex the elbow forward until the shoulder-elbow-wrist angle hits the target
            p = pos()
            u = (p[Fa] - p[A]).normalized()
            v = (p[Hd] - p[Fa]).normalized()
            flex_now = math.degrees(u.angle(v))
            hinge = v.cross(fwd).normalized()
            turn(Fa, Quaternion(hinge, math.radians(IDLE["elbow_flex_deg"] - flex_now)))
        p = pos()
        v = (p[Hd] - p[Fa]).normalized()
        sgn = medial_sign(v)
        turn(Fa, Quaternion(v, sgn * tw_f))
        turn(Hd, Quaternion(v, sgn * tw_h))
    return RB


def idle_frames(abd, n=121):
    """Calm idle: relaxed arms, contrapposto (weight on one straight leg, pelvis tilted, the free knee soft,
    shoulders counter-tilted), breathing, a slow small weight shift and head drift; feet planted (2-bone IK)."""
    RB = relaxed_base(abd)
    frames = []
    X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    deg = math.radians
    st = IDLE["stand"]
    sgs = 1 if st == L else -1  # +x side carries the weight
    up_len = {s: (rest_head[P + s + "Leg"] - rest_head[P + s + "UpLeg"]).length for s in (L, R)}
    lo_len = {s: (rest_head[P + s + "Foot"] - rest_head[P + s + "Leg"]).length for s in (L, R)}
    for fi in range(n):
        t = fi / (n - 1)
        w = 2 * math.pi * t
        br = math.sin(w + 0.3)  # one breath per loop (4 s)
        sway = math.sin(w)
        D = {b: Quaternion() for b in bones}

        def rot(b, axis, a):
            D[P + b] = Quaternion(axis, a) @ D[P + b]

        # contrapposto: the free-leg hip drops (rotation about +Y lowers the -x side for negative angles)
        tilt = deg(IDLE["pelvis_tilt_deg"] + 0.4 * sway)
        rot("Hips", Y, -sgs * tilt)
        rot("Hips", Z, sgs * deg(3.0) + deg(0.8) * math.sin(w + 1.0))
        # spine counter-tilt: chest ends up tilted the other way (standing-side shoulder lower), head level
        rot("Spine", Y, sgs * (0.75 * tilt))
        rot("Spine1", Y, sgs * (0.75 * tilt))
        rot("Spine2", Y, sgs * deg(0.6))
        rot("Spine1", Z, -sgs * deg(1.5))
        rot("Spine2", Z, -sgs * deg(1.5))
        rot("Spine1", X, -deg(0.6) * br)
        rot("Spine2", X, -deg(0.9) * br)
        rot("Neck", Y, -sgs * deg(0.8))
        rot("Neck", Z, deg(1.2) * math.sin(w + 0.8))
        rot("Head", Y, -sgs * deg(1.0) + deg(1.0) * math.sin(w + 2.0))
        rot("Head", Z, deg(3.0) * math.sin(w + 0.8))
        rot("Head", X, deg(1.2) * math.sin(2 * w + 0.4))
        for s, sg in ((L, 1), (R, -1)):
            ph = 0.6 if s == R else 0.0
            rot(s + "Shoulder", Y, -sg * deg(1.3) * br)
            rot(s + "Arm", Y, sg * deg(0.8) * br)
            rot(s + "Arm", X, deg(1.4) * math.sin(w + 1.2 + ph))
            rot(s + "ForeArm", X, -deg(1.2) * math.sin(w + 2.0 + ph))
            rot(s + "Hand", X, -deg(1.5) * math.sin(w + 2.4 + ph))
        Rw = {}
        for b in order:
            p = parent[b]
            base = (Rw[p] @ (RB[p].inverted() @ RB[b])) if p else RB[b]
            Rw[b] = D[b] @ base
        # pelvis over the standing foot; height so the standing knee keeps a small (breathing) flex
        hx = sgs * (IDLE["pelvis_shift_m"] + 0.003 * sway)
        hp0 = rest_head[HIPS] + Vector((hx, 0.0, 0.0))
        pos = fk_positions(Rw, hp0)
        an = rest_head[P + st + "Foot"]
        vh = pos[P + st + "UpLeg"] - an
        a_, b_ = up_len[st], lo_len[st]
        kf = math.radians(IDLE["stand_knee_flex_deg"] + 1.0 * br)
        d_t = math.sqrt(a_ * a_ + b_ * b_ + 2 * a_ * b_ * math.cos(kf))
        horiz2 = vh.x ** 2 + vh.y ** 2
        dz = math.sqrt(max(d_t * d_t - horiz2, 0)) - vh.z
        hips_pos = hp0 + Vector((0, 0, dz))
        pos = fk_positions(Rw, hips_pos)
        for s in (L, R):
            up, lo, ft = P + s + "UpLeg", P + s + "Leg", P + s + "Foot"
            hp = pos[up]
            an = rest_head[ft]
            dvec = an - hp
            d = min(dvec.length, up_len[s] + lo_len[s] - 1e-4)
            u = dvec.normalized()
            ru = (rest_head[ft] - rest_head[up]).normalized()
            pole = Vector((0, -1, 0))  # knees bend forward (-Y)
            v = (pole - u * pole.dot(u)).normalized()
            a = (up_len[s] ** 2 - lo_len[s] ** 2 + d * d) / (2 * d)
            h = math.sqrt(max(up_len[s] ** 2 - a * a, 0))
            kn = hp + u * a + v * h

            def frame_rot(d0, n0, d1, n1):
                m0 = Matrix((d0, n0, d0.cross(n0))).transposed()
                m1 = Matrix((d1, n1, d1.cross(n1))).transposed()
                return (m1 @ m0.transposed()).to_quaternion()

            n_rest = ru.cross((pole - ru * pole.dot(ru)).normalized()).normalized()
            n_new = u.cross(v).normalized()
            d_up0 = (rest_head[lo] - rest_head[up]).normalized()
            d_lo0 = (rest_head[ft] - rest_head[lo]).normalized()
            Rw[up] = frame_rot(d_up0, (n_rest - d_up0 * n_rest.dot(d_up0)).normalized(), (kn - hp).normalized(),
                               (n_new - (kn - hp).normalized() * n_new.dot((kn - hp).normalized())).normalized()) @ rest_rot[up]
            dl = (an - kn).normalized()
            Rw[lo] = frame_rot(d_lo0, (n_rest - d_lo0 * n_rest.dot(d_lo0)).normalized(), dl,
                               (n_new - dl * n_new.dot(dl)).normalized()) @ rest_rot[lo]
            Rw[ft] = rest_rot[ft].copy()
            for b in (P + s + "ToeBase", P + s + "Toe_End"):
                p = parent[b]
                Rw[b] = Rw[p] @ (rest_rot[p].inverted() @ rest_rot[b])
        frames.append((Rw, hips_pos))
    return frames


def build_idle():
    """Smallest arm abduction >= IDLE['abduction_deg'] whose hands/forearms clear the hips and thighs."""
    abd = {L: IDLE["abduction_deg"], R: IDLE["abduction_deg"]}
    while True:
        fr = idle_frames(abd)
        sub = fr[::6]
        cl = {s: float(clearance(sub, s)) for s in (L, R)}
        low = [s for s in (L, R) if cl[s] < IDLE["clearance_m"] and abd[s] < 12]
        if not low:
            break
        for s in low:
            abd[s] += 0.5
    feet_err = max((fk_positions(Rw, hp)[P + s + "Foot"] - rest_head[P + s + "Foot"]).length for Rw, hp in fr for s in (L, R))
    return fr, dict(arm_abduction_deg=abd, hand_clearance_m={k: round(v, 4) for k, v in cl.items()}, feet_drift_m=round(feet_err, 5))


report["clips"] = {}
report["clips"]["Walking"] = retarget(GHOST, "Walking", "Walking", loop=True, mirror=(R, L))
report["clips"]["Walk_Backward"] = retarget(GHOST, "Walk_Backward", "Walk_Backward", loop=True,
                                            post_pose=ease_lean(WB_POSTURE["lean_blend"]), raise_blend=WB_POSTURE["crouch_blend"])
report["clips"]["Cheer"] = retarget(ALLROUNDER, "Cheer_with_Both_Hands_1", "Cheer", loop=False,
                                    skip_bones=(P + "LeftHandMiddle4", P + "RightHandMiddle4"),
                                    post_pose=both_arms_up if CHEER_BOTH_ARMS else None)
idle, idle_info = build_idle()
new_action("Idle", idle)
report["clips"]["Idle"] = dict(source="procedural relaxed contrapposto", frames=len(idle), duration=round((len(idle) - 1) / FPS, 3),
                               **idle_info, pose=IDLE)
log("idle", report["clips"]["Idle"])

# drop every action that is not ours
ours = {"Walking", "Walk_Backward", "Cheer", "Idle"}
for a in list(bpy.data.actions):
    if a.name not in ours:
        bpy.data.actions.remove(a)
bpy.data.objects.remove(ghost_arm, do_unlink=True)
for o in list(scene.objects):
    if o not in (rig, girl):
        bpy.data.objects.remove(o, do_unlink=True)
rig.animation_data.action = None
for pb in rig.pose.bones:
    pb.rotation_quaternion = Quaternion()
    pb.location = Vector()
# NLA tracks so every action is attached to the rig (exporter: ACTIONS mode)
for name in ("Idle", "Walking", "Walk_Backward", "Cheer"):
    tr = rig.animation_data.nla_tracks.new()
    tr.name = name
    try:
        tr.strips.new(name, 0, bpy.data.actions[name])
    except Exception as e:
        log("nla strip failed", name, e)
    tr.mute = True

# ----------------------------------------------------------------------------- 6. export
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
for o in scene.objects:
    o.select_set(o in (rig, girl))
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", use_selection=True, export_yup=True,
    export_image_format="AUTO", export_unused_images=False,
    export_skins=True, export_influence_nb=4, export_all_influences=False, export_def_bones=False,
    export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
    export_frame_step=1, export_anim_single_armature=True, export_optimize_animation_size=False,
    export_anim_slide_to_zero=True, export_morph=False, export_tangents=False)


def reorder_glb_animations(path, order):
    """The exporter writes actions alphabetically (Cheer first); glTF loaders autoplay animations[0] -> put
    Idle first. Animations are only referenced by index from nothing else, so reordering the array is safe."""
    import struct
    b = open(path, "rb").read()
    magic, ver, _ = struct.unpack_from("<III", b, 0)
    jl, jt = struct.unpack_from("<II", b, 12)
    j = json.loads(b[20:20 + jl])
    rest = b[20 + jl:]
    names = [a["name"] for a in j["animations"]]
    j["animations"] = sorted(j["animations"], key=lambda a: order.index(a["name"]) if a["name"] in order else len(order))
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    out = struct.pack("<III", magic, ver, 12 + 8 + len(js) + len(rest)) + struct.pack("<II", len(js), jt) + js + rest
    open(path, "wb").write(out)
    return names, [a["name"] for a in j["animations"]]


_before, _after = reorder_glb_animations(OUT, ANIM_ORDER)
report["animation_order"] = dict(exported=_before, written=_after)
report["file_bytes"] = os.path.getsize(OUT)
log("exported", OUT, report["file_bytes"])
with open(REPORT, "w") as fh:
    json.dump(report, fh, indent=1, default=str)
