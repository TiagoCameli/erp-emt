-- Execução F1a, revisão final: na edição, fn_ex_calendario_salvar mantém o que não veio (como o lote).
-- Mandar só {"horas_sab": 4} não zera a semana nem volta os feriados para nacional + AC. A criação
-- continua com os mesmos padrões, e a regra do padrão da empresa (travas e mensagens) fica igual.

CREATE OR REPLACE FUNCTION public.fn_ex_calendario_salvar(p_dados jsonb, p_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_modelo boolean; v_atual boolean; v_padrao boolean;
  -- Sem a chave, vale nacional + AC na criação e o que já estava na edição; com a chave (mesmo vazia), vale o que veio.
  v_abr text[] := case when p_dados ? 'feriados_abrangencia'
                       then array(select jsonb_array_elements_text(p_dados -> 'feriados_abrangencia'))
                       else array['nacional', 'AC'] end;
begin
  if p_id is null then
    perform public.fn_ex_exigir('execucao.modelos', 'criar', null, 'Sem permissão para criar calendário');
    v_modelo := true;
  else
    perform public.fn_ex_exigir_calendario(p_id, 'Sem permissão para editar este calendário');
    select modelo, padrao_empresa into v_modelo, v_atual from public.ex_calendarios where id = p_id;
  end if;
  -- Na edição, sem a chave o nome guardado continua; com a chave, não pode vir vazio.
  if (p_id is null or p_dados ? 'nome') and btrim(coalesce(p_dados ->> 'nome', '')) = '' then
    raise exception 'Informe o nome do calendário' using errcode = 'P0001';
  end if;
  -- Na edição, sem a chave o padrão guardado continua valendo; na criação o padrão é falso.
  v_padrao := case when p_dados ? 'padrao_empresa' then coalesce((p_dados ->> 'padrao_empresa')::boolean, false)
                   else coalesce(v_atual, false) end;
  if p_id is not null and v_atual and not v_padrao then
    raise exception 'Escolha outro calendário como padrão da empresa antes de tirar este' using errcode = 'P0001';
  end if;
  if v_padrao and not v_modelo then raise exception 'Só um calendário modelo pode ser o padrão da empresa' using errcode = 'P0001'; end if;
  if v_padrao and not coalesce(v_atual, false) then
    perform pg_advisory_xact_lock(hashtextextended('ex_calendario_padrao', 0));
    update public.ex_calendarios set padrao_empresa = false where padrao_empresa and id is distinct from p_id;
  end if;
  begin
    if p_id is null then
      insert into public.ex_calendarios (nome, modelo, padrao_empresa, horas_seg, horas_ter, horas_qua, horas_qui, horas_sex,
        horas_sab, horas_dom, feriados_abrangencia, municipio, chuvoso_inicio_mes, chuvoso_fim_mes, observacoes)
      values (btrim(p_dados ->> 'nome'), true, v_padrao,
        coalesce((p_dados ->> 'horas_seg')::numeric, 0), coalesce((p_dados ->> 'horas_ter')::numeric, 0),
        coalesce((p_dados ->> 'horas_qua')::numeric, 0), coalesce((p_dados ->> 'horas_qui')::numeric, 0),
        coalesce((p_dados ->> 'horas_sex')::numeric, 0), coalesce((p_dados ->> 'horas_sab')::numeric, 0),
        coalesce((p_dados ->> 'horas_dom')::numeric, 0), v_abr, nullif(btrim(p_dados ->> 'municipio'), ''),
        nullif(p_dados ->> 'chuvoso_inicio_mes', '')::smallint, nullif(p_dados ->> 'chuvoso_fim_mes', '')::smallint,
        nullif(btrim(p_dados ->> 'observacoes'), ''))
      returning id into v_id;
    else
      -- Cada coluna: com a chave, o que veio (mesma regra da criação); sem a chave, o que já estava.
      update public.ex_calendarios set
        nome = case when p_dados ? 'nome' then btrim(p_dados ->> 'nome') else nome end,
        padrao_empresa = v_padrao,
        horas_seg = case when p_dados ? 'horas_seg' then coalesce((p_dados ->> 'horas_seg')::numeric, 0) else horas_seg end,
        horas_ter = case when p_dados ? 'horas_ter' then coalesce((p_dados ->> 'horas_ter')::numeric, 0) else horas_ter end,
        horas_qua = case when p_dados ? 'horas_qua' then coalesce((p_dados ->> 'horas_qua')::numeric, 0) else horas_qua end,
        horas_qui = case when p_dados ? 'horas_qui' then coalesce((p_dados ->> 'horas_qui')::numeric, 0) else horas_qui end,
        horas_sex = case when p_dados ? 'horas_sex' then coalesce((p_dados ->> 'horas_sex')::numeric, 0) else horas_sex end,
        horas_sab = case when p_dados ? 'horas_sab' then coalesce((p_dados ->> 'horas_sab')::numeric, 0) else horas_sab end,
        horas_dom = case when p_dados ? 'horas_dom' then coalesce((p_dados ->> 'horas_dom')::numeric, 0) else horas_dom end,
        feriados_abrangencia = case when p_dados ? 'feriados_abrangencia' then v_abr else feriados_abrangencia end,
        municipio = case when p_dados ? 'municipio' then nullif(btrim(p_dados ->> 'municipio'), '') else municipio end,
        chuvoso_inicio_mes = case when p_dados ? 'chuvoso_inicio_mes' then nullif(p_dados ->> 'chuvoso_inicio_mes', '')::smallint
                                  else chuvoso_inicio_mes end,
        chuvoso_fim_mes = case when p_dados ? 'chuvoso_fim_mes' then nullif(p_dados ->> 'chuvoso_fim_mes', '')::smallint
                               else chuvoso_fim_mes end,
        observacoes = case when p_dados ? 'observacoes' then nullif(btrim(p_dados ->> 'observacoes'), '') else observacoes end
      where id = p_id returning id into v_id;
      perform public.fn_ex_recalcular_calendario(v_id);
    end if;
  exception when unique_violation then
    raise exception 'Outro calendário acabou de virar o padrão da empresa. Tente de novo' using errcode = 'P0001';
  when check_violation then
    raise exception 'Calendário inválido: confira o nome (2 a 120 letras), as horas (0 a 24, ao menos um dia com horas) e o período chuvoso (início e fim juntos)'
      using errcode = 'P0001';
  end;
  return v_id;
end $function$;
