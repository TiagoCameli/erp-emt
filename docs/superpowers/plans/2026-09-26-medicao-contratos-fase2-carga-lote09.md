# Medição de Contratos, Fase 2 (carga do Lote 09): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Carregar no módulo o contrato do Lote 09 (CT 00615/2025, DNIT) com a planilha contratual v0 e as 10 medições aprovadas, conferindo contra a planilha oficial até o centavo e abortando se não bater. A carga só é aplicada com o ok do Tiago.

**Architecture:** Padrão das cargas da Manutenção e do Frete (`scripts/migracao-gestao-obras/`, migrations `*_preparo_carga` + `*_carga_*`). Um script Python lê o xlsx oficial (valor bruto da célula, openpyxl), gera o staging e o `esperado.json` fora do git; uma migration de preparo cria a tabela de staging em `legado`; a migration de carga não tem dado: lê o staging, grava pelas tabelas do módulo com `app.mc_carga = '1'`, confere tudo contra o esperado e aborta se qualquer número divergir. Ensaio em 3 rodadas antes de aplicar.

**Tech Stack:** Python 3 + openpyxl + Decimal; Supabase Postgres 17 (MCP `apply_migration` / `execute_sql`); `supabase db query --linked` para subir o staging (como `carregar_staging_fase34.py`).

**Spec:** `docs/superpowers/specs/2026-09-25-medicao-contratos-design.md` (seção 10 e emendas de 26/09).

## Fonte e decisões (Tiago, 26/09/2026)

- Fonte única: `Medicao_Teste_3_ATUALIZADA_v12_NOVO.xlsx` (SharePoint, `Obras/009 - ... Lote-9/6 - Medições`), aba `Planilha de Medição`. Cópia local de trabalho com sha256 `2a29e7473cca3e057a700a91c58d8d992e89ea42e2c74a094d1f3e59121fcb0b`. O script recusa arquivo com outro hash.
- Estrutura: cabeçalho na linha 14; linhas 15 a 279; total geral na 280 (fora da carga). B código, C descrição, E unidade, F preço, G quantidade prevista, H valor previsto, I..R = 1ª..10ª medição (S..AR vazias ou zero).
- **Regra de arredondamento: `sem_arredondar`.** Conferido: reproduz ao centavo previsto (243.927.483,49), acumulado até a 10ª (36.541.661,77), 10ª (680.738,27) e os 8 grupos. O centavo entre a soma dos grupos (…,76) e o total (…,77) é o total ser round(soma exata).
- **Saldo = previsto − acumulado = 207.385.821,72.** A planilha mostra 207.385.821,63 porque trunca o saldo por item (`TRUNC(H-AT,3)`). Decisão do Tiago: o módulo usa a conta direta. O esperado da carga usa ,72.
- **Linha 20 (DOPE, l) entra com código `02.02.01`** (no xlsx está `02.02`, repetido da linha 19). A carga grava a observação no contrato.
- Linhas 184 a 199 (03.16.01 a 03.16.09, ocultas no xlsx): preço preenchido e quantidade vazia: entram com quantidade prevista 0, como a importação faria (campo vazio vira zero).
- Unidade `'un '` (linhas 100 e 101): gravada aparada.
- Grupo 08 (linha 278) tem F = 0: é título (código de 2 dígitos).
- Quantidades de medição com casa escondida (156 células, ex.: 01.01 na 9ª = 0,749996) entram com o valor bruto.
- **Períodos (NFs no ERP):** 1ª 01–30/11/2025 (NF 345), 2ª 01–31/12/2025 (350), 3ª 01–31/01/2026 (356), 4ª 01–28/02/2026 (359), 5ª 01–31/03/2026 (360), 6ª 01–30/04/2026 (361), 7ª 01–31/05/2026 (362), 8ª 01–30/06/2026 (363), 9ª 01–31/07/2026 (368), 10ª 01–31/08/2026 (sem NF ainda; inferido do padrão mensal). Contrato com `dia_inicio_periodo = 1`.
- **Contrato** (dados do vault `business/lote09-br364`, fonte o PDF do contrato SEI 22563019): código `L09-BR364`, obra "BR-364/AC Lote 09 (manutenção)", local "BR-364/AC, km 620,90 a 682,90", objeto "Serviços de manutenção rodoviária (conservação/recuperação) na BR-364/AC", número `00615/2025`, contratante "DNIT - Superintendência Regional do Acre" (federal), valor do contrato R$ 243.927.498,02, assinatura 01/10/2025, prazo 39 meses a partir da assinatura, localização rodovia, status ativo. Observação: diferença de R$ 14,53 entre valor do contrato e previsto da planilha (D4) e a troca 02.02 → 02.02.01.
- Acesso: os 4 Admins ativos (Tiago, James, Emanuel, Lorenzo) entram na lista do contrato.
- Cada medição entra `aprovada`, `origem = 'carga'`, com REV00 `aprovada`, as quantidades como `mc_ajustes` tipo `carga` ("Carga inicial da planilha oficial v12") e aprovada = medida.

