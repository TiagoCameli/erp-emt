-- Módulo Mapa v1.14: carretas em rota pelo Frete e Melozas como máquinas
--
-- Pedido do Tiago (16/10/2026):
--
-- 1. "As carretas EMT têm três delas que estão em rota e deveriam estar aparecendo no mapa com a
--    rota; o card delas deve ter material, peso e valor do transporte." fn_mapa_estado passa a
--    devolver os fretes em rota (sem data de chegada, não excluídos, saídos nos últimos 7 dias:
--    frete esquecido aberto não deixa carreta "em rota" para sempre), com o traçado da rota salvo
--    pelo Frete (frete_rotas_tracado, pontos [lat, lng]) e a máquina casada pela placa da carreta
--    (placa ou descrição do equipamento, só letras e números; casa só quando um equipamento bate).
--    Os valores (frete, R$/t·km, material) só vão para quem vê a aba Fretes; material, peso e rota
--    vão para quem vê o Mapa. Em 16/10: CS-003, CS-004 e CS-005, Pedreira Britam → Usina Gregorio,
--    BRITA 1, 47 t, R$ 12.346,90 cada.
--
-- 2. "Esses dois são tanque mas são equipamentos móveis": o tanque Meloza EMT é o MZ-001 e o
--    tanque Meloza Colorado é o COL-MZ-01 (alugado). tanques.equipamento_id liga cada um à sua
--    máquina; o mapa deixa de desenhá-los como tanque fixo.

do $migracao$
declare
  v_def text := pg_get_functiondef('public.fn_mapa_estado()'::regprocedure);
  v_velho text := $t$    'localidades_sem_posicao', (select coalesce(jsonb_agg(jsonb_build_object($t$;
begin
  if (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho) <> 1 then
    raise exception 'fn_mapa_estado sem a lista de locais sem posição esperada; nada alterado';
  end if;
  v_def := replace(v_def, v_velho, $t$    'fretes_em_rota', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'tipo', f.tipo, 'data', f.data, 'criado_em', f.created_at,
        'placa', f.placa_carreta, 'motorista', f.motorista,
        'equipamento_id', (
          select case when count(*) = 1 then min(e.id::text)::uuid end
          from public.equipamentos e
          where e.ativo
            and length(regexp_replace(upper(coalesce(f.placa_carreta, '')), '[^A-Z0-9]', '', 'g')) >= 7
            and regexp_replace(upper(coalesce(e.placa, '') || ' ' || coalesce(e.descricao, '')), '[^A-Z0-9]', '', 'g')
                like '%' || regexp_replace(upper(f.placa_carreta), '[^A-Z0-9]', '', 'g') || '%'),
        'transportadora', (select coalesce(x.nome_fantasia, x.razao_social) from public.fornecedores x
                           where x.id = f.transportadora_id),
        'origem', lo.nome, 'origem_lng', extensions.st_x(lo.posicao), 'origem_lat', extensions.st_y(lo.posicao),
        'destino', ld.nome, 'destino_lng', extensions.st_x(ld.posicao), 'destino_lat', extensions.st_y(ld.posicao),
        'material', (select i.nome from public.insumos i where i.id = f.insumo_id),
        'peso', f.peso_toneladas, 'km', f.km_rodados,
        'valor_tkm', case when public.tem_permissao('frete.fretes', 'ver') then f.valor_tkm end,
        'valor_total', case when public.tem_permissao('frete.fretes', 'ver') then f.valor_total end,
        'valor_material', case when public.tem_permissao('frete.fretes', 'ver') then f.valor_material end,
        'horas', rt.horas_mapa, 'tracado', rt.tracado) order by f.data, f.created_at), '[]'::jsonb)
      from public.fretes f
      left join public.localidades lo on lo.id = f.origem_localidade_id
      left join public.localidades ld on ld.id = f.destino_localidade_id
      left join public.frete_rotas_tracado rt
        on rt.origem_localidade_id = f.origem_localidade_id and rt.destino_localidade_id = f.destino_localidade_id
      where f.excluido_em is null and f.data_chegada is null
        and f.data >= (now() at time zone 'America/Rio_Branco')::date - 7),
$t$ || v_velho);
  execute v_def;
end
$migracao$;

update public.tanques set equipamento_id = 'bf554339-af03-406f-acb8-21409d7c5e79'
where nome = 'Meloza EMT' and equipamento_id is null;
update public.tanques set equipamento_id = '72ce1d70-6e66-438b-a341-666c8fcf009a'
where nome = 'Meloza Colorado' and equipamento_id is null;
