-- Criar o recibo (que cria as ferias junto), editar os valores, o vencimento,
-- e o ciclo ate a aprovacao. A aprovacao em si vem na migration seguinte,
-- porque mexe em dinheiro no financeiro.

-- ===================================================================
-- 1. Lancar ferias: cria a linha E o recibo, numa transacao
-- ===================================================================
-- Uma tela so, e nao "primeiro programe, depois pague": rh_ferias tinha ZERO
-- linhas em producao, o que diz que o cadastro em duas etapas nunca pegou.
create or replace function public.fn_lancar_ferias(
  p_colaborador uuid,
  p_aquisitivo_inicio date,
  p_aquisitivo_fim date,
  p_data_inicio date,
  p_data_fim date,
  p_dias integer,
  p_status text,
  p_bruto numeric,
  p_inss numeric default 0,
  p_irrf numeric default 0,
  p_data_vencimento date default null,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ferias uuid;
  v_cc uuid;
  v_nome text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'criar') then
    raise exception 'Sem permissao para lancar ferias';
  end if;

  select nome, centro_custo_id into v_nome, v_cc
    from public.colaboradores where id = p_colaborador;
  if v_nome is null then raise exception 'Colaborador nao encontrado'; end if;

  if p_status not in ('programada', 'gozada') then
    raise exception 'Status de gozo invalido: %', p_status;
  end if;

  -- Recibo sem dias nem datas nao da para pagar: nao se sabe do que e.
  if p_dias is null or p_dias <= 0 then
    raise exception 'Informe quantos dias de ferias.';
  end if;
  if p_data_inicio is null or p_data_fim is null then
    raise exception 'Informe as datas de inicio e fim do gozo.';
  end if;
  if p_data_fim < p_data_inicio then
    raise exception 'O fim do gozo (%) e antes do inicio (%).',
      to_char(p_data_fim, 'DD/MM/YYYY'), to_char(p_data_inicio, 'DD/MM/YYYY');
  end if;
  if p_aquisitivo_fim < p_aquisitivo_inicio then
    raise exception 'O fim do periodo aquisitivo e antes do inicio.';
  end if;

  if p_bruto is null or p_bruto < 0 then
    raise exception 'O bruto nao pode ser negativo';
  end if;
  if coalesce(p_inss,0) < 0 or coalesce(p_irrf,0) < 0 then
    raise exception 'O desconto nao pode ser negativo';
  end if;
  if coalesce(p_inss,0) + coalesce(p_irrf,0) > p_bruto then
    raise exception 'Os descontos (%) passam do bruto (%): o liquido ficaria negativo.',
      coalesce(p_inss,0) + coalesce(p_irrf,0), p_bruto;
  end if;

  insert into public.rh_ferias
    (colaborador_id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim,
     data_inicio, data_fim, dias, status, observacao,
     status_recibo, valor_bruto, valor_inss, valor_irrf,
     data_vencimento, centro_custo_id, created_by)
  values
    (p_colaborador, p_aquisitivo_inicio, p_aquisitivo_fim,
     p_data_inicio, p_data_fim, p_dias, p_status, p_observacao,
     'rascunho', p_bruto, coalesce(p_inss,0), coalesce(p_irrf,0),
     p_data_vencimento, v_cc, v_uid)
  returning id into v_ferias;

  return v_ferias;
end $$;

comment on function public.fn_lancar_ferias(uuid, date, date, date, date, integer, text, numeric, numeric, numeric, date, text) is
  'Cria a linha de ferias E o recibo em rascunho, numa transacao. O app nao calcula: bruto, INSS e IRRF sao digitados, e o liquido sai do trigger. O centro de custo e fotografado do colaborador.';

