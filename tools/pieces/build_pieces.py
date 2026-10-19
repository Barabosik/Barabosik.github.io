"""Builds the chess set for the hero board: src/assets/pieces.glb is made from this file (Blender 5.2).

    blender -b --factory-startup --python tools/pieces/build_pieces.py -- <chess_set_1k.gltf> <out.glb> [preview_dir]
    gltf-transform meshopt <out.glb> src/assets/pieces.glb       (level high: quantized, ~190 KB, ~105 KB gzipped)

Pawn, rook, bishop, queen and king are turned here from profiles. The knight's head is the CC0 knight from
Poly Haven's "Chess Set" by Riley Queen (polyhaven.com/a/chess_set, 1k glTF); only its mesh is used, set on
this set's own base. Lighting is baked into the vertex colours with Cycles, under a soft dome that is the
same from every side, so it still holds when a piece turns or the board spins:
    R = ambient occlusion: the grooves, the collars and the contact with the board
    G = the dome light: soft light from above, falling off toward the foot
Units match the board: one square is 1, the base is 0.34 in radius, the piece stands on y = 0.
"""
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
KNIGHT_SRC, OUT = argv[0], argv[1]
PREVIEW = argv[2] if len(argv) > 2 else None

SEGMENTS = 36                  # at the board's camera distances a 36-gon's silhouette error is under half a pixel
SHARP = math.radians(38)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ---------- profiles: (radius, height) paths drawn from the foot up ----------
class Profile:
    def __init__(self, r, z):
        self.pts = [(r, z)]

    @property
    def end(self):
        return self.pts[-1]

    def line(self, r, z, step=0.08):
        r0, z0 = self.end
        n = max(1, math.ceil(math.hypot(r - r0, z - z0) / step))
        self.pts += [(r0 + (r - r0) * i / n, z0 + (z - z0) * i / n) for i in range(1, n + 1)]
        return self

    def curve(self, cr, cz, r, z):
        """quadratic bezier through control (cr, cz)"""
        r0, z0 = self.end
        a0 = math.atan2(cz - z0, cr - r0)
        a1 = math.atan2(z - cz, r - cr)
        turn = abs((a1 - a0 + math.pi) % (2 * math.pi) - math.pi)
        length = math.hypot(cr - r0, cz - z0) + math.hypot(r - cr, z - cz)
        # about 16 degrees a step, but no chord under 14 mm: small fillets stay light, long curves stay round
        n = max(2, min(math.ceil(turn / math.radians(16)), math.ceil(length / 0.014)), math.ceil(length / 0.07))
        for i in range(1, n + 1):
            t = i / n
            self.pts.append(((1 - t) ** 2 * r0 + 2 * (1 - t) * t * cr + t * t * r,
                             (1 - t) ** 2 * z0 + 2 * (1 - t) * t * cz + t * t * z))
        return self

    def arc(self, cr, cz, rad, a0, a1):
        """circular arc around (cr, cz), angles in degrees; starts with a line to the arc's first point"""
        a0, a1 = math.radians(a0), math.radians(a1)
        self.line(cr + rad * math.cos(a0), cz + rad * math.sin(a0))
        n = max(2, min(math.ceil(abs(a1 - a0) / math.radians(16)), math.ceil(rad * abs(a1 - a0) / 0.014)))
        for i in range(1, n + 1):
            a = a0 + (a1 - a0) * i / n
            self.pts.append((max(0.0, cr + rad * math.cos(a)), cz + rad * math.sin(a)))
        return self


def base():
    """the foot every piece shares: a rounded plinth, a bead, then a cove up into the stem"""
    return (Profile(0, 0).line(0.318, 0, step=0.16).curve(0.34, 0, 0.34, 0.022).line(0.34, 0.048)
            .curve(0.34, 0.066, 0.318, 0.068).line(0.292, 0.074)
            .arc(0.284, 0.101, 0.027, -90, 90)
            .curve(0.226, 0.13, 0.212, 0.168))


def collar(p, r_in, r_out, z, t=0.034):
    """a turned ring: out from the stem, a rounded rim, back in"""
    p.line(r_out - 0.012, z, step=0.04).curve(r_out, z, r_out, z + 0.012).line(r_out, z + t - 0.012)
    p.curve(r_out, z + t, r_out - 0.012, z + t).line(r_in, z + t + 0.006, step=0.04)
    return p