## Global Constraints

- Nada vai para o git que seja dado da planilha: staging, `esperado.json` e relatórios ficam em `scripts/migracao-medicao/_retrato/` (gitignored), como na Fase 3/4.
- Migration de preparo: aditiva (tabela em `legado`, RLS ligada, sem policy, sem grant). Migration de carga: sem dado, arquivo `_PENDENTE_` até o ok do Tiago; nome final = versão real aplicada.
- A carga roda numa transação só (aprovada não se apaga nem por TRUNCATE: não existe desfazer em pedaços). Ensaio sempre em transação abortada.
- Números sempre por Decimal a partir de `repr()` da célula; numeric sem escala no banco.
- Conferência da carga compara, e aborta se diferir em qualquer um: por linha, preço e quantidade prevista (texto exato); por item e por medição, a quantidade (texto exato); por grupo e total, previsto, acumulado até a 10ª e 10ª (2 casas); saldo total 207.385.821,72; contagens (265 linhas, 20 títulos, 245 serviços, 10 medições, N ajustes).
- Textos pt-BR, sem travessão. Commits com a linha Co-Authored-By.
- Ao final: PR, CI verde, merge e deploy (regra do Tiago); a aplicação da carga em produção espera o ok dele.

---

### Task 1: Extrator e esperado

**Files:**
- Create: `scripts/migracao-medicao/gerar_carga_lote09.py`, `scripts/migracao-medicao/test_gerar_carga_lote09.py`, `scripts/migracao-medicao/README.md`
- Modify: `.gitignore` (acrescentar `scripts/migracao-medicao/_retrato/`)

**Interfaces:**
- Produces: `_retrato/staging_l09.json` com `{"contrato": {...}, "linhas": [{"ordem", "linha_origem", "codigo", "pai_ordem", "descricao", "unidade", "tipo", "preco_unitario", "quantidade_prevista"}], "medicoes": [{"numero", "periodo_inicio", "periodo_fim"}], "quantidades": [{"numero_medicao", "ordem", "quantidade"}]}` (números como texto) e `_retrato/esperado_l09.json` com `{"linhas": N, "titulos": 20, "servicos": 245, "medicoes": 10, "ajustes": N, "grupos": {"01": {"previsto": "761566.89", "acumulado": "117937.01", "decima": "0.00"}, ...}, "total": {"previsto": "243927483.49", "acumulado": "36541661.77", "decima": "680738.27", "saldo": "207385821.72"}, "precos": {ordem: texto}, "qtds_previstas": {ordem: texto}}`.

- [ ] Step 1: teste Python (pytest ou unittest da stdlib) que roda o gerador sobre o xlsx e confere: hash, 265 linhas, 20 títulos, 245 serviços; linha de ordem do DOPE com código `02.02.01`; 02.07.04 com preço `580.8643` e quantidade `17057.717`; 01.01 com preço `21154.63583333333` e quantidade da 9ª `0.749996`; os totais do esperado iguais aos alvos do Tiago (previsto 243927483.49, acumulado 36541661.77, 10ª 680738.27, saldo 207385821.72) e os 8 grupos. Rodar e ver falhar.
- [ ] Step 2: implementar lendo com openpyxl (`data_only=True`), texto do número por `repr(float)` (recusa expoente), unidade aparada, vazio vira `"0"` em serviço, pai pelo maior prefixo (DOPE já renomeado antes de montar a hierarquia), cálculo `sem_arredondar` em Decimal, round half away from zero. Caminho do xlsx por argumento; recusa hash diferente.
- [ ] Step 3: rodar e ver passar; mutação: trocar a regra para arredondar por item e ver o teste do total falhar; desfazer.
- [ ] Step 4: commit (sem `_retrato/`).

### Task 2: Staging (preparo) e carregador

**Files:**
- Create: `supabase/migrations/<versão real>_mc_fase2_preparo_carga_l09.sql`, `scripts/migracao-medicao/carregar_staging_lote09.py`

