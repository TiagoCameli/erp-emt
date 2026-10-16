-- Módulo Mapa v1.24 (16/10/2026), pedido do Tiago sobre o print da EH-004:
--
-- "Quando um equipamento está fora de funcionamento eu também posso fazer ele retornar para
-- manutenção e voltar para operação."
--
-- A EH-004 (e a TRE-002 e a TRE-003) estão fora de funcionamento pelo CADASTRO
-- (equipamentos.status = 'fora_funcionamento', da carga da Fase 1). A view v_mapa_equipamentos
-- dá precedência ao cadastro, então marcar outro estado no mapa não mudava nada, e a ficha
-- escondia os botões. Agora, quando a máquina sai do fora de funcionamento pelo mapa, a
-- fn_mapa_marcar_estado devolve o cadastro para 'ativa' e o estado marcado passa a valer
-- (conserto, operando, parado...). O trg_equipamento_status_historico registra a troca com o
-- motivo digitado na ficha.
--
-- Função refeita a partir da definição VIVA (pg_get_functiondef de 16/10, igual à v1.19),
-- acrescentando só o bloco do cadastro. CREATE OR REPLACE mantém os grants.

begin;

create or replace function public.fn_mapa_marcar_estado(p_id uuid, p_estado text, p_motivo text, p_descricao text default null, p_deslocamento jsonb default null, p_previsao date default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_antes jsonb; v_bloqueio text;
begin
  perform public.fn_mapa_exigir('editar');
  if p_estado not in ('operando','parado','em_rota','quebrado_obra','conserto','fora_funcionamento') then
    raise exception 'Estado inválido: %', p_estado;
  end if;
  v_bloqueio := public.fn_mapa_motivo_fora_do_mapa(p_id);
  if v_bloqueio is not null then raise exception '%', v_bloqueio; end if;
  select to_jsonb(m) into v_antes from public.mapa_equipamentos m where m.equipamento_id = p_id;
  if v_antes is null then
    insert into public.mapa_equipamentos (equipamento_id) values (p_id);
    v_antes := '{}'::jsonb;
  end if;
  -- Fora de funcionamento pelo cadastro: sair dele pelo mapa reativa o cadastro.
  if p_estado <> 'fora_funcionamento'
     and exists (select 1 from public.equipamentos e where e.id = p_id and e.status = 'fora_funcionamento') then
    perform set_config('app.status_motivo', 'Voltou pelo Mapa: ' || coalesce(nullif(btrim(p_motivo), ''), p_estado), true);
    update public.equipamentos set status = 'ativa' where id = p_id;
    perform set_config('app.status_motivo', '', true);
    v_antes := v_antes || jsonb_build_object('estado', 'fora_funcionamento');
  end if;
  update public.mapa_equipamentos m set
    estado = p_estado,
    estado_desde = case when m.estado is distinct from p_estado then now() else m.estado_desde end,
    quebra_descricao = case when p_estado = 'quebrado_obra' then p_descricao end,
    deslocamento = case when p_estado = 'em_rota' then coalesce(p_deslocamento, m.deslocamento) end,
    conserto_motivo   = case when p_estado = 'conserto' then coalesce(p_descricao, p_motivo) end,
    conserto_entrada  = case when p_estado = 'conserto' then coalesce(case when m.estado = 'conserto' then m.conserto_entrada end, (now() at time zone 'America/Rio_Branco')::date) end,
    conserto_previsao = case when p_estado = 'conserto' then coalesce(p_previsao, case when m.estado = 'conserto' then m.conserto_previsao end) end,
    updated_by = auth.uid()
  where m.equipamento_id = p_id;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo)
  values ('estado', 'equipamento', p_id, jsonb_build_object('estado', v_antes->'estado'),
          jsonb_build_object('estado', p_estado, 'descricao', p_descricao, 'previsao', p_previsao, 'deslocamento', p_deslocamento), p_motivo);
end $function$;

-- Desfazer pelo Histórico (fn_mapa_desfazer_movimentacao, v1.23) restaura só mapa_equipamentos
-- pela auditoria; o cadastro reativado ficaria ativa e a máquina voltaria como "parada". Quando
-- a movimentação desfeita saiu de fora_funcionamento, a máquina volta como fora marcado no mapa.
-- Refeita a partir da definição VIVA (igual à v1.23, conferido por diff em 16/10).

