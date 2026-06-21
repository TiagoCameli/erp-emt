-- =============================================================
-- Fase 5 / Migration: funções de manutenção
-- Abrir/iniciar/concluir/cancelar OS, adicionar peça (baixa do almoxarifado
-- por PEPS), gerar OS preventiva de um plano, executar checklist (pendência
-- abre OS). Custo cai no centro de custo Manutenção > Equipamento.
-- =============================================================

-- Permite lançamento financeiro com origem 'os' (serviço de terceiro).
alter table public.lancamentos drop constraint if exists lancamentos_origem_check;
alter table public.lancamentos add constraint lancamentos_origem_check
  check (origem = any (array['oc', 'manual', 'fatura', 'os']));

-- ---------- Abrir OS ----------
create or replace function public.fn_abrir_os(
  p_equipamento uuid, p_tipo text, p_descricao text,
  p_prioridade text default 'media', p_horimetro numeric default null, p_km numeric default null,
  p_origem text default 'manual', p_origem_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_cc uuid; v_numero text; v_os uuid;
begin
  if not public.tem_permissao('manutencao.ordens-servico', 'criar') then raise exception 'Sem permissao para abrir ordem de servico'; end if;
  if coalesce(btrim(p_descricao), '') = '' then raise exception 'Descreva o problema ou o servico'; end if;

  select id into v_cc from public.centros_custo where equipamento_id = p_equipamento limit 1;
  v_numero := public.proximo_numero_documento('OS');

  insert into public.ordens_servico (numero, equipamento_id, centro_custo_id, tipo, prioridade, descricao, horimetro_abertura, km_abertura, origem, origem_id, status, created_by)
  values (v_numero, p_equipamento, v_cc, p_tipo, p_prioridade, p_descricao, p_horimetro, p_km, p_origem, p_origem_id, 'aberta', (select auth.uid()))
  returning id into v_os;

  insert into public.os_transicoes (ordem_servico_id, de_status, para_status, usuario_id)
  values (v_os, null, 'aberta', (select auth.uid()));

  if p_horimetro is not null then
    insert into public.leituras_equipamento (equipamento_id, tipo, valor, origem, origem_id, created_by)
    values (p_equipamento, 'horimetro', p_horimetro, 'os', v_os, (select auth.uid()));
  end if;
  if p_km is not null then
    insert into public.leituras_equipamento (equipamento_id, tipo, valor, origem, origem_id, created_by)
    values (p_equipamento, 'km', p_km, 'os', v_os, (select auth.uid()));
  end if;

  return v_os;
end $$;
revoke all on function public.fn_abrir_os(uuid, text, text, text, numeric, numeric, text, uuid) from public, anon;
grant execute on function public.fn_abrir_os(uuid, text, text, text, numeric, numeric, text, uuid) to authenticated;

-- ---------- Iniciar OS (aberta -> em_execucao) ----------
create or replace function public.fn_iniciar_os(p_os uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if not public.tem_permissao('manutencao.ordens-servico', 'editar') then raise exception 'Sem permissao'; end if;
  select status into v_status from public.ordens_servico where id = p_os;
  if v_status is null then raise exception 'OS nao encontrada'; end if;
  if v_status <> 'aberta' then raise exception 'So da para iniciar uma OS aberta'; end if;
  update public.ordens_servico set status = 'em_execucao' where id = p_os;
  insert into public.os_transicoes (ordem_servico_id, de_status, para_status, usuario_id)
  values (p_os, 'aberta', 'em_execucao', (select auth.uid()));
end $$;
revoke all on function public.fn_iniciar_os(uuid) from public, anon;
grant execute on function public.fn_iniciar_os(uuid) to authenticated;

-- ---------- Adicionar peça (baixa do almoxarifado) ----------
create or replace function public.fn_os_adicionar_peca(p_os uuid, p_insumo uuid, p_deposito uuid, p_quantidade numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_status text; v_equip uuid; v_cc uuid; v_numero text; v_mov uuid; v_custo numeric; v_unit numeric; v_peca uuid;
begin
  if not public.tem_permissao('manutencao.ordens-servico', 'editar') then raise exception 'Sem permissao'; end if;
  if p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;

  select status, equipamento_id, centro_custo_id, numero into v_status, v_equip, v_cc, v_numero
  from public.ordens_servico where id = p_os;
  if v_status is null then raise exception 'OS nao encontrada'; end if;
  if v_status not in ('aberta', 'em_execucao') then raise exception 'So da para adicionar peca em OS aberta ou em execucao'; end if;

  v_mov := public.fn_estoque_saida_interna(p_insumo, p_deposito, p_quantidade, 'consumo', v_cc, 'os', p_os, null, 'Peca da OS ' || coalesce(v_numero, ''), v_equip);
  select custo_total into v_custo from public.estoque_movimentos where id = v_mov;
  v_unit := case when p_quantidade > 0 then round(v_custo / p_quantidade, 4) else 0 end;

  insert into public.os_pecas (ordem_servico_id, insumo_id, deposito_id, movimento_id, quantidade, custo_unitario, custo_total, created_by)
  values (p_os, p_insumo, p_deposito, v_mov, p_quantidade, v_unit, round(v_custo, 2), (select auth.uid()))
  returning id into v_peca;
  return v_peca;
end $$;
revoke all on function public.fn_os_adicionar_peca(uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.fn_os_adicionar_peca(uuid, uuid, uuid, numeric) to authenticated;

-- ---------- Concluir OS (totais + terceiros -> financeiro + leitura) ----------
create or replace function public.fn_concluir_os(p_os uuid, p_horimetro_fech numeric default null, p_km_fech numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_status text; v_equip uuid; v_cc uuid; v_numero text; v_fornec uuid;
  v_pecas numeric; v_mao numeric; v_terc numeric; v_tr record; v_lanc uuid;
  v_competencia date := (now() at time zone 'America/Rio_Branco')::date;
begin
  if not public.tem_permissao('manutencao.ordens-servico', 'editar') then raise exception 'Sem permissao'; end if;
  select status, equipamento_id, centro_custo_id, numero into v_status, v_equip, v_cc, v_numero
  from public.ordens_servico where id = p_os;
  if v_status is null then raise exception 'OS nao encontrada'; end if;
  if v_status not in ('aberta', 'em_execucao') then raise exception 'So da para concluir OS aberta ou em execucao'; end if;

  select coalesce(sum(custo_total), 0) into v_pecas from public.os_pecas where ordem_servico_id = p_os;
  select coalesce(sum(custo_total), 0) into v_mao from public.os_mao_obra where ordem_servico_id = p_os;
  select coalesce(sum(valor), 0) into v_terc from public.os_terceiros where ordem_servico_id = p_os;

  -- Cada terceiro vira um lançamento a pagar (uma vez), com CC do equipamento.
  for v_tr in select * from public.os_terceiros where ordem_servico_id = p_os and lancamento_id is null and valor > 0 loop
    insert into public.lancamentos (tipo, origem, origem_id, fornecedor_id, centro_custo_id, descricao, valor, status, competencia, data_vencimento, created_by)
    values ('a_pagar', 'os', p_os, v_tr.fornecedor_id, v_cc, 'OS ' || coalesce(v_numero, '') || ' - ' || v_tr.descricao, v_tr.valor, 'a_pagar', v_competencia, v_tr.data_vencimento, (select auth.uid()))
    returning id into v_lanc;
    insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_lanc, 1, v_tr.valor, v_tr.data_vencimento, 'pendente', (select auth.uid()));
    update public.os_terceiros set lancamento_id = v_lanc where id = v_tr.id;
  end loop;

  update public.ordens_servico
  set status = 'concluida', data_conclusao = v_competencia,
      horimetro_fechamento = p_horimetro_fech, km_fechamento = p_km_fech,
      custo_pecas = v_pecas, custo_mao_obra = v_mao, custo_terceiros = v_terc,
      custo_total = v_pecas + v_mao + v_terc
  where id = p_os;

  insert into public.os_transicoes (ordem_servico_id, de_status, para_status, usuario_id)
  values (p_os, v_status, 'concluida', (select auth.uid()));

  if p_horimetro_fech is not null then
    insert into public.leituras_equipamento (equipamento_id, tipo, valor, origem, origem_id, created_by)
    values (v_equip, 'horimetro', p_horimetro_fech, 'os', p_os, (select auth.uid()));
  end if;
  if p_km_fech is not null then
    insert into public.leituras_equipamento (equipamento_id, tipo, valor, origem, origem_id, created_by)
    values (v_equip, 'km', p_km_fech, 'os', p_os, (select auth.uid()));
  end if;
end $$;
revoke all on function public.fn_concluir_os(uuid, numeric, numeric) from public, anon;
grant execute on function public.fn_concluir_os(uuid, numeric, numeric) to authenticated;

-- ---------- Cancelar OS ----------
create or replace function public.fn_cancelar_os(p_os uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if not public.tem_permissao('manutencao.ordens-servico', 'editar') then raise exception 'Sem permissao'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  select status into v_status from public.ordens_servico where id = p_os;
  if v_status is null then raise exception 'OS nao encontrada'; end if;
  if v_status not in ('aberta', 'em_execucao') then raise exception 'So da para cancelar OS aberta ou em execucao'; end if;
  if exists (select 1 from public.os_pecas where ordem_servico_id = p_os) then
    raise exception 'OS com pecas ja baixadas do estoque nao pode ser cancelada. Conclua a OS ou ajuste o inventario';
  end if;
  update public.ordens_servico set status = 'cancelada', motivo_cancelamento = p_motivo where id = p_os;
  insert into public.os_transicoes (ordem_servico_id, de_status, para_status, motivo, usuario_id)
  values (p_os, v_status, 'cancelada', p_motivo, (select auth.uid()));
end $$;
revoke all on function public.fn_cancelar_os(uuid, text) from public, anon;
grant execute on function public.fn_cancelar_os(uuid, text) to authenticated;

-- ---------- Gerar OS preventiva de um plano atribuído ----------
create or replace function public.fn_gerar_os_preventiva(p_equip_plano uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_equip uuid; v_plano uuid; v_nome text; v_desc text; v_os uuid;
  v_hor numeric; v_km numeric; v_atividades text;
begin
  if not public.tem_permissao('manutencao.ordens-servico', 'criar') then raise exception 'Sem permissao para abrir ordem de servico'; end if;
  select ep.equipamento_id, ep.plano_id, pp.nome into v_equip, v_plano, v_nome
  from public.equipamento_planos ep join public.planos_preventivos pp on pp.id = ep.plano_id
  where ep.id = p_equip_plano;
  if v_equip is null then raise exception 'Plano do equipamento nao encontrado'; end if;

  select string_agg(descricao, '; ' order by ordem) into v_atividades from public.plano_atividades where plano_id = v_plano;
  v_desc := 'Preventiva: ' || coalesce(v_nome, '') || coalesce(' (' || v_atividades || ')', '');

  select valor into v_hor from public.leituras_equipamento where equipamento_id = v_equip and tipo = 'horimetro' order by data desc, created_at desc limit 1;
  select valor into v_km from public.leituras_equipamento where equipamento_id = v_equip and tipo = 'km' order by data desc, created_at desc limit 1;

  v_os := public.fn_abrir_os(v_equip, 'preventiva', v_desc, 'media', v_hor, v_km, 'preventiva', p_equip_plano);

  -- Reseta a base de cálculo do plano para a leitura atual (próximo ciclo).
  update public.equipamento_planos
  set base_horimetro = v_hor, base_km = v_km, base_data = (now() at time zone 'America/Rio_Branco')::date
  where id = p_equip_plano;

  return v_os;
end $$;
revoke all on function public.fn_gerar_os_preventiva(uuid) from public, anon;
grant execute on function public.fn_gerar_os_preventiva(uuid) to authenticated;

-- ---------- Executar checklist (pendência pode abrir OS) ----------
create or replace function public.fn_executar_checklist(
  p_checklist uuid, p_equipamento uuid, p_operador uuid,
  p_horimetro numeric, p_km numeric, p_obs text, p_respostas jsonb, p_abrir_os boolean default true
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_nome text; v_exec uuid; v_item jsonb; v_status text := 'ok'; v_tem_nok boolean := false;
  v_os uuid; v_nok_desc text;
begin
  if not public.tem_permissao('manutencao.checklists', 'criar') then raise exception 'Sem permissao para executar checklist'; end if;
  if p_respostas is null or jsonb_array_length(p_respostas) = 0 then raise exception 'Responda ao menos uma pergunta'; end if;
  select nome into v_nome from public.checklists where id = p_checklist;
  if v_nome is null then raise exception 'Checklist nao encontrado'; end if;

  if exists (select 1 from jsonb_array_elements(p_respostas) r where r->>'resposta' = 'nok') then
    v_tem_nok := true; v_status := 'com_pendencia';
  end if;

  insert into public.checklist_execucoes (checklist_id, equipamento_id, operador_id, horimetro, km, status, observacao, created_by)
  values (p_checklist, p_equipamento, p_operador, p_horimetro, p_km, v_status, p_obs, (select auth.uid()))
  returning id into v_exec;

  for v_item in select * from jsonb_array_elements(p_respostas) loop
    insert into public.checklist_respostas (execucao_id, pergunta_id, resposta, observacao)
    values (v_exec, (v_item->>'pergunta_id')::uuid, v_item->>'resposta', nullif(v_item->>'observacao', ''));
  end loop;

  -- Item reprovado abre uma OS corretiva, se o usuário puder e tiver pedido.
  if v_tem_nok and p_abrir_os and public.tem_permissao('manutencao.ordens-servico', 'criar') then
    select string_agg(p.pergunta || coalesce(': ' || nullif(cr.observacao, ''), ''), '; ')
    into v_nok_desc
    from public.checklist_respostas cr join public.checklist_perguntas p on p.id = cr.pergunta_id
    where cr.execucao_id = v_exec and cr.resposta = 'nok';

    v_os := public.fn_abrir_os(p_equipamento, 'corretiva', 'Checklist ' || v_nome || ': ' || coalesce(v_nok_desc, 'item reprovado'), 'alta', p_horimetro, p_km, 'checklist', v_exec);
    update public.checklist_respostas set os_id = v_os where execucao_id = v_exec and resposta = 'nok';
  end if;

  if p_horimetro is not null then
    insert into public.leituras_equipamento (equipamento_id, tipo, valor, origem, origem_id, created_by)
    values (p_equipamento, 'horimetro', p_horimetro, 'checklist', v_exec, (select auth.uid()));
  end if;
  if p_km is not null then
    insert into public.leituras_equipamento (equipamento_id, tipo, valor, origem, origem_id, created_by)
    values (p_equipamento, 'km', p_km, 'checklist', v_exec, (select auth.uid()));
  end if;

  return v_exec;
end $$;
revoke all on function public.fn_executar_checklist(uuid, uuid, uuid, numeric, numeric, text, jsonb, boolean) from public, anon;
grant execute on function public.fn_executar_checklist(uuid, uuid, uuid, numeric, numeric, text, jsonb, boolean) to authenticated;