PROFILES = {
    'p': lambda: collar(base().curve(0.13, 0.25, 0.112, 0.40), 0.098, 0.19, 0.405, 0.036)
                 .arc(0, 0.596, 0.145, -48, 90),
    'r': lambda: collar(base().curve(0.19, 0.36, 0.172, 0.55), 0.17, 0.215, 0.552, 0.03)
                 .curve(0.17, 0.61, 0.236, 0.635).curve(0.25, 0.64, 0.25, 0.66).line(0.25, 0.808)
                 .curve(0.25, 0.82, 0.238, 0.82).line(0.186, 0.82).curve(0.176, 0.82, 0.176, 0.81)
                 .line(0.17, 0.745).line(0, 0.745, step=0.06),
    'b': lambda: collar(collar(base().curve(0.118, 0.3, 0.1, 0.5), 0.12, 0.19, 0.505, 0.034), 0.1, 0.16, 0.548, 0.024)
                 .curve(0.2, 0.68, 0.142, 0.79).curve(0.09, 0.88, 0.03, 0.905)
                 .arc(0, 0.953, 0.05, -52, 90),
    'q': lambda: collar(collar(base().curve(0.132, 0.36, 0.112, 0.645), 0.13, 0.215, 0.652, 0.036), 0.115, 0.158, 0.7, 0.022)
                 .curve(0.11, 0.85, 0.222, 0.94).curve(0.242, 0.955, 0.236, 0.972).line(0.2, 0.976)
                 .curve(0.15, 0.99, 0.07, 1.004).arc(0, 1.05, 0.052, -60, 90),
    'k': lambda: collar(collar(base().curve(0.15, 0.4, 0.124, 0.7), 0.135, 0.222, 0.705, 0.036), 0.12, 0.165, 0.755, 0.022)
                 .curve(0.12, 0.9, 0.2, 0.985).curve(0.218, 0.997, 0.208, 1.012).line(0.16, 1.02)
                 .curve(0.1, 1.034, 0.055, 1.06).curve(0.04, 1.068, 0, 1.07),
    # the knight's head stands on this: the same foot with a low plinth for the cut to sit in
    'n': lambda: base().curve(0.2, 0.2, 0.205, 0.215).curve(0.205, 0.228, 0.19, 0.228).line(0, 0.23, step=0.06),
}


# ---------- mesh helpers ----------
def link(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def lathe(name, pts, segments=SEGMENTS):
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in pts]
    edges = [bm.edges.new((a, b)) for a, b in zip(verts, verts[1:])]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=segments, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm)


def box(name, size, loc, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    ob = link(name, bm)
    ob.location, ob.rotation_euler = loc, rot
    return ob


def sphere(name, rad, loc):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=rad)
    ob = link(name, bm)
    ob.location = loc
    return ob


def apply_mods(ob):
    bpy.context.view_layer.objects.active = ob
    for o in scene.objects:
        o.select_set(o is ob)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def boolean(ob, cutters, op='DIFFERENCE'):
    for c in cutters:
        m = ob.modifiers.new('bool', 'BOOLEAN')
        m.operation, m.solver, m.object = op, 'EXACT', c
        apply_mods(ob)
        bpy.data.objects.remove(c)


def bevel(ob, width=0.005, angle=40):
    m = ob.modifiers.new('bevel', 'BEVEL')
    m.width, m.segments, m.limit_method, m.angle_limit = width, 2, 'ANGLE', math.radians(angle)
    m.harden_normals = False
    m.use_clamp_overlap = True
    apply_mods(ob)


def smooth_by_angle(ob, angle=SHARP):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > angle)
    bm.to_mesh(ob.data)
    bm.free()


# ---------- the pieces ----------
def build_rook():
    ob = lathe('r', PROFILES['r']().pts)
    # six crenels: three slots straight through the turret
    boolean(ob, [box(f'cut{i}', (0.64, 0.072, 0.12), (0, 0, 0.815), (0, 0, math.radians(30 + 60 * i))) for i in range(3)])
    return ob


def build_bishop():
    ob = lathe('b', PROFILES['b']().pts)
    # the mitre's slit: a diagonal cut into the side that faces the camera (three.js +z is Blender -y), two thirds deep
    boolean(ob, [box('slit', (0.42, 0.2, 0.026), (0, -0.135, 0.76), (0, math.radians(-38), 0))])
    return ob


def build_queen():
    ob = lathe('q', PROFILES['q']().pts)
    # the coronet: eight round notches out of the flared rim
    boolean(ob, [sphere(f'n{i}', 0.05, (0.25 * math.cos(a), 0.25 * math.sin(a), 0.995))
                 for i, a in enumerate(math.radians(22.5 + 45 * k) for k in range(8))])
    return ob


