"""Builds data/neighbors.json: neighbouring countries, Bulgaria's national border and the coast,
all in the same projection as data/map.json (see tools/build_map.py).

Source of the neighbours: Natural Earth 10m admin-0 countries (public domain), as GeoJSON from
github.com/datasets/geo-countries (data/countries.geojson, ~15 MB, not stored in this repo).
The national border and the coast are taken from the provinces themselves (edges that belong to
only one province), so they line up exactly with the playable map.

Usage:  python3 tools/build_neighbors.py path/to/countries.geojson
"""
import json, math, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'countries.geojson')

# ---------- the same projection as build_map.py ----------
prov = json.load(open(os.path.join(HERE, 'provinces.geojson')))
mp = json.load(open(os.path.join(HERE, '..', 'data', 'map.json')))
W, H = mp['width'], mp['height']

def polys(g):
    return [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']

allpts = [p for f in prov['features'] for poly in polys(f['geometry']) for ring in poly for p in ring]
lat0 = sum(p[1] for p in allpts) / len(allpts)
k = math.cos(math.radians(lat0))
xs = [p[0] * k for p in allpts]; ys = [p[1] for p in allpts]
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
s = (W - 20) / (maxx - minx)
assert round((maxy - miny) * s + 20) == H, 'projection differs from data/map.json'
def proj(p): return (round((p[0] * k - minx) * s + 10, 1), round((maxy - p[1]) * s + 10, 1))
def unproj(x, y): return (((x - 10) / s + minx) / k, maxy - (y - 10) / s)

# ---------- the part of the world that is drawn around Bulgaria ----------
VIEW = {'x': -130, 'y': -85, 'w': W + 260, 'h': H + 130}
PAD = 280  # land goes well beyond the picture, so a frame of another shape never shows an edge
CLIP = (VIEW['x'] - PAD, VIEW['y'] - PAD, VIEW['x'] + VIEW['w'] + PAD, VIEW['y'] + VIEW['h'] + PAD)

# ISO code (or name, where Natural Earth has none) -> label in Bulgarian and the place of the label
COUNTRIES = {
    'ROU': ('Румъния', 26.3, 44.45), 'SRB': ('Сърбия', 21.95, 43.45),
    'MKD': ('С. Македония', 22.15, 41.75), 'GRC': ('Гърция', 24.0, 41.15),
    'TUR': ('Турция', 27.3, 41.45), 'Kosovo': ('Косово', None, None), 'BGR': ('България', None, None),
}
SEA = ('Черно море', 28.75, 42.75)

# ---------- helpers ----------
def clip_ring(ring, box):
    x0, y0, x1, y1 = box
    def clip(pts, inside, cross):
        out = []
        for i, cur in enumerate(pts):
            prev = pts[i - 1]
            if inside(cur):
                if not inside(prev): out.append(cross(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur))
        return out
    def at_x(x):
        return lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))
    def at_y(y):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)
    pts = ring
    for inside, cross in ((lambda p: p[0] >= x0, at_x(x0)), (lambda p: p[0] <= x1, at_x(x1)),
                          (lambda p: p[1] >= y0, at_y(y0)), (lambda p: p[1] <= y1, at_y(y1))):
        if not pts: return []
        pts = clip(pts, inside, cross)
    return pts

def rdp(pts, eps):
    """Douglas-Peucker for an open polyline, without recursion."""
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay; n = math.hypot(dx, dy)
        best, bi = -1, a
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / n if n else math.hypot(px - ax, py - ay)
            if d > best: best, bi = d, i
        if best > eps:
            keep[bi] = True; stack += [(a, bi), (bi, b)]
    return [p for p, kp in zip(pts, keep) if kp]

def simplify_ring(ring, eps):
    ring = ring[:-1] if ring[0] == ring[-1] else ring
    if len(ring) < 4: return ring
    far = max(range(len(ring)), key=lambda i: math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]))
    a = rdp(ring[:far + 1], eps); b = rdp(ring[far:] + [ring[0]], eps)
    return a[:-1] + b[:-1]

def ring_path(ring):
    return 'M' + 'L'.join(f'{round(x, 1)},{round(y, 1)}' for x, y in ring) + 'Z'

def area(ring):
    return abs(sum(ring[i][0] * ring[i - 1][1] - ring[i - 1][0] * ring[i][1] for i in range(len(ring)))) / 2

