"""Generate original game-ready glTF geometry with Blender (no paid APIs).

Usage: blender -b --python tools/assets/generate_environment.py -- --output apps/web/public/models/environment
"""
import argparse
import math
import os
import sys
import bpy

def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*color, 1)
    node.inputs["Roughness"].default_value = 0.88
    return mat

def cube(name, location, scale, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj

def export(name, folder):
    os.makedirs(folder, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(folder, name + ".glb"), export_format="GLB", use_selection=False)

def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

def tree(folder):
    clear()
    bark = material("bark", (.22,.13,.075))
    leaves = [material("foliage_%d" % i, c) for i,c in enumerate([(.12,.30,.10),(.18,.38,.12),(.22,.43,.14)])]
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=.18, depth=2.6, location=(0,1.3,0))
    bpy.context.object.name = "oak trunk"
    bpy.context.object.data.materials.append(bark)
    for i in range(13):
        theta = i * 2.3999632297
        radius = .3 + .58 * math.sqrt((i+1)/13)
        x, z = radius*math.cos(theta), radius*math.sin(theta)
        y = 2.4 + .55*math.sin(i*1.8)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=(x,y,z))
        obj = bpy.context.object
        obj.name = "leaf cluster %02d" % i
        obj.scale = (.65,.63,.62)
        obj.data.materials.append(leaves[i % len(leaves)])
    export("oak", folder)

def house(folder):
    clear()
    wall=material("warm siding",(.66,.63,.55))
    roof=material("charcoal roof",(.21,.23,.26))
    glass=material("window glass",(.12,.27,.34))
    trim=material("white trim",(.86,.84,.77))
    door=material("front door",(.30,.18,.12))
    cube("house walls",(0,1.65,0),(5.2,3.3,4.2),wall)
    cube("roof ridge",(0,3.8,0),(.15,.2,4.8),roof)
    for side in (-1,1):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(side*1.37,3.35,0))
        r=bpy.context.object
        r.name="roof slope"
        r.dimensions=(3.05,.18,4.8)
        r.rotation_euler[1]=side*math.radians(28)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        r.data.materials.append(roof)
    for x in (-1.55,1.55):
        cube("front window",(x,2.1,-2.12),(1.05,1.05,.06),glass)
        cube("window sill",(x,1.52,-2.17),(1.2,.12,.16),trim)
    cube("door",(0,.95,-2.14),(.88,1.9,.08),door)
    cube("front step",(0,.12,-2.65),(1.8,.24,.9),trim)
    export("house",folder)

if __name__=="__main__":
    args=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    p=argparse.ArgumentParser()
    p.add_argument("--output",default="apps/web/public/models/environment")
    out=p.parse_args(args).output
    tree(out)
    house(out)
    print("Generated original oak.glb and house.glb in",out)
