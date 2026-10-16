-- Módulo Mapa v1.19 (16/10/2026), dois pedidos do Tiago sobre o print da EH-006:
--
-- 1. "Adicione mais um tipo de status que deve ser Fora de Funcionamento." Até aqui
--    fora_funcionamento só existia como estado IMPOSTO pelo cadastro (equipamentos.status) e a
--    ficha nem mostrava os botões. Agora é um estado que a pessoa marca no mapa, como os outros
--    cinco: entra no CHECK de mapa_equipamentos.estado, na lista da fn_mapa_marcar_estado e
--    vence o "sem posição" no estado_efetivo da view (a máquina parada de vez continua fora,
--    mesmo sem ponto no mapa). O cadastro continua mandando quando diz fora_funcionamento.
--
-- 2. "Essa EH-006 deve ser bem menor." A EH-006 é uma Volvo EC55B Pro (mini, ~5,5 t) e usava o
--    mesmo modelo das 320C/PC200 (~20 t). O tamanho vem de mapa_modelos_3d.escala, por modelo,
--    então nasce o modelo "miniescavadeira": o mesmo GLB da escavadeira em 0,55 (comprimento de
--    transporte ~5,8 m contra ~9,5 m da 320C). A EH-006 passa a apontar para ele.
--
-- Funções e view refeitas a partir da definição VIVA (pg_get_functiondef / pg_get_viewdef de
-- 16/10), mudando só a linha do estado. A fn_mapa_marcar_estado parte da v1.18 (conserto fica
-- no lugar), não da v1.17. CREATE OR REPLACE mantém os grants.

begin;

-- 1a. CHECK do estado marcado
alter table public.mapa_equipamentos drop constraint if exists mapa_equipamentos_estado_check;
alter table public.mapa_equipamentos add constraint mapa_equipamentos_estado_check
  check (estado in ('operando','parado','em_rota','quebrado_obra','conserto','fora_funcionamento'));

-- 1b. RPC dos botões da ficha
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

