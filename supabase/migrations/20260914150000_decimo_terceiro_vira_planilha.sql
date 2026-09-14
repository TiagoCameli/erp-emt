-- O 13o deixa de calcular e passa a ser planilha, como a folha gerencial.
--
-- Decisao do Tiago em 14/09/2026, depois de rodar o primeiro lote: a empresa
-- paga 13o para quem NAO tem carteira tambem, e o valor de quem entrou durante
-- o ano nao sai de formula nenhuma. Entao:
--
--   1. Entra TODO colaborador ativo, nos tres vinculos (clt, terceiro,
--      diarista), sem filtro de data de admissao.
--   2. O app NAO calcula valor. Bruto, INSS e IRRF sao digitados linha a linha.
--   3. Quem monta o lote tira e acrescenta quem quiser.
--
-- Sai tudo que existia para calcular: avos, percentual, abatimento da 1a
-- parcela e a chave com_desconto. Sai tambem o "regerar", que apagaria o que
-- foi digitado.

-- ===================================================================
-- 1. As colunas de calculo
-- ===================================================================
alter table public.rh_decimo_terceiro
  drop constraint if exists rh_dt_percentual_check;

alter table public.rh_decimo_terceiro
  drop column if exists percentual,
  drop column if exists com_desconto;

alter table public.rh_decimo_terceiro_itens
  drop constraint if exists rh_dt_itens_avos_check;

alter table public.rh_decimo_terceiro_itens
  drop column if exists avos,
  drop column if exists valor_ja_pago;

-- `salario_base` fica: e o salario do cadastro no momento em que o lote foi
-- montado, mostrado em cinza para o Tiago decidir o valor olhando. Contexto,
-- nao conta.
comment on column public.rh_decimo_terceiro_itens.salario_base is
  'Salario do cadastro no momento da geracao. CONTEXTO para quem digita o valor, nunca base de calculo: o app nao calcula 13o.';

-- ===================================================================
-- 2. O liquido e a subtracao, mantida por trigger
-- ===================================================================
-- Coluna comum com trigger, e NAO coluna gerada: coluna gerada faz o
-- PostgREST devolver 428C9 para o frontend publicado antes do deploy novo.
create or replace function public.fn_dt_item_liquido()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.valor_liquido := new.valor_bruto - new.valor_inss - new.valor_irrf;
  return new;
end $$;

comment on function public.fn_dt_item_liquido() is
  'Liquido do item = bruto - INSS - IRRF. E subtracao, nao regra de negocio: os tres termos sao digitados.';

drop trigger if exists rh_dt_itens_liquido on public.rh_decimo_terceiro_itens;
create trigger rh_dt_itens_liquido
  before insert or update of valor_bruto, valor_inss, valor_irrf
  on public.rh_decimo_terceiro_itens
  for each row execute function public.fn_dt_item_liquido();

