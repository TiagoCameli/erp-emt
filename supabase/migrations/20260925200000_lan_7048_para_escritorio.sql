-- =============================================================
-- LAN-2026-7048 "DEBITO AUTORIZADO" sai do CC Investimentos e vai para o
-- Escritorio Central
--
-- PEDIDO DO TIAGO (25/09/2026): "reclassifique o LAN-2026-7048 como despesa do
-- escritorio".
--
-- Ficou de fora da conversao das aplicacoes (20260925192000) de proposito: e um
-- debito de R$ 19.519,44 em 29/05, coberto por um resgate automatico do mesmo
-- valor no mesmo dia. O resgate era movimentacao e virou transferencia; o debito
-- e despesa de verdade, e ficou esperando a decisao de onde ela mora.
--
-- O QUE MUDA: o unico rateio (100%) troca de centro, Investimentos -> Escritorio
-- Central. Categoria ("Outras despesas", operacional), valor, status (pago) e
-- conta ficam iguais. Saldo bancario nao se mexe: pago antes do corte da Caixa.
--
-- COMPETENCIA FECHADA: maio/2026 foi fechado pelo Tiago em 14/08/2026. Esta
-- migration aumenta em R$ 19.519,44 o custo do Escritorio Central em maio, a
-- pedido dele e sabendo do fechamento. Nada mais daquele mes muda (conferido
-- abaixo: a migration aborta se outro centro mudar).
-- =============================================================

do $reclassifica$
declare
  v_lanc uuid;
  v_invest uuid;
  v_escritorio uuid;
  v_trocados int;
  v_custo_antes jsonb;
  v_custo_depois jsonb;
  v_mudados jsonb;
begin
  select id into v_lanc from public.lancamentos
  where numero = 'LAN-2026-7048' and tipo = 'a_pagar' and valor = 19519.44;
  select id into v_invest from public.centros_custo
  where nivel = 1 and tipo = 'investimento' and nome = 'Investimentos';
  select id into v_escritorio from public.centros_custo
  where nivel = 1 and tipo = 'escritorio' and nome = 'Escritório Central';

  if v_lanc is null or v_invest is null or v_escritorio is null then
    raise exception 'Faltou o lancamento (%), o centro Investimentos (%) ou o Escritorio Central (%)',
      v_lanc, v_invest, v_escritorio;
  end if;

  select jsonb_object_agg(cc.nome, t.total) into v_custo_antes from (
    select r.centro_custo_id, sum(r.valor) as total
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where l.status <> 'cancelado' and l.tipo = 'a_pagar'
    group by 1) t
    join public.centros_custo cc on cc.id = t.centro_custo_id;

  update public.lancamento_rateios
  set centro_custo_id = v_escritorio
  where lancamento_id = v_lanc and centro_custo_id = v_invest;
  get diagnostics v_trocados = row_count;

  if v_trocados <> 1 then
    raise exception 'Esperava trocar 1 rateio e troquei %', v_trocados;
  end if;

  update public.lancamentos
  set observacoes = concat_ws(E'\n', nullif(observacoes, ''),
    'Reclassificado em 25/09/2026 a pedido do Tiago: do CC Investimentos para o Escritorio Central (debito coberto por resgate automatico; o resgate virou transferencia da subconta).')
  where id = v_lanc;

  select jsonb_object_agg(cc.nome, t.total) into v_custo_depois from (
    select r.centro_custo_id, sum(r.valor) as total
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where l.status <> 'cancelado' and l.tipo = 'a_pagar'
    group by 1) t
    join public.centros_custo cc on cc.id = t.centro_custo_id;

  select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_mudados
  from (select jsonb_object_keys(v_custo_antes) as k
        union select jsonb_object_keys(v_custo_depois)) ks
  where (v_custo_antes->>k) is distinct from (v_custo_depois->>k);

  if v_mudados <> '["Escritório Central", "Investimentos"]'::jsonb then
    raise exception 'Esperava mudar so Escritorio Central e Investimentos, e mudou: %', v_mudados;
  end if;
  if (v_custo_depois->>'Escritório Central')::numeric - (v_custo_antes->>'Escritório Central')::numeric <> 19519.44 then
    raise exception 'O Escritorio Central devia subir R$ 19.519,44';
  end if;
end $reclassifica$;
