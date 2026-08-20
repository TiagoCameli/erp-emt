-- Rollback das quatro migrations de "varias formas por lancamento" (20/08/2026):
--   20260820160000_lancamento_com_varias_formas_estrutura
--   20260820163000_regra_pagamento_por_bloco_de_forma
--   20260820163100_salvar_lancamento_recebe_formas
--   20260820163200_reparcelar_respeita_bloco_de_forma (+ o conserto do min(uuid))
--
-- ORDEM IMPORTA: as funcoes voltam primeiro, a estrutura depois. Derrubar a
-- tabela com fn_salvar_lancamento ainda escrevendo nela quebraria toda gravacao
-- de lancamento no intervalo.
--
-- PERDA DE DADO ASSUMIDA: a divisao por forma vai embora com a tabela. Cada
-- lancamento que tinha 2+ formas fica com `forma_pagamento_id` NULO no cabecalho
-- (era null de proposito, porque "a forma" nao existia), ou seja: perde a
-- informacao de como ele seria pago. Antes de rodar isto, exporte:
--
--   select l.numero, f.nome, lf.valor
--   from lancamento_formas lf
--   join lancamentos l on l.id = lf.lancamento_id
--   join formas_pagamento f on f.id = lf.forma_pagamento_id
--   where l.id in (select lancamento_id from lancamento_formas
--                  group by lancamento_id having count(*) > 1);
--
-- Rodar logo depois de aplicar (nenhum lancamento multi-forma criado ainda) nao
-- perde nada.

-- ---------------------------------------------------------------------------
-- 1. fn_salvar_lancamento volta a assinatura de 4 argumentos
-- ---------------------------------------------------------------------------

drop function if exists public.fn_salvar_lancamento(uuid, jsonb, jsonb, jsonb, jsonb);

create or replace function public.fn_salvar_lancamento(
  p_id uuid, p_dados jsonb, p_parcelas jsonb, p_rateios jsonb
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

  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_id);

  if v_acao = 'criar' then
    insert into public.lancamentos (tipo, origem, fornecedor_id, cliente_id, categoria_id, forma_pagamento_id, condicao_pagamento_id, descricao, observacoes, valor, status, data_compra, mes_competencia, data_vencimento, numero_documento, created_by)
    values (
      v_tipo, 'manual',
      nullif(p_dados->>'fornecedor_id','')::uuid,
      nullif(p_dados->>'cliente_id','')::uuid,
      nullif(p_dados->>'categoria_id','')::uuid,
      nullif(p_dados->>'forma_pagamento_id','')::uuid,
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
      forma_pagamento_id = nullif(p_dados->>'forma_pagamento_id','')::uuid,
      condicao_pagamento_id = nullif(p_dados->>'condicao_pagamento_id','')::uuid,
      descricao = p_dados->>'descricao', valor = v_valor,
      observacoes = nullif(btrim(p_dados->>'observacoes'),''),
      data_compra = v_compra,
      mes_competencia = v_mes,
      data_vencimento = nullif(p_dados->>'data_vencimento','')::date,
      numero_documento = v_numero_documento
    where id = v_id;
    delete from public.lancamento_parcelas where lancamento_id = v_id;
    delete from public.lancamento_rateios where lancamento_id = v_id;
  end if;

  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, created_by)
  select
    v_id,
    row_number() over (
      order by nullif(x->>'data_vencimento','')::date nulls last, x->>'valor'
    )::smallint,
    (x->>'valor')::numeric,
    nullif(x->>'data_vencimento','')::date,
    'pendente',
    v_conta_destino,
    (select auth.uid())
  from jsonb_array_elements(coalesce(p_parcelas,'[]'::jsonb)) x;

  for r in select * from jsonb_array_elements(coalesce(p_rateios,'[]'::jsonb)) loop
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_id, (r->>'centro_custo_id')::uuid, (r->>'valor')::numeric, (select auth.uid()));
  end loop;

  perform public.fn_aplicar_regra_pagamento(v_id);

  return v_id;
end;
$function$;

