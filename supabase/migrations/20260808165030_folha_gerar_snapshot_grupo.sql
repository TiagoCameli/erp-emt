-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808165030 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 4 do Bloco 8a, parte 2 de 4.
--
-- fn_gerar_folha congela o grupo de recolhimento no snapshot do encargo.
--
-- A fn tem 169 linhas de dinheiro (INSS progressivo, IRRF min(completo,
-- simplificado), rateio de centro de custo). Redigitar tudo para mudar duas
-- linhas é como se perde uma delas, então a recriação é CIRÚRGICA: parte da
-- própria pg_get_functiondef e troca só os dois trechos do loop de encargos.
--
-- O md5 da versão viva está fixado abaixo (lido no Step 5). Se a fn em produção
-- não for exatamente aquela, a migration aborta em vez de escrever por cima de
-- uma versão que alguém mudou no meio do caminho. Por isso este arquivo é
-- registro do que rodou, não fonte de reaplicação: rodar de novo aborta no md5.
--
-- Prova do diff (conferida na aplicação): 169 linhas antes e depois, 9020 -> 9086
-- caracteres (+66, exatamente o que os dois trechos crescem), e desfazer as duas
-- trocas na fn recriada devolve o md5 578cedc0776cff206c7d15a4a9206af6 da
-- original. Só as linhas 142, 145 e 146 mudaram.
--
-- A guarda de status ('só da para gerar em rascunho') JÁ foi corrigida na
-- 20260808150538: aqui ela é só CONFERIDA, não reescrita, para não duplicar.
do $$
declare
  v_def text;
  v_novo text;
  v_reverso text;
  v_delta_esperado integer;
  -- Alvo 1: o select do loop passa a trazer o grupo.
  c_sel_antes constant text :=
    'select nome, percentual from public.folha_encargos where ativo order by nome';
  c_sel_depois constant text :=
    'select nome, percentual, grupo_recolhimento from public.folha_encargos where ativo order by nome';
  -- Alvo 2: o insert do snapshot passa a gravar o grupo.
  c_ins_antes constant text :=
    'insert into public.folha_item_encargos (folha_item_id, nome, percentual, valor)
      values (v_item_id, v_enc.nome, v_enc.percentual, v_valor);';
  c_ins_depois constant text :=
    'insert into public.folha_item_encargos (folha_item_id, nome, percentual, valor, grupo_recolhimento)
      values (v_item_id, v_enc.nome, v_enc.percentual, v_valor, v_enc.grupo_recolhimento);';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  if v_def is null then
    raise exception 'fn_gerar_folha nao encontrada';
  end if;

  if md5(v_def) <> '578cedc0776cff206c7d15a4a9206af6' then
    raise exception 'fn_gerar_folha viva nao e a lida no Step 5 (md5 %, esperado 578cedc0776cff206c7d15a4a9206af6): reler antes de recriar',
      md5(v_def);
  end if;

  -- A guarda de status corrigida tem que estar presente, e a antiga ausente.
  if position('só da para gerar em rascunho' in v_def) = 0 then
    raise exception 'fn_gerar_folha sem a guarda de rascunho: nao aplicar por cima';
  end if;
  if position('ja esta fechada' in v_def) > 0 then
    raise exception 'fn_gerar_folha ainda tem a guarda antiga de folha fechada';
  end if;

  -- Cada alvo aparece exatamente uma vez: replace() sem ambiguidade.
  if (length(v_def) - length(replace(v_def, c_sel_antes, ''))) / length(c_sel_antes) <> 1 then
    raise exception 'o select do loop de encargos nao aparece exatamente 1 vez na fn viva';
  end if;
  if (length(v_def) - length(replace(v_def, c_ins_antes, ''))) / length(c_ins_antes) <> 1 then
    raise exception 'o insert do snapshot de encargo nao aparece exatamente 1 vez na fn viva';
  end if;

  v_novo := replace(replace(v_def, c_sel_antes, c_sel_depois), c_ins_antes, c_ins_depois);

  -- O tamanho só pode crescer o que os dois trechos crescem (66 caracteres:
  -- 20 no select, 20 na lista de colunas e 26 no values). Qualquer outra
  -- diferença é replace() pegando algo que não devia.
  v_delta_esperado := (length(c_sel_depois) - length(c_sel_antes))
                    + (length(c_ins_depois) - length(c_ins_antes));
  if v_delta_esperado <> 66 then
    raise exception 'delta esperado saiu % em vez de 66: revisar os literais', v_delta_esperado;
  end if;
  if length(v_novo) - length(v_def) <> v_delta_esperado then
    raise exception 'a fn nova cresceu % caracteres em vez de %',
      length(v_novo) - length(v_def), v_delta_esperado;
  end if;

  execute v_novo;

  -- Prova final: desfazer as duas trocas na fn recriada tem que devolver, byte a
  -- byte, a original do Step 5. Fecha a porta para qualquer alteração colateral.
  select pg_get_functiondef(p.oid) into v_reverso
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  v_reverso := replace(replace(v_reverso, c_sel_depois, c_sel_antes), c_ins_depois, c_ins_antes);

  if md5(v_reverso) <> '578cedc0776cff206c7d15a4a9206af6' then
    raise exception 'fn_gerar_folha recriada difere da original em algo alem do snapshot do grupo (md5 reverso %)',
      md5(v_reverso);
  end if;
end $$;

-- Trava fail-closed: o snapshot do grupo realmente está no corpo da fn.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_gerar_folha'
      and pg_get_functiondef(p.oid) like '%v_enc.grupo_recolhimento%'
  ) then
    raise exception 'fn_gerar_folha nao grava grupo_recolhimento no snapshot';
  end if;
end $$;

-- Rollback: o mesmo bloco com c_sel_antes/c_sel_depois e c_ins_antes/c_ins_depois
-- trocados de lugar (e o md5 esperado passando a ser
-- ee9dea65bdb0bb9e04179eb308a44c2c, o da versão com snapshot).
