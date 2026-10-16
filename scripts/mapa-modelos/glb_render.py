"""Renderiza um GLB (malha única) em 3 vistas ortográficas, cada parte conectada numa cor.
uso: glb_render.py arquivo.glb saida.ppm"""
import json, struct, sys
from collections import defaultdict

exec(open(__file__.replace("glb_render.py", "glb_partes_lib.py")).read())

js, binc = ler(sys.argv[1])
pr = js["meshes"][0]["primitives"][0]
pos = acessor(js, binc, pr["attributes"]["POSITION"])
idx = acessor(js, binc, pr["indices"])
comp = componentes(pos, idx)
ordem = sorted(set(comp.values()), key=lambda g: -sum(1 for v in comp.values() if v == g))
CORES = [(200, 200, 200), (230, 60, 60), (60, 120, 230), (60, 190, 90), (230, 180, 40),
         (170, 80, 200), (40, 200, 200), (240, 120, 30), (120, 120, 120)]
cor_de = {g: CORES[i % len(CORES)] for i, g in enumerate(ordem)}

W = H = 360
vistas = [("cima (x,y)", 0, 1, 2), ("lado (y,z)", 1, 2, 0), ("frente (x,z)", 0, 2, 1)]
xs = [p[0] for p in pos]; ys = [p[1] for p in pos]; zs = [p[2] for p in pos]
lim = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)) * 1.1
centro = [(max(c) + min(c)) / 2 for c in (xs, ys, zs)]
img = [[(255, 255, 255)] * (W * 3) for _ in range(H)]
for vi, (nome, a, b, prof) in enumerate(vistas):
    zbuf = [[-1e9] * W for _ in range(H)]
    def proj(p):
        u = (p[a] - centro[a]) / lim * W + W / 2
        v = H / 2 - (p[b] - centro[b]) / lim * H
        return u, v, p[prof]
    for t in range(0, len(idx), 3):
        i0, i1, i2 = idx[t], idx[t + 1], idx[t + 2]
        p0, p1, p2 = proj(pos[i0]), proj(pos[i1]), proj(pos[i2])
        cor = cor_de[comp[i0]]
        # sombreamento simples pela normal na direção da vista
        ax, ay, az = [pos[i1][k] - pos[i0][k] for k in range(3)]
        bx, by, bz = [pos[i2][k] - pos[i0][k] for k in range(3)]
        n = (ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx)
        nn = (n[0] ** 2 + n[1] ** 2 + n[2] ** 2) ** 0.5 or 1
        luz = 0.45 + 0.55 * abs(n[prof]) / nn
        c = tuple(int(x * luz) for x in cor)
        minx = max(int(min(p0[0], p1[0], p2[0])), 0); maxx = min(int(max(p0[0], p1[0], p2[0])) + 1, W - 1)
        miny = max(int(min(p0[1], p1[1], p2[1])), 0); maxy = min(int(max(p0[1], p1[1], p2[1])) + 1, H - 1)
        den = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1])
        if abs(den) < 1e-9: continue
        for y in range(miny, maxy + 1):
            for x in range(minx, maxx + 1):
                w0 = ((p1[1] - p2[1]) * (x - p2[0]) + (p2[0] - p1[0]) * (y - p2[1])) / den
                w1 = ((p2[1] - p0[1]) * (x - p2[0]) + (p0[0] - p2[0]) * (y - p2[1])) / den
                w2 = 1 - w0 - w1
                if w0 < 0 or w1 < 0 or w2 < 0: continue
                z = w0 * p0[2] + w1 * p1[2] + w2 * p2[2]
                if z > zbuf[y][x]:
                    zbuf[y][x] = z
                    img[y][vi * W + x] = c
with open(sys.argv[2], "wb") as f:
    f.write(b"P6 %d %d 255\n" % (W * 3, H))
    for linha in img:
        f.write(bytes(v for px in linha for v in px))
print("ok", [n for n, *_ in vistas])