create or replace function public.fn_mapa_desfazer_movimentacao(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r public.mapa_movimentacoes;
  v_antes jsonb;
  v_depois jsonb;
  v_atual jsonb;
  v_campos text[];
  v_mudou text[];
  v_patch jsonb;
  v_cols text;
begin
  perform public.fn_mapa_exigir('editar');
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo para desfazer a movimentação';
  end if;

  select * into r from public.mapa_movimentacoes m where m.id = p_id for update;
  if not found then raise exception 'Movimentação não encontrada'; end if;
  if r.desfeita_em is not null then raise exception 'Esta movimentação já foi desfeita'; end if;
  if r.alvo <> 'equipamento' or r.tipo not in ('transferencia', 'posicao', 'estado') then
    raise exception 'Só dá para desfazer transferência, posição e estado de máquina';
  end if;
  if exists (
    select 1 from public.mapa_movimentacoes m
    where m.alvo = r.alvo and m.alvo_id = r.alvo_id and m.desfeita_em is null
      and (m.criado_em, m.id) > (r.criado_em, r.id)
  ) then
    raise exception 'Só dá para desfazer a última movimentação da máquina: desfaça antes as mais novas';
  end if;

  -- O antes da primeira atualização e o depois da última, na transação da movimentação.
  select a.dados_antes into v_antes from public.audit_log a
  where a.tabela = 'mapa_equipamentos' and a.acao = 'UPDATE' and a.criado_em = r.criado_em
    and a.dados_antes->>'equipamento_id' = r.alvo_id::text
  order by a.id limit 1;
  select a.dados_depois into v_depois from public.audit_log a
  where a.tabela = 'mapa_equipamentos' and a.acao = 'UPDATE' and a.criado_em = r.criado_em
    and a.dados_depois->>'equipamento_id' = r.alvo_id::text
  order by a.id desc limit 1;
  if v_antes is null or v_depois is null then
    raise exception 'Não achei na auditoria como a máquina estava antes desta movimentação';
  end if;

  select array_agg(k order by k) into v_campos
  from jsonb_object_keys(v_depois) k
  where k not in ('id', 'equipamento_id', 'updated_at', 'updated_by')
    and (v_antes->k) is distinct from (v_depois->k);

  if v_campos is not null then
    select to_jsonb(m) into v_atual from public.mapa_equipamentos m where m.equipamento_id = r.alvo_id;
    select array_agg(k order by k) into v_mudou
    from unnest(v_campos) k
    where (v_atual->k) is distinct from (v_depois->k);
    if v_mudou is not null then
      raise exception 'A máquina mudou depois desta movimentação por outro caminho (%): desfazer apagaria essa mudança',
        array_to_string(v_mudou, ', ');
    end if;

    -- Colunas comuns pelo jsonb_populate_record; a posição (GeoJSON) à parte.
    select jsonb_object_agg(k, v_antes->k) into v_patch
    from unnest(v_campos) k where k <> 'posicao';
    if v_patch is not null then
      select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(v_patch) k;
      execute format(
        'update public.mapa_equipamentos m set (%1$s) = (select %1$s from jsonb_populate_record(null::public.mapa_equipamentos, $1)) where m.equipamento_id = $2',
        v_cols)
      using v_patch, r.alvo_id;
    end if;
    if 'posicao' = any (v_campos) then
      update public.mapa_equipamentos m set
        posicao = case
          when v_antes->'posicao' is null or jsonb_typeof(v_antes->'posicao') = 'null' then null
          else extensions.st_setsrid(extensions.st_geomfromgeojson((v_antes->'posicao')::text), 4326)
        end
      where m.equipamento_id = r.alvo_id;
    end if;
    update public.mapa_equipamentos m set updated_by = auth.uid() where m.equipamento_id = r.alvo_id;
  end if;

  -- v1.24: a volta de uma máquina fora de funcionamento pelo cadastro reativou o cadastro, que
  -- a auditoria de mapa_equipamentos não devolve; ela volta como fora marcado no mapa.
  if r.tipo = 'estado' and r.de->>'estado' = 'fora_funcionamento' then
    update public.mapa_equipamentos m set estado = 'fora_funcionamento', updated_by = auth.uid()
    where m.equipamento_id = r.alvo_id and m.estado is distinct from 'fora_funcionamento';
  end if;

  update public.mapa_movimentacoes m set
    desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = btrim(p_motivo)
  where m.id = p_id;
end
$function$;

commit;
