-- Conserto de ambiguidade: fn_rel_custo_centro_custo ficou com DUAS sobrecargas.
--
-- COMO ACONTECEU, e vale registrar porque é uma armadilha que não falha no build:
-- a versão de 4 parâmetros (p_centro_custo, p_categoria) foi aplicada no banco vivo
-- pelo painel de Gestão (`painel-filtros`, mergeado no main em 14/08/2026) DEPOIS
-- que este trabalho leu a função e ANTES da migration 20260814140000 rodar. A 140000
-- criou uma de 6 parâmetros sem saber da de 4.
--
-- Com duas sobrecargas de mesmo prefixo e TODOS os argumentos com default, a chamada
-- por nome que o PostgREST faz fica ambígua:
--   ERROR 42725: function fn_rel_custo_centro_custo(unknown, unknown) is not unique
--   HINT: Could not choose a best candidate function.
-- Isso quebra o relatório em RUNTIME, com o build e os testes passando — o mesmo
-- feitio do gotcha de embed ambíguo do PostgREST (HTTP 300) já registrado em
-- docs/decisoes.md.
--
-- CONSERTO: UMA função só, com a UNIÃO dos parâmetros, na ordem da de 4 primeiro,
-- para não quebrar chamada posicional nem por nome de nenhum dos dois lados
-- (Gestão manda p_centro_custo/p_categoria; o relatório do Financeiro manda
-- p_fornecedor/p_excluir_previsto/p_tipo_centro).
--
-- REGRA daqui pra frente: esta função tem que ter UMA sobrecarga só. Duas com todos
-- os args opcionais é ambiguidade garantida.

drop function if exists public.fn_rel_custo_centro_custo(date, date, uuid, uuid);
drop function if exists public.fn_rel_custo_centro_custo(date, date, uuid, uuid, boolean, text);

create function public.fn_rel_custo_centro_custo(
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null,
  p_categoria uuid default null,
  p_fornecedor uuid default null,
  p_excluir_previsto boolean default false,
  p_tipo_centro text default null
)
returns table (centro_custo_id uuid, nome text, codigo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  select r.centro_custo_id, cc.nome, cc.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.centros_custo cc on cc.id = r.centro_custo_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    -- Previsto continua DENTRO por padrão: é o comportamento histórico, e a base
    -- tem 0 previsto hoje, então inverter o padrão mudaria um número de dinheiro de
    -- forma invisível agora e visível no primeiro previsto lançado.
    and (not coalesce(p_excluir_previsto, false) or l.status <> 'previsto')
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
    and (p_centro_custo is null or r.centro_custo_id = p_centro_custo)
    and (p_categoria is null or l.categoria_id = p_categoria)
    and (p_fornecedor is null or l.fornecedor_id = p_fornecedor)
    and (p_tipo_centro is null or cc.tipo = p_tipo_centro)
  group by r.centro_custo_id, cc.nome, cc.codigo
$function$;

comment on function public.fn_rel_custo_centro_custo(date, date, uuid, uuid, uuid, boolean, text) is
  'Custo por centro de custo em regime de competencia. Uniao das sobrecargas: serve o painel de Gestao (p_centro_custo, p_categoria) e o relatorio do Financeiro (p_fornecedor, p_excluir_previsto, p_tipo_centro). Manter UMA sobrecarga so: duas com todos os args opcionais deixam a chamada por nome ambigua e quebram em runtime.';

revoke all on function public.fn_rel_custo_centro_custo(date, date, uuid, uuid, uuid, boolean, text) from public;
grant execute on function public.fn_rel_custo_centro_custo(date, date, uuid, uuid, uuid, boolean, text) to authenticated;
