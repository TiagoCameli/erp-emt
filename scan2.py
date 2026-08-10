import re, os, sys

ROOT = "/Users/tiagocameli/Documents/GitHub/erp-emt/.claude/worktrees/excluir-obras-centros-custo/src/modules/cadastros"
BASE = "/Users/tiagocameli/Documents/GitHub/erp-emt/.claude/worktrees/excluir-obras-centros-custo"

MAP = {
"nao":"nao","sao":"sao","voce":"voce","vao":"vao","estao":"estao","ate":"ate","apos":"apos",
"acao":"a","acoes":"a","codigo":"c","codigos":"c","numero":"n","numeros":"n",
"periodo":"p","periodos":"p","salario":"s","salarios":"s",
"funcao":"f","funcoes":"f","situacao":"s","situacoes":"s",
"descricao":"d","descricoes":"d","observacao":"o","observacoes":"o",
"informacao":"i","informacoes":"i","manutencao":"m","escritorio":"e",
"orcamento":"o","orcamentos":"o","endereco":"e","enderecos":"e",
"municipio":"m","municipios":"m","responsavel":"r","responsaveis":"r",
"obrigatorio":"o","obrigatoria":"o","obrigatorios":"o","obrigatorias":"o",
"invalido":"i","invalida":"i","invalidos":"i","invalidas":"i",
"possivel":"p","impossivel":"i","permissao":"p","permissoes":"p",
"usuario":"u","usuarios":"u","padrao":"p","minimo":"m","minima":"m",
"maximo":"m","maxima":"m","proximo":"p","proxima":"p","ultimo":"u","ultima":"u",
"ultimos":"u","ultimas":"u","unico":"u","unica":"u","unicos":"u","unicas":"u",
"multiplo":"m","multiplos":"m","especifico":"e","tambem":"t","porem":"p",
"entao":"e","conteudo":"c","titulo":"t","titulos":"t","rotulo":"r","rotulos":"r",
"pagina":"p","paginas":"p","inicio":"i","termino":"t","arvore":"a",
"nivel":"n","niveis":"n","vinculo":"v","vinculos":"v","credito":"c","debito":"d",
"deposito":"d","transferencia":"t","antecipacao":"a","verificacao":"v",
"conferencia":"c","referencia":"r","referencias":"r","competencia":"c",
"calculo":"c","calculos":"c","parametro":"p","parametros":"p",
"criterio":"c","criterios":"c","relatorio":"r","relatorios":"r",
"opcao":"o","opcoes":"o","selecao":"s","importacao":"i","exportacao":"e",
"validacao":"v","confirmacao":"c","atencao":"a","maquina":"m","maquinas":"m",
"combustivel":"c","veiculo":"v","veiculos":"v","matricula":"m",
"admissao":"a","demissao":"d","ferias":"f","rescisao":"r","contribuicao":"c",
"deducao":"d","producao":"p","medicao":"m","requisicao":"r","devolucao":"d",
"transacao":"t","conciliacao":"c","previsao":"p","liquidacao":"l",
"emissao":"e","mae":"m","orgao":"o","cartao":"c","proprio":"p","propria":"p",
"varios":"v","varias":"v","familia":"f","dolar":"d","grafico":"g","graficos":"g","trafego":"t",
"seguranca":"s","economico":"e","tecnico":"t","mecanico":"m","eletrico":"e",
"hidraulico":"h","automatico":"a","basico":"b","historico":"h","oleo":"o",
"diario":"d","distancia":"d","quilometro":"q","rodoviario":"r",
"licenca":"l","licencas":"l","apolice":"a","exercicio":"e","almoco":"a",
"alteracao":"a","alteracoes":"a","criacao":"c","exclusao":"e",
"restauracao":"r","movimentacao":"m","localizacao":"l",
"classificacao":"c","reclassificacao":"r","sequencia":"s",
"consequencia":"c","frequencia":"f","agencia":"a","especie":"e",
"lider":"l","lideranca":"l","gerencia":"g","supervisao":"s",
"operacao":"o","operacoes":"o","expedicao":"e","razao":"r","nucleo":"n",
"regiao":"r","estacao":"e","aplicacao":"a","juridica":"j","fisica":"f",
"numeracao":"n","posicao":"p","condicao":"c","condicoes":"c",
"obito":"o","aereo":"a","fisico":"f","juridico":"j","gestao":"g",
"pos":"pos","razoes":"r",
"utilizacao":"u","atualizacao":"a","duplicacao":"d","integracao":"i",
"apuracao":"a","reposicao":"r","aquisicao":"a","instalacao":"i",
"execucao":"e","conclusao":"c","revisao":"r","divisao":"d",
"comissao":"c","dimensao":"d","extensao":"e","suspensao":"s",
"ocorrencia":"o","providencia":"p","tendencia":"t","urgencia":"u",
"emergencia":"e","eficiencia":"e","experiencia":"e",
"beneficio":"b","beneficios":"b",
"tributaria":"t","tributario":"t",
"contabil":"c","serie":"serie","previa":"p","previo":"p",
"incluida":"i","excluida":"e","concluida":"c","concluido":"c",
"saida":"s","saidas":"s","ja":"ja","so":"so","esta":"esta","mes":"mes","tres":"t",
"pais":"pais","area":"area","areas":"area","valida":"v","valido":"v","validos":"v","validas":"v",
}

WORDRE = re.compile(r"(?<![0-9A-Za-zÀ-ÿ_])(" + "|".join(sorted(MAP, key=len, reverse=True)) + r")(?![0-9A-Za-zÀ-ÿ_])", re.IGNORECASE)
AMBIG = set("ja so esta sao mes pais area areas serie valida valido validos validas".split())

STR = re.compile(r"""('(?:[^'\\\n]|\\.)*')|("(?:[^"\\\n]|\\.)*")|(`(?:[^`\\]|\\.)*`)""", re.S)
SKIP_LIT = re.compile(r"^[`'\"](@/|\./|\.\./|use |http)")

out = []
for dirpath, dirs, files in os.walk(ROOT):
    for f in sorted(files):
        if not f.endswith((".ts", ".tsx")):
            continue
        p = os.path.join(dirpath, f)
        rel = os.path.relpath(p, BASE)
        src = open(p, encoding="utf-8").read()
        lines = src.split("\n")
        hits = {}
        for m in STR.finditer(src):
            lit = m.group(0)
            if SKIP_LIT.match(lit):
                continue
            inner = lit[1:-1]
            ms = list(WORDRE.finditer(inner))
            if not ms:
                continue
            line = src.count("\n", 0, m.start()) + 1
            hits.setdefault(line, set()).update(x.group(1).lower() for x in ms)
        for i, l in enumerate(lines, 1):
            for m in re.finditer(r">([^<>{}\n]{2,})<", l):
                t = m.group(1)
                ws = set(x.group(1).lower() for x in WORDRE.finditer(t))
                if ws:
                    hits.setdefault(i, set()).update(ws)
        for line in sorted(hits):
            ws = hits[line]
            amb = all(w in AMBIG for w in ws)
            out.append((rel, line, ",".join(sorted(ws)), lines[line - 1].strip()[:200], amb))

strong = [o for o in out if not o[4]]
weak = [o for o in out if o[4]]
print("=== STRONG (%d) ===" % len(strong))
for r in strong:
    print("%s:%d [%s] %s" % (r[0], r[1], r[2], r[3]))
print("\n=== WEAK/AMBIG (%d) ===" % len(weak))
for r in weak:
    print("%s:%d [%s] %s" % (r[0], r[1], r[2], r[3]))