- [ ] Step 1: migration de preparo, no molde de `20260925120000_fase34_preparo_carga.sql`: `legado.carga_mc_l09 (secao text, parte int, dados jsonb, carregado_em, pk (secao, parte))`, RLS ligada, `revoke all from public, anon, authenticated`; função `legado.fn_staging_mc_l09(p_secao text) returns setof jsonb` sem grant. Aplicar por `apply_migration`; arquivo com a versão real; advisors.
- [ ] Step 2: carregador no molde de `carregar_staging_fase34.py`: confere o project ref `vsesgvqjgqpapoxhnbqx`, apaga e regrava o staging em lotes de ~35 KB (seções `contrato`, `linhas`, `medicoes`, `quantidades`, `esperado`). Rodar e conferir contagens por `execute_sql`.
- [ ] Step 3: commit.

### Task 3: Migration de carga (sem dado) com conferência

**Files:**
- Create: `supabase/migrations/_PENDENTE_mc_fase2_carga_l09.sql`, `supabase/rollbacks/mc_fase2_carga_l09_rollback.sql`

- [ ] Step 1: um bloco `do $carga$` que:
  1. aborta se o staging estiver incompleto ou se já existir contrato `L09-BR364` não excluído;
  2. `perform set_config('app.mc_carga', '1', true)`;
  3. insere o contrato (regra `sem_arredondar`, `dia_inicio_periodo` 1, `tipo_localizacao` rodovia), `mc_reajuste_config` (sem reajuste, a Fase 6 configura), a lista de acesso (4 Admins ativos, conferindo que são 4);
  4. cria a versão 0 em rascunho, os `mc_itens` e as `mc_planilha_itens` (pai por `pai_ordem`), e torna a versão vigente com `vigente_desde` = 01/11/2025;
  5. para N de 1 a 10, na ordem: insere a medição `aprovada`, `origem = 'carga'`, com o período; a REV00 `aprovada`; os `mc_ajustes` tipo `carga` (só quantidade diferente de zero); as `mc_aprovacoes_item` com a mesma quantidade;
  6. confere, com as views do módulo (`mc_v_planilha_linhas`, `mc_v_planilha_totais`, `mc_v_versao_totais`, `mc_v_medicao_itens`, `mc_v_medicao_totais`, `mc_v_item_acumulado`), cada número do esperado; acumula as diferenças em `v_erros` e, se houver alguma, `raise exception 'Carga não bate com a origem: % || RELATORIO %'`;
  7. com `current_setting('app.carga_ensaio', true) = 'sim'` termina em `raise exception 'ENSAIO OK, nada gravado: %'` com o relatório.
- [ ] Step 2: rollback em arquivo separado: apaga, na ordem inversa e só para o contrato `L09-BR364` da carga, com `app.mc_carga = '1'` (as travas bloqueiam delete de aprovada: o rollback precisa de um caminho de carga; se as travas impedirem, o rollback é desabilitar os gatilhos do módulo na transação com `set local session_replication_role = replica`, documentado e só neste arquivo).
- [ ] Step 3: commit.

### Task 4: Ensaio em 3 rodadas

**Files:**
- Create: `scripts/migracao-medicao/ensaiar_carga_lote09.py`

- [ ] Step 1: no molde de `ensaiar_carga_fase34.py`, três rodadas, cada uma num bloco que aborta:
  1. ENSAIO: `app.carga_ensaio = 'sim'`, tem de sair `ENSAIO OK` com todos os números;
  2. CONTROLE: o esperado de um grupo alterado em R$ 0,01 dentro da transação; tem de ser recusado com "Carga não bate com a origem";
  3. ROLLBACK: carga real + rollback na mesma transação; contagens `mc_*` do contrato voltam a zero.
- [ ] Step 2: rodar as 3; guardar a saída em `_retrato/ensaio.txt`; commit do script.

### Task 5: Documentação, PR, merge e deploy

- [ ] Step 1: `docs/decisoes.md`: entrada de 26/09 com a regra `sem_arredondar` do Lote 09 e o porquê do centavo, o saldo sem TRUNC, a linha 20 → 02.02.01, os períodos das NFs, a 10ª inferida.
- [ ] Step 2: PR com a saída do ensaio; CI verde; merge e deploy (regra do Tiago).
- [ ] Step 3: **parar** e pedir o ok do Tiago para aplicar a carga. Com o ok: aplicar `_PENDENTE_mc_fase2_carga_l09.sql` por `apply_migration`, renomear para a versão real, rodar a prova pós-carga (reler as views e comparar com o esperado), conferir no navegador em produção o contrato L09-BR364 e a planilha, atualizar o status no vault.