-- 1c. View: o fora_funcionamento marcado vence o sem_posicao
CREATE OR REPLACE VIEW public.v_mapa_equipamentos WITH (security_invoker = true) AS
 SELECT e.id AS equipamento_id,
    e.codigo,
    e.descricao,
    e.tipo,
    e.marca,
    e.modelo,
    e.placa,
    e.ano,
    e.propriedade,
    e.status AS status_erp,
    e.ativo,
    COALESCE(m.no_mapa, false) AS no_mapa,
    m.id AS mapa_id,
    m.tipo_modelo_3d,
    m.fonte_posicao,
    m.heading,
    m.estado AS estado_mapa,
    m.estado_desde,
    m.obra_id,
    m.trecho_id,
    m.frente_id,
    m.area_id,
    m.localidade_id,
    m.km_atual,
    m.operador_colaborador_id,
    m.deslocamento,
    m.quebra_descricao,
    m.observacao,
    m.conserto_motivo,
    m.conserto_previsao,
    lc.id AS locacao_id,
    lc.fornecedor_id AS locador_id,
    COALESCE(fr.nome_fantasia, fr.razao_social) AS locador_nome,
    lc.tipo_aluguel,
    lc.valor_unitario AS locacao_valor_unitario,
    lc.inicio AS locacao_inicio,
    lc.fim_previsto AS locacao_fim_previsto,
    lc.medicao_inicio AS locacao_medicao_inicio,
        CASE
            WHEN lc.id IS NULL THEN NULL::numeric
            WHEN lc.tipo_aluguel = 'dia'::text THEN lc.valor_unitario * ((now() AT TIME ZONE 'America/Rio_Branco'::text)::date - lc.inicio + 1)::numeric
            WHEN lc.tipo_aluguel = 'mes'::text THEN round(lc.valor_unitario * ((now() AT TIME ZONE 'America/Rio_Branco'::text)::date - lc.inicio + 1)::numeric / 30.0, 2)
            WHEN lc.tipo_aluguel = 'hora'::text AND lc.medicao_inicio IS NOT NULL AND um.medicao IS NOT NULL AND um.medicao >= lc.medicao_inicio THEN lc.valor_unitario * (um.medicao - lc.medicao_inicio)
            ELSE NULL::numeric
        END AS locacao_custo_estimado,
    extensions.st_y(m.posicao) AS lat,
    extensions.st_x(m.posicao) AS lng,
        CASE
            WHEN e.status = 'fora_funcionamento'::text THEN 'fora_funcionamento'::text
            WHEN e.status = 'em_manutencao'::text THEN 'conserto'::text
            WHEN m.estado = 'conserto'::text THEN 'conserto'::text
            WHEN m.estado = 'fora_funcionamento'::text THEN 'fora_funcionamento'::text
            WHEN m.posicao IS NULL THEN 'sem_posicao'::text
            ELSE m.estado
        END AS estado_efetivo,
    COALESCE(( SELECT min(COALESCE(os.data_inicio, os.data_abertura)) AS min
           FROM public.ordens_servico os
          WHERE os.equipamento_id = e.id AND os.excluido_em IS NULL AND os.status = 'em_execucao'::text), m.conserto_entrada) AS conserto_desde,
    ( SELECT count(*) AS count
           FROM public.ordens_servico os
          WHERE os.equipamento_id = e.id AND os.excluido_em IS NULL AND (os.status = ANY (ARRAY['aberta'::text, 'em_execucao'::text]))) AS os_abertas,
    ( SELECT max(cs.data) AS max
           FROM public.combustivel_saidas cs
          WHERE cs.equipamento_id = e.id AND cs.excluido_em IS NULL) AS ultimo_abastecimento,
    um.medicao AS ultima_medicao,
    o.nome AS obra_nome,
    t.nome AS trecho_nome,
    f.nome AS frente_nome,
    l.nome AS localidade_nome,
    a.nome AS area_nome,
    c.nome AS operador_nome,
    EXTRACT(day FROM now() - m.estado_desde)::integer AS dias_no_estado
   FROM public.equipamentos e
     LEFT JOIN public.mapa_equipamentos m ON m.equipamento_id = e.id
     LEFT JOIN public.mapa_locacoes lc ON lc.id = m.locacao_id
     LEFT JOIN public.fornecedores fr ON fr.id = lc.fornecedor_id
     LEFT JOIN LATERAL ( SELECT cs.medicao
           FROM public.combustivel_saidas cs
          WHERE cs.equipamento_id = e.id AND cs.excluido_em IS NULL AND cs.medicao IS NOT NULL
          ORDER BY cs.data DESC
         LIMIT 1) um ON true
     LEFT JOIN public.obras o ON o.id = m.obra_id
     LEFT JOIN public.mapa_trechos t ON t.id = m.trecho_id
     LEFT JOIN public.mapa_frentes f ON f.id = m.frente_id
     LEFT JOIN public.localidades l ON l.id = m.localidade_id
     LEFT JOIN public.mapa_areas a ON a.id = m.area_id
     LEFT JOIN public.colaboradores c ON c.id = m.operador_colaborador_id;

-- 2. Miniescavadeira: mesmo GLB, escala menor; a EH-006 passa a usar
insert into public.mapa_modelos_3d (chave, nome, arquivo, escala)
values ('miniescavadeira', 'Miniescavadeira', '/mapa-modelos/escavadeira.glb', 0.55)
on conflict (chave) do update set escala = excluded.escala, arquivo = excluded.arquivo, updated_at = now();

update public.mapa_equipamentos m set tipo_modelo_3d = 'miniescavadeira'
  from public.equipamentos e
 where e.id = m.equipamento_id and e.codigo = 'EH-006' and m.tipo_modelo_3d = 'escavadeira';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261016160100', 'modulo_mapa_v1_19_fora_de_funcionamento_e_miniescavadeira')
on conflict do nothing;

commit;
