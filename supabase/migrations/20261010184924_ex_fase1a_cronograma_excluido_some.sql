-- Execução F1a, revisão final: atividades de cronograma excluído saem da leitura e não prendem local.
-- Excluir o cronograma só carimba ex_cronogramas.excluido_em; as atividades ficam, mas a view padrão
-- e a trava de exclusão do local passam a ignorá-las.

create or replace view public.ex_v_atividades with (security_invoker = true) as
 SELECT a.id,
    a.cronograma_id,
    a.obra_id,
    a.pai_id,
    p.codigo AS pai_codigo,
    a.tipo,
    a.codigo,
    a.nome,
    a.ordem,
    a.servico_id,
    s.codigo AS servico_codigo,
    s.nome AS servico_nome,
    a.quantidade,
    a.unidade_id,
    u.sigla AS unidade_sigla,
    a.produtividade,
    a.modo_duracao,
    a.duracao_dias,
    a.peso_manual,
    a.valor_orcado,
    a.restricao_data,
    a.restricao_data_em,
    a.responsavel_id,
    a.observacao,
    a.inicio_real,
    a.fim_real,
    d.inicio_cedo,
    d.fim_cedo,
    d.inicio_tarde,
    d.fim_tarde,
    d.folga_total,
    d.folga_livre,
    d.critica,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('codigo', pa.codigo, 'tipo', dp.tipo, 'atraso', dp.atraso_dias) ORDER BY pa.ordem) AS jsonb_agg
           FROM public.ex_dependencias dp
             JOIN public.ex_atividades pa ON pa.id = dp.predecessora_id
          WHERE dp.sucessora_id = a.id), '[]'::jsonb) AS predecessoras,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', l.id, 'codigo', l.codigo, 'nome', l.nome) ORDER BY l.ordem, l.codigo) AS jsonb_agg
           FROM public.ex_atividade_locais al
             JOIN public.ex_locais l ON l.id = al.local_id
          WHERE al.atividade_id = a.id AND l.excluido_em IS NULL), '[]'::jsonb) AS locais,
    a.updated_at AS versao
   FROM public.ex_atividades a
     JOIN public.ex_cronogramas k ON k.id = a.cronograma_id AND k.excluido_em IS NULL
     LEFT JOIN public.ex_atividades p ON p.id = a.pai_id
     LEFT JOIN public.ex_servicos s ON s.id = a.servico_id
     LEFT JOIN public.unidades_medida u ON u.id = a.unidade_id
     LEFT JOIN public.ex_atividade_datas d ON d.atividade_id = a.id
  WHERE a.excluido_em IS NULL;

comment on view public.ex_v_atividades is 'Execução: atividades com datas do CPM, folgas, crítica, predecessoras e locais. Leitura padrão para grade e agentes.';
revoke all on public.ex_v_atividades from anon, authenticated;
grant select on public.ex_v_atividades to authenticated;

CREATE OR REPLACE FUNCTION public.fn_ex_local_excluir(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_obra uuid;
begin
  select obra_id into v_obra from public.ex_locais where id = p_id and excluido_em is null;
  if v_obra is null then raise exception 'Local não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'excluir', v_obra, 'Sem permissão para excluir local');
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'Informe o motivo da exclusão' using errcode = 'P0001'; end if;
  if exists (select 1 from public.ex_locais where pai_id = p_id and excluido_em is null) then
    raise exception 'Exclua ou mova antes os locais que estão dentro deste' using errcode = 'P0001';
  end if;
  -- Atividade de cronograma excluído não conta.
  if exists (select 1 from public.ex_atividade_locais al
               join public.ex_atividades a on a.id = al.atividade_id
               join public.ex_cronogramas k on k.id = a.cronograma_id
             where al.local_id = p_id and a.excluido_em is null and k.excluido_em is null) then
    raise exception 'Há atividades neste local. Tire o local delas antes de excluir' using errcode = 'P0001';
  end if;
  update public.ex_locais set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo) where id = p_id;
end $function$;
