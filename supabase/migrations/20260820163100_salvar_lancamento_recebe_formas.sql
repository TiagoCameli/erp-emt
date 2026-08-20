-- ---------------------------------------------------------------------------
-- 2. fn_salvar_lancamento recebe as formas
-- ---------------------------------------------------------------------------
-- Parametro novo exige DROP + CREATE, nao `create or replace`: com a assinatura
-- antiga viva, o PostgREST passaria a ver DUAS sobrecargas e escolheria uma
-- delas em runtime, com o build verde. O grant volta logo abaixo, porque o DROP
-- leva o grant embora e sem ele a tela quebra no primeiro salvamento.
--
-- E `p_formas` tem DEFAULT porque a migration entra no banco ANTES do deploy do
-- app: sem o default, toda gravacao de lancamento quebraria na janela entre as
-- duas coisas. Uma funcao so, com um parametro opcional -- nao duas sobrecargas.

drop function if exists public.fn_salvar_lancamento(uuid, jsonb, jsonb, jsonb);

create or replace function public.fn_salvar_lancamento(
  p_id uuid, p_dados jsonb, p_parcelas jsonb, p_rateios jsonb,
  p_formas jsonb default '[]'::jsonb
)
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

  -- ---- as formas de pagamento -------------------------------------------
  v_qtd_formas := jsonb_array_length(coalesce(p_formas, '[]'::jsonb));

  -- Recebimento nao tem forma de pagamento: a forma diz como a EMT PAGA, e num
  -- recebivel quem paga e o cliente. O que o recebimento tem e conta de destino.
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

    -- Toda parcela tem de dizer de qual forma ela e. Sem isto, uma parcela sem
    -- forma num lancamento COM formas ficaria fora de todo bloco: nao apareceria
    -- em atalho nenhum e a trava de soma do bloco a acusaria depois, com uma
    -- mensagem sobre valores em vez de sobre a forma que ficou faltando.
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

    -- E as parcelas de CADA forma fecham com o valor daquela forma. E esta a
    -- trava que faz o modelo de duas camadas ser honesto.
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

  -- Com UMA forma, o cabecalho guarda ela: as listagens, os filtros, os
  -- relatorios e o RH continuam lendo `lancamentos.forma_pagamento_id`, e o caso
  -- de uma forma so e a esmagadora maioria. Com DUAS ou mais o cabecalho vai
  -- NULO de proposito -- nao existe "a forma" desse lancamento, e gravar uma
  -- delas faria a lista afirmar algo falso. A tela le lancamento_formas para
  -- dizer "2 formas".
  v_forma_cabecalho := case
    when v_qtd_formas = 1 then nullif(p_formas->0->>'forma_pagamento_id','')::uuid
    when v_qtd_formas > 1 then null
    else nullif(p_dados->>'forma_pagamento_id','')::uuid
  end;

  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_id);

  if v_acao = 'criar' then
    insert into public.lancamentos (tipo, origem, fornecedor_id, cliente_id, categoria_id, forma_pagamento_id, condicao_pagamento_id, descricao, observacoes, valor, status, data_compra, mes_competencia, data_vencimento, numero_documento, created_by)
    values (
      v_tipo, 'manual',
      nullif(p_dados->>'fornecedor_id','')::uuid,
      nullif(p_dados->>'cliente_id','')::uuid,
      nullif(p_dados->>'categoria_id','')::uuid,
      v_forma_cabecalho,
      nullif(p_dados->>'condicao_pagamento_id','')::uuid,
      p_dados->>'descricao', nullif(btrim(p_dados->>'observacoes'),''), v_valor, 'a_pagar',
      v_compra, v_mes, nullif(p_dados->>'data_vencimento','')::date, v_numero_documento, (select auth.uid())
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
      numero_documento = v_numero_documento
    where id = v_id;
    -- Parcelas ANTES das formas: apagar a forma leva a parcela em cascata, e a
    -- ordem inversa funcionaria por acidente. Explicito para nao depender disso.
    delete from public.lancamento_parcelas where lancamento_id = v_id;
    delete from public.lancamento_rateios where lancamento_id = v_id;
    delete from public.lancamento_formas where lancamento_id = v_id;
  end if;

  -- As formas antes das parcelas: a parcela precisa do id do bloco.
  insert into public.lancamento_formas (lancamento_id, forma_pagamento_id, valor, created_by)
  select v_id, nullif(x->>'forma_pagamento_id','')::uuid,
         round((x->>'valor')::numeric, 2), (select auth.uid())
  from jsonb_array_elements(coalesce(p_formas,'[]'::jsonb)) x;

  -- O numero da parcela sai do VENCIMENTO, nao da ordem em que as linhas foram
  -- digitadas: parcela 1 e a que vence primeiro. A numeracao segue sendo do
  -- LANCAMENTO INTEIRO, e nao por forma: "parcela 2 de 4" ja significa isso em
  -- toda tela e em todo espelho, e reiniciar por bloco faria dois documentos
  -- diferentes chamarem a mesma coisa de "parcela 1".
  --
  -- O left join resolve o bloco de cada parcela pela forma que ela declarou. Sem
  -- formas, lf.id vem nulo em todas -- que e o caminho antigo.
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

revoke all on function public.fn_salvar_lancamento(uuid, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.fn_salvar_lancamento(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