-- ===================================================================
-- 3. Totais do lote
-- ===================================================================
create or replace function public.fn_dt_recalcular_totais(p_lote uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.rh_decimo_terceiro l
     set valor_bruto = t.bruto,
         valor_descontos = t.descontos,
         valor_liquido = t.liquido,
         updated_at = now()
    from (
      select coalesce(sum(valor_bruto), 0) as bruto,
             coalesce(sum(valor_inss + valor_irrf), 0) as descontos,
             coalesce(sum(valor_liquido), 0) as liquido
        from public.rh_decimo_terceiro_itens
       where decimo_terceiro_id = p_lote
    ) t
   where l.id = p_lote;
end $$;

comment on function public.fn_dt_recalcular_totais(uuid) is
  'Soma os itens no cabecalho do lote. Nao calcula 13o: so agrega o que foi digitado.';

-- ===================================================================
-- 4. Gerar: traz todo mundo, zerado
-- ===================================================================
drop function if exists public.fn_gerar_decimo_terceiro(smallint, smallint, numeric, boolean, date);

create or replace function public.fn_gerar_decimo_terceiro(
  p_ano smallint,
  p_parcela smallint,
  p_data_vencimento date default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_lote uuid;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'criar') then
    raise exception 'Sem permissao para gerar o 13o';
  end if;

  if exists (select 1 from public.rh_decimo_terceiro
              where ano = p_ano and parcela = p_parcela and excluido_em is null) then
    raise exception 'Ja existe um lote de 13o da %a parcela de %.', p_parcela, p_ano;
  end if;

  insert into public.rh_decimo_terceiro (ano, parcela, data_vencimento, created_by)
  values (p_ano, p_parcela, p_data_vencimento, v_uid)
  returning id into v_lote;

  -- TODO colaborador ativo, nos tres vinculos. Sem filtro de data de admissao
  -- e sem filtro de carteira: a empresa paga 13o para terceiro e diarista
  -- tambem, e quem decide quanto e quem monta o lote.
  --
  -- Valores nascem ZERADOS de proposito. Zero nao paga ninguem por descuido, e
  -- a aprovacao ignora linha com liquido <= 0: lote intocado nao vira dinheiro.
  insert into public.rh_decimo_terceiro_itens
    (decimo_terceiro_id, colaborador_id, centro_custo_id, salario_base)
  select v_lote, c.id, c.centro_custo_id, coalesce(c.salario, 0)
    from public.colaboradores c
   where c.ativo
     and c.vinculo in ('clt', 'terceiro', 'diarista');

  perform public.fn_dt_recalcular_totais(v_lote);
  return v_lote;
end $$;

comment on function public.fn_gerar_decimo_terceiro(smallint, smallint, date) is
  'Cria o lote com TODO colaborador ativo dos tres vinculos, com valores ZERADOS. O app nao calcula 13o: quem monta o lote digita cada valor.';

-- ===================================================================
-- 5. Editar: os tres valores digitados
-- ===================================================================
drop function if exists public.fn_editar_item_decimo_terceiro(uuid, numeric);

create or replace function public.fn_editar_item_decimo_terceiro(
  p_item uuid,
  p_bruto numeric,
  p_inss numeric default 0,
  p_irrf numeric default 0
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_lote uuid;
  v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar o 13o';
  end if;

  if p_bruto is null or p_bruto < 0 then
    raise exception 'O bruto nao pode ser negativo';
  end if;
  if coalesce(p_inss, 0) < 0 or coalesce(p_irrf, 0) < 0 then
    raise exception 'O desconto nao pode ser negativo';
  end if;
  if coalesce(p_inss, 0) + coalesce(p_irrf, 0) > p_bruto then
    raise exception 'Os descontos (%) passam do bruto (%): o liquido ficaria negativo.',
      coalesce(p_inss, 0) + coalesce(p_irrf, 0), p_bruto;
  end if;

  select i.decimo_terceiro_id, l.status into v_lote, v_status
    from public.rh_decimo_terceiro_itens i
    join public.rh_decimo_terceiro l on l.id = i.decimo_terceiro_id
   where i.id = p_item and l.excluido_em is null
   for update;

  if not found then raise exception 'Item nao encontrado'; end if;

  if v_status <> 'rascunho' then
    raise exception 'O lote esta em "%": so da para editar em rascunho.', v_status;
  end if;

  update public.rh_decimo_terceiro_itens
     set valor_bruto = p_bruto,
         valor_inss = coalesce(p_inss, 0),
         valor_irrf = coalesce(p_irrf, 0),
         editado_manualmente = true
   where id = p_item;

  perform public.fn_dt_recalcular_totais(v_lote);
end $$;

comment on function public.fn_editar_item_decimo_terceiro(uuid, numeric, numeric, numeric) is
  'Grava bruto, INSS e IRRF digitados. O liquido sai do trigger. Recusa desconto maior que o bruto.';

-- ===================================================================
-- 6. Tirar e acrescentar
-- ===================================================================
create or replace function public.fn_tirar_do_lote_decimo_terceiro(p_item uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_lote uuid; v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar o 13o';
  end if;

  select i.decimo_terceiro_id, l.status into v_lote, v_status
    from public.rh_decimo_terceiro_itens i
    join public.rh_decimo_terceiro l on l.id = i.decimo_terceiro_id
   where i.id = p_item and l.excluido_em is null
   for update;
  if not found then raise exception 'Item nao encontrado'; end if;

  if v_status <> 'rascunho' then
    raise exception 'O lote esta em "%": so da para tirar do lote em rascunho.', v_status;
  end if;

  -- Delete mesmo, sem lixeira: a linha e do LOTE, nao do colaborador, e o
  -- proprio "Adicionar colaborador" desfaz. O audit_log guarda o que saiu.
  delete from public.rh_decimo_terceiro_itens where id = p_item;

  perform public.fn_dt_recalcular_totais(v_lote);
end $$;

comment on function public.fn_tirar_do_lote_decimo_terceiro(uuid) is
  'Tira a linha do lote (so em rascunho). Nao mexe no colaborador: e exclusao daquele lote, e Adicionar colaborador desfaz.';

create or replace function public.fn_adicionar_ao_lote_decimo_terceiro(
  p_lote uuid, p_colaborador uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text; v_item uuid; v_nome text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar o 13o';
  end if;

  select status into v_status from public.rh_decimo_terceiro
   where id = p_lote and excluido_em is null for update;
  if not found then raise exception 'Lote nao encontrado'; end if;

  if v_status <> 'rascunho' then
    raise exception 'O lote esta em "%": so da para acrescentar em rascunho.', v_status;
  end if;

  select nome into v_nome from public.colaboradores where id = p_colaborador;
  if v_nome is null then raise exception 'Colaborador nao encontrado'; end if;

  if exists (select 1 from public.rh_decimo_terceiro_itens
              where decimo_terceiro_id = p_lote and colaborador_id = p_colaborador) then
    raise exception '% ja esta neste lote.', v_nome;
  end if;

  insert into public.rh_decimo_terceiro_itens
    (decimo_terceiro_id, colaborador_id, centro_custo_id, salario_base)
  select p_lote, c.id, c.centro_custo_id, coalesce(c.salario, 0)
    from public.colaboradores c where c.id = p_colaborador
  returning id into v_item;

  perform public.fn_dt_recalcular_totais(p_lote);
  return v_item;
end $$;

comment on function public.fn_adicionar_ao_lote_decimo_terceiro(uuid, uuid) is
  'Acrescenta um colaborador ao lote, zerado (so em rascunho). Existe porque nao ha "regerar": regerar apagaria o que foi digitado.';

-- ===================================================================
-- 7. Aprovar: a guia agora vem do que foi digitado
-- ===================================================================
create or replace function public.fn_aprovar_decimo_terceiro(p_lote uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_l record; v_item record;
  v_uid uuid := (select auth.uid());
  v_comp date; v_venc date; v_lanc uuid; v_parcela uuid;
  v_aprova_pgto boolean := public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar');
  v_st_parcela text;
  v_grupo_inss text; v_grupo_irrf text;
  v_tot_inss numeric(14,2); v_tot_irrf numeric(14,2);
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'aprovar') then
    raise exception 'Sem permissao para aprovar o 13o';
  end if;

  select * into v_l from public.rh_decimo_terceiro
   where id = p_lote and excluido_em is null for update;
  if not found then raise exception 'Lote nao encontrado'; end if;

  if v_l.status <> 'pendente_aprovacao' then
    raise exception 'O lote esta em "%": so da para aprovar o que esta pendente de aprovacao.', v_l.status;
  end if;

  -- Lote inteiro zerado nao vira dinheiro nenhum, e aprovar seria um clique
  -- que nao faz nada. Melhor recusar dizendo o porque.
  if v_l.valor_liquido <= 0 then
    raise exception 'O lote esta zerado: preencha os valores antes de aprovar.';
  end if;

  v_comp := make_date(v_l.ano, 12, 1);
  perform public.fn_exigir_competencia_aberta(v_comp, 'decimo_terceiro', p_lote);

  v_venc := coalesce(v_l.data_vencimento, make_date(v_l.ano, 12, 20));
  v_st_parcela := case when v_aprova_pgto then 'aprovado' else 'pendente' end;

  for v_item in
    select i.*, c.nome
      from public.rh_decimo_terceiro_itens i
      join public.colaboradores c on c.id = i.colaborador_id
     where i.decimo_terceiro_id = p_lote
       and i.valor_liquido > 0
     order by c.nome
  loop
    insert into public.lancamentos
      (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
       data_compra, mes_competencia, data_vencimento, created_by)
    values
      ('a_pagar', 'decimo_terceiro', v_item.id, v_item.centro_custo_id,
       '13o ' || v_item.nome || ' ' || v_l.parcela || 'a parcela ' || v_l.ano,
       v_item.valor_liquido, 'a_pagar',
       (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc, v_uid)
    returning id into v_lanc;

    insert into public.lancamento_parcelas
      (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by,
       aprovado_por, aprovado_em, data_programada, data_programada_origem)
    values (v_lanc, 1, v_item.valor_liquido, v_venc, v_st_parcela, v_uid,
       case when v_aprova_pgto then v_uid end,
       case when v_aprova_pgto then now() end,
       case when v_aprova_pgto then v_venc end,
       case when v_aprova_pgto then 'vencimento' end)
    returning id into v_parcela;

    if v_aprova_pgto then
      insert into public.parcela_eventos (parcela_id, tipo, data_para, created_by)
      values (v_parcela, 'aprovou', v_venc, v_uid);
    end if;

    if v_item.centro_custo_id is not null then
      insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
      values (v_lanc, v_item.centro_custo_id, v_item.valor_liquido, v_uid);
    end if;

    update public.rh_decimo_terceiro_itens set lancamento_id = v_lanc where id = v_item.id;
  end loop;

  -- A guia sai do que foi DIGITADO nas linhas, nao de uma chave do lote.
  -- Sem INSS/IRRF digitado, nao ha guia, que e o caso de quem paga 13o sem
  -- desconto.
  select coalesce(sum(valor_inss), 0), coalesce(sum(valor_irrf), 0)
    into v_tot_inss, v_tot_irrf
    from public.rh_decimo_terceiro_itens where decimo_terceiro_id = p_lote;

  if v_tot_inss > 0 or v_tot_irrf > 0 then
    select grupo_recolhimento_inss, grupo_recolhimento_irrf
      into v_grupo_inss, v_grupo_irrf
      from public.folha_parametros where id = 1;

    if v_grupo_inss is not null and v_tot_inss > 0 then
      insert into public.lancamentos
        (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
         data_compra, mes_competencia, data_vencimento, created_by)
      values ('a_pagar', 'decimo_terceiro_guia', p_lote, null,
        v_grupo_inss || ' 13o ' || v_l.parcela || 'a parcela ' || v_l.ano,
        v_tot_inss, 'a_pagar',
        (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc, v_uid)
      returning id into v_lanc;
      insert into public.lancamento_parcelas
        (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
      values (v_lanc, 1, v_tot_inss, v_venc, 'pendente', v_uid);
    end if;

    if v_grupo_irrf is not null and v_tot_irrf > 0 then
      insert into public.lancamentos
        (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
         data_compra, mes_competencia, data_vencimento, created_by)
      values ('a_pagar', 'decimo_terceiro_guia', p_lote, null,
        v_grupo_irrf || ' 13o ' || v_l.parcela || 'a parcela ' || v_l.ano,
        v_tot_irrf, 'a_pagar',
        (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc, v_uid)
      returning id into v_lanc;
      insert into public.lancamento_parcelas
        (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
      values (v_lanc, 1, v_tot_irrf, v_venc, 'pendente', v_uid);
    end if;
  end if;

  update public.rh_decimo_terceiro
     set status = 'aprovado', aprovado_por = v_uid, aprovado_em = now(),
         motivo_rejeicao = null, updated_at = now()
   where id = p_lote;
end $$;

comment on function public.fn_aprovar_decimo_terceiro(uuid) is
  'Aprova o lote: uma conta a pagar por linha com liquido > 0, no centro de custo do colaborador, e guia por grupo quando houver INSS/IRRF digitado. Recusa lote zerado.';

-- ===================================================================
-- 8. Enviar para aprovacao: lote zerado nao vai
-- ===================================================================
create or replace function public.fn_enviar_decimo_terceiro_aprovacao(p_lote uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text; v_itens integer; v_liquido numeric;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para enviar o 13o para aprovacao';
  end if;

  select status, valor_liquido into v_status, v_liquido
    from public.rh_decimo_terceiro
   where id = p_lote and excluido_em is null for update;
  if not found then raise exception 'Lote nao encontrado'; end if;

  if v_status <> 'rascunho' then
    raise exception 'O lote esta em "%": so da para enviar o que esta em rascunho.', v_status;
  end if;

  select count(*) into v_itens from public.rh_decimo_terceiro_itens
   where decimo_terceiro_id = p_lote;
  if v_itens = 0 then
    raise exception 'O lote esta vazio: acrescente ao menos um colaborador.';
  end if;

  -- O lote nasce zerado por desenho, entao "todo mundo em branco" e o estado
  -- inicial e nao pode virar aprovacao por engano.
  if coalesce(v_liquido, 0) <= 0 then
    raise exception 'O lote esta zerado: preencha os valores antes de enviar para aprovacao.';
  end if;

  update public.rh_decimo_terceiro
     set status = 'pendente_aprovacao', motivo_rejeicao = null, updated_at = now()
   where id = p_lote;
end $$;
