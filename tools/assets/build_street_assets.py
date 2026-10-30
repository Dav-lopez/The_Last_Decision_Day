"""Build original, embedded-texture street GLBs. Python 3 + Pillow; no asset downloads.

All coordinates are glTF Y-up metres, with the building front toward +Z.
Run: python tools/assets/build_street_assets.py
"""
import io
import json
import math
import random
import struct
from pathlib import Path

from PIL import Image, ImageDraw

OUTPUT = Path(__file__).resolve().parents[2] / 'apps/web/public/models/environment'


def texture(kind):
    rng = random.Random(94)
    size = 128
    image = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    draw = ImageDraw.Draw(image)
    if kind == 'leaf':
        image = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        points = [(64, 4), (86, 20), (105, 47), (109, 68), (94, 91),
                  (65, 121), (36, 95), (20, 71), (23, 48), (40, 21)]
        draw.polygon(points, fill=(122, 155, 93, 255))
        draw.line([(64, 15), (65, 120)], fill=(178, 190, 122, 255), width=2)
        for y in range(31, 105, 17):
            draw.line([(64, y + 17), (33, y)], fill=(148, 172, 108, 255))
            draw.line([(64, y + 17), (96, y)], fill=(148, 172, 108, 255))
    else:
        pixels = image.load()
        for y in range(size):
            for x in range(size):
                noise = rng.randrange(-8, 9)
                if kind == 'bark':
                    value = 120 + int(19 * math.sin(x * .48 + math.sin(y * .06))) + noise
                    color = (value + 10, value - 10, value - 24, 255)
                elif kind == 'roof':
                    seam = y % 16 < 2 or (x + (y // 16 % 2) * 16) % 32 < 1
                    value = (100 if seam else 155) + noise
                    color = (value, value, value, 255)
                elif kind == 'siding':
                    value = (172 if y % 16 < 2 else 238) + noise
                    color = (value, value, value - 4, 255)
                else:
                    seam = y % 16 < 2 or (x + (y // 16 % 2) * 16) % 32 < 2
                    color = (171 + noise, 159 + noise, 145 + noise, 255) if seam else (209 + noise, 181 + noise, 158 + noise, 255)
                pixels[x, y] = tuple(max(0, min(255, n)) for n in color)
    buffer = io.BytesIO()
    image.save(buffer, format='PNG', optimize=True)
    return buffer.getvalue()


def subtract(a, b):
    return tuple(x - y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])


def unit(v):
    length = math.sqrt(sum(x*x for x in v))
    return tuple(x / max(length, 1e-9) for x in v)


class Model:
    def __init__(self, name):
        self.name = name
        self.doc = {'asset': {'version': '2.0', 'generator': 'Last Decision original street assets v1'},
                    'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': name, 'mesh': 0}],
                    'meshes': [], 'materials': [], 'accessors': [], 'bufferViews': [],
                    'buffers': [], 'images': [], 'textures': [],
                    'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]}
        self.binary = bytearray()
        self.parts = {}

    def blob(self, data, target=None):
        while len(self.binary) % 4:
            self.binary.append(0)
        index = len(self.doc['bufferViews'])
        view = {'buffer': 0, 'byteOffset': len(self.binary), 'byteLength': len(data)}
        if target:
            view['target'] = target
        self.doc['bufferViews'].append(view)
        self.binary.extend(data)
        return index

    def material(self, name, color, roughness=.85, pattern=None, alpha=False, metallic=0, emission=None):
        index = len(self.doc['materials'])
        pbr = {'baseColorFactor': [*color, 1], 'roughnessFactor': roughness, 'metallicFactor': metallic}
        material = {'name': name, 'pbrMetallicRoughness': pbr}
        if pattern:
            image_index = len(self.doc['images'])
            self.doc['images'].append({'bufferView': self.blob(texture(pattern)), 'mimeType': 'image/png'})
            self.doc['textures'].append({'sampler': 0, 'source': image_index})
            pbr['baseColorTexture'] = {'index': len(self.doc['textures']) - 1}
        if alpha:
            material.update(alphaMode='MASK', alphaCutoff=.45, doubleSided=True)
        if emission:
            material['emissiveFactor'] = emission
        self.doc['materials'].append(material)
        self.parts[index] = {'positions': [], 'normals': [], 'uvs': [], 'indices': []}
        return index

    def face(self, corners, material, uv=None):
        part = self.parts[material]
        start = len(part['positions']) // 3
        normal = unit(cross(subtract(corners[1], corners[0]), subtract(corners[2], corners[0])))
        for i, point in enumerate(corners):
            part['positions'].extend(point)
            part['normals'].extend(normal)
            part['uvs'].extend((uv or [(0, 0), (1, 0), (1, 1), (0, 1)])[i])
        for i in range(1, len(corners) - 1):
            part['indices'].extend([start, start + i, start + i + 1])

    def box(self, center, size, material, repeat=(1, 1)):
        x, y, z = center
        w, h, d = (s / 2 for s in size)
        points = [(x-w,y-h,z-d), (x+w,y-h,z-d), (x+w,y+h,z-d), (x-w,y+h,z-d),
                  (x-w,y-h,z+d), (x+w,y-h,z+d), (x+w,y+h,z+d), (x-w,y+h,z+d)]
        uv = [(0,0), (repeat[0],0), (repeat[0],repeat[1]), (0,repeat[1])]
        for face_index, indices in enumerate([(0,3,2,1), (4,5,6,7), (0,4,7,3), (1,2,6,5), (3,7,6,2), (0,1,5,4)]):
            # Keep horizontal siding horizontal on the side/back walls as well.
            face_uv = [(0,0),(0,repeat[1]),repeat,(repeat[0],0)] if face_index in (0,3) else uv
            self.face([points[i] for i in indices], material, face_uv)

    def cylinder(self, a, b, radius_a, radius_b, material, segments=10):
        axis = unit(subtract(b, a))
        u = unit(cross(axis, (1,0,0) if abs(axis[0]) < .8 else (0,1,0)))
        v = cross(axis, u)
        rings = []
        for center, radius in [(a, radius_a), (b, radius_b)]:
            rings.append([tuple(center[k] + radius * (u[k]*math.cos(i*math.tau/segments) +
                          v[k]*math.sin(i*math.tau/segments)) for k in range(3)) for i in range(segments)])
        for i in range(segments):
            j = (i + 1) % segments
            self.face([rings[0][i], rings[0][j], rings[1][j], rings[1][i]], material,
                      [(i/segments*3,0), (j/segments*3,0), (j/segments*3,2), (i/segments*3,2)])
        self.face(list(reversed(rings[0])), material, [(0,0)]*segments)
        self.face(rings[1], material, [(0,0)]*segments)

    def save(self, path):
        # A tilted trunk's bottom ring may extend a few millimetres below its
        # nominal origin. Ground the complete exported mesh, not just its axis.
        bottom = min(min(p['positions'][1::3]) for p in self.parts.values() if p['positions'])
        for part in self.parts.values():
            for index in range(1, len(part['positions']), 3):
                part['positions'][index] -= bottom
        primitives = []
        for material, part in self.parts.items():
            if not part['indices']:
                continue
            attributes = {}
            for name, field, kind, width in [('POSITION','positions','VEC3',3), ('NORMAL','normals','VEC3',3),
                                              ('TEXCOORD_0','uvs','VEC2',2)]:
                values = part[field]
                accessor = {'bufferView': self.blob(struct.pack('<%sf' % len(values), *values), 34962),
                            'componentType': 5126, 'count': len(values)//width, 'type': kind}
                if name == 'POSITION':
                    accessor['min'] = [min(values[k::3]) for k in range(3)]
                    accessor['max'] = [max(values[k::3]) for k in range(3)]
                attributes[name] = len(self.doc['accessors'])
                self.doc['accessors'].append(accessor)
            indices = part['indices']
            component, fmt = (5123, 'H') if max(indices) < 65536 else (5125, 'I')
            index = len(self.doc['accessors'])
            self.doc['accessors'].append({'bufferView': self.blob(struct.pack('<%s%s' % (len(indices), fmt), *indices), 34963),
                                         'componentType': component, 'count': len(indices), 'type': 'SCALAR'})
            primitives.append({'attributes': attributes, 'indices': index, 'material': material})
        self.doc['meshes'] = [{'name': self.name, 'primitives': primitives}]
        self.doc['buffers'] = [{'byteLength': len(self.binary)}]
        js = json.dumps(self.doc, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        data = bytes(self.binary) + b'\0' * (-len(self.binary) % 4)
        glb = struct.pack('<III', 0x46546C67, 2, 12+8+len(js)+8+len(data))
        glb += struct.pack('<II', len(js), 0x4E4F534A) + js
        glb += struct.pack('<II', len(data), 0x004E4942) + data
        path.write_bytes(glb)
        triangles = sum(len(p['indices'])//3 for p in self.parts.values())
        print('%s: %s bytes, %s triangles, %s materials' % (path.name, len(glb), triangles, len(primitives)))


def oak():
    model = Model('Original textured oak')
    bark = model.material('Oak bark', (.62,.49,.37), pattern='bark')
    leaves = [model.material('Oak leaf '+str(i), color, pattern='leaf', alpha=True)
              for i, color in enumerate([(.45,.65,.33), (.62,.79,.43), (.37,.55,.28)])]
    model.cylinder((0,0,0), (.06,2.7,-.03), .23, .09, bark, 12)
    rng = random.Random(41)
    for index in range(11):
        angle = index*2.39996
        start = (.025, 1.25+index*.1, 0)
        end = (math.cos(angle)*(1.0+index%3*.16), 2.8+index%3*.28, math.sin(angle)*1.1)
        model.cylinder(start, end, .09-index*.004, .022, bark, 7)
        for _ in range(96):
            theta = rng.random()*math.tau
            elevation = rng.uniform(-1,1)
            radius = rng.random()**(1/3)
            ring = math.sqrt(1-elevation*elevation)*radius
            center = (end[0]+math.cos(theta)*ring*.87,
                      end[1]+elevation*radius*.65,
                      end[2]+math.sin(theta)*ring*.8)
            normal = unit((rng.uniform(-1,1), rng.uniform(-.7,1), rng.uniform(-1,1)))
            u = unit(cross(normal, (0,1,0) if abs(normal[1]) < .9 else (1,0,0)))
            v = cross(normal, u)
            size = rng.uniform(.07,.14)
            points = [tuple(center[k] + a*size*u[k] + b*size*1.35*v[k] for k in range(3))
                      for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]]
            model.face(points, leaves[index%3])
    return model


def house():
    model = Model('Original suburban house')
    siding = model.material('Ivory horizontal siding', (.83,.79,.69), pattern='siding')
    roof = model.material('Shingle roof', (.31,.35,.39), pattern='roof')
    trim = model.material('Painted white trim', (.91,.91,.86))
    glass = model.material('Blue window glass', (.17,.29,.36), .16, metallic=.15)
    door = model.material('Stained wood door', (.27,.16,.09), pattern='bark')
    brick = model.material('Brick foundation', (.85,.77,.68), pattern='brick')
    dark = model.material('Window shutters and metal', (.22,.27,.29))
    model.box((0,1.62,0), (4.2,2.98,4.9), siding, (3,2))
    model.box((0,.11,0), (4.26,.22,4.96), brick, (3,1))
    for z, order in [(2.45,1),(-2.45,-1)]:
        points = [(-2.1,3.11,z), (2.1,3.11,z), (0,4.13,z)]
        model.face(points if order == 1 else list(reversed(points)), siding)
    for side in [-1,1]:
        pts = [(0,4.18,-2.7), (side*2.45,3.0,-2.7), (side*2.45,3.0,2.7), (0,4.18,2.7)]
        model.face(pts if side == -1 else list(reversed(pts)), roof, [(0,0),(3,0),(3,5),(0,5)])
        model.box((side*2.43,2.98,0), (.1,.14,5.4), trim)
        model.box((side*2.08,1.55,2.5), (.09,3.05,.11), trim)
        model.cylinder((side*2.27,.12,2.35),(side*2.27,2.96,2.35), .035,.035,dark,6)
    # Garage, panel seams and front entrance face the same +Z direction as the fallback.
    model.box((-1.08,1.04,2.48), (1.65,1.94,.08), trim)
    for y in [.4,.8,1.2,1.6]:
        model.box((-1.08,y,2.532),(1.6,.025,.015),dark)
    model.box((.76,1.11,2.5),(.84,2.12,.1),door)
    model.box((1.04,1.1,2.58),(.04,.04,.06),dark)
    for x in [.29,1.23]:
        model.box((x,1.1,2.56),(.09,2.2,.12),trim)
    model.box((.76,2.22,2.56),(1.03,.1,.12),trim)
    model.box((.76,.08,2.86),(1.62,.16,.82),brick)
    model.box((.76,2.53,2.88),(1.76,.12,.92),roof)
    for x in [.02,1.5]:
        model.box((x,1.34,3.22),(.1,2.36,.1),trim)
    def window(x,y,z,w=.7,h=1.0,side=False):
        if side:
            model.box((x,y,z),(.07,h,w),glass)
            for dz in [-w/2-.04,w/2+.04]:
                model.box((x,y,z+dz),(.1,h+.17,.07),trim)
            model.box((x,y-h/2-.04,z),(.14,.08,w+.17),trim)
            model.box((x,y+h/2+.04,z),(.1,.08,w+.17),trim)
            model.box((x,y,z),(.1,.04,w),trim)
        else:
            model.box((x,y,z),(w,h,.07),glass)
            for dx in [-w/2-.04,w/2+.04]:
                model.box((x+dx,y,z+.025),(.07,h+.17,.1),trim)
            model.box((x,y-h/2-.04,z+.04),(w+.18,.08,.14),trim)
            model.box((x,y+h/2+.04,z+.025),(w+.17,.08,.1),trim)
            model.box((x,y,z+.05),(.04,h,.08),trim)
            model.box((x,y,z+.05),(w,.04,.08),trim)
    window(1.65,1.97,2.52,.56,.87)
    window(0,3.48,2.48,.55,.5)
    for x in [-2.13,2.13]:
        for z in [-1.4,.5]:
            window(x,1.83,z,1.0,1.2,True)
    model.box((-1.25,3.7,-.95),(.46,1.05,.6),brick)
    model.box((-1.25,4.27,-.95),(.58,.1,.72),dark)
    return model


def sedan():
    model = Model('Original parked sedan')
    paint = model.material('Deep blue car paint', (.12,.27,.4), .28, metallic=.35)
    glass = model.material('Automotive dark glass', (.1,.17,.21), .12, metallic=.35)
    rubber = model.material('Tire rubber', (.035,.038,.042), .94)
    metal = model.material('Alloy wheels and trim', (.54,.58,.6), .3, metallic=.8)
    light = model.material('Headlight lens', (.91,.91,.79), .2, emission=[.25,.24,.18])
    tail = model.material('Red tail light', (.65,.035,.025), .3, emission=[.16,.01,0])
    model.box((0,.55,0),(1.42,.42,3.55),paint)
    model.box((0,.38,1.8),(1.38,.16,.1),metal)
    model.box((0,.38,-1.8),(1.38,.16,.1),metal)
    # Sloping hood, windshield, rear window and side glazing give the car a silhouette.
    model.face(list(reversed([(-.7,.76,.6),(.7,.76,.6),(.67,.69,1.78),(-.67,.69,1.78)])),paint)
    model.face(list(reversed([(-.68,.77,.62),(-.55,1.28,.08),(.55,1.28,.08),(.68,.77,.62)])),glass)
    model.face(list(reversed([(-.55,1.28,.08),(-.55,1.28,-.75),(.55,1.28,-.75),(.55,1.28,.08)])),paint)
    model.face(list(reversed([(-.55,1.28,-.75),(-.67,.77,-1.25),(.67,.77,-1.25),(.55,1.28,-.75)])),glass)
    model.face(list(reversed([(-.67,.77,-1.25),(-.67,.7,-1.78),(.67,.7,-1.78),(.67,.77,-1.25)])),paint)
    for side in [-1,1]:
        pts = [(side*.68,.78,.57),(side*.55,1.25,.04),(side*.55,1.25,-.72),(side*.67,.78,-1.2)]
        model.face(pts if side == -1 else list(reversed(pts)),glass)
        model.box((side*.62,1.01,-.42),(.06,.48,.055),paint)
        model.box((side*.704,.79,-.3),(.04,.045,1.8),metal)
        model.box((side*.746,.89,.5),(.048,.12,.18),paint)
        for z in [-1.12,1.12]:
            model.cylinder((side*.6,.31,z),(side*.75,.31,z),.3,.3,rubber,18)
            model.cylinder((side*.75,.31,z),(side*.76,.31,z),.18,.18,metal,12)
        model.box((side*.48,.65,1.8),(.33,.14,.025),light)
        model.box((side*.5,.65,-1.8),(.3,.16,.025),tail)
        model.box((side*.72,.69,-.35),(.035,.035,.18),metal)
    model.box((0,.48,1.82),(.32,.1,.02),metal)
    return model


if __name__ == '__main__':
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for filename, build in [('oak.glb',oak), ('house.glb',house), ('sedan.glb',sedan)]:
        build().save(OUTPUT / filename)
