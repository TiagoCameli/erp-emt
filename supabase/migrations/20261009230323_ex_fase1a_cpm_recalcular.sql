-- Execução de Obras, Fase 1a: motor CPM, parte 2. A única função que escreve ex_atividade_datas (cache do CPM).

create or replace function public.fn_ex_cpm_recalcular(p_cronograma uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_obra uuid;
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_cronograma;
  delete from public.ex_atividade_datas where cronograma_id = p_cronograma;
  insert into public.ex_atividade_datas (atividade_id, cronograma_id, obra_id, inicio_cedo, fim_cedo, inicio_tarde,
    fim_tarde, folga_total, folga_livre, critica)
  select c.atividade_id, p_cronograma, v_obra, c.inicio_cedo, c.fim_cedo, c.inicio_tarde, c.fim_tarde,
         c.folga_total, c.folga_livre, c.critica
  from public.fn_ex_cpm_calcular(p_cronograma) c;
  update public.ex_cronogramas set calculado_em = now() where id = p_cronograma;
end $$;

-- Interna: só as RPCs fn_ex_* (security definer) chamam. Nenhum grant para authenticated.
revoke all on function public.fn_ex_cpm_recalcular(uuid) from public, anon, authenticated;
