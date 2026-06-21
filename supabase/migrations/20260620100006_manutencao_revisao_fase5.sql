-- =============================================================
-- Fase 5 / Migration: correções da revisão adversarial
-- 1. fn_concluir_os: o lançamento do terceiro passa a criar lancamento_rateios
--    no CC do equipamento, para o custo aparecer no relatório por centro de
--    custo (igual às demais funções que geram lançamento).
-- 2. RLS de os_mao_obra/os_terceiros: insert/delete só com a OS aberta ou em
--    execução (impede desincronizar o custo congelado de uma OS concluída).
-- 3. fn_executar_checklist: valida que cada pergunta pertence ao checklist.
-- =============================================================

-- 1. fn_concluir_os com rateio do terceiro.
create or replace function public.fn_concluir_os(p_os uuid, p_horimetro_fech numeric default null, p_km_fech numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_status text; v_equip uuid; v_cc uuid; v_numero text;
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

  for v_tr in select * from public.os_terceiros where ordem_servico_id = p_os and lancamento_id is null and valor > 0 loop
    insert into public.lancamentos (tipo, origem, origem_id, fornecedor_id, centro_custo_id, descricao, valor, status, competencia, data_vencimento, created_by)
    values ('a_pagar', 'os', p_os, v_tr.fornecedor_id, v_cc, 'OS ' || coalesce(v_numero, '') || ' - ' || v_tr.descricao, v_tr.valor, 'a_pagar', v_competencia, v_tr.data_vencimento, (select auth.uid()))
    returning id into v_lanc;
    insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_lanc, 1, v_tr.valor, v_tr.data_vencimento, 'pendente', (select auth.uid()));
    if v_cc is not null then
      insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
      values (v_lanc, v_cc, v_tr.valor, (select auth.uid()));
    end if;
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

-- 2. RLS de os_mao_obra/os_terceiros: só mexe com a OS aberta ou em execução.
drop policy if exists os_mao_obra_insert on public.os_mao_obra;
create policy os_mao_obra_insert on public.os_mao_obra for insert to authenticated
  with check (
    (select public.tem_permissao('manutencao.ordens-servico', 'editar'))
    and exists (select 1 from public.ordens_servico o where o.id = ordem_servico_id and o.status in ('aberta', 'em_execucao'))
  );
drop policy if exists os_mao_obra_delete on public.os_mao_obra;
create policy os_mao_obra_delete on public.os_mao_obra for delete to authenticated
  using (
    (select public.tem_permissao('manutencao.ordens-servico', 'editar'))
    and exists (select 1 from public.ordens_servico o where o.id = ordem_servico_id and o.status in ('aberta', 'em_execucao'))
  );

drop policy if exists os_terceiros_insert on public.os_terceiros;
create policy os_terceiros_insert on public.os_terceiros for insert to authenticated
  with check (
    (select public.tem_permissao('manutencao.ordens-servico', 'editar'))
    and exists (select 1 from public.ordens_servico o where o.id = ordem_servico_id and o.status in ('aberta', 'em_execucao'))
  );
drop policy if exists os_terceiros_delete on public.os_terceiros;
create policy os_terceiros_delete on public.os_terceiros for delete to authenticated
  using (
    (select public.tem_permissao('manutencao.ordens-servico', 'editar'))
    and exists (select 1 from public.ordens_servico o where o.id = ordem_servico_id and o.status in ('aberta', 'em_execucao'))
  );

-- 3. fn_executar_checklist valida pergunta x checklist.
create or replace function public.fn_executar_checklist(
  p_checklist uuid, p_equipamento uuid, p_respostas jsonb,
  p_operador uuid default null, p_horimetro numeric default null, p_km numeric default null,
  p_obs text default null, p_abrir_os boolean default true
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_nome text; v_exec uuid; v_item jsonb; v_status text := 'ok'; v_tem_nok boolean := false;
  v_os uuid; v_nok_desc text; v_pergunta uuid;
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
    v_pergunta := (v_item->>'pergunta_id')::uuid;
    if not exists (select 1 from public.checklist_perguntas where id = v_pergunta and checklist_id = p_checklist) then
      raise exception 'Pergunta nao pertence ao checklist informado';
    end if;
    insert into public.checklist_respostas (execucao_id, pergunta_id, resposta, observacao)
    values (v_exec, v_pergunta, v_item->>'resposta', nullif(v_item->>'observacao', ''));
  end loop;

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
revoke all on function public.fn_executar_checklist(uuid, uuid, jsonb, uuid, numeric, numeric, text, boolean) from public, anon;
grant execute on function public.fn_executar_checklist(uuid, uuid, jsonb, uuid, numeric, numeric, text, boolean) to authenticated;
