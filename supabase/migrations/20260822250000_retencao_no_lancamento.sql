-- =============================================================
-- Retencao no lancamento: valor bruto digitado, liquido calculado
--
-- PEDIDO DO TIAGO (22/08/2026): "crie a area de retencao para os lancamentos a
-- receber e coloque um local para inserir o valor bruto e o valor liquido
-- calculado automaticamente."
--
-- ============================================================
-- O QUE ISTO RESOLVE
-- ============================================================
-- Nota de medicao do DNIT tem dois numeros e o ERP so guardava um. A nota 345
-- vale R$ 3.243.566,33 de servico e o que entrou na conta foi R$ 2.935.427,53:
-- a diferenca de R$ 308.138,80 e imposto retido na fonte pelo tomador. Sem
-- campo para a retencao, quem lanca tem de escolher entre:
--
--   gravar o bruto   -> o saldo bancario fica R$ 308 mil maior do que a conta tem
--   gravar o liquido -> a receita da obra fica R$ 308 mil menor do que ela faturou
--
-- Nas nove notas da BR-364 isso soma R$ 2.985.761,67 (8,7% do faturado). Com os
-- campos, os dois numeros convivem: `valor` continua sendo o que TRANSITA (e por
-- isso parcela, rateio e saldo nao mudam de significado) e `valor_bruto` guarda
-- o que foi faturado.
--
-- ============================================================
-- POR QUE `valor` CONTINUA SENDO O LIQUIDO
-- ============================================================
-- `valor` e a ancora de tres invariantes que ja existem: a soma das parcelas, a
-- soma do rateio e o movimento da conta bancaria. Trocar o significado dele para
-- "bruto" faria a parcela paga mover o saldo pelo valor cheio, e o extrato
-- passaria a discordar em toda nota com retencao. O bruto entra como campo NOVO,
-- ao lado, sem mexer em nada do que ja funciona.
--
-- ============================================================
-- A TOLERANCIA DE UM REAL, QUE E O CORACAO DISTO
-- ============================================================
-- bruto menos retencoes NAO da exatamente o liquido creditado: o pagador
-- arredonda. Medido nas nove notas, a diferenca e de no maximo 3 centavos, e
-- para os dois lados (o DNIT creditou 1 centavo A MAIS na nota 356).
--
-- Entao a regra nao pode ser igualdade exata (impediria gravar o valor real do
-- extrato) nem "qualquer coisa" (deixaria passar erro de digitacao). E
-- tolerancia de R$ 1,00:
--
--   abs((valor_bruto - retencoes) - valor) <= 1.00
--
-- Isso aceita o centavo do pagador e RECUSA o erro grande. Nao e hipotese: o
-- lancamento LAN-2026-6286 esta hoje R$ 40.021,27 acima do que o banco creditou,
-- e e exatamente esse tipo de erro que a trava pega. A migration seguinte
-- corrige os quatro lancamentos existentes; esta cria a trava.
-- =============================================================

alter table public.lancamentos
  add column if not exists valor_bruto numeric(14,2),
  add column if not exists retencao_iss numeric(14,2) not null default 0,
  add column if not exists retencao_pis numeric(14,2) not null default 0,
  add column if not exists retencao_cofins numeric(14,2) not null default 0,
  add column if not exists retencao_csll numeric(14,2) not null default 0,
  add column if not exists retencao_ir numeric(14,2) not null default 0,
  add column if not exists retencao_inss numeric(14,2) not null default 0,
  add column if not exists retencao_outras numeric(14,2) not null default 0;

comment on column public.lancamentos.valor_bruto is
  'Valor faturado antes das retencoes na fonte. NULL = lancamento sem retencao, e ai `valor` e o valor cheio. Quando preenchido, `valor` continua sendo o LIQUIDO (o que transita e move o saldo).';
comment on column public.lancamentos.retencao_iss is 'ISS/ISSQN retido pelo tomador.';
comment on column public.lancamentos.retencao_pis is 'PIS/PASEP retido na fonte.';
comment on column public.lancamentos.retencao_cofins is 'COFINS retido na fonte.';
comment on column public.lancamentos.retencao_csll is 'CSLL retido na fonte.';
comment on column public.lancamentos.retencao_ir is 'IR/IRRF retido na fonte.';
comment on column public.lancamentos.retencao_inss is 'INSS / contribuicao previdenciaria retida.';
comment on column public.lancamentos.retencao_outras is 'Outras retencoes, e o arredondamento do pagador quando houver.';

