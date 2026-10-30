#!/usr/bin/env python3
"""Build a game city from real OpenStreetMap data.

    python tools/city/osm_city.py            # every city in tools/city/cities.json

Queries the Overpass API for buildings, streets and parks inside each city's
bounding box, projects them to metres around the box centre (x east, z north),
simplifies them for a browser game and writes apps/web/public/city/<id>.json.
Data © OpenStreetMap contributors, available under the ODbL.
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'tools/city/cities.json'
OUT = ROOT / 'apps/web/public/city'
USER_AGENT = 'TheLastDecisionDay-CityBuilder/1.0 (+https://github.com/Dav-lopez/The_Last_Decision_Day)'
ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
LEVEL_HEIGHT = 3.4
ROAD_WIDTHS = {
    'motorway': 14, 'trunk': 12, 'primary': 11, 'secondary': 10, 'tertiary': 9, 'unclassified': 7,
    'residential': 7, 'living_street': 6, 'service': 4.5, 'pedestrian': 6, 'footway': 2.5, 'path': 2,
    'cycleway': 2.5, 'steps': 2,
}
EARTH = 6_371_000.0


def overpass(query: str) -> dict:
    data = urllib.parse.urlencode({'data': query}).encode()
    last = None
    for endpoint in ENDPOINTS:
        for attempt in range(3):
            try:
                request = urllib.request.Request(endpoint, data=data, headers={'User-Agent': USER_AGENT})
                with urllib.request.urlopen(request, timeout=180) as response:
                    return json.loads(response.read())
            except Exception as error:  # noqa: BLE001 - retry any transport error
                last = error
                time.sleep(5 * (attempt + 1))
    raise SystemExit(f'Overpass failed: {last}')


def parse_height(tags: dict) -> float:
    height = tags.get('height') or tags.get('building:height')
    if height:
        match = re.match(r'\s*([\d.]+)', str(height))
        if match:
            return max(3.0, min(120.0, float(match.group(1))))
    levels = tags.get('building:levels')
    if levels:
        match = re.match(r'\s*([\d.]+)', str(levels))
        if match:
            return max(3.0, min(120.0, float(match.group(1)) * LEVEL_HEIGHT + 1.0))
    kind = tags.get('building', 'yes')
    return {'house': 6.5, 'garage': 3.2, 'shed': 3.0, 'church': 14.0, 'apartments': 12.0, 'commercial': 8.0,
            'retail': 6.5, 'office': 13.0, 'hotel': 16.0, 'parking': 9.0}.get(kind, 7.5)


def simplify(points: list[list[float]], tolerance: float) -> list[list[float]]:
    """Ramer–Douglas–Peucker on an open polyline."""
    if len(points) < 3:
        return points
    ax, az = points[0]
    bx, bz = points[-1]
    dx, dz = bx - ax, bz - az
    length = math.hypot(dx, dz) or 1e-9
    worst, index = -1.0, 0
    for i in range(1, len(points) - 1):
        px, pz = points[i]
        distance = abs(dz * px - dx * pz + bx * az - bz * ax) / length
        if distance > worst:
            worst, index = distance, i
    if worst <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def area(ring: list[list[float]]) -> float:
    return sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring))) / 2


def build(city: dict) -> dict:
    south, west, north, east = city['bbox']
    lat0, lon0 = (south + north) / 2, (west + east) / 2
    scale_x = math.cos(math.radians(lat0)) * math.pi / 180 * EARTH
    scale_z = math.pi / 180 * EARTH

    def project(node: dict) -> list[float]:
        return [round((node['lon'] - lon0) * scale_x, 2), round((node['lat'] - lat0) * scale_z, 2)]

    box = f'{south},{west},{north},{east}'
    query = f"""[out:json][timeout:120];
(
  way["building"]({box});
  way["highway"]({box});
  way["leisure"="park"]({box});
  way["landuse"="grass"]({box});
);
out geom tags;"""
    elements = overpass(query)['elements']
    buildings, roads, parks = [], [], []
    for element in elements:
        geometry = element.get('geometry') or []
        tags = element.get('tags', {})
        if len(geometry) < 2:
            continue
        points = [project(node) for node in geometry]
        if 'building' in tags:
            if points[0] == points[-1]:
                points = points[:-1]
            ring = simplify(points + [points[0]], 0.35)[:-1]
            if len(ring) < 3 or abs(area(ring)) < 12:
                continue
            if area(ring) < 0:
                ring.reverse()  # counter-clockwise when viewed from above (x east, z north)
            buildings.append({
                'id': element['id'], 'ring': ring, 'height': round(parse_height(tags), 1),
                'kind': tags.get('building', 'yes'), 'name': tags.get('name', ''),
                'shop': bool(tags.get('shop') or tags.get('amenity')),
            })
        elif 'highway' in tags and tags['highway'] in ROAD_WIDTHS:
            line = simplify(points, 0.5)
            roads.append({'id': element['id'], 'points': line, 'kind': tags['highway'], 'width': ROAD_WIDTHS[tags['highway']],
                          'name': tags.get('name', '')})
        elif tags.get('leisure') == 'park' or tags.get('landuse') == 'grass':
            if points[0] == points[-1]:
                points = points[:-1]
            ring = simplify(points + [points[0]], 0.8)[:-1]
            if len(ring) >= 3 and abs(area(ring)) > 30:
                if area(ring) < 0:
                    ring.reverse()
                parks.append({'id': element['id'], 'ring': ring, 'name': tags.get('name', '')})
    half_x = (east - west) / 2 * scale_x
    half_z = (north - south) / 2 * scale_z
    buildings.sort(key=lambda item: item['id'])
    roads.sort(key=lambda item: item['id'])
    parks.sort(key=lambda item: item['id'])
    return {
        'id': city['id'], 'name': city['name'], 'license': 'ODbL-1.0',
        'attribution': '© OpenStreetMap contributors', 'source': 'https://www.openstreetmap.org/copyright',
        'bbox': city['bbox'], 'centre': [lat0, lon0], 'halfSize': [round(half_x, 1), round(half_z, 1)],
        'buildings': buildings, 'roads': roads, 'parks': parks,
    }


def main() -> int:
    config = json.loads(CONFIG.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for city in config['cities']:
        data = build(city)
        target = OUT / f"{city['id']}.json"
        target.write_text(json.dumps(data, separators=(',', ':')))
        heights = sorted(item['height'] for item in data['buildings']) or [0]
        print(f"{city['name']}: {len(data['buildings'])} buildings (median {heights[len(heights) // 2]} m, max {heights[-1]} m), "
              f"{len(data['roads'])} roads, {len(data['parks'])} parks, {target.stat().st_size} bytes")
        index.append({'id': city['id'], 'name': city['name'], 'file': target.name})
    (OUT / 'index.json').write_text(json.dumps({'cities': index}, indent=2) + '\n')
    (OUT / 'ATTRIBUTION.md').write_text(
        '# City data\n\nStreets, buildings and parks in this folder are derived from OpenStreetMap.\n\n'
        '© OpenStreetMap contributors. The data is available under the Open Database License (ODbL 1.0):\n'
        'https://www.openstreetmap.org/copyright — these derived files are likewise available under the ODbL.\n'
        'Regenerate with `python tools/city/osm_city.py`.\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
