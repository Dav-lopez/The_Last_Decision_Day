#!/usr/bin/env python3
"""Fetch CC0 models from Poly Haven, convert them to web-ready GLBs and write a manifest.

Run from the repository root (needs network access and Node for gltf-transform):

    python tools/assets/polyhaven_fetch.py

Selection is deterministic: a pinned `prefer` id wins, otherwise the first
matching asset id (sorted) whose id/name tokens contain a slot keyword.
Every download is MD5-checked against Poly Haven's file listing. Output goes to
apps/web/public/models/polyhaven/ together with manifest.json and ATTRIBUTION.md.
Poly Haven assets are CC0; we still credit them in-game as their API requests.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'tools/assets/polyhaven.json'
OUT = ROOT / 'apps/web/public/models/polyhaven'
API = 'https://api.polyhaven.com'
USER_AGENT = 'TheLastDecisionDay-AssetPipeline/1.0 (+https://github.com/Dav-lopez/The_Last_Decision_Day)'
GLTF_TRANSFORM = ['npx', '--yes', '@gltf-transform/cli@4']


def get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def get_json(path: str):
    return json.loads(get(API + path))


def tokens(asset_id: str, info: dict) -> set[str]:
    text = f"{asset_id} {info.get('name', '')} {' '.join(info.get('tags', []))}".lower()
    return set(re.split(r'[^a-z0-9]+', text)) - {''}


def choose(slot: dict, assets: dict, taken: set[str]) -> str | None:
    preferred = slot.get('prefer')
    if preferred:
        if preferred not in assets:
            raise SystemExit(f"Pinned Poly Haven model '{preferred}' for slot {slot['slot']} does not exist")
        return preferred
    for asset_id in sorted(assets):
        if asset_id in taken:
            continue
        words = tokens(asset_id, assets[asset_id])
        if any(keyword in words for keyword in slot['keywords']) and not words & set(slot.get('exclude', [])):
            return asset_id
    return None


def download_checked(entry: dict, target: Path) -> None:
    data = get(entry['url'])
    expected = entry.get('md5')
    if expected and hashlib.md5(data).hexdigest() != expected:
        raise SystemExit(f"MD5 mismatch for {entry['url']}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def glb_summary(path: Path) -> dict:
    raw = path.read_bytes()
    assert raw[:4] == b'glTF', f'{path.name} is not a GLB'
    assert struct.unpack_from('<I', raw, 8)[0] == len(raw), f'{path.name} has a bad length header'
    length = struct.unpack_from('<I', raw, 12)[0]
    document = json.loads(raw[20:20 + length])
    assert document['asset']['version'] == '2.0'
    meshes = document.get('meshes', [])
    assert meshes, f'{path.name} contains no meshes'
    lows, highs = [float('inf')] * 3, [float('-inf')] * 3
    for mesh in meshes:
        for primitive in mesh['primitives']:
            accessor = document['accessors'][primitive['attributes']['POSITION']]
            for axis in range(3):
                lows[axis] = min(lows[axis], accessor['min'][axis])
                highs[axis] = max(highs[axis], accessor['max'][axis])
    # External URIs would break offline/self-hosted play; everything must be embedded.
    for image in document.get('images', []):
        assert 'uri' not in image, f'{path.name} references an external image'
    return {'meshes': len(meshes), 'sizeMeters': [round(h - l, 3) for l, h in zip(lows, highs)]}


def convert(source_gltf: Path, target: Path, texture_size: int) -> None:
    # Quantized geometry (KHR_mesh_quantization) and WebP textures load natively in
    # Babylon: no Draco/meshopt decoder fetched from a CDN at runtime.
    subprocess.run([*GLTF_TRANSFORM, 'optimize', str(source_gltf), str(target),
                    '--compress', 'quantize', '--texture-compress', 'webp',
                    '--texture-size', str(texture_size)], check=True)


def main() -> int:
    config = json.loads(CONFIG.read_text())
    assets = get_json('/assets?t=models')
    print(f'Poly Haven lists {len(assets)} models')
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    manifest = {'source': 'https://polyhaven.com', 'license': 'CC0-1.0', 'assets': []}
    taken: set[str] = set()
    for slot in config['slots']:
        asset_id = choose(slot, assets, taken)
        if not asset_id:
            if slot.get('required'):
                raise SystemExit(f"No Poly Haven model matches required slot {slot['slot']}")
            print(f"skip {slot['slot']}: no match")
            continue
        taken.add(asset_id)
        files = get_json(f'/files/{asset_id}')
        resolutions = files.get('gltf', {})
        resolution = config['resolution'] if config['resolution'] in resolutions else sorted(resolutions)[0]
        gltf = resolutions[resolution]['gltf']
        info = get_json(f'/info/{asset_id}')
        with tempfile.TemporaryDirectory() as work:
            source = Path(work) / Path(gltf['url']).name
            download_checked(gltf, source)
            for relative, entry in gltf.get('include', {}).items():
                download_checked(entry, Path(work) / relative)
            target = OUT / f"{slot['slot']}.glb"
            for size in (1024, 512):
                convert(source, target, size)
                if target.stat().st_size <= config['maxBytes']:
                    break
            if target.stat().st_size > config['maxBytes']:
                raise SystemExit(f'{asset_id} is still {target.stat().st_size} bytes after downscaling')
        summary = glb_summary(target)
        record = {
            'slot': slot['slot'], 'id': asset_id, 'name': info.get('name', asset_id),
            'authors': sorted(info.get('authors', {})), 'page': f'https://polyhaven.com/a/{asset_id}',
            'file': target.name, 'bytes': target.stat().st_size, 'placed': bool(slot.get('placed')),
            'rotation': float(slot.get('rotation', 0)), **summary,
        }
        manifest['assets'].append(record)
        print(f"{slot['slot']}: {asset_id} -> {target.name} ({record['bytes']} bytes, {summary['sizeMeters']} m)")
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    lines = ['# Poly Haven models', '',
             'These models come from [Poly Haven](https://polyhaven.com) and are released under',
             '[CC0](https://creativecommons.org/publicdomain/zero/1.0/): free for commercial use, no attribution',
             'required. We credit Poly Haven in-game anyway. Converted with gltf-transform (quantized',
             'geometry, WebP textures); regenerate with `python tools/assets/polyhaven_fetch.py`.', '',
             '| Slot | Model | Authors |', '|---|---|---|']
    lines += [f"| {a['slot']} | [{a['name']}]({a['page']}) | {', '.join(a['authors'])} |" for a in manifest['assets']]
    (OUT / 'ATTRIBUTION.md').write_text('\n'.join(lines) + '\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
