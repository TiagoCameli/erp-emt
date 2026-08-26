-- Extrato de conta bancária: uma linha por movimento de dinheiro.
--
-- É a GÊMEA DETALHADA de `fn_rel_posicao_bancaria`. Aquela devolve o total já
-- somado (uma linha por conta e tipo); esta devolve UMA LINHA POR MOVIMENTO,
-- com exatamente o mesmo WHERE, copiado dela. Isso não é gosto de arquitetura:
-- a coluna "Saldo atual" da listagem de contas sai da RPC agregada, e é ela que
-- é conferida contra o extrato do banco. Se o critério de "o que compõe o
-- saldo" divergir entre as duas funções, a tela de extrato fecha num saldo
-- diferente do que a listagem mostra na linha de cima, e nenhum erro aparece
-- em lugar nenhum.
--
-- Por que no banco e não em TypeScript com PostgREST: dois dos filtros não se
-- escrevem em PostgREST sem mentir.
--   1. `coalesce(cf.natureza,'operacional') <> 'movimentacao'` tem que INCLUIR
--      lançamento sem categoria; um `neq` em embed opcional descarta a linha
--      com o lado nulo, e o documento inteiro desaparece calado.
--   2. o corte por `saldo_inicial_data` compara coluna de DUAS tabelas
--      (parcela x conta), que embed nenhum expressa.
-- A regra do dinheiro tem que ser uma só, e ela mora aqui.
--
-- O QUE ENTRA, e de onde veio cada pedaço de fn_rel_posicao_bancaria:
--   parcela paga  -> a_receber é entrada, a_pagar é saída, no `valor_liquido`
--                    (valor - desconto + juros + outras_despesas), fora
--                    lançamento cancelado e fora natureza 'movimentacao'
--                    (aplicação/resgate do principal não mexem no saldo:
--                    o saldo inicial já vem do extrato com o aplicado dentro).
--   transferência -> entrada na conta de destino pelo `valor`; saída na conta de
--                    origem pelo `valor`, MAIS uma linha separada de `tarifa`.
--                    A agregada soma `valor + tarifa` numa parcela só; aqui as
--                    duas viram linhas distintas porque num extrato tarifa é um
--                    lançamento à parte. A SOMA é a mesma, e é isso que importa.
--
-- `no_saldo` é a resposta a "este movimento está dentro do saldo atual?". Ele é
-- false só no movimento ANTERIOR à data de corte da conta, que já está
-- representado pelo saldo de abertura e por isso não pode ser somado de novo.
-- Ele vem como coluna, e não como filtro escondido, porque uma tela que omite
-- 5.573 pagamentos sem dizer que omitiu é o mesmo defeito que a data de corte
-- veio consertar.
--
-- `p_incluir_anteriores` existe por VOLUME, não por regra: na BB 102.124-9 o
-- movimento anterior ao corte são 5.573 parcelas mais 313 transferências, e
-- carregar isso na abertura da tela custa segundos por nada, já que o padrão da
-- tela é o movimento que forma o saldo. Ligado, a função devolve o histórico
-- inteiro, e as linhas antigas vêm marcadas com `no_saldo = false`.