def build_king():
    ob = lathe('k', PROFILES['k']().pts)
    # the cross, arms along x like the old set, unioned onto the crown so it is one closed shell
    v = box('cv', (0.062, 0.05, 0.2), (0, 0, 1.15))
    h = box('ch', (0.17, 0.05, 0.056), (0, 0, 1.165))
    for c in (v, h):
        bevel(c, 0.008, 30)
    boolean(ob, [v, h], 'UNION')
    return ob


def build_knight():
    bpy.ops.import_scene.gltf(filepath=KNIGHT_SRC)
    src = bpy.data.objects['piece_knight_white_01']
    head = bpy.data.objects.new('nh', src.data.copy())
    scene.collection.objects.link(head)
    head.matrix_world = src.matrix_world.copy()
    for o in list(scene.objects):
        if o.name not in ('nh',):
            bpy.data.objects.remove(o)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    apply_mods(head)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = head.data
    lo = min(v.co.z for v in me.vertices)
    cut = lo + 0.015                     # just above the source's own foot, where the neck starts to rise
    ring = [v.co for v in me.vertices if abs(v.co.z - cut) < 0.0012]
    cx = (min(p.x for p in ring) + max(p.x for p in ring)) / 2
    cy = (min(p.y for p in ring) + max(p.y for p in ring)) / 2
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, cut), plane_no=(0, 0, 1), clear_inner=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    holes = [e for e in bm.edges if e.is_boundary]
    if holes:
        bmesh.ops.holes_fill(bm, edges=holes, sides=0)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    # face +x (the source looks down -y), scale to the set and stand it in the plinth
    s = 13.0
    m = Matrix.Translation((0, 0, 0.205)) @ Matrix.Rotation(math.radians(90), 4, 'Z') @ Matrix.Scale(s, 4) @ Matrix.Translation((-cx, -cy, -cut))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    # one level of subdivision smooths the facets of the game-res source; the bake then has vertices to land on
    sub = head.modifiers.new('sub', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    apply_mods(head)
    dec = head.modifiers.new('dec', 'DECIMATE')
    dec.ratio = 3000 / sum(len(f.vertices) - 2 for f in head.data.polygons)
    apply_mods(head)
    ob = lathe('n', PROFILES['n']().pts)
    for o in scene.objects:
        o.select_set(o in (ob, head))
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.join()
    smooth_by_angle(ob, math.radians(60))
    return ob


pieces = {}
pieces['n'] = build_knight()
pieces['p'] = lathe('p', PROFILES['p']().pts)
pieces['r'] = build_rook()
pieces['b'] = build_bishop()
pieces['q'] = build_queen()
pieces['k'] = build_king()
for key in 'prbqk':
    if key != 'p':                       # soften the boolean cuts so their edges catch the light
        bevel(pieces[key], 0.004, 50)
    smooth_by_angle(pieces[key])

for key, ob in pieces.items():
    me = ob.data
    me.calc_loop_triangles()
    zs = [v.co.z for v in me.vertices]
    rs = [math.hypot(v.co.x, v.co.y) for v in me.vertices]
    print(f'PIECE {key}: verts {len(me.vertices)} tris {len(me.loop_triangles)} height {max(zs):.3f} radius {max(rs):.3f}')


# ---------- bake ----------
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 2048
scene.cycles.use_denoising = False

# the board under the piece: dark, a little rough, big enough to fill the lower hemisphere
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
ground = bpy.context.active_object
gm = bpy.data.materials.new('board')
gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.03, 0.04, 0.038, 1)
ground.data.materials.append(gm)

# the dome: bright above, falling to the horizon, dim below
world = bpy.data.worlds.new('dome')
scene.world = world
world.use_nodes = True
nt = world.node_tree
tc = nt.nodes.new('ShaderNodeTexCoord')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
mr = nt.nodes.new('ShaderNodeMapRange')
mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = -0.1, 1.0
mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = 0.08, 1.0
pw = nt.nodes.new('ShaderNodeMath')
pw.operation, pw.inputs[1].default_value = 'POWER', 1.6
bg = nt.nodes['Background']
nt.links.new(tc.outputs['Generated'], sep.inputs[0])
nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
nt.links.new(mr.outputs['Result'], pw.inputs[0])
nt.links.new(pw.outputs[0], bg.inputs['Strength'])
world.light_settings.distance = 0.32       # AO reach: grooves and the foot, not the whole dome

