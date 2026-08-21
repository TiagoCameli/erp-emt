-- Prova de aceite: o saldo da conta bancária tem UMA conta só, e o guard do
-- pagamento usa ela.
--
-- Contexto: o guard de `fn_pagar_parcela` tinha fórmula própria e ignorava
-- `transferencias_contas`. Depois da carga do histórico do Mais Controle
-- (21/08/2026 15:25:42 UTC, 319 transferências) a conta operacional aparecia com
-- R$ 22.326,46 na tela e R$ -33.173.201,31 no guard, e nenhum pagamento passava.
--
-- A parte 1 é só leitura. A parte 2 PAGA de verdade e desfaz: ela roda dentro de
-- um bloco que termina em `raise`, então nada é gravado. Vale porque
-- `proximo_numero_documento` numera por UPDATE em tabela e não por sequência,
-- então o rollback também devolve numeração (aqui não há numeração envolvida, mas
-- a regra é a mesma da prova da OC).
--
-- As LINHAS DE CONTROLE são o que dá valor ao resto: sem o caso B, um guard que
-- aceitasse qualquer coisa passaria no caso A.

-- =====================================================================
-- Parte 1 (leitura): a fonte única bate com a fórmula da TELA em toda conta
-- =====================================================================

with mov as (select * from public.fn_rel_posicao_bancaria()),
tela as (
  select c.id, c.nome,
         round(c.saldo_inicial
           + coalesce(sum(case when m.tipo in ('a_receber','transferencia_entrada') then m.total
                               else -m.total end),0), 2) as saldo
  from public.contas_bancarias c
  left join mov m on m.conta_bancaria_id = c.id
  where c.ativo
  group by c.id, c.nome, c.saldo_inicial
),
guard_antigo as (
  -- A fórmula que o guard tinha antes, reproduzida aqui só para a linha de
  -- controle: ela TEM que divergir em alguma conta, senão esta prova não prova
  -- nada (era o caso da CAIXINHA DE DINHEIRO, que não tem transferência e por
  -- isso nunca quebrou).
  select c.id,
         round(c.saldo_inicial + coalesce(sum(case when l.tipo='a_receber' then p.valor_liquido else -p.valor_liquido end),0),2) as saldo
  from public.contas_bancarias c
  left join public.lancamento_parcelas p on p.conta_bancaria_id = c.id and p.status='pago'
  left join public.lancamentos l on l.id = p.lancamento_id
  where c.ativo
  group by c.id, c.saldo_inicial
)
select t.nome,
       t.saldo as saldo_da_tela,
       public.fn_saldo_conta(t.id) as fonte_unica,
       (public.fn_saldo_conta(t.id) = t.saldo) as passou,
       ga.saldo as guard_antigo,
       (ga.saldo <> t.saldo) as controle_o_antigo_divergia
from tela t join guard_antigo ga on ga.id = t.id
order by t.nome;

-- Resultado em 21/08/2026: as cinco contas com `passou = true`, e
-- `controle_o_antigo_divergia = true` em quatro delas (BB 102.124-9 por
-- R$ 33.195.527,77).

-- =====================================================================
-- Parte 2 (escreve e desfaz): pagar de verdade pela conta operacional
-- =====================================================================
--
-- Troque o id da parcela por uma parcela `aprovado` com `data_programada` = hoje
-- (pagar na data programada dispensa motivo). A do exemplo é a do caso relatado:
-- LAN-2026-6460, R$ 240,00.

do $prova$
declare
  v_usuario uuid := (select id from public.usuarios where email = 'tiago@emtconstrutora.com' and ativo limit 1);
  v_parcela uuid := 'e4640839-346e-43ac-94e9-e817ee3431e8';
  v_conta_boa uuid;
  v_conta_zero uuid;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_status_a text := '(nao rodou)';
  v_erro_a text := '(sem erro)';
  v_b text := '(nao rodou)';
  v_saldo_boa numeric; v_saldo_zero numeric;
begin
  select id into v_conta_boa from public.contas_bancarias where nome ilike '%102.124-9%' limit 1;
  select id into v_conta_zero from public.contas_bancarias where nome ilike '%30.893-5%' limit 1;
  v_saldo_boa := public.fn_saldo_conta(v_conta_boa);
  v_saldo_zero := public.fn_saldo_conta(v_conta_zero);

  -- A RPC checa tem_permissao(), que depende de auth.uid(). E `set local role`
  -- é o que faz a RLS valer: só as claims não bastam, porque o MCP entra como
  -- owner.
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- A: o caso relatado. Parcela de R$ 240,00 na conta operacional: tem que PASSAR.
  begin
    perform public.fn_pagar_parcela(v_parcela, v_conta_boa, v_hoje);
    select p.status into v_status_a from public.lancamento_parcelas p where p.id = v_parcela;
    -- Desfaz A pelo savepoint implícito do bloco, para o caso B encontrar a
    -- parcela como estava (senão B falharia por "precisa estar aprovada", e não
    -- pelo saldo, que é o que ele quer provar).
    raise exception 'desfaz A';
  exception when others then
    if sqlerrm <> 'desfaz A' then v_erro_a := sqlerrm; end if;
  end;

  -- B, LINHA DE CONTROLE: mesma parcela, conta de saldo R$ 0,00. Tem que RECUSAR.
  begin
    perform public.fn_pagar_parcela(v_parcela, v_conta_zero, v_hoje);
    v_b := 'PASSOU (NAO DEVIA)';
    raise exception 'desfaz B';
  exception when others then
    if sqlerrm <> 'desfaz B' then v_b := sqlerrm; end if;
  end;

  raise exception E'PROVA (desfeita, nada gravado)\n  saldo da conta operacional: %\n  A) pagar R$ 240,00 nela -> status da parcela=% erro=%\n  saldo da conta 30.893-5: %\n  B) CONTROLE, mesma parcela nela -> %',
    v_saldo_boa, v_status_a, v_erro_a, v_saldo_zero, v_b;
end $prova$;

-- Resultado em 21/08/2026:
--   saldo da conta operacional: 22326.46
--   A) status da parcela=pago  erro=(sem erro)
--   saldo da conta 30.893-5: 0.00
--   B) CONTROLE -> Saldo insuficiente na conta: saldo atual R$ 0.00, pagamento de R$ 240.00.
--
-- E depois, conferido que a parcela seguia `aprovado`, com data_pagamento e
-- pago_em nulos: a prova não deixou rastro.
