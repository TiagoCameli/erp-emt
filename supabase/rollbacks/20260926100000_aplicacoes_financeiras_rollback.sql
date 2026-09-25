-- Rollback de 20260926100000_aplicacoes_financeiras.
-- ANTES: rode o rollback da abertura (20260926120000) e exclua as posicoes
-- pela aba. Este arquivo recusa se ainda houver lancamento de origem aplicacao.
do $pre$
begin
  if exists (select 1 from public.lancamentos where origem = 'aplicacao') then
    raise exception 'Ha lancamento de origem aplicacao: desfaca a abertura e exclua as posicoes antes';
  end if;
end $pre$;

-- travas: tira o bloco inserido nas tres funcoes
do $travas$
declare v_def text; v_fn text; v_bloco text;
begin
  select pg_get_functiondef('public.fn_estornar_pagamento(uuid)'::regprocedure) into v_def;
  v_bloco := E'\n  if exists (select 1 from public.lancamentos l join public.lancamento_parcelas lp on lp.lancamento_id = l.id where lp.id = p_parcela_id and l.origem = ''aplicacao'') then\n    raise exception ''Nao da para estornar: este lancamento foi gerado pela posicao da aplicacao. Regrave ou exclua a posicao em Financeiro > Aplicacoes'';\n  end if;';
  execute replace(v_def, v_bloco, '');
  v_bloco := E'\n  if exists (select 1 from public.lancamentos l where l.id = p_lanc_id and l.origem = ''aplicacao'') then\n    raise exception ''Nao da para mexer aqui: este lancamento foi gerado pela posicao da aplicacao. Regrave ou exclua a posicao em Financeiro > Aplicacoes'';\n  end if;';
  foreach v_fn in array array[
    'public.fn_definir_rateio_lancamento(uuid, jsonb, text)',
    'public.fn_definir_parcelas_lancamento(uuid, jsonb, text)'
  ] loop
    select pg_get_functiondef(v_fn::regprocedure) into v_def;
    execute replace(v_def, v_bloco, '');
  end loop;

  select pg_get_functiondef('public.fn_extrato_conta(uuid, boolean)'::regprocedure) into v_def;
  execute replace(v_def,
    'and (coalesce(cf.natureza, ''operacional'') <> ''movimentacao'' or l.origem = ''aplicacao'')',
    'and coalesce(cf.natureza, ''operacional'') <> ''movimentacao''');
end $travas$;

-- saldo e DRE: texto anterior (20260822210000 e 20260828143348)
create or replace function public.fn_rel_posicao_bancaria()
 returns table(conta_bancaria_id uuid, tipo text, total numeric)
 language sql stable set search_path to ''
as $function$
  select p.conta_bancaria_id, l.tipo, sum(p.valor_liquido) as total
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  left join public.categorias_financeiras cf on cf.id = l.categoria_id
  join public.contas_bancarias c on c.id = p.conta_bancaria_id
  where p.status = 'pago'
    and p.conta_bancaria_id is not null
    and l.status <> 'cancelado'
    and coalesce(cf.natureza, 'operacional') <> 'movimentacao'
    and (c.saldo_inicial_data is null or p.data_pagamento is null or p.data_pagamento > c.saldo_inicial_data)
  group by p.conta_bancaria_id, l.tipo
  union all
  select t.conta_destino_id, 'transferencia_entrada', sum(t.valor)
  from public.transferencias_contas t
  join public.contas_bancarias c on c.id = t.conta_destino_id
  where c.saldo_inicial_data is null or t.data_transferencia > c.saldo_inicial_data
  group by t.conta_destino_id
  union all
  select t.conta_origem_id, 'transferencia_saida', sum(t.valor + t.tarifa)
  from public.transferencias_contas t
  join public.contas_bancarias c on c.id = t.conta_origem_id
  where c.saldo_inicial_data is null or t.data_transferencia > c.saldo_inicial_data
  group by t.conta_origem_id