revoke all on function public.fn_salvar_lancamento(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.fn_salvar_lancamento(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. fn_aplicar_regra_pagamento volta a ler a forma do cabecalho
-- ---------------------------------------------------------------------------

create or replace function public.fn_aplicar_regra_pagamento(p_lanc_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tipo_lanc text; v_status text; v_valor numeric(14, 2); v_compra date;
  v_tipo_forma text; v_qtd int; v_soma numeric(14, 2); v_parcela record;
  v_sem_conta int;
begin
  select l.tipo, l.status, l.valor, l.data_compra, coalesce(f.tipo, 'bancario')
  into v_tipo_lanc, v_status, v_valor, v_compra, v_tipo_forma
  from public.lancamentos l
  left join public.formas_pagamento f on f.id = l.forma_pagamento_id
  where l.id = p_lanc_id;

  if v_tipo_lanc is null then return; end if;
  if v_tipo_lanc <> 'a_pagar' then return; end if;
  if v_status = 'cancelado' then return; end if;

  if exists (
    select 1 from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('aprovado', 'pago')
  ) then
    return;
  end if;

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd, v_soma
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao');

  if v_qtd = 0 or v_soma <> round(coalesce(v_valor, 0), 2) then
    update public.lancamentos
    set status = 'previsto'
    where id = p_lanc_id and status <> 'previsto';
    return;
  end if;

  select count(*) into v_sem_conta
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status = 'pendente'
    and conta_bancaria_id is null;

  if v_tipo_forma = 'dinheiro' then
    if v_sem_conta > 0 then
      update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;
      return;
    end if;

    update public.lancamento_parcelas
    set status = 'aprovado',
        aprovado_por = (select auth.uid()),
        aprovado_em = now(),
        data_programada = coalesce(
          data_vencimento, (now() at time zone 'America/Rio_Branco')::date
        ),
        data_programada_origem = 'vencimento'
    where lancamento_id = p_lanc_id and status = 'pendente';

    update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;

  elsif v_tipo_forma = 'cartao_credito' then
    if v_sem_conta > 0 then
      update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;
      return;
    end if;

    update public.lancamento_parcelas
    set status = 'pago',
        data_pagamento = coalesce(v_compra, (now() at time zone 'America/Rio_Branco')::date),
        pago_por = (select auth.uid()),
        pago_em = now()
    where lancamento_id = p_lanc_id and status = 'pendente';

    update public.lancamentos set status = 'pago' where id = p_lanc_id;

    for v_parcela in
      select id from public.lancamento_parcelas
      where lancamento_id = p_lanc_id and status = 'pago'
    loop
      perform public.fn_propagar_anexos(
        'lancamento', p_lanc_id, 'pagamento', v_parcela.id
      );
    end loop;

  else
    update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;
  end if;
end;
$function$;

revoke all on function public.fn_aplicar_regra_pagamento(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. Reparcelar sem a guarda de bloco
-- ---------------------------------------------------------------------------
-- Nao ha o que reverter no corpo: sem a tabela, a guarda de 2+ blocos nunca
-- dispara e o `lancamento_forma_id` do insert deixa de existir. A funcao volta
-- na versao sem as tres mencoes a forma.
--
-- Ela e longa e nao mudou em mais nada, entao o caminho aqui e restaurar do
-- arquivo original em vez de repetir 200 linhas:
--   supabase/migrations/20260819143004_alterar_parcelas_exige_motivo_e_grava_evento.sql
--   supabase/migrations/20260819140229_reparcelar_avulso_redistribui_rateio.sql
-- Aplique o mais recente dos dois (o de 143004) e a funcao volta ao estado
-- anterior a este bloco de trabalho.

-- ---------------------------------------------------------------------------
-- 4. A estrutura
-- ---------------------------------------------------------------------------

drop trigger if exists trg_valida_parcelas_da_forma on public.lancamento_parcelas;
drop function if exists public.fn_valida_parcelas_da_forma();
drop trigger if exists trg_valida_soma_das_formas on public.lancamento_formas;
drop function if exists public.fn_valida_soma_das_formas();

-- Antes de derrubar a coluna e a tabela: devolve ao cabecalho a forma dos
-- lancamentos que tinham UMA forma so e ficaram com o cabecalho preenchido (nao
-- muda nada, ja esta lá) e dos que tinham VARIAS, cujo cabecalho estava nulo.
-- Para os de varias formas nao ha resposta certa: fica a de maior valor, com o
-- desempate pelo id, para ser deterministico.
update public.lancamentos l
set forma_pagamento_id = escolhida.forma_pagamento_id
from (
  select distinct on (lancamento_id) lancamento_id, forma_pagamento_id
  from public.lancamento_formas
  order by lancamento_id, valor desc, id
) escolhida
where escolhida.lancamento_id = l.id
  and l.forma_pagamento_id is null;

drop index if exists public.idx_lancamento_parcelas_forma;
alter table public.lancamento_parcelas drop column if exists lancamento_forma_id;

drop table if exists public.lancamento_formas;