-- ===================================================================
-- 2. Editar os valores do recibo
-- ===================================================================
create or replace function public.fn_editar_recibo_ferias(
  p_ferias uuid, p_bruto numeric, p_inss numeric default 0, p_irrf numeric default 0
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar o recibo';
  end if;

  if p_bruto is null or p_bruto < 0 then
    raise exception 'O bruto nao pode ser negativo';
  end if;
  if coalesce(p_inss,0) < 0 or coalesce(p_irrf,0) < 0 then
    raise exception 'O desconto nao pode ser negativo';
  end if;
  if coalesce(p_inss,0) + coalesce(p_irrf,0) > p_bruto then
    raise exception 'Os descontos (%) passam do bruto (%): o liquido ficaria negativo.',
      coalesce(p_inss,0) + coalesce(p_irrf,0), p_bruto;
  end if;

  select status_recibo into v_status from public.rh_ferias
   where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  if v_status <> 'rascunho' then
    raise exception 'O recibo esta em "%": so da para editar em rascunho.', v_status;
  end if;

  update public.rh_ferias
     set valor_bruto = p_bruto,
         valor_inss = coalesce(p_inss,0),
         valor_irrf = coalesce(p_irrf,0),
         updated_at = now()
   where id = p_ferias;
end $$;

-- ===================================================================
-- 3. Vencimento
-- ===================================================================
create or replace function public.fn_definir_vencimento_ferias(
  p_ferias uuid, p_data date
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text; v_inicio date;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar o recibo';
  end if;

  select status_recibo, data_inicio into v_status, v_inicio
    from public.rh_ferias where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  -- So em rascunho: depois de enviado o recibo esta na mao de quem aprova, e
  -- mudar a data por baixo trocaria o que a pessoa autorizou sem ela ver.
  if v_status <> 'rascunho' then
    raise exception 'O recibo esta em "%": a data de vencimento so muda em rascunho.', v_status;
  end if;

  -- Guarda de DIGITACAO: ferias sao pagas ate dois dias antes do gozo, mas
  -- recibo atrasado e caso real. O piso e um ano antes do inicio do gozo, que
  -- pega o erro tipico de ano errado sem recusar o atraso legitimo.
  if p_data is not null and v_inicio is not null
     and p_data < (v_inicio - interval '1 year')::date then
    raise exception 'A data de vencimento (%) esta mais de um ano antes do inicio do gozo (%).',
      to_char(p_data, 'DD/MM/YYYY'), to_char(v_inicio, 'DD/MM/YYYY');
  end if;

  update public.rh_ferias
     set data_vencimento = p_data, updated_at = now()
   where id = p_ferias;
end $$;

-- ===================================================================
-- 4. O ciclo ate a aprovacao
-- ===================================================================
create or replace function public.fn_enviar_recibo_ferias_aprovacao(p_ferias uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text; v_liquido numeric;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para enviar o recibo para aprovacao';
  end if;

  select status_recibo, valor_liquido into v_status, v_liquido
    from public.rh_ferias where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  if v_status <> 'rascunho' then
    raise exception 'O recibo esta em "%": so da para enviar o que esta em rascunho.', v_status;
  end if;

  if coalesce(v_liquido, 0) <= 0 then
    raise exception 'O recibo esta zerado: informe o valor antes de enviar para aprovacao.';
  end if;

  update public.rh_ferias
     set status_recibo = 'pendente_aprovacao', motivo_rejeicao = null, updated_at = now()
   where id = p_ferias;
end $$;

-- Lado de QUEM MONTOU: correcao antes de alguem aprovar, sem motivo.
create or replace function public.fn_voltar_recibo_ferias_para_rascunho(p_ferias uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar o recibo';
  end if;

  select status_recibo into v_status from public.rh_ferias
   where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  if v_status <> 'pendente_aprovacao' then
    raise exception 'O recibo esta em "%": so da para voltar para rascunho o que esta pendente.', v_status;
  end if;

  update public.rh_ferias
     set status_recibo = 'rascunho', motivo_rejeicao = null, updated_at = now()
   where id = p_ferias;
end $$;

-- Lado de QUEM APROVA: devolve COM motivo. Vai para rascunho, e nao para um
-- status 'rejeitado', porque de 'rejeitado' nao se reenvia: seria beco sem
-- saida, que foi o bug do 13o em 12/09.
create or replace function public.fn_rejeitar_recibo_ferias(p_ferias uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'aprovar') then
    raise exception 'Sem permissao para devolver o recibo';
  end if;

  if btrim(coalesce(p_motivo, ''), E' \t\r\n') = '' then
    raise exception 'Informe o motivo da devolucao';
  end if;

  select status_recibo into v_status from public.rh_ferias
   where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  if v_status <> 'pendente_aprovacao' then
    raise exception 'O recibo esta em "%": so da para devolver o que esta pendente.', v_status;
  end if;

  update public.rh_ferias
     set status_recibo = 'rascunho',
         motivo_rejeicao = btrim(p_motivo, E' \t\r\n'),
         updated_at = now()
   where id = p_ferias;
end $$;
