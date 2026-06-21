-- =============================================================
-- Fase 5 / Migration: fn_executar_checklist com parâmetros opcionais
-- Operador, horímetro, km e observação são opcionais. Para o tipo gerado
-- marcá-los como opcionais (e evitar cast no client), eles precisam ter
-- DEFAULT e vir DEPOIS dos obrigatórios. Como p_respostas (obrigatório)
-- estava no meio, reordeno a assinatura: dropa a antiga e recria.
-- Chamada é por nome (supabase.rpc), então a ordem não afeta o app.
-- =============================================================

drop function if exists public.fn_executar_checklist(uuid, uuid, uuid, numeric, numeric, text, jsonb, boolean);

create or replace function public.fn_executar_checklist(
  p_checklist uuid, p_equipamento uuid, p_respostas jsonb,
  p_operador uuid default null, p_horimetro numeric default null, p_km numeric default null,
  p_obs text default null, p_abrir_os boolean default true
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
