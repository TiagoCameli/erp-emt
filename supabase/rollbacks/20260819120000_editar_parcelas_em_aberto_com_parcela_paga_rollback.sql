-- Rollback de 20260819120000_editar_parcelas_em_aberto_com_parcela_paga.sql.
--
-- Volta a `fn_definir_parcelas_lancamento` à versão viva de 19/08/2026, md5
-- 0aa578ae20f6ac29a5f43f8d236a3254, copiada da `pg_get_functiondef` antes da
-- troca. É byte a byte a de antes.
--
-- LEIA ANTES DE RODAR.
--
-- Rodar isto traz de volta a trava que o Tiago pediu para tirar: lançamento com
-- UMA parcela paga volta a não deixar mexer em NENHUMA parcela, nem nas que
-- ninguém pagou. No LAN-2026-1603 (ICMS renegociado) isso são 38 parcelas
-- futuras travadas por causa de 3 pagas.
--
-- Isto NÃO desfaz edição já feita. Se alguém já reparcelou um lançamento com
-- parcela paga, as parcelas e o valor ficam como estão — o rollback só impede
-- novas edições. Para saber se houve alguma, procure no audit_log:
--
--   select * from audit_log
--    where tabela = 'lancamento_parcelas' and criado_em >= '2026-08-19'
--    order by criado_em desc;
--
-- Atenção ao voltar: a versão antiga APAGA todas as parcelas e reinsere. Ela
-- zera `conta_bancaria_id` (907 parcelas em aberto na base têm conta) e derruba
-- `parcela_eventos` por cascade. Foi por isso que a nova atualiza no lugar.

create or replace function public.fn_definir_parcelas_lancamento(p_lanc_id uuid, p_parcelas jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_valor numeric(14, 2);
  v_status text;
  v_origem text;
  v_soma numeric(14, 2);
  v_qtd int;
begin
  if not public.tem_permissao('financeiro.lancamentos', 'editar') then
    raise exception 'Sem permissao para editar lancamentos';
  end if;

  select valor, status, origem into v_valor, v_status, v_origem
  from public.lancamentos
  where id = p_lanc_id;

  if v_valor is null then
    raise exception 'Lancamento nao encontrado';
  end if;
  if v_status = 'cancelado' then
    raise exception 'Lancamento cancelado nao aceita parcelas';
  end if;

  if exists (
    select 1 from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('aprovado', 'pago')
  ) then
    raise exception 'Este lancamento ja tem parcela aprovada ou paga: as parcelas nao podem mais ser trocadas';
  end if;

  -- Guarda de origem: mesmo criterio e mesma forma de mensagem da
  -- fn_excluir_lancamento. Lancamento que veio do RH nao se reparcela pelo
  -- Financeiro: guia de imposto tem prazo legal, e o vencimento sai do dia
  -- configurado em Parametros da Folha. Sem esta guarda dava para mover a guia
  -- de INSS de 2026-12-20 para 2027-06-30 e partir em duas parcelas, com o
  -- total preservado (a identidade de conferencia continua fechando em 0.00) e
  -- sem sinal nenhum na tela da folha.
  if v_origem in ('folha', 'folha_guia') then
    raise exception 'Nao da para trocar as parcelas aqui: este lancamento veio da folha. Mude o dia de vencimento em Parametros da Folha, depois desaprove e reaprove a folha';
  end if;

  if v_origem = 'adiantamento' then
    raise exception 'Nao da para trocar as parcelas aqui: este lancamento veio de um adiantamento. Exclua e recrie o adiantamento pelo RH';
  end if;

  v_qtd := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));
  if v_qtd = 0 then
    raise exception 'Informe ao menos uma parcela';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_parcelas) x
    where coalesce((x->>'valor')::numeric, 0) <= 0
  ) then
    raise exception 'Toda parcela precisa de um valor maior que zero';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_parcelas) x
    where nullif(x->>'data_vencimento', '') is null
  ) then
    raise exception 'Toda parcela precisa de uma data de vencimento';
  end if;

  select round(coalesce(sum((x->>'valor')::numeric), 0), 2)
  into v_soma
  from jsonb_array_elements(p_parcelas) x;

  if v_soma <> round(v_valor, 2) then
    raise exception 'A soma das parcelas (R$ %) precisa fechar com o valor do lancamento (R$ %)', v_soma, round(v_valor, 2);
  end if;

  delete from public.lancamento_parcelas where lancamento_id = p_lanc_id;

  insert into public.lancamento_parcelas (
    lancamento_id, numero_parcela, valor, data_vencimento, status, created_by
  )
  select
    p_lanc_id,
    row_number() over (
      order by (x->>'data_vencimento')::date, x->>'valor'
    )::smallint,
    round((x->>'valor')::numeric, 2),
    (x->>'data_vencimento')::date,
    'pendente',
    (select auth.uid())
  from jsonb_array_elements(p_parcelas) x;

  update public.lancamentos
  set data_vencimento = (
    select min(lp.data_vencimento)
    from public.lancamento_parcelas lp
    where lp.lancamento_id = p_lanc_id
  )
  where id = p_lanc_id;

  perform public.fn_aplicar_regra_pagamento(p_lanc_id);
end;
$function$;
