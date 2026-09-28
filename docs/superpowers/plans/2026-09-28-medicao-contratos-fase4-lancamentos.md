# Medição de Contratos, Fase 4 (abrir medição + lançamento diário): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Lançar o executado por item e dia (desktop, celular com foto e colar do Excel) nas medições abertas, com o banco conferindo cada regra, e abrir a próxima medição do contrato.

**Architecture:** Toda escrita por RPC `security definer` (padrão da Fase 1d). Uma função interna `fn_mc_lancamento_gravar` concentra as regras do lançamento e é chamada pelo formulário, pelo celular e pelo colar; o gatilho que já existe (`fn_mc_lancamento_medicao`) escolhe a medição pela data e trava a medição que não está aberta. O TS só monta a tela, lê o texto colado e mostra o que o banco devolve.

**Tech Stack:** Supabase Postgres 17 (MCP `apply_migration` / `execute_sql`), Next.js App Router, canônicos do repo, vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-25-medicao-contratos-design.md` (seções 5.4, 7.2, 8, 9.5 e as emendas de 28/09/2026 em 7.2 e 13).

## Decisões do Tiago (28/09/2026)

- Abrir medição entra na Fase 4, só o abrir. Fechar, revisar e aprovar ficam na Fase 5.
- Celular precisa de sinal: sem fila offline (como o Abastecer do Combustível). Fotos sobem depois do lançamento gravado; foto que falha vira aviso e não desfaz o lançamento.
- Contrato de rodovia: km inicial e km final obrigatórios (estaca opcional).

## Regras que o banco confere (todas já escritas e testadas no SQL da Task 1)

- Abrir: período com fim ≥ início; começa depois do fim da última medição; usa a versão vigente de maior número; nasce `aberta` com REV00 em aberto e evento `abrir`. Sugestão: dia seguinte ao fim da última (ou OS, ou assinatura) até a véspera do próximo `dia_inicio_periodo`.
- Lançamento: item obrigatório e serviço na versão da medição; data que já chegou (fuso `America/Rio_Branco`) e dentro de medição aberta; quantidade > 0 com até 4 casas; rodovia exige km inicial e final; km não negativo; só muda/sai com a medição aberta; contrato não muda; excluir exige motivo (≥ 3 letras).
- Excesso: acumulado do item em todas as medições (com o próprio lançamento) acima do previsto da versão da medição → recusa com `errcode = 'MCEXC'` até vir `motivo_excesso` (≥ 3 letras).
- Colar: mesmas regras linha a linha, na ordem, excesso somando as linhas anteriores do bloco; `p_gravar = false` só confere; gravar é tudo ou nada; máximo 500 linhas.

## Global Constraints

- Migration vai direto para produção: só mudança aditiva. Aplicar por `apply_migration`; o arquivo no repo usa a versão REAL de `supabase_migrations.schema_migrations`, com o texto idêntico ao aplicado (md5 das statements = md5 do arquivo sem a quebra final). `db push` proibido.
- Funções novas: `set search_path to ''`, nomes qualificados, `revoke ... from public, anon`, `grant execute ... to authenticated` (a interna `fn_mc_lancamento_gravar` sem grant). Advisors limpos depois de cada migration.
- Nenhuma escrita em outro módulo (D1). Dinheiro só do banco (D7): o TS não soma nem arredonda valor.
- Backfill só para os 4 Admins ativos; `$confere$` aborta se não forem 4 usuários e 68 linhas `medicao.%`.
- Canônicos obrigatórios (FilterBar, DataTable, FormDrawer, InputQuantidade, EmptyState, MoneyText, FilaFotosEArquivos/BotaoTirarFoto). Nenhuma tabela ou formulário paralelo.
- Nenhuma medição é aberta e nenhum lançamento é gravado em produção por mim: quem abre e lança é o Tiago, pela tela. Testes no banco vivo só em transação desfeita.
- Textos pt-BR com acentos, sem travessão (—). Commits terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- `node_modules` do checkout no iCloud pode ficar "dataless": se travar, `npm ci` no worktree; arquivos `.next/types/* 2.ts` do iCloud se apagam antes do `tsc`.
- Portão do PR: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`, CI verde, provas SQL no banco vivo, advisors. Depois: merge (merge commit), deploy acompanhado e conferência na tela.

## Review Focus

1. Duas medições abertas ao mesmo tempo (spec 7.3): lançamento cai na que contém a data, e editar a data pode mover o lançamento de uma para a outra, nunca para uma não aberta. Prova 4e/4j.
2. Colar com datas e números no formato do Excel pt-BR (`10/09/2026`, `1.234,5`, célula vazia, tabulação no fim da linha, linha em branco, cabeçalho colado junto): a prévia entende ou aponta a linha, nunca grava errado. Teste Task 5.
3. Código de item repetido entre serviços da versão (o Lote 09 teve `02.02` duas vezes): o colar não escolhe sozinho. Teste Task 5.
4. Excesso: o formulário, o celular e o colar mostram o campo de motivo quando o banco devolve `MCEXC`, e gravam com o motivo sem perder o resto do que foi digitado. Testes Tasks 4, 5 e 6.
5. Foto que falha no celular depois do lançamento gravado: aviso, sem regravar o lançamento (sem duplicar). Teste Task 6.

---

### Task 1: RPCs de abrir medição e de lançamento + prova

**Files:**
- Create: `supabase/provas/mc_fase4_banco.sql`
- Create: `supabase/migrations/<versão real>_mc_fase4a_lancamentos.sql`
- Modify: `src/lib/database.types.ts` (só as entradas novas: as 5 funções com grant e a view `mc_v_lancamentos`)

**Interfaces:**
- Produces:
  - `fn_mc_medicao_sugestao(p_contrato uuid) returns jsonb` → `{numero, periodo_inicio, periodo_fim, versao_numero, depois_de}` (exige `medicao.medicoes/criar`).
  - `fn_mc_medicao_abrir(p_contrato uuid, p_inicio date, p_fim date) returns uuid`.
  - `fn_mc_lancamento_salvar(p_contrato uuid, p_dados jsonb, p_id uuid default null) returns uuid`; `p_dados` = `{item_id, data (yyyy-mm-dd), quantidade (texto), km_inicial, km_final, estaca, local_texto, observacao, motivo_excesso}`; erro de excesso com `code = 'MCEXC'`.
  - `fn_mc_lancamento_excluir(p_id uuid, p_motivo text) returns void`.
  - `fn_mc_lancamentos_colar(p_contrato uuid, p_linhas jsonb, p_gravar boolean) returns jsonb` → `{gravadas, validas, erros: [{linha, erro, excesso}]}`; com `p_gravar = true` e erro, recusa com `P0001` "Nada foi gravado: N linha(s) com erro" e `detail` = a lista de erros em JSON.
  - View `mc_v_lancamentos` (security_invoker): `id, contrato_id, medicao_id, medicao_numero, medicao_status, item_id, codigo, descricao, unidade, data, quantidade, km_inicial, km_final, estaca, local_texto, observacao, motivo_excesso, created_at, created_by, excluido_em, excluido_por, motivo_exclusao`.

Números da prova, feitos à mão. Contrato **KL** (rodovia, `item_por_medicao`, `dia_inicio_periodo = 26`, assinatura 2026-06-10, Tiago na lista), v0 vigente: `01` título | `01.01` serviço, preço 2, previsto 10 | `01.02` serviço, preço 3, previsto 5. Contrato **KT** (localização texto, mesmas linhas, `dia_inicio_periodo = 1`, assinatura 2026-06-01).
- 4a sugestão de KL sem medição: `{numero 1, periodo_inicio 2026-06-10, periodo_fim 2026-06-25, versao_numero 0, depois_de null}`.
- 4b abrir KL 1ª (06-10 a 06-25): status `aberta`, 1 revisão REV00 `em_aberto` fase `antes_aprovacao`, 1 evento `abrir` com `para_status = 'aberta'`, `origem = 'app'`.
- 4c sugestão da 2ª: `{2, 2026-06-26, 2026-07-25}`. Abrir 06-20 a 07-25 → recusou ("começar depois de 25/06/2026"). Abrir 06-26 a 07-25 → ok (duas abertas).
- 4d abrir com fim antes do início → recusou. Contrato sem versão vigente → recusou.
- 4e lançar `01.01` 4 em 06-20 (km 1 a 2) → 1ª; lançar `01.01` 3 em 07-01 (km 2 a 1, sentido decrescente) → 2ª.
- 4f recusas: sem km; km negativo; quantidade 0; `1.00001` (5 casas); data futura; título `01`; data 2026-05-01 (sem medição); item de outro contrato.
- 4g excesso: `01.01` 4 em 07-02 (acumulado 4 + 3 + 4 = 11 > 10) sem motivo → `sqlstate = 'MCEXC'`; com motivo "aditivo em análise" → grava e o motivo fica na linha.
- 4h colar prévia em KL: [`01.02` 3 em 07-03, `01.02` 3 em 07-04] → `validas 1`, `erros = [{linha 2, excesso true}]`, e nenhuma linha nova gravada.
- 4i colar gravar com a mesma lista → recusou "Nada foi gravado: 1 linha(s) com erro"; contagem igual. Colar gravar [`01.02` 3 em 07-03, `01.02` 2 em 07-04] → `gravadas 2` (acumulado 5 = previsto, não passa).
- 4j editar o lançamento de 06-20 para quantidade 2 → ok; editar a data dele para 07-05 → passa para a 2ª; voltar para 06-20 → volta para a 1ª.
- 4k lançar `01.01` 1 em 06-21 (1ª; acumulado 2 + 3 + 4 + 1 = 10, não passa) e excluir esse lançamento: motivo "ab" → recusou; "lançado errado" → ok (`excluido_em` preenchido, some de `mc_v_medicao_qtd`).
- 4l passar a 1ª para `em_conferencia` (update como dono, na transação): editar ou excluir lançamento da 1ª → recusou ("só muda enquanto a medição está aberta"); lançar em 06-15 → recusou ("está em conferência").
- 4m permissões: usuário zero sem `medicao.lancamentos/criar` → recusou; com a permissão na transação mas fora da lista de KL → "Contrato não encontrado"; sem `medicao.medicoes/criar` → abrir recusado.
- 4n update direto como dono trocando `contrato_id` de um lançamento → recusou ("contrato do lançamento não muda").
- 4o KT (texto): lançar sem km → ok.
- 4p boletim de KL (depois de 4e..4l): valor da 2ª = `01.01` (3 + 4) × 2 = 14,00 + `01.02` (3 + 2) × 3 = 15,00 → **29,00**; 1ª = `01.01` 2 × 2 = **4,00** (o lançamento de 06-20 editado para 2 em 4j; o de 06-21 excluído em 4k).
- 4q controle: 4p comparado a `29.01` tem de dar DIFERENTE.
- 4r nada fora: contagens de `obras`, `centros_custo`, `lancamentos` iguais; L09 continua com 10 medições e nenhum lançamento.

- [ ] **Step 1: prova** `supabase/provas/mc_fase4_banco.sql` no estilo de `supabase/provas/mc_fase3_banco.sql` (ler inteira antes: `begin;`, helpers da planilha recriados na transação, dados como dono, `set local role authenticated` + `request.jwt.claims`, `r jsonb` com uma chave por caso, `fn_mc_prova_confere` para números, recusas com `'PASSOU (errado)'` logo depois da chamada, `raise exception 'PROVA %', r` e ABORTO GARANTIDO). O Tiago ainda não tem `medicao.medicoes` nem `medicao.lancamentos` em produção (backfill é a Task 3): a prova insere essas permissões dele dentro da própria transação.
- [ ] **Step 2:** rodar a prova (`supabase db query --linked -f supabase/provas/mc_fase4_banco.sql`): tem de falhar porque as funções não existem.
- [ ] **Step 3: migration** com este texto (rodado em 28/09 contra produção numa transação desfeita no L09: sugestão 11ª 01/09 a 30/09/2026, sobreposição recusada, 11ª aberta com REV00, lançamento na 11ª, recusas de km/aprovada/título/futuro, excesso `MCEXC`, colar prévia e tudo ou nada, excluir, boletim da 11ª com 5 × 580,8643 = 2.904,32):

```sql
-- Medição de Contratos, Fase 4a: abrir medição e lançamento diário (RPCs de escrita), só aditivo.
-- Regras: spec seção 5.4, 7.2 e 8, emenda de 28/09/2026. Números chegam como texto e viram numeric
-- sem passar por float.

-- Período sugerido da próxima medição: começa no dia seguinte ao fim da última (ou na OS/assinatura,
-- se não houver nenhuma) e termina na véspera do próximo dia_inicio_periodo.
create or replace function public.fn_mc_medicao_sugestao(p_contrato uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_c public.mc_contratos%rowtype; v_ultimo date; v_ini date; v_corte date; v_num int; v_versao int;
begin
  perform public.fn_mc_exigir('medicao.medicoes', 'criar', p_contrato, 'Sem permissão para abrir medição');
  select * into v_c from public.mc_contratos where id = p_contrato and excluido_em is null;
  if not found then raise exception 'Contrato não encontrado' using errcode = 'P0001'; end if;
  select max(periodo_fim), coalesce(max(numero), 0) + 1 into v_ultimo, v_num from public.mc_medicoes where contrato_id = p_contrato;
  v_ini := coalesce(v_ultimo + 1, v_c.data_ordem_servico, v_c.data_assinatura);
  v_corte := make_date(extract(year from v_ini)::int, extract(month from v_ini)::int, v_c.dia_inicio_periodo);
  if v_corte <= v_ini then v_corte := (v_corte + interval '1 month')::date; end if;
  select numero into v_versao from public.mc_planilha_versoes
   where contrato_id = p_contrato and status = 'vigente' and excluido_em is null order by numero desc limit 1;
  return jsonb_build_object('numero', v_num, 'periodo_inicio', v_ini, 'periodo_fim', v_corte - 1,
    'versao_numero', v_versao, 'depois_de', v_ultimo);
end $$;

-- Abre a próxima medição do contrato, sempre depois da última, com a planilha vigente mais recente
-- e a REV00 em aberto (a Fase 5 fecha, revisa e aprova).
create or replace function public.fn_mc_medicao_abrir(p_contrato uuid, p_inicio date, p_fim date)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_num int; v_ultimo date; v_versao uuid; v_codigo text;
begin
  perform public.fn_mc_exigir('medicao.medicoes', 'criar', p_contrato, 'Sem permissão para abrir medição');
  select codigo into v_codigo from public.mc_contratos where id = p_contrato and excluido_em is null;
  if not found then raise exception 'Contrato não encontrado' using errcode = 'P0001'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then
    raise exception 'Informe o período da medição com o fim igual ou depois do início' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mc_medicao:' || p_contrato::text, 0));
  select max(periodo_fim), coalesce(max(numero), 0) + 1 into v_ultimo, v_num from public.mc_medicoes where contrato_id = p_contrato;
  if v_ultimo is not null and p_inicio <= v_ultimo then
    raise exception 'A %ª medição tem de começar depois de % (fim da %ª)', v_num, to_char(v_ultimo, 'DD/MM/YYYY'), v_num - 1
      using errcode = 'P0001';
  end if;
  select id into v_versao from public.mc_planilha_versoes
   where contrato_id = p_contrato and status = 'vigente' and excluido_em is null order by numero desc limit 1;
  if v_versao is null then
    raise exception 'O contrato % não tem planilha vigente. Aprove a planilha antes de abrir medição', v_codigo using errcode = 'P0001';
  end if;
  insert into public.mc_medicoes (contrato_id, numero, periodo_inicio, periodo_fim, versao_id, origem)
  values (p_contrato, v_num, p_inicio, p_fim, v_versao, 'app') returning id into v_id;
  insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero) values (v_id, p_contrato, 0);
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, para_status)
  values (v_id, p_contrato, 'abrir', 'aberta');
  return v_id;
end $$;

-- Grava (cria ou edita) um lançamento. Interna: quem chama já conferiu permissão e contrato.
-- Recusa com errcode MCEXC quando o acumulado do item passa do previsto sem motivo (spec 8).
create or replace function public.fn_mc_lancamento_gravar(p_contrato uuid, p_dados jsonb, p_id uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_tipo_loc text; v_id uuid; v_item uuid; v_data date; v_qtd numeric; v_km_i numeric; v_km_f numeric;
  v_motivo text; v_medicao uuid; v_prevista numeric; v_acum numeric; v_codigo text; v_unidade text;
begin
  select tipo_localizacao into v_tipo_loc from public.mc_contratos where id = p_contrato;
  v_item := nullif(p_dados ->> 'item_id', '')::uuid;
  v_data := nullif(p_dados ->> 'data', '')::date;
  v_qtd := nullif(btrim(p_dados ->> 'quantidade'), '')::numeric;
  v_km_i := nullif(btrim(p_dados ->> 'km_inicial'), '')::numeric;
  v_km_f := nullif(btrim(p_dados ->> 'km_final'), '')::numeric;
  v_motivo := nullif(btrim(p_dados ->> 'motivo_excesso'), '');
  if v_item is null then raise exception 'Escolha o item' using errcode = 'P0001'; end if;
  if v_data is null then raise exception 'Informe a data' using errcode = 'P0001'; end if;
  if v_data > (now() at time zone 'America/Rio_Branco')::date then
    raise exception 'A data % ainda não chegou. Lançamento é do que já foi executado', to_char(v_data, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade maior que zero' using errcode = 'P0001'; end if;
  if v_qtd <> round(v_qtd, 4) then raise exception 'A quantidade tem no máximo 4 casas' using errcode = 'P0001'; end if;
  if v_tipo_loc = 'rodovia' and (v_km_i is null or v_km_f is null) then
    raise exception 'Informe o km inicial e o km final' using errcode = 'P0001';
  end if;
  if v_km_i < 0 or v_km_f < 0 then raise exception 'Km não pode ser negativo' using errcode = 'P0001'; end if;
  if v_motivo is not null and char_length(v_motivo) < 3 then
    raise exception 'O motivo do excesso precisa de pelo menos 3 letras' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade, km_inicial, km_final, estaca,
      local_texto, observacao, motivo_excesso)
    values (p_contrato, v_item, '00000000-0000-0000-0000-000000000000', v_data, v_qtd, v_km_i, v_km_f,
      nullif(btrim(p_dados ->> 'estaca'), ''), nullif(btrim(p_dados ->> 'local_texto'), ''),
      nullif(btrim(p_dados ->> 'observacao'), ''), v_motivo)
    returning id, medicao_id into v_id, v_medicao;
  else
    update public.mc_lancamentos set item_id = v_item, data = v_data, quantidade = v_qtd, km_inicial = v_km_i,
      km_final = v_km_f, estaca = nullif(btrim(p_dados ->> 'estaca'), ''), local_texto = nullif(btrim(p_dados ->> 'local_texto'), ''),
      observacao = nullif(btrim(p_dados ->> 'observacao'), ''), motivo_excesso = v_motivo
    where id = p_id and contrato_id = p_contrato and excluido_em is null
    returning id, medicao_id into v_id, v_medicao;
    if v_id is null then raise exception 'Lançamento não encontrado' using errcode = 'P0001'; end if;
  end if;

  -- Excesso: acumulado do item em todas as medições (aprovada = quantidade aprovada; aberta = medida)
  -- contra o previsto da versão da medição do lançamento.
  select pi.quantidade_prevista, pi.codigo, pi.unidade into v_prevista, v_codigo, v_unidade
  from public.mc_medicoes m join public.mc_planilha_itens pi on pi.versao_id = m.versao_id and pi.item_id = v_item
  where m.id = v_medicao;
  select coalesce(sum(qtd_efetiva), 0) into v_acum from public.mc_v_medicao_itens where contrato_id = p_contrato and item_id = v_item;
  if v_acum > v_prevista and v_motivo is null then
    raise exception 'O acumulado do % passa a % %, acima do previsto de % %. Informe o motivo (sinal de que precisa de aditivo)',
      v_codigo, replace(trim_scale(round(v_acum, 6))::text, '.', ','), v_unidade,
      replace(trim_scale(round(v_prevista, 6))::text, '.', ','), v_unidade using errcode = 'MCEXC';
  end if;
  return v_id;
end $$;

create or replace function public.fn_mc_lancamento_salvar(p_contrato uuid, p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
begin
  if p_id is null then
    perform public.fn_mc_exigir('medicao.lancamentos', 'criar', p_contrato, 'Sem permissão para lançar');
  else
    perform public.fn_mc_exigir('medicao.lancamentos', 'editar', p_contrato, 'Sem permissão para editar lançamento');
  end if;
  return public.fn_mc_lancamento_gravar(p_contrato, p_dados, p_id);
end $$;

create or replace function public.fn_mc_lancamento_excluir(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_contrato uuid;
begin
  select contrato_id into v_contrato from public.mc_lancamentos where id = p_id and excluido_em is null;
  perform public.fn_mc_exigir('medicao.lancamentos', 'excluir', v_contrato, 'Sem permissão para excluir lançamento');
  if v_contrato is null then raise exception 'Lançamento não encontrado' using errcode = 'P0001'; end if;
  if char_length(coalesce(btrim(p_motivo), '')) < 3 then
    raise exception 'Informe o motivo da exclusão' using errcode = 'P0001';
  end if;
  update public.mc_lancamentos set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo)
  where id = p_id;
end $$;

-- Colar do Excel. Uma linha por objeto {linha, data, item_id, quantidade, km_inicial, km_final, estaca,
-- observacao, motivo_excesso}. Cada linha passa pelas mesmas regras do formulário, na ordem, e o
-- excesso soma as linhas anteriores do mesmo bloco. p_gravar = false só confere e não grava nada.
-- Devolve {gravadas, erros: [{linha, erro, excesso}]}; com p_gravar = true e algum erro, nada grava
-- (a RPC recusa com a lista).
create or replace function public.fn_mc_lancamentos_colar(p_contrato uuid, p_linhas jsonb, p_gravar boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare l jsonb; v_erros jsonb := '[]'::jsonb; v_ok int := 0; v_res jsonb;
begin
  perform public.fn_mc_exigir('medicao.lancamentos', 'criar', p_contrato, 'Sem permissão para lançar');
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Cole pelo menos uma linha' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_linhas) > 500 then
    raise exception 'Cole no máximo 500 linhas por vez' using errcode = 'P0001';
  end if;
  begin
    for l in select * from jsonb_array_elements(p_linhas) loop
      begin
        perform public.fn_mc_lancamento_gravar(p_contrato, l, null);
        v_ok := v_ok + 1;
      exception when others then
        v_erros := v_erros || jsonb_build_object('linha', (l ->> 'linha')::int, 'erro', sqlerrm, 'excesso', sqlstate = 'MCEXC');
      end;
    end loop;
    v_res := jsonb_build_object('gravadas', case when p_gravar and jsonb_array_length(v_erros) = 0 then v_ok else 0 end,
                                'validas', v_ok, 'erros', v_erros);
    if not p_gravar or jsonb_array_length(v_erros) > 0 then
      raise exception using errcode = 'MCDRY', message = v_res::text;
    end if;
  exception when sqlstate 'MCDRY' then
    v_res := sqlerrm::jsonb;
    if p_gravar then
      raise exception 'Nada foi gravado: % linha(s) com erro', jsonb_array_length(v_res -> 'erros') using errcode = 'P0001',
        detail = (v_res -> 'erros')::text;
    end if;
  end;
  return v_res;
end $$;

-- Trava do lançamento, reforçada: o contrato não muda, e a medição fica travada (for share) enquanto
-- o lançamento entra, para não passar por um fechamento concorrente.
create or replace function public.fn_mc_lancamento_medicao()
returns trigger language plpgsql set search_path to '' as $$
declare m record; v_codigo text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select numero, status into m from public.mc_medicoes where id = old.medicao_id for share;
    if m.status <> 'aberta' then
      raise exception 'O lançamento é da %ª medição, que está %. Ele só muda enquanto a medição está aberta',
        m.numero, public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    if new.contrato_id is distinct from old.contrato_id then
      raise exception 'O contrato do lançamento não muda' using errcode = 'P0001';
    end if;
  end if;
  select c.codigo into v_codigo from public.mc_contratos c where c.id = new.contrato_id;
  select id, numero, status, periodo_inicio, periodo_fim, versao_id into m
  from public.mc_medicoes where contrato_id = new.contrato_id and new.data between periodo_inicio and periodo_fim for share;
  if not found then
    raise exception 'Não há medição para % no contrato %. Abra a medição do período antes de lançar',
      to_char(new.data, 'DD/MM/YYYY'), v_codigo using errcode = 'P0001';
  end if;
  if m.status <> 'aberta' then
    raise exception 'Não há medição aberta para % no contrato %. A %ª medição (% a %) está %',
      to_char(new.data, 'DD/MM/YYYY'), v_codigo, m.numero, to_char(m.periodo_inicio, 'DD/MM/YYYY'),
      to_char(m.periodo_fim, 'DD/MM/YYYY'), public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.mc_planilha_itens where versao_id = m.versao_id and item_id = new.item_id and tipo = 'servico') then
    raise exception 'O item não é serviço na versão da planilha da %ª medição. Título não recebe lançamento', m.numero using errcode = 'P0001';
  end if;
  new.medicao_id := m.id;
  return new;
end $$;

-- Lista de lançamentos com o item e a medição, para a tela (RLS das tabelas vale: security_invoker).
create or replace view public.mc_v_lancamentos with (security_invoker = true) as
select l.id, l.contrato_id, l.medicao_id, m.numero as medicao_numero, m.status as medicao_status, l.item_id,
       pi.codigo, pi.descricao, pi.unidade, l.data, l.quantidade, l.km_inicial, l.km_final, l.estaca, l.local_texto,
       l.observacao, l.motivo_excesso, l.created_at, l.created_by, l.excluido_em, l.excluido_por, l.motivo_exclusao
from public.mc_lancamentos l
join public.mc_medicoes m on m.id = l.medicao_id
left join public.mc_planilha_itens pi on pi.versao_id = m.versao_id and pi.item_id = l.item_id;
grant select on public.mc_v_lancamentos to authenticated;

revoke all on function public.fn_mc_lancamento_gravar(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.fn_mc_medicao_sugestao(uuid) from public, anon;
revoke all on function public.fn_mc_medicao_abrir(uuid, date, date) from public, anon;
revoke all on function public.fn_mc_lancamento_salvar(uuid, jsonb, uuid) from public, anon;
revoke all on function public.fn_mc_lancamento_excluir(uuid, text) from public, anon;
revoke all on function public.fn_mc_lancamentos_colar(uuid, jsonb, boolean) from public, anon;
grant execute on function public.fn_mc_medicao_sugestao(uuid) to authenticated;
grant execute on function public.fn_mc_medicao_abrir(uuid, date, date) to authenticated;
grant execute on function public.fn_mc_lancamento_salvar(uuid, jsonb, uuid) to authenticated;
grant execute on function public.fn_mc_lancamento_excluir(uuid, text) to authenticated;
grant execute on function public.fn_mc_lancamentos_colar(uuid, jsonb, boolean) to authenticated;
```

- [ ] **Step 4:** aplicar por `apply_migration` (nome `mc_fase4a_lancamentos`), ler a versão real, gravar o arquivo com essa versão e texto idêntico (conferir md5). Advisors `security` e `performance` sem aviso novo.
- [ ] **Step 5:** rodar a prova: todos os casos esperados, 4q DIFERENTE. Mutação: numa cópia só na transação, trocar `v_acum > v_prevista` por `>=` e ver 4i (acumulado igual ao previsto) falhar; desfazer.
- [ ] **Step 6:** `database.types.ts` só com as entradas novas; `npx tsc --noEmit`. Commit `Medição Fase 4a: abrir medição e lançamento no banco (aplicadas) + prova`.

### Task 2: Anexo `mc_lancamento`

**Files:**
- Create: `supabase/migrations/<versão real>_mc_fase4b_anexo_lancamento.sql`
- Modify: `src/modules/_shared/anexos/entidades.ts` e o teste `entidades.test.ts` (ele compara o mapa TS com a última migration que recria a função)

**Interfaces:**
- Produces: tipo de entidade `mc_lancamento` → recurso `medicao.lancamentos`, rótulo "Lançamento da medição", contrato = `mc_lancamentos.contrato_id`.

- [ ] **Step 1:** teste de `entidades.test.ts` esperando `mc_lancamento` → `medicao.lancamentos`: FAIL.
- [ ] **Step 2:** migration que recria `public.fn_recurso_da_entidade` e `public.fn_mc_contrato_da_entidade` a partir da definição VIVA (`select pg_get_functiondef('public.fn_recurso_da_entidade(text)'::regprocedure)` e o mesmo para a outra, conferindo a assinatura real), acrescentando só o ramo `mc_lancamento` (decisoes.md: nunca recriar de cópia). Aplicar por `apply_migration`, versão real no nome, texto idêntico, advisors.
- [ ] **Step 3:** `entidades.ts` com a entrada nova; teste PASS. Conferir no banco (execute_sql, transação desfeita, como o Tiago com as permissões na transação): vincular um arquivo fictício a um lançamento de KL passa e a um lançamento de contrato fora da lista é recusado; se exigir montar dados, fazer como caso extra da prova da Task 1 (`4s_anexo`).
- [ ] **Step 4:** commit `Medição Fase 4b: foto do lançamento (anexo mc_lancamento)`.

### Task 3: Recursos `medicao.medicoes` e `medicao.lancamentos` + backfill

**Files:**
- Modify: `src/config/recursos.ts`, `src/modules/medicao/_shared/recursos.test.ts`
- Create: `supabase/migrations/<versão real>_mc_fase4c_permissoes.sql`

**Interfaces:**
- Produces: `{ id: "medicao.lancamentos", nome: "Lançamentos", acoes: ["ver","criar","editar","excluir"], rota: "/medicao/lancamentos" }` e `{ id: "medicao.medicoes", nome: "Medições", acoes: ["ver","criar"], rota: "/medicao/medicoes" }`, no formato das entradas vizinhas. Ordem das abas: Painel, Contratos, Planilha, Lançamentos, Medições, Boletim.

- [ ] **Step 1:** teste com a ordem e as ações: FAIL. **Step 2:** entradas: PASS.
- [ ] **Step 3:** migration no molde de `20260927182333_mc_fase3b_permissoes.sql` com as 6 ações novas; `$confere$` com 4 usuários e **68** linhas `medicao.%`. Pré-conferência (só leitura): 44 linhas, 4 usuários; se não, parar. Aplicar, versão real, md5, advisors, pós-conferência 68.
- [ ] **Step 4:** commit `Medição Fase 4c: recursos lançamentos e medições, backfill dos 4 Admins`.

### Task 4: Tela Medições (lista + abrir)

**Files:**
- Create: `src/modules/medicao/medicoes/{tipos,queries,actions,schemas}.ts`, `components/medicoes-tabela.tsx`, `components/abrir-medicao-drawer.tsx` (+ testes)
- Create: `src/app/(app)/medicao/medicoes/{page,loading}.tsx`

**Interfaces:**
- Produces: `carregarMedicoes(contratoId)` (lista: `mc_medicoes` + `mc_v_medicao_totais.valor` + contagem de lançamentos não excluídos, por número desc); `sugestaoMedicao(contratoId)` e `abrirMedicao({contratoId, inicio, fim})` (actions com `exigirPermissao("medicao.medicoes","criar")`, `idSchema`, datas `yyyy-mm-dd`, chamando as RPCs; erro do banco vira mensagem).
- Consumes: `FiltroContrato` de `src/modules/medicao/_shared/seletor-contrato.tsx`; `SeloMedicao` de `_shared/selo-medicao.tsx`; `periodoMedicao` de `boletim/formato.ts`.

- [ ] **Step 1:** testes de componente: a tabela mostra número, período, status (selo), valor (`MoneyText` do texto do banco) e lançamentos; o drawer abre com o período sugerido preenchido, permite editar, mostra o erro do banco ao gravar e fecha com sucesso. FAIL → implementar → PASS.
- [ ] **Step 2:** página com guarda `medicao.medicoes/ver`; botão "Abrir próxima medição" só com `criar`; linha clicável leva a `/medicao/lancamentos?contrato=<id>&medicao=<n>` quando o usuário tem `medicao.lancamentos/ver`.
- [ ] **Step 3:** commit `Medição: tela Medições com abrir próxima medição`.

### Task 5: Tela Lançamentos (lista, formulário, excluir, colar do Excel)

**Files:**
- Create: `src/modules/medicao/lancamentos/{tipos,queries,actions,schemas}.ts`, `colar.ts` + `colar.test.ts`, `components/lancamentos-tabela.tsx`, `components/lancamento-drawer.tsx`, `components/excluir-lancamento.tsx`, `components/colar-lancamentos.tsx` (+ testes)
- Create: `src/app/(app)/medicao/lancamentos/{page,loading}.tsx`

**Interfaces:**
- Produces `queries.ts`: `listarLancamentos(filtros: {contratoId, medicao?: number, de?: string, ate?: string, itemId?: string, busca?: string})` sobre `mc_v_lancamentos` (não excluídos, `todasAsLinhas`, ordem data desc, id); `servicosParaLancar(contratoId)`: para cada medição aberta do contrato, as linhas `tipo = 'servico'` da versão dela (`mc_v_planilha_linhas`, com `quantidade_prevista::text`), mais o período.
- Produces `actions.ts`: `salvarLancamento(input, id?)`, `excluirLancamento(id, motivo)`, `conferirColagem(contratoId, linhas)` e `gravarColagem(contratoId, linhas)` (RPC `fn_mc_lancamentos_colar` com `p_gravar` false/true). Resultado `{ ok: true, id } | { ok: false, erro, excesso: boolean }` (`excesso` quando `error.code === 'MCEXC'`).
- Produces `colar.ts` (puro, sem rede): `lerColagem(texto: string, servicos: ServicoParaLancar[], tipoLocalizacao: 'rodovia'|'texto'): { linhas: LinhaColada[]; erros: {linha: number; erro: string}[] }`. Colunas por posição: Data | Item | Quantidade | Km inicial | Km final | Estaca | Observação. Aceita cabeçalho na 1ª linha (detecta "Data" na 1ª célula), linhas em branco, tabulação sobrando; data `dd/mm/aaaa` (ou `aaaa-mm-dd`); número pt-BR (`1.234,5`) ou com ponto decimal (`1234.5`) pelo `normalizarNumeroDigitado` de `@/lib/numero-digitado`; resolve o código do item entre os serviços da medição aberta que contém a data; código ausente → erro da linha; código repetido entre serviços dessa versão → erro "Código repetido na planilha: lance esta linha pelo formulário"; data sem medição aberta → erro da linha. Nunca arredonda: a quantidade vai como texto normalizado.

- [ ] **Step 1: testes de `colar.ts`** com casos: bloco com cabeçalho; `10/09/2026` e `2026-09-10`; `1.234,5` → `"1234.5"`; `0,5` → `"0.5"`; célula vazia de km em rodovia → erro; código inexistente; código repetido; linha em branco ignorada; tabulação no fim; mais de 500 linhas → erro geral. FAIL → implementar → PASS. Mutação: tirar a detecção de código repetido e ver o teste falhar.
- [ ] **Step 2: página** com guarda `medicao.lancamentos/ver`: `FiltroContrato`, filtros medição / período / item / busca (URL); `DataTable` (data, item código + descrição, unid., quantidade `numeroExibicao`, km inicial a final ou estaca/local, observação, ícone de motivo de excesso, fotos, medição Nª); ações por linha editar/excluir só com a permissão e medição aberta. Sem medição aberta no contrato: aviso com link para Medições.
- [ ] **Step 3: formulário** (`FormDrawer`): serviço (combobox canônico dos serviços da medição aberta da data escolhida, mostrando código, descrição, unidade e previsto), data (padrão hoje), `InputQuantidade`, km inicial e final (obrigatórios em rodovia), estaca, local (texto), observação, `FilaFotosEArquivos` (fotos sobem com `subirFilaFotosEArquivos("mc_lancamento", id, fila)` depois de gravar; falha vira aviso). Quando a action volta `excesso`, o drawer mostra o alerta forte com a mensagem do banco e o campo "Motivo do excesso" e reenvia com o motivo, mantendo o resto. Testes de componente: excesso mostra o campo e reenvia com `motivo_excesso`; erro comum aparece; sucesso fecha.
- [ ] **Step 4: excluir** com motivo obrigatório (diálogo canônico de confirmação com campo), teste.
- [ ] **Step 5: colar** (`colar-lancamentos.tsx`): diálogo com área de colar, instrução das colunas, prévia (tabela com cada linha, erro do `lerColagem` e depois o `conferirColagem` do banco por linha), linhas com excesso pedem o motivo na própria linha (ou um motivo para todas), botão "Gravar N linhas" só sem erro; gravação chama `gravarColagem` e mostra o resultado. Teste de componente com colagem de 3 linhas, uma com erro do banco.
- [ ] **Step 6:** `npx vitest run src/modules/medicao`, `tsc`, lint, build. Commit `Medição: tela Lançamentos (formulário, excluir e colar do Excel)`.

### Task 6: Lançar pelo celular (`/m/medicao`)

**Files:**
- Create: `src/app/(campo)/m/medicao/page.tsx` (e `loading.tsx` se o padrão de `(campo)` tiver)
- Create: `src/modules/medicao/campo/components/lancar-campo.tsx` (+ teste)

**Interfaces:**
- Consumes: `salvarLancamento` e `servicosParaLancar` da Task 5; `BotaoTirarFoto` e `carimbarFotos` (`src/lib/carimbo-foto.ts`); `subirFilaFotosEArquivos` / `avisoDeFalhas`; o layout de `src/app/(campo)/layout.tsx` (sem AppShell).

- [ ] **Step 1:** página com guarda `medicao.lancamentos/criar` (padrão de `src/modules/manutencao/campo/permissao.ts`); contrato só perguntado quando o usuário tem mais de um com medição aberta.
- [ ] **Step 2:** formulário de uma coluna, dedos grandes: data (hoje), busca de serviço (código ou descrição), quantidade, km inicial e final (rodovia), estaca, observação, botão de foto com carimbo (data, hora, GPS). Sem sinal (`navigator.onLine === false` ou erro de rede): mensagem "Sem internet. Anote e lance quando tiver sinal", nada gravado. Excesso: mesmo fluxo do desktop (campo de motivo). Gravou: toast com "Lançado na Nª medição", fotos sobem depois; foto que falha vira aviso, sem regravar o lançamento; formulário limpa para o próximo, mantendo data e contrato.
- [ ] **Step 3:** testes de componente: grava e sobe as fotos com o id devolvido; foto que falha dá aviso e `salvarLancamento` foi chamado uma vez só; sem sinal não chama a action; excesso pede motivo.
- [ ] **Step 4:** link "Lançar pelo celular" na tela de Lançamentos (desktop) apontando para `/m/medicao`. Commit `Medição: lançar pelo celular com foto`.

### Task 7: Fechamento: docs, PR, merge, deploy, conferência

**Files:**
- Modify: `docs/decisoes.md` (entrada 2026-09-28: Fase 4, as 3 decisões do Tiago, as regras, migrations aplicadas, rulings do ledger), `/Users/tiagocameli/Desktop/personal-os/vault/projects/erp-emt/status.md` e `vault/log.md`.

- [ ] **Step 1:** portão completo; provas `mc_fase4_banco.sql` e `mc_fase3_banco.sql` de novo no banco vivo (a da Fase 3 tem de continuar verde); advisors.
- [ ] **Step 2:** revisão final do branch.
- [ ] **Step 3:** push, PR "Medição Fase 4: abrir medição e lançamento diário", CI verde, merge, deploy de produção `success`.
- [ ] **Step 4:** conferir em produção no navegador SEM gravar: abas Lançamentos e Medições aparecem; Medições do L09 lista as 10 aprovadas e o drawer "Abrir próxima medição" sugere 01/09 a 30/09/2026 (fechar sem gravar); Lançamentos sem medição aberta mostra o aviso; `/m/medicao` abre. Abrir a 11ª e lançar de verdade é do Tiago.
