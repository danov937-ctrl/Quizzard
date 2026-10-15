"""Builds data/map.json (SVG paths, centroids, adjacency) from tools/provinces.geojson.
Source: github.com/yurukov/Bulgaria-geocoding (provinces.geojson)."""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
src = json.load(open(os.path.join(HERE, 'provinces.geojson')))

NAMES = {
 'BLG':'Благоевград','BGS':'Бургас','VAR':'Варна','VTR':'Велико Търново','VID':'Видин',
 'VRC':'Враца','GAB':'Габрово','DOB':'Добрич','KRZ':'Кърджали','KNL':'Кюстендил',
 'LOV':'Ловеч','MON':'Монтана','PAZ':'Пазарджик','PER':'Перник','PVN':'Плевен',
 'PDV':'Пловдив','RAZ':'Разград','RSE':'Русе','SLS':'Силистра','SLV':'Сливен',
 'SML':'Смолян','SFO':'София област','SOF':'София','SZR':'Стара Загора','TGV':'Търговище',
 'HKV':'Хасково','SHU':'Шумен','JAM':'Ямбол'}

W = 1000
def polys(g):
    return [g['coordinates']] if g['type']=='Polygon' else g['coordinates']

allpts = [p for f in src['features'] for poly in polys(f['geometry']) for ring in poly for p in ring]
lat0 = sum(p[1] for p in allpts)/len(allpts)
k = math.cos(math.radians(lat0))
xs = [p[0]*k for p in allpts]; ys = [p[1] for p in allpts]
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
s = (W-20)/(maxx-minx)
H = round((maxy-miny)*s+20)
def proj(p): return (round((p[0]*k-minx)*s+10,1), round((maxy-p[1])*s+10,1))

def area_centroid(ring):
    a=cx=cy=0
    for i in range(len(ring)-1):
        x0,y0=ring[i]; x1,y1=ring[i+1]; c=x0*y1-x1*y0
        a+=c; cx+=(x0+x1)*c; cy+=(y0+y1)*c
    a/=2
    return (abs(a), cx/(6*a), cy/(6*a)) if a else (0,ring[0][0],ring[0][1])

regions = {}
for f in src['features']:
    code = f['properties']['nuts3']
    d=[]; best=(0,0,0); pts=set()
    for poly in polys(f['geometry']):
        for ri,ring in enumerate(poly):
            pr=[proj(p) for p in ring]
            d.append('M'+'L'.join(f'{x},{y}' for x,y in pr)+'Z')
            for p in ring: pts.add((round(p[0],3),round(p[1],3)))
            if ri==0:
                c=area_centroid(pr)
                if c[0]>best[0]: best=c
    regions[code]={'id':code,'name':NAMES[code],'path':''.join(d),'cx':round(best[1],1),'cy':round(best[2],1),'_pts':pts}

# adjacency: share at least 2 (approximately equal) boundary points
codes=sorted(regions)
adj={c:set() for c in codes}
for i,a in enumerate(codes):
    for b in codes[i+1:]:
        if len(regions[a]['_pts'] & regions[b]['_pts'])>=2:
            adj[a].add(b); adj[b].add(a)
# Sofia city sits inside Sofia province; label tweak so it is clickable
out={'width':W,'height':H,'regions':[]}
for c in codes:
    r=regions[c]; del r['_pts']; r['neighbors']=sorted(adj[c]); out['regions'].append(r)
json.dump(out, open(os.path.join(HERE,'..','data','map.json'),'w'), ensure_ascii=False)
for c in codes: print(c, NAMES[c], [NAMES[n] for n in sorted(adj[c])])