-- ---------- as invariantes ----------
alter table public.lancamentos
  drop constraint if exists lancamentos_retencao_nao_negativa;
alter table public.lancamentos
  add constraint lancamentos_retencao_nao_negativa check (
    retencao_iss >= 0 and retencao_pis >= 0 and retencao_cofins >= 0
    and retencao_csll >= 0 and retencao_ir >= 0 and retencao_inss >= 0
    and retencao_outras >= 0
  );

-- Retencao sem bruto nao diz nada: de que valor ela foi retida?
alter table public.lancamentos
  drop constraint if exists lancamentos_retencao_exige_bruto;
alter table public.lancamentos
  add constraint lancamentos_retencao_exige_bruto check (
    valor_bruto is not null
    or (retencao_iss + retencao_pis + retencao_cofins + retencao_csll
        + retencao_ir + retencao_inss + retencao_outras) = 0
  );

-- O liquido nunca passa o bruto, e a aritmetica fecha a menos de um real (o
-- arredondamento do pagador). Ver o cabecalho: aceita centavo, recusa erro.
alter table public.lancamentos
  drop constraint if exists lancamentos_liquido_confere_com_bruto;
alter table public.lancamentos
  add constraint lancamentos_liquido_confere_com_bruto check (
    valor_bruto is null
    or (
      valor_bruto >= valor
      and abs(
        (valor_bruto - (retencao_iss + retencao_pis + retencao_cofins
                        + retencao_csll + retencao_ir + retencao_inss
                        + retencao_outras)) - valor
      ) <= 1.00
    )
  );

