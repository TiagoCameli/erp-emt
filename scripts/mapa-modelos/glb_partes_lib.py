def ler(p):
    b = open(p, "rb").read()
    off = 12; js = None; binc = None
    while off < len(b):
        n, t = struct.unpack_from("<II", b, off); off += 8
        chunk = b[off:off+n]; off += n
        if t == 0x4E4F534A: js = json.loads(chunk)
        elif t == 0x004E4942: binc = chunk
    return js, binc

def acessor(js, binc, i):
    a = js["accessors"][i]
    bv = js["bufferViews"][a["bufferView"]]
    base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    fmt = {5126: "f", 5125: "I", 5123: "H", 5121: "B"}[a["componentType"]]
    tam = struct.calcsize(fmt)
    passo = bv.get("byteStride", tam * comps)
    out = []
    for k in range(a["count"]):
        o = base + k * passo
        v = struct.unpack_from("<" + fmt * comps, binc, o)
        out.append(v if comps > 1 else v[0])
    return out

def componentes(pos, idx):
    pai = list(range(len(pos)))
    def ach(x):
        while pai[x] != x:
            pai[x] = pai[pai[x]]; x = pai[x]
        return x
    def un(a, b):
        a, b = ach(a), ach(b)
        if a != b: pai[a] = b
    chave = {}
    for i, p in enumerate(pos):
        k = (round(p[0], 4), round(p[1], 4), round(p[2], 4))
        if k in chave: un(i, chave[k])
        else: chave[k] = i
    for t in range(0, len(idx), 3):
        un(idx[t], idx[t+1]); un(idx[t], idx[t+2])
    return {i: ach(i) for i in range(len(pos))}
