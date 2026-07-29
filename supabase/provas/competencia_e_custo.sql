-- Prova de aceite dos blocos 2 e 3: competência fechada e custo por competência.
--
-- Roda contra o banco vivo, cria a própria massa ([PROVA-COMP] nas observações),
-- verifica cada regra e apaga o que criou. Pode rodar quantas vezes quiser.
-- Cobre:
--
--   1. fechar competência marca o mês
--   2. fechar duas vezes não duplica
--   3. mês que ainda não começou não fecha
--   4. lançar em mês fechado por quem pode reabrir registra a EXCEÇÃO na trilha
--   5. quem NÃO pode reabrir é barrado ao lançar em mês fechado
--   5b. reabrir exige a permissão
--   6. reabrir exige motivo
--   7. reabrir libera o mês, e o motivo fica na trilha
--   8. o painel mostra situação, exceções e reaberturas do mês
--   9. custo por centro de custo respeita o MÊS DE REFERÊNCIA (bloco 3)
--   9c. série por mês vê o mês certo
--   9d. sem período, soma todos os meses (acumulado)
--
-- ATENÇÃO: o caso 5 remove temporariamente a permissão 'desaprovar' de
-- financeiro.competencias do usuário da prova e a devolve em seguida. Se a prova
-- abortar no meio, confira a permissão do usuário antes de seguir.
--
-- IMPORTANTE: as funções checam tem_permissao(), que depende de auth.uid().
-- Rodando fora de uma sessão autenticada (SQL editor, MCP), o bloco abaixo
-- assume o primeiro usuário ativo com financeiro.competencias:aprovar.

do $prova$
declare v_usuario uuid;
begin
  select u.id into v_usuario from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo and up.recurso = 'financeiro.competencias' and up.acao = 'aprovar' limit 1;
  if v_usuario is null then raise exception 'Nenhum usuario com financeiro.competencias:aprovar'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, false);
end $prova$;

create temp table if not exists prova_comp (
  ordem int generated always as identity,
  caso text, esperado text, obtido text, passou boolean
);
truncate prova_comp;

do $prova$
declare
  v_forn uuid; v_ins uuid; v_cc uuid; v_cond uuid; v_pix uuid;
  v_oc uuid; v_lanc uuid;
  v_mes date := '2026-05-01';
  v_txt text; v_num numeric; v_int int; v_bool boolean;
  v_antes int; v_depois int;