white = bpy.data.materials.new('white')
white.use_nodes = True
white.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
white.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0

bake = scene.render.bake
bake.target = 'VERTEX_COLORS'
bake.use_pass_direct, bake.use_pass_indirect, bake.use_pass_color = True, True, False


def bake_into(ob, attr, kind):
    ca = ob.data.color_attributes.get(attr) or ob.data.color_attributes.new(attr, 'FLOAT_COLOR', 'POINT')
    ob.data.color_attributes.active_color = ca
    for o in scene.objects:
        o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type=kind, target='VERTEX_COLORS')
    return [c.color[0] for c in ob.data.color_attributes[attr].data]


def relax(ob, vals, k=0.5):
    """one pass toward the neighbours' mean: takes out the sampling speckle, keeps the grooves"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    out = []
    for v in bm.verts:
        ns = [e.other_vert(v).index for e in v.link_edges]
        out.append(vals[v.index] * (1 - k) + k * sum(vals[i] for i in ns) / len(ns) if ns else vals[v.index])
    bm.free()
    return out


baked = {}
for key, ob in pieces.items():
    ob.data.materials.clear()
    ob.data.materials.append(white)
    for o in pieces.values():
        o.hide_render = o is not ob
    baked[key] = (relax(ob, bake_into(ob, 'ao', 'AO')), relax(ob, bake_into(ob, 'light', 'DIFFUSE')))
    print(f'BAKED {key}')

# the dome light is scaled so the brightest point of the set (the top of the king) reads as 1
peak = max(max(light) for _, light in baked.values())
for key, ob in pieces.items():
    ao, light = baked[key]
    col = ob.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(col.data):
        c.color = (min(1.0, ao[i]), min(1.0, light[i] / peak), 0.0, 1.0)
    for name in ('ao', 'light'):
        ob.data.color_attributes.remove(ob.data.color_attributes[name])
    ob.data.color_attributes.active_color = ob.data.color_attributes['Col']
    ob.data.materials.clear()
    ob.hide_render = False
    ob.location = (0, 0, 0)

# ---------- export ----------
for o in scene.objects:
    o.select_set(o in pieces.values())
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
    export_texcoords=False, export_normals=True, export_tangents=False, export_materials='NONE',
    export_vertex_color='NAME', export_vertex_color_name='Col', export_all_vertex_colors=False,
    export_animations=False, export_skins=False, export_morph=False, export_cameras=False, export_lights=False, export_extras=False,
)
print('EXPORTED', OUT)

# ---------- preview: the line-up in bone, lit only by what was baked ----------
if PREVIEW:
    bpy.data.objects.remove(ground)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 1800, 700
    scene.world = bpy.data.worlds.new('flat')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.012, 0.016, 0.015, 1)
    mat = bpy.data.materials.new('preview')
    mat.use_nodes = True
    n = mat.node_tree.nodes
    out = n['Material Output']
    attr = n.new('ShaderNodeAttribute')
    attr.attribute_name = 'Col'
    sep = n.new('ShaderNodeSeparateColor')
    mul = n.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    emit = n.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = (0.77, 0.76, 0.70, 1)
    mat.node_tree.links.new(attr.outputs['Color'], sep.inputs[0])
    mat.node_tree.links.new(sep.outputs[0], mul.inputs[0])
    mat.node_tree.links.new(sep.outputs[1], mul.inputs[1])
    mat.node_tree.links.new(mul.outputs[0], emit.inputs['Strength'])
    mat.node_tree.links.new(emit.outputs[0], out.inputs['Surface'])
    for i, key in enumerate('prnbqk'):
        ob = pieces[key]
        ob.data.materials.append(mat)
        ob.location = (i * 0.8 - 2.0, 0, 0)
        if key == 'n':
            ob.rotation_euler = (0, 0, math.radians(-35))
    for name, rot in (('front', 0), ('back', 180)):
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        scene.collection.objects.link(cam)
        cam.data.type, cam.data.ortho_scale = 'ORTHO', 5.0
        a = math.radians(rot)
        cam.location = (math.sin(a) * 10, -math.cos(a) * 10, 0.62 + 1.2)
        cam.rotation_euler = (math.radians(83), 0, a)
        scene.camera = cam
        scene.render.filepath = f'{PREVIEW}/lineup_{name}.png'
        bpy.ops.render.render(write_still=True)
