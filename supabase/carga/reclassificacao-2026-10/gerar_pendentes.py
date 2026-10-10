"""Planilha do que ficou por fazer na reclassificacao (so leitura).

Roda de-para.sql de novo (o que ja foi aplicado nao casa mais com nenhuma
regra), tira as linhas que o Tiago marcou "nao" na planilha anterior (decididas:
ficam como estao), e junta a proposta de categoria das "Despesas financeiras".
Uso: python3 gerar_pendentes.py <planilha_do_tiago.xlsx> <saida.xlsx>
"""
import json, subprocess, sys, pathlib
from collections import defaultdict
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]

def rodar(sql):
    out = subprocess.run(["npx", "supabase", "db", "query", "--linked", "-o", "json", "-f", str(sql)],
                         cwd=RAIZ, capture_output=True, text=True, check=True).stdout
    d = json.loads(out[out.index("{"):]); return d["rows"] if isinstance(d, dict) else d

# A funcao propor() do script de propostas, sem rodar o script inteiro.
fonte = (AQUI / "propostas_despesas_financeiras.py").read_text(encoding="utf-8")
ns = {"re": __import__("re")}; exec(fonte[fonte.index("# (padrao, categoria"):fonte.index("wb = Workbook()")], ns)
propor = ns["propor"]

linhas = rodar(AQUI / "de-para.sql")

# Linhas "nao" da planilha do Tiago: casar por lancamento, valor, centro e descricao.
wb_t = load_workbook(sys.argv[1], data_only=True); ws_t = wb_t["De-para"]
hdr = [c.value for c in ws_t[1]]
ap = next(h for h in hdr if h and h.startswith("Aprovar"))
chave = lambda n, v, c, d: (n, round(float(v), 2), c, (d or "").strip())
nao = defaultdict(int)
for r in ws_t.iter_rows(min_row=2, values_only=True):
    r = dict(zip(hdr, r))
    if str(r[ap] or "").strip().lower() == "não":
        nao[chave(r["Lançamento"], r["Valor"], r["Centro atual"], r["Descrição"])] += 1

OBS = {
    "a_centro_socio": "Frete de peças: no Mais Controle a parte estava em 'Casa James' sem equipamento. Diga o equipamento ou deixe como distribuição",
    "a_despesa_pessoal": "Achado pelo texto (envio a PF, despesa pessoal). Atenção: a regra pegou nomes como DONIZETE por engano",
    "b_empresa_ligada": "Empréstimo (BASA) em centro da Amazônia: sugiro deixar como está",
    "c_consorcio": "Consórcio lançado como despesa",
    "c_equipamento": "Bem comprado lançado em Outras despesas",
    "d_imobilizado": "Centro de aquisição com categoria de custo",
    "d_imobilizado_gasto": "Frete/documentação no centro de aquisição: é gasto (Manutenção/Doc.) ou parte do bem?",
    "e_pecuaria": "Custeio de pecuária",
    "e_pro_labore_sem_socio": "Pró-labore sem nome do sócio",
}
pend = []
for l in linhas:
    k = chave(l["numero"], l["valor"], l["centro_atual"], l["descricao"])
    if nao.get(k):
        nao[k] -= 1; continue
    cat, conf, obs = l["categoria_proposta"], "", OBS.get(l["regra"], "")
    if l["regra"] == "e_despesas_financeiras":
        cat, conf, obs = propor(l["descricao"])
    pend.append({**l, "categoria_proposta": cat or "", "confianca": conf, "obs": obs})

wb = Workbook(); rs = wb.active; rs.title = "Resumo"
rs.append(["Regra", "Pendentes", "Valor (R$)", "O que falta"])
por = defaultdict(lambda: [0, 0.0])
for p in pend: por[p["regra"]][0] += 1; por[p["regra"]][1] += float(p["valor"])
for regra, (q, v) in sorted(por.items()): rs.append([regra, q, round(v, 2), OBS.get(regra, "Despesas financeiras: proposta por palavra-chave, confira a coluna Confiança")])
rs.append(["TOTAL", len(pend), round(sum(float(p["valor"]) for p in pend), 2), ""])
rs.append([]); rs.append(["Já aplicado em 10/10/2026: parte 1 (443 'sim'), parte 2 (13 'outra'), parte 3 (Amazônia 463, Colorado, Areacre, apólice). As 51 'não' ficam como estão."])
ws = wb.create_sheet("Pendentes")
cab = ["Rateio (id) — não apagar", "Lançamento", "Tipo", "Competência", "Valor", "Descrição", "Fornecedor", "Categoria atual",
       "Centro atual", "Categoria proposta", "Centro proposto", "Regra", "Confiança", "Observação", "Aprovar (sim/não/outra)", "Se outra: categoria / centro certos"]
ws.append(cab)
for p in pend:
    ws.append([p["rateio_id"], p["numero"], p["tipo"], p["competencia"], float(p["valor"]), p["descricao"], p["fornecedor"],
               p["categoria_atual"], p["centro_atual"], p["categoria_proposta"], p["centro_proposto"], p["regra"],
               p["confianca"], p["obs"], "", ""])
for i in range(1, len(cab) + 1): ws.column_dimensions[get_column_letter(i)].width = 18
ws.column_dimensions["F"].width = 55; ws.column_dimensions["N"].width = 50
ws.freeze_panes = "B2"; ws.auto_filter.ref = ws.dimensions
for c in ws[1]: c.font = Font(bold=True)
for c in rs[1]: c.font = Font(bold=True)
rs.column_dimensions["D"].width = 90
wb.save(sys.argv[2])
print(len(pend), "pendentes ->", sys.argv[2])
for regra, (q, v) in sorted(por.items()): print(f"  {regra}: {q}, R$ {v:,.2f}")
print("nao nao casados:", sum(v for v in nao.values() if v > 0))