def country_paths(geom):
    d = []
    for poly in polys(geom):
        for ring in poly:
            pr = clip_ring([proj(p) for p in ring], CLIP)
            if len(pr) < 3: continue
            pr = simplify_ring(pr, 0.35)
            if len(pr) < 3 or area(pr) < 6: continue  # specks that are too small to see
            d.append(ring_path(pr))
    return ''.join(d)

# ---------- neighbours ----------
world = json.load(open(SRC))
found = {}
for f in world['features']:
    pr_ = f['properties']
    key = pr_.get('ISO3166-1-Alpha-3')
    if key == '-99': key = pr_.get('name')
    if key in COUNTRIES: found[key] = f
missing = set(COUNTRIES) - set(found)
assert not missing, f'not found in {SRC}: {missing}'

countries = []
for key, (name, lon, lat) in COUNTRIES.items():
    path = country_paths(found[key]['geometry'])
    if not path: continue
    item = {'id': 'KOS' if key == 'Kosovo' else key, 'name': name, 'path': path}
    if key == 'BGR': item['base'] = True  # lies under the provinces, so no gap shows at the border
    if lon is not None:
        x, y = proj((lon, lat)); item['lx'], item['ly'] = x, y
    countries.append(item)

# ---------- national border and coast: the edges that belong to one province only ----------
rkey = lambda p: (round(p[0], 5), round(p[1], 5))
cnt = collections.Counter()
for f in prov['features']:
    for poly in polys(f['geometry']):
        for ring in poly:
            for a, b in zip(ring, ring[1:]):
                if rkey(a) != rkey(b): cnt[frozenset((rkey(a), rkey(b)))] += 1
outer = [tuple(e) for e, c in cnt.items() if c == 1]
nxt = collections.defaultdict(list)
for a, b in outer: nxt[a].append(b); nxt[b].append(a)
seen, loops = set(), []
for a, b in outer:
    if frozenset((a, b)) in seen: continue
    loop, cur, prev = [a], b, a
    seen.add(frozenset((a, b)))
    while cur != a:
        loop.append(cur)
        step = [n for n in nxt[cur] if n != prev] or [prev]
        prev, cur = cur, step[0]
        seen.add(frozenset((prev, cur)))
    loops.append(loop)
loops.sort(key=len, reverse=True)
print('outer loops:', [len(l) for l in loops])

# The outline is one closed loop. The coast is the arc between two fixed vertices: the end of the
# Romanian border at the Black Sea (Durankulak) and the mouth of the Rezovo river (Turkish border).
assert len(loops) == 1, 'the provinces must form one connected country'
L = loops[0]; n = len(L)
COAST_N, COAST_S = (28.559, 43.738), (28.035, 41.983)
near = lambda c: min(range(n), key=lambda i: math.hypot(L[i][0] - c[0], L[i][1] - c[1]))
iN, iS = near(COAST_N), near(COAST_S)
arc = lambda i, j: [L[(i + t) % n] for t in range((j - i) % n + 1)]
a1, a2 = arc(iN, iS), arc(iS, iN)
mean_lon = lambda a: sum(p[0] for p in a) / len(a)
coast, land = (a1, a2) if mean_lon(a1) > mean_lon(a2) else (a2, a1)
line = lambda ll: 'M' + 'L'.join(f'{x},{y}' for x, y in (proj(p) for p in ll))
print('coast edges', len(coast) - 1, 'land border edges', len(land) - 1)

# The Danube is the part of the northern land border between Vidin and Silistra
danube, run = [], []
for p in land:
    if 22.75 <= p[0] <= 27.3 and p[1] > 43.6: run.append(p)
    elif run: danube.append(run); run = []
if run: danube.append(run)
danube = [r for r in danube if len(r) > 5]

sx, sy = proj((SEA[1], SEA[2]))
out = {
    'view': VIEW,
    'countries': countries,
    'border': line(land),        # national border on land (towards neighbours)
    'coast': line(coast),        # Black Sea coast
    'danube': ''.join(line(r) for r in danube),
    'sea': {'name': SEA[0], 'x': sx, 'y': sy},
}
dst = os.path.join(HERE, '..', 'data', 'neighbors.json')
json.dump(out, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
print('written', os.path.relpath(dst), os.path.getsize(dst) // 1024, 'KB;', ', '.join(f"{c['id']}:{len(c['path']) // 1024}KB" for c in countries))