create or replace function public.fn_extrato_conta(
  p_conta uuid,
  p_incluir_anteriores boolean default false
)
returns table (
  -- Chave estável da linha, para o React e para o desempate da ordenação. Uma
  -- transferência com tarifa gera DUAS linhas com o mesmo id de origem, então o
  -- id sozinho não identifica movimento.
  chave text,
  tipo_movimento text,
  -- Null na transferência e na tarifa: elas não têm página de detalhe para onde
  -- a linha possa levar.
  lancamento_id uuid,
  data_movimento date,
  sentido text,
  -- SEMPRE positivo. O sinal é `sentido`, para a tela poder somar entrada e
  -- saída separadamente sem ter que adivinhar de qual lado o número está.
  valor numeric,
  no_saldo boolean,
  numero text,
  numero_documento text,
  descricao text,
  categoria_nome text,
  contraparte text,
  parcela text
)
language sql
stable
set search_path to ''
as $function$
  with conta as (
    select c.id, c.saldo_inicial_data
    from public.contas_bancarias c
    where c.id = p_conta
  ),
  movimentos as (
    -- Parcelas pagas nesta conta.
    select
      'parcela:' || p.id::text as chave,
      'parcela'::text as tipo_movimento,
      l.id as lancamento_id,
      p.data_pagamento as data_movimento,
      case when l.tipo = 'a_receber' then 'entrada' else 'saida' end as sentido,
      p.valor_liquido as valor,
      (
        co.saldo_inicial_data is null
        or p.data_pagamento is null
        or p.data_pagamento > co.saldo_inicial_data
      ) as no_saldo,
      l.numero as numero,
      l.numero_documento as numero_documento,
      l.descricao as descricao,
      cf.nome as categoria_nome,
      -- Quem está do outro lado do dinheiro. A ordem repete a das telas:
      -- fornecedor (fantasia, senão razão social), depois cliente no a receber,
      -- depois colaborador quando o lançamento vem da folha.
      coalesce(
        f.nome_fantasia,
        f.razao_social,
        cl.nome_fantasia,
        cl.nome,
        col.nome
      ) as contraparte,
      case
        when (
          select count(*)
          from public.lancamento_parcelas p2
          where p2.lancamento_id = l.id
        ) > 1
        then p.numero_parcela::text || '/' || (
          select count(*)
          from public.lancamento_parcelas p2
          where p2.lancamento_id = l.id
        )::text
      end as parcela
    from conta co
    join public.lancamento_parcelas p on p.conta_bancaria_id = co.id
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.categorias_financeiras cf on cf.id = l.categoria_id
    left join public.fornecedores f on f.id = l.fornecedor_id
    left join public.clientes cl on cl.id = l.cliente_id
    left join public.colaboradores col on col.id = l.colaborador_id
    where p.status = 'pago'
      and l.status <> 'cancelado'
      and coalesce(cf.natureza, 'operacional') <> 'movimentacao'
      and (
        p_incluir_anteriores
        or co.saldo_inicial_data is null
        or p.data_pagamento is null
        or p.data_pagamento > co.saldo_inicial_data
      )

    union all

    -- Transferência recebida: esta conta é o destino.
    select
      'transferencia-entrada:' || t.id::text,
      'transferencia'::text,
      null::uuid,
      t.data_transferencia,
      'entrada'::text,
      t.valor,
      (
        co.saldo_inicial_data is null
        or t.data_transferencia > co.saldo_inicial_data
      ),
      t.numero,
      null::text,
      coalesce(t.descricao, 'Transferência recebida'),
      null::text,
      o.nome,
      null::text
    from conta co
    join public.transferencias_contas t on t.conta_destino_id = co.id
    join public.contas_bancarias o on o.id = t.conta_origem_id
    where p_incluir_anteriores
      or co.saldo_inicial_data is null
      or t.data_transferencia > co.saldo_inicial_data

    union all

    -- Transferência enviada: esta conta é a origem. Só o `valor`; a tarifa vem
    -- na linha seguinte.
    select
      'transferencia-saida:' || t.id::text,
      'transferencia'::text,
      null::uuid,
      t.data_transferencia,
      'saida'::text,
      t.valor,
      (
        co.saldo_inicial_data is null
        or t.data_transferencia > co.saldo_inicial_data
      ),
      t.numero,
      null::text,
      coalesce(t.descricao, 'Transferência enviada'),
      null::text,
      d.nome,
      null::text
    from conta co
    join public.transferencias_contas t on t.conta_origem_id = co.id
    join public.contas_bancarias d on d.id = t.conta_destino_id
    where p_incluir_anteriores
      or co.saldo_inicial_data is null
      or t.data_transferencia > co.saldo_inicial_data

    union all

    -- Tarifa da transferência enviada, em linha própria: no extrato do banco ela
    -- é um débito separado, e somada dentro do valor da transferência ela faria
    -- a linha discordar do documento de transferência.
    select
      'transferencia-tarifa:' || t.id::text,
      'tarifa'::text,
      null::uuid,
      t.data_transferencia,
      'saida'::text,
      t.tarifa,
      (
        co.saldo_inicial_data is null
        or t.data_transferencia > co.saldo_inicial_data
      ),
      t.numero,
      null::text,
      'Tarifa da transferência',
      null::text,
      d.nome,
      null::text
    from conta co
    join public.transferencias_contas t on t.conta_origem_id = co.id
    join public.contas_bancarias d on d.id = t.conta_destino_id
    where t.tarifa > 0
      and (
        p_incluir_anteriores
        or co.saldo_inicial_data is null
        or t.data_transferencia > co.saldo_inicial_data
      )
  )
  select
    m.chave,
    m.tipo_movimento,
    m.lancamento_id,
    m.data_movimento,
    m.sentido,
    m.valor,
    m.no_saldo,
    m.numero,
    m.numero_documento,
    m.descricao,
    m.categoria_nome,
    m.contraparte,
    m.parcela
  from movimentos m
  -- Ordem cronológica, que é a ordem em que o saldo acumulado faz sentido. O
  -- desempate por `chave` não é enfeite: dezenas de movimentos caem no mesmo dia
  -- e, sem ele, a paginação repete uma linha numa página e perde outra na
  -- seguinte (já aconteceu neste projeto, em Pagamentos).
  order by m.data_movimento nulls first, m.chave
$function$;

comment on function public.fn_extrato_conta(uuid, boolean) is
  'Extrato de uma conta bancária, uma linha por movimento. Mesmo WHERE de fn_rel_posicao_bancaria, para o saldo acumulado fechar no "Saldo atual" da listagem de contas.';

-- Grants: função nova nasce com EXECUTE para PUBLIC, e PUBLIC inclui `anon`.
-- Sem o revoke, o extrato de todas as contas fica aberto para quem não logou.
-- A função não é SECURITY DEFINER, então a RLS de lancamentos, parcelas,
-- transferências e cadastros continua valendo para quem chama.
revoke all on function public.fn_extrato_conta(uuid, boolean) from public;
grant execute on function public.fn_extrato_conta(uuid, boolean) to authenticated;
