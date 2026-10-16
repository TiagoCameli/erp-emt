"""Endireita o trator de esteira: gira o modelo para o corpo ficar no eixo Y (frente = +y, como os
outros modelos), alinha a lâmina e o escarificador e encosta os dois no corpo.
uso: glb_conserta_esteira.py entrada.glb saida.glb"""
import json, struct, sys, math
from collections import defaultdict

exec(open(__file__.replace("glb_conserta_esteira.py", "glb_partes_lib.py")).read())

entrada, saida = sys.argv[1], sys.argv[2]
js, binc = ler(entrada)
pr = js["meshes"][0]["primitives"][0]
ia = pr["attributes"]["POSITION"]
pos = [list(p) for p in acessor(js, binc, ia)]
idx = acessor(js, binc, pr["indices"])
comp = componentes(pos, idx)
grupos = defaultdict(list)
for i, g in comp.items(): grupos[g].append(i)
ordem = sorted(grupos.values(), key=len, reverse=True)
corpo = ordem[0]
# as duas chapas de 363 vértices: a da frente (+y) é a lâmina, a de trás o escarificador
chapas = [g for g in ordem[1:3]]
lamina = max(chapas, key=lambda vs: sum(pos[v][1] for v in vs) / len(vs))
escarificador = min(chapas, key=lambda vs: sum(pos[v][1] for v in vs) / len(vs))
# O resto (corpo e as peças pequenas da cabine: faróis, retrovisores) anda junto com o corpo.
_chapas = set(lamina) | set(escarificador)
corpo_e_pecas = [v for v in range(len(pos)) if v not in _chapas]


def girar(vs, graus, cx, cy):
    r = math.radians(graus); c, s = math.cos(r), math.sin(r)
    for v in vs:
        x, y = pos[v][0] - cx, pos[v][1] - cy
        pos[v][0] = cx + x * c - y * s
        pos[v][1] = cy + x * s + y * c


def area_min(vs):
    """Ângulo (−45..45) que deixa a caixa envolvente XY com a menor área."""
    melhor = None
    for k in range(-180, 181):
        a = k / 4
        r = math.radians(a); c, s = math.cos(r), math.sin(r)
        xs = [pos[v][0] * c - pos[v][1] * s for v in vs]
        ys = [pos[v][0] * s + pos[v][1] * c for v in vs]
        area = (max(xs) - min(xs)) * (max(ys) - min(ys))
        if melhor is None or area < melhor[0]: melhor = (area, a)
    return melhor[1]


def centro(vs):
    return (sum(pos[v][0] for v in vs) / len(vs), sum(pos[v][1] for v in vs) / len(vs))


def caixa(vs):
    xs = [pos[v][0] for v in vs]; ys = [pos[v][1] for v in vs]; zs = [pos[v][2] for v in vs]
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)


todos = list(range(len(pos)))
a_corpo = area_min(corpo)
girar(todos, a_corpo, 0, 0)
# A malha da IA tem o corpo andando no eixo X (esteiras em X; motor em -x, cabine em +x) e a
# lâmina na lateral: gira só o corpo -90° para a frente (-x, o motor) virar +y, onde a lâmina está.
girar(corpo_e_pecas, -90, *centro(corpo))
# resto do ângulo das chapas, cada uma no próprio centro
for parte in (lamina, escarificador):
    cx, cy = centro(parte)
    girar(parte, area_min(parte), cx, cy)
c = caixa(corpo)
cx_corpo = (c[0] + c[1]) / 2
# lâmina: centrada no corpo, encostada na frente (5 cm de sobreposição)
l = caixa(lamina)
dx = cx_corpo - (l[0] + l[1]) / 2
dy = (c[3] - 0.05) - l[2]
for v in lamina: pos[v][0] += dx; pos[v][1] += dy
# escarificador: centrado, encostado atrás
e = caixa(escarificador)
dx = cx_corpo - (e[0] + e[1]) / 2
dy = (c[2] + 0.05) - e[3]
for v in escarificador: pos[v][0] += dx; pos[v][1] += dy
# recentraliza: caixa total centrada em x/y, chão em z = 0
t = caixa(todos)
ox, oy, oz = (t[0] + t[1]) / 2, (t[2] + t[3]) / 2, t[4]
for p in pos: p[0] -= ox; p[1] -= oy; p[2] -= oz

# grava no mesmo buffer (POSITION é VEC3 float sem stride)
a = js["accessors"][ia]
bv = js["bufferViews"][a["bufferView"]]
base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
binc = bytearray(binc)
for k, p in enumerate(pos):
    struct.pack_into("<fff", binc, base + 12 * k, *p)
a["min"] = [min(p[i] for p in pos) for i in range(3)]
a["max"] = [max(p[i] for p in pos) for i in range(3)]
jb = json.dumps(js, separators=(",", ":")).encode()
jb += b" " * ((4 - len(jb) % 4) % 4)
bb = bytes(binc) + b"\0" * ((4 - len(binc) % 4) % 4)
total = 12 + 8 + len(jb) + 8 + len(bb)
with open(saida, "wb") as f:
    f.write(struct.pack("<III", 0x46546C67, 2, total))
    f.write(struct.pack("<II", len(jb), 0x4E4F534A)); f.write(jb)
    f.write(struct.pack("<II", len(bb), 0x004E4942)); f.write(bb)
print("corpo girado", a_corpo, "graus; caixa final", [round(x, 2) for x in a["min"]], [round(x, 2) for x in a["max"]])