begin
  select id into v_forn from public.fornecedores where ativo order by razao_social limit 1;
  select id into v_ins from public.insumos where ativo order by nome limit 1;
  select id into v_cc from public.centros_custo where ativo order by codigo nulls last limit 1;
  select id into v_cond from public.condicoes_pagamento where ativo order by descricao limit 1;
  select id into v_pix from public.formas_pagamento where tipo='bancario' and ativo order by nome limit 1;

  delete from public.competencia_eventos where mes = v_mes;
  delete from public.competencias_fechadas where mes = v_mes;

  perform public.fn_fechar_competencia(v_mes, 'prova de aceite');
  select public.fn_competencia_fechada(v_mes) into v_bool;
  insert into prova_comp (caso, esperado, obtido, passou)
  values ('1. fechar competencia marca o mes', 'true', v_bool::text, v_bool);

  perform public.fn_fechar_competencia(v_mes, 'de novo');
  select count(*)::int into v_int from public.competencias_fechadas where mes = v_mes;
  insert into prova_comp (caso, esperado, obtido, passou)
  values ('2. fechar duas vezes nao duplica', '1', v_int::text, v_int = 1);

  begin
    perform public.fn_fechar_competencia('2099-01-01', null);
    insert into prova_comp (caso, esperado, obtido, passou)
    values ('3. fechar mes que nao comecou', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_comp (caso, esperado, obtido, passou)
    values ('3. fechar mes que nao comecou', 'recusado', left(sqlerrm, 40), true);
  end;

  select count(*)::int into v_antes from public.competencia_eventos
  where mes = v_mes and tipo = 'excecao';

  v_oc := public.fn_criar_ordem_compra(
    jsonb_build_object('fornecedor_id', v_forn, 'condicao_pagamento_id', v_cond,
      'forma_pagamento_id', v_pix, 'data_compra', '2026-05-20',
      'mes_competencia', v_mes, 'observacoes', '[PROVA-COMP] em mes fechado'),
    jsonb_build_array(jsonb_build_object('insumo_id', v_ins, 'quantidade', 10,
      'preco_unitario', 20.00, 'centro_custo_id', v_cc))
  );

  select count(*)::int into v_depois from public.competencia_eventos
  where mes = v_mes and tipo = 'excecao';
  insert into prova_comp (caso, esperado, obtido, passou)
  values ('4. excecao de mes fechado fica na trilha', (v_antes + 1)::text,
          v_depois::text, v_depois = v_antes + 1);

  delete from public.usuario_permissoes
  where usuario_id = (select auth.uid()) and recurso = 'financeiro.competencias'
    and acao = 'desaprovar';

  begin
    perform public.fn_criar_ordem_compra(
      jsonb_build_object('fornecedor_id', v_forn, 'condicao_pagamento_id', v_cond,
        'forma_pagamento_id', v_pix, 'data_compra', '2026-05-21',
        'mes_competencia', v_mes, 'observacoes', '[PROVA-COMP] barrada'),
      jsonb_build_array(jsonb_build_object('insumo_id', v_ins, 'quantidade', 1,
        'preco_unitario', 1.00, 'centro_custo_id', v_cc))
    );
    insert into prova_comp (caso, esperado, obtido, passou)
    values ('5. sem permissao de reabrir, mes fechado barra', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_comp (caso, esperado, obtido, passou)
    values ('5. sem permissao de reabrir, mes fechado barra', 'recusado',
            left(sqlerrm, 45), sqlerrm ilike '%fechada%');
  end;

  begin
    perform public.fn_reabrir_competencia(v_mes, 'sem permissao');
    insert into prova_comp (caso, esperado, obtido, passou)
    values ('5b. reabrir sem permissao', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_comp (caso, esperado, obtido, passou)
    values ('5b. reabrir sem permissao', 'recusado', left(sqlerrm, 40), true);
  end;

  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  values ((select auth.uid()), 'financeiro.competencias', 'desaprovar');

  begin
    perform public.fn_reabrir_competencia(v_mes, '   ');
    insert into prova_comp (caso, esperado, obtido, passou)
    values ('6. reabrir sem motivo', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_comp (caso, esperado, obtido, passou)
    values ('6. reabrir sem motivo', 'recusado', left(sqlerrm, 40), true);
  end;

  perform public.fn_reabrir_competencia(v_mes, 'prova: reabrindo para corrigir custo');
  select public.fn_competencia_fechada(v_mes) into v_bool;
  insert into prova_comp (caso, esperado, obtido, passou)
  values ('7. reabrir libera o mes', 'false', v_bool::text, v_bool = false);

  select motivo into v_txt from public.competencia_eventos
  where mes = v_mes and tipo = 'reabriu' order by created_at desc limit 1;
  insert into prova_comp (caso, esperado, obtido, passou)
  values ('7b. motivo da reabertura na trilha', 'prova: reabrindo para corrigir custo',
          coalesce(v_txt, 'nulo'), v_txt = 'prova: reabrindo para corrigir custo');

  select fechada, excecoes, reaberturas into v_bool, v_int, v_depois
  from public.fn_competencias_painel(24) where mes = v_mes;
  insert into prova_comp (caso, esperado, obtido, passou)
  values ('8. painel: mes aberto, 1 excecao, 1 reabertura', 'false/1/1',
          coalesce(v_bool::text,'?') || '/' || coalesce(v_int::text,'?') || '/' || coalesce(v_depois::text,'?'),
          v_bool = false and v_int = 1 and v_depois = 1);

  update public.ordens_compra set status = 'pendente_aprovacao' where id = v_oc;
  perform public.fn_aprovar_ordem_compra(v_oc);
  select id into v_lanc from public.lancamentos where origem_id = v_oc and origem = 'oc';

  select coalesce(sum(total), 0) into v_num
  from public.fn_rel_custo_centro_custo('2026-05-01', '2026-06-01');
  insert into prova_comp (caso, esperado, obtido, passou)
  values ('9. custo de 05/2026 pelo mes de referencia', '200.00', v_num::text, v_num = 200.00);

  select coalesce(sum(total), 0) into v_num
  from public.fn_rel_custo_centro_custo('2026-06-01', '2026-07-01');
  insert into prova_comp (caso, esperado, obtido, passou)
  values ('9b. custo de 06/2026 nao ve a compra de maio', '0', v_num::text, v_num = 0);

  select total into v_num from public.fn_rel_custo_por_mes(24) where mes = v_mes;
  insert into prova_comp (caso, esperado, obtido, passou)
  values ('9c. serie por mes tem 05/2026', '200.00', coalesce(v_num::text,'nulo'), v_num = 200.00);

  select coalesce(sum(total), 0) into v_num
  from public.fn_rel_custo_centro_custo(null, null);
  insert into prova_comp (caso, esperado, obtido, passou)
  values ('9d. sem periodo soma todos os meses (>= 200)', 'true', (v_num >= 200)::text, v_num >= 200);

  delete from public.anexo_vinculos where entidade_id in (
    select id from public.lancamento_parcelas where lancamento_id = v_lanc);
  delete from public.lancamento_parcelas where lancamento_id = v_lanc;
  delete from public.lancamento_rateios where lancamento_id = v_lanc;
  delete from public.anexo_vinculos where entidade_id = v_lanc;
  delete from public.lancamentos where id = v_lanc;
  delete from public.oc_parcelas where ordem_compra_id = v_oc;
  delete from public.oc_itens where ordem_compra_id = v_oc;
  delete from public.anexo_vinculos where entidade_id = v_oc;
  delete from public.ordens_compra where id = v_oc;
  delete from public.competencia_eventos where mes = v_mes;
  delete from public.competencias_fechadas where mes = v_mes;
end $prova$;

select caso, esperado, obtido, case when passou then 'PASSOU' else 'FALHOU' end as resultado
from prova_comp order by ordem;