$function$;

create or replace function public.fn_rel_dre(p_inicio date, p_fim date)
 returns table(tipo text, categoria_id uuid, categoria text, natureza text, total numeric)
 language sql stable set search_path to ''
as $function$
  select l.tipo, c.id as categoria_id, c.nome as categoria,
    coalesce(c.natureza, 'operacional') as natureza, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.categorias_financeiras c on c.id = coalesce(r.categoria_id, l.categoria_id)
  where l.status <> 'cancelado'
    and l.mes_competencia >= date_trunc('month', p_inicio)::date
    and l.mes_competencia < p_fim
  group by l.tipo, c.id, c.nome, c.natureza
$function$;

create or replace function public.fn_recurso_da_entidade(p_tipo text)
 returns text language sql immutable set search_path to ''
as $function$
  select case p_tipo
    when 'cotacao'        then 'compras.cotacoes'
    when 'ordem_compra'   then 'compras.ordens'
    when 'lancamento'     then 'financeiro.lancamentos'
    when 'pagamento'      then 'financeiro.pagamentos'
    when 'rh_documento'   then 'rh.documentos'
    when 'rh_epi'         then 'rh.epis'
    when 'rh_ocorrencia'  then 'rh.ocorrencias'
    when 'equipamento_documento' then 'cadastros.equipamentos'
    when 'frete'          then 'frete.fretes'
    when 'frete_chegada'  then 'frete.fretes'
    when 'frete_pagamento' then 'frete.pagamentos'
    when 'pedido_material' then 'frete.pedidos-material'
    when 'combustivel_entrada' then 'combustivel.entradas'
    when 'combustivel_saida' then 'combustivel.saidas'
    when 'combustivel_transferencia' then 'combustivel.transferencias'
    when 'manutencao_os'  then 'manutencao.servicos'
    else null
  end;
$function$;

drop trigger if exists trg_transferencia_recalcula_aplicacao on public.transferencias_contas;
drop function if exists public.fn_transferencia_recalcula_aplicacao();
drop function if exists public.fn_aba_aplicacoes(date, date);
drop function if exists public.fn_cdi_mensal_manual(date, numeric);
drop function if exists public.fn_cdi_gravar(jsonb, jsonb);
drop function if exists public.fn_salvar_aplicacao(uuid, uuid, uuid, text, text, numeric, text, smallint, date, date, text, boolean, text);
drop function if exists public.fn_excluir_posicao_aplicacao(uuid, text);
drop function if exists public.fn_simular_posicao_aplicacao(uuid, date, numeric);
drop function if exists public.fn_salvar_posicao_aplicacao(uuid, date, numeric, numeric, numeric, numeric, text);
drop function if exists public.fn_aplicacao_recalcular(uuid, date);
drop function if exists public.fn_aplicacao_sincronizar_posicao(uuid);

delete from public.anexo_vinculos where entidade_tipo = 'aplicacao_posicao';
drop table if exists public.aplicacao_posicoes;
drop table if exists public.aplicacoes;
drop table if exists public.cdi_diario;
drop table if exists public.cdi_mensal;

delete from public.usuario_permissoes where recurso = 'financeiro.aplicacoes';
delete from public.perfil_permissoes where recurso = 'financeiro.aplicacoes';

drop index if exists public.lancamentos_um_por_posicao_de_aplicacao;
alter table public.lancamentos drop constraint lancamentos_origem_check;
alter table public.lancamentos add constraint lancamentos_origem_check
  check (origem = any (array[
    'oc', 'manual', 'diaria', 'folha', 'folha_guia', 'adiantamento', 'rescisao',
    'decimo_terceiro', 'ferias', 'decimo_terceiro_guia', 'ferias_guia'
  ]));

delete from public.categorias_financeiras
 where id in ('9feb495d-3d71-48b6-b509-2c798cb45e19', 'd0157304-467a-4def-81fd-09660a0e02af');