-- ---------- fn_salvar_lancamento passa a ler os campos novos ----------
-- `p_dados` e jsonb, entao a assinatura nao muda: chave nova no objeto e chave
-- ausente continua valendo zero (lancamento sem retencao segue igual).
create or replace function public.fn_salvar_lancamento(p_id uuid, p_dados jsonb, p_parcelas jsonb, p_rateios jsonb, p_formas jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid := p_id; v_acao text; v_valor numeric(14,2);
  v_soma_parc numeric(14,2); v_soma_rat numeric(14,2); v_origem text; r jsonb;
  v_compra date; v_mes date; v_mes_atual date;
  v_numero_documento text;
  v_tipo text; v_tipo_atual text; v_conta_destino uuid;
  v_qtd_formas int; v_soma_formas numeric(14,2); v_falta text;
  v_forma_cabecalho uuid;
  v_bruto numeric(14,2);
  v_ret_iss numeric(14,2); v_ret_pis numeric(14,2); v_ret_cofins numeric(14,2);
  v_ret_csll numeric(14,2); v_ret_ir numeric(14,2); v_ret_inss numeric(14,2);
  v_ret_outras numeric(14,2); v_ret_total numeric(14,2);
begin
  v_acao := case when p_id is null then 'criar' else 'editar' end;
  v_tipo := coalesce(nullif(p_dados->>'tipo', ''), 'a_pagar');

  if v_tipo not in ('a_pagar', 'a_receber') then
    raise exception 'Tipo de lancamento invalido: %', v_tipo;
  end if;

  if v_acao = 'editar' then
    select tipo into v_tipo_atual from public.lancamentos where id = v_id;
    if v_tipo_atual is null then raise exception 'Lancamento nao encontrado'; end if;
    if not public.fn_pode_lancar_tipo(v_tipo_atual, v_acao)
       or not public.fn_pode_lancar_tipo(v_tipo, v_acao) then
      raise exception 'Sem permissao para % lancamentos', v_acao;
    end if;
  else
    if not public.fn_pode_lancar_tipo(v_tipo, v_acao) then
      raise exception 'Sem permissao para % lancamentos', v_acao;
    end if;
  end if;

  v_valor := (p_dados->>'valor')::numeric;
  if v_valor is null or v_valor < 0 then raise exception 'Valor invalido'; end if;

  -- ---------- retencoes ----------
  v_bruto      := nullif(p_dados->>'valor_bruto','')::numeric;
  v_ret_iss    := coalesce(nullif(p_dados->>'retencao_iss','')::numeric, 0);
  v_ret_pis    := coalesce(nullif(p_dados->>'retencao_pis','')::numeric, 0);
  v_ret_cofins := coalesce(nullif(p_dados->>'retencao_cofins','')::numeric, 0);
  v_ret_csll   := coalesce(nullif(p_dados->>'retencao_csll','')::numeric, 0);
  v_ret_ir     := coalesce(nullif(p_dados->>'retencao_ir','')::numeric, 0);
  v_ret_inss   := coalesce(nullif(p_dados->>'retencao_inss','')::numeric, 0);
  v_ret_outras := coalesce(nullif(p_dados->>'retencao_outras','')::numeric, 0);
  v_ret_total  := v_ret_iss + v_ret_pis + v_ret_cofins + v_ret_csll
                + v_ret_ir + v_ret_inss + v_ret_outras;

  if v_bruto is null and v_ret_total <> 0 then
    raise exception 'Informe o valor bruto: retencao sem bruto nao diz de que valor ela saiu';
  end if;

  if v_bruto is not null then
    if v_bruto < v_valor then
      raise exception 'O valor liquido (R$ %) nao pode ser maior que o bruto (R$ %)',
        v_valor, v_bruto;
    end if;
    -- Tolerancia de R$ 1,00 e nao igualdade: o pagador arredonda (o DNIT erra
    -- ate 3 centavos, para os dois lados). Ver o comentario do cabecalho.
    if abs((v_bruto - v_ret_total) - v_valor) > 1.00 then
      raise exception
        'Bruto menos retencoes da R$ %, e o liquido informado e R$ % (diferenca de R$ %). Confira as retencoes.',
        to_char(v_bruto - v_ret_total, 'FM999999999990.00'),
        to_char(v_valor, 'FM999999999990.00'),
        to_char(abs((v_bruto - v_ret_total) - v_valor), 'FM999999999990.00');
    end if;
  end if;

  v_numero_documento := nullif(btrim(p_dados->>'numero_documento'), '');

  if v_tipo = 'a_receber' and v_numero_documento is null then
    raise exception 'Informe o numero do documento do recebimento';
  end if;

  v_compra := nullif(p_dados->>'data_compra','')::date;
  if v_compra is null then
    raise exception 'Informe a data da compra ou do documento';
  end if;
  v_mes := date_trunc('month', coalesce(nullif(p_dados->>'mes_competencia','')::date, v_compra))::date;

  if v_tipo = 'a_receber' then
    v_conta_destino := nullif(p_dados->>'conta_bancaria_id','')::uuid;
    if v_conta_destino is null then
      raise exception 'Informe a conta em que o dinheiro vai entrar';
    end if;
    if not exists (
      select 1 from public.contas_bancarias
      where id = v_conta_destino and ativo
    ) then
      raise exception 'Conta bancaria inativa ou inexistente';
    end if;
  else
    v_conta_destino := null;
  end if;

  if v_tipo = 'a_receber'
     and nullif(p_dados->>'cliente_id','') is not null
     and not exists (
       select 1 from public.clientes
       where id = (p_dados->>'cliente_id')::uuid and ativo
     ) then
    raise exception 'Cliente inativo ou inexistente';
  end if;

  select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_parc from jsonb_array_elements(coalesce(p_parcelas,'[]'::jsonb)) x;
  if v_soma_parc <> round(v_valor, 2) then
    raise exception 'A soma das parcelas (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_parc, v_valor;
  end if;
  if jsonb_array_length(coalesce(p_rateios,'[]'::jsonb)) = 0 then
    raise exception 'Escolha o centro de custo: nenhum custo existe sem centro de custo';
  end if;
  if true then
    select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_rat from jsonb_array_elements(p_rateios) x;
    if v_soma_rat <> round(v_valor, 2) then
      raise exception 'A soma do rateio (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_rat, v_valor;
    end if;
  end if;

  v_qtd_formas := jsonb_array_length(coalesce(p_formas, '[]'::jsonb));

  if v_tipo = 'a_receber' and v_qtd_formas > 0 then
    raise exception 'Recebimento nao tem forma de pagamento: informe a conta em que o dinheiro entra';
  end if;

  if v_qtd_formas > 0 then
    if exists (
      select 1 from jsonb_array_elements(p_formas) x
      where coalesce(round((x->>'valor')::numeric, 2), 0) <= 0
    ) then
      raise exception 'Toda forma de pagamento precisa de um valor maior que zero';
    end if;

    select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_formas
    from jsonb_array_elements(p_formas) x;
    if v_soma_formas <> round(v_valor, 2) then
      raise exception 'A soma das formas de pagamento (R$ %) deve ser igual ao valor do lancamento (R$ %)',
        v_soma_formas, v_valor;
    end if;

    if (
      select count(distinct x->>'forma_pagamento_id')
      from jsonb_array_elements(p_formas) x
    ) <> v_qtd_formas then
      raise exception 'A mesma forma de pagamento aparece duas vezes: some os valores numa linha so';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_formas) x
      where not exists (
        select 1 from public.formas_pagamento f
        where f.id = nullif(x->>'forma_pagamento_id','')::uuid and f.ativo
      )
    ) then
      raise exception 'Forma de pagamento inativa ou inexistente';
    end if;

    if exists (
      select 1 from jsonb_array_elements(coalesce(p_parcelas,'[]'::jsonb)) x
      where nullif(x->>'forma_pagamento_id','') is null
         or not exists (
           select 1 from jsonb_array_elements(p_formas) fx
           where fx->>'forma_pagamento_id' = x->>'forma_pagamento_id'
         )
    ) then
      raise exception 'Toda parcela precisa dizer por qual forma de pagamento ela sai';
    end if;

    select string_agg(
             f.nome||' (parcelas R$ '||to_char(t.soma,'FM999999999990.00')||
             ' contra R$ '||to_char(t.valor_forma,'FM999999999990.00')||')', '; ')
    into v_falta
    from (
      select nullif(fx->>'forma_pagamento_id','')::uuid as forma,
             round((fx->>'valor')::numeric, 2) as valor_forma,
             coalesce((
               select sum(round((px->>'valor')::numeric, 2))
               from jsonb_array_elements(coalesce(p_parcelas,'[]'::jsonb)) px
               where px->>'forma_pagamento_id' = fx->>'forma_pagamento_id'
             ), 0) as soma
      from jsonb_array_elements(p_formas) fx
    ) t
    join public.formas_pagamento f on f.id = t.forma
    where t.soma <> t.valor_forma;

    if v_falta is not null then
      raise exception 'As parcelas de cada forma tem que fechar com o valor dela: %', v_falta;
    end if;
  end if;

  v_forma_cabecalho := case
    when v_qtd_formas = 1 then nullif(p_formas->0->>'forma_pagamento_id','')::uuid
    when v_qtd_formas > 1 then null
    else nullif(p_dados->>'forma_pagamento_id','')::uuid
  end;

  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_id);

  if v_acao = 'criar' then
    insert into public.lancamentos (tipo, origem, fornecedor_id, cliente_id, categoria_id, forma_pagamento_id, condicao_pagamento_id, descricao, observacoes, valor, status, data_compra, mes_competencia, data_vencimento, numero_documento, valor_bruto, retencao_iss, retencao_pis, retencao_cofins, retencao_csll, retencao_ir, retencao_inss, retencao_outras, created_by)
    values (
      v_tipo, 'manual',
      nullif(p_dados->>'fornecedor_id','')::uuid,
      nullif(p_dados->>'cliente_id','')::uuid,
      nullif(p_dados->>'categoria_id','')::uuid,
      v_forma_cabecalho,
      nullif(p_dados->>'condicao_pagamento_id','')::uuid,
      p_dados->>'descricao', nullif(btrim(p_dados->>'observacoes'),''), v_valor, 'a_pagar',
      v_compra, v_mes, nullif(p_dados->>'data_vencimento','')::date, v_numero_documento,
      v_bruto, v_ret_iss, v_ret_pis, v_ret_cofins, v_ret_csll, v_ret_ir, v_ret_inss, v_ret_outras,
      (select auth.uid())
    ) returning id into v_id;
  else
    select origem, mes_competencia into v_origem, v_mes_atual
    from public.lancamentos where id = v_id;
    if v_origem is null then raise exception 'Lancamento nao encontrado'; end if;
    if v_origem <> 'manual' then
      raise exception 'Lancamento de origem % e somente-leitura aqui. Edite na origem.', v_origem;
    end if;
    if exists (select 1 from public.lancamento_parcelas where lancamento_id = v_id and status = 'pago') then
      raise exception 'Nao da para editar um lancamento com parcela ja paga';
    end if;
    if exists (select 1 from public.lancamento_parcelas where lancamento_id = v_id and status = 'aprovado') then
      raise exception 'Nao da para editar um lancamento com pagamento aprovado. Desaprove o pagamento em Financeiro > Aprovacao de pagamentos, edite e aprove de novo.';
    end if;
    if exists (
      select 1 from public.lancamento_parcelas
      where lancamento_id = v_id and status in ('aprovado', 'pago')
    ) and v_mes_atual <> v_mes then
      raise exception 'O mes de referencia nao muda com pagamento aprovado ou pago. Desaprove ou estorne o pagamento antes.';
    end if;
    perform public.fn_exigir_competencia_aberta(v_mes_atual, 'lancamento', v_id);
    update public.lancamentos set
      tipo = v_tipo,
      fornecedor_id = nullif(p_dados->>'fornecedor_id','')::uuid,
      cliente_id = nullif(p_dados->>'cliente_id','')::uuid,
      categoria_id = nullif(p_dados->>'categoria_id','')::uuid,
      forma_pagamento_id = v_forma_cabecalho,
      condicao_pagamento_id = nullif(p_dados->>'condicao_pagamento_id','')::uuid,
      descricao = p_dados->>'descricao', valor = v_valor,
      observacoes = nullif(btrim(p_dados->>'observacoes'),''),
      data_compra = v_compra,
      mes_competencia = v_mes,
      data_vencimento = nullif(p_dados->>'data_vencimento','')::date,
      numero_documento = v_numero_documento,
      valor_bruto = v_bruto,
      retencao_iss = v_ret_iss,
      retencao_pis = v_ret_pis,
      retencao_cofins = v_ret_cofins,
      retencao_csll = v_ret_csll,
      retencao_ir = v_ret_ir,
      retencao_inss = v_ret_inss,
      retencao_outras = v_ret_outras
    where id = v_id;
    delete from public.lancamento_parcelas where lancamento_id = v_id;
    delete from public.lancamento_rateios where lancamento_id = v_id;
    delete from public.lancamento_formas where lancamento_id = v_id;
  end if;

  insert into public.lancamento_formas (lancamento_id, forma_pagamento_id, valor, created_by)
  select v_id, nullif(x->>'forma_pagamento_id','')::uuid,
         round((x->>'valor')::numeric, 2), (select auth.uid())
  from jsonb_array_elements(coalesce(p_formas,'[]'::jsonb)) x;

  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, lancamento_forma_id, created_by)
  select
    v_id,
    row_number() over (
      order by nullif(x->>'data_vencimento','')::date nulls last, x->>'valor'
    )::smallint,
    (x->>'valor')::numeric,
    nullif(x->>'data_vencimento','')::date,
    'pendente',
    v_conta_destino,
    lf.id,
    (select auth.uid())
  from jsonb_array_elements(coalesce(p_parcelas,'[]'::jsonb)) x
  left join public.lancamento_formas lf
    on lf.lancamento_id = v_id
   and lf.forma_pagamento_id = nullif(x->>'forma_pagamento_id','')::uuid;

  for r in select * from jsonb_array_elements(coalesce(p_rateios,'[]'::jsonb)) loop
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_id, (r->>'centro_custo_id')::uuid, (r->>'valor')::numeric, (select auth.uid()));
  end loop;

  perform public.fn_aplicar_regra_pagamento(v_id);

  return v_id;
end;
$function$;

revoke all on function public.fn_salvar_lancamento(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.fn_salvar_lancamento(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
