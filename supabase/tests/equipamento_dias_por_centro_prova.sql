-- Prova dos dias de equipamento por centro de custo (16/10/2026).
-- Roda tudo e termina SEMPRE em raise exception com o relatório: nada fica gravado.
-- Uso: supabase db query --linked -o table -f supabase/tests/equipamento_dias_por_centro_prova.sql < /dev/null
do $prova$
declare
  v_sem uuid := public.fn_mapa_centro_sem_alocacao();
  v_obra uuid;            -- uma obra com centro raiz
  v_raiz uuid;            -- o centro raiz dela
  v_obra_sem uuid;        -- uma obra sem centro raiz (criada aqui)
  v_carretas uuid := (select id from public.centros_custo where obra_id = public.fn_mapa_obra_carretas_emt() and pai_id is null limit 1);
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  r record;
  v_n1 int; v_n2 int; v_esperado int;
  v_maq uuid; v_imp uuid;
  v_rel text := '';
  v_falhas int := 0;
  v_usuario uuid;
begin
  -- age como um usuário que edita o Mapa e vê o Histórico (as RPCs conferem tem_permissao)
  select a.usuario_id into v_usuario from public.usuario_permissoes a
    join public.usuario_permissoes b on b.usuario_id = a.usuario_id and b.recurso = 'mapa.historico' and b.acao = 'ver'
    join public.usuarios u on u.id = a.usuario_id and u.ativo
   where a.recurso = 'mapa.mapa' and a.acao = 'editar' limit 1;
  if v_usuario is null then raise exception 'FALHA: nenhum usuário com mapa.mapa/editar e mapa.historico/ver'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
  if v_sem is null then raise exception 'FALHA: centro Sem Alocação não configurado'; end if;
  select c.obra_id, c.id into v_obra, v_raiz from public.centros_custo c
   where c.pai_id is null and c.tipo = 'obra' and c.obra_id is not null and c.papel_rateio is null limit 1;
  v_obra_sem := gen_random_uuid();  -- obra que não tem centro raiz (a regra só procura o centro)

  -- (a) a regra, linha a linha
  for r in
    select * from (values
      ('fora_funcionamento', v_obra, false, false, null::uuid, null::text, 'fora não conta'),
      ('parado',             v_obra, false, true,  v_carretas, 'carreta_emt', 'carreta sempre 001'),
      ('operando',           v_obra, true,  false, v_sem, 'varios_centros', 'vários centros'),
      ('operando',           null,   false, false, v_sem, 'sem_obra', 'operando sem obra'),
      ('operando',           v_obra_sem, false, false, v_sem, 'obra_sem_centro', 'obra sem raiz'),
      ('operando',           v_obra, false, false, v_raiz, 'obra', 'operando na obra'),
      ('parado',             v_obra, false, false, v_sem, 'parado', 'parado'),
      ('em_rota',            v_obra, false, false, v_sem, 'em_rota', 'em rota'),
      ('quebrado_obra',      v_obra, false, false, v_sem, 'quebrado_obra', 'quebrado'),
      ('conserto',           v_obra, false, false, v_sem, 'conserto', 'conserto'),
      ('sem_posicao',        v_obra, false, false, v_sem, 'sem_posicao', 'sem posição'),
      (null,                 v_obra, false, false, v_sem, 'sem_estado', 'estado nulo')
    ) t(estado, obra, varios, carreta, centro_esp, motivo_esp, rotulo)
  loop
    declare v_c uuid; v_m text; v_linhas int;
    begin
      select count(*), max(x.centro_custo_id::text)::uuid, max(x.motivo) into v_linhas, v_c, v_m
        from public.fn_equip_centro_regra(r.estado, r.obra, r.varios, r.carreta) x;
      if (r.centro_esp is null and v_linhas = 0) or (v_linhas = 1 and v_c = r.centro_esp and v_m = r.motivo_esp) then
        v_rel := v_rel || format(E'\nOK   regra: %s', r.rotulo);
      else
        v_falhas := v_falhas + 1;
        v_rel := v_rel || format(E'\nFALHA regra: %s -> linhas=%s centro=%s motivo=%s', r.rotulo, v_linhas, v_c, v_m);
      end if;
    end;
  end loop;

  -- (b) fechar duas vezes dá o mesmo
  v_n1 := public.fn_equip_dias_fechar();
  v_n2 := public.fn_equip_dias_fechar();
  if v_n1 = v_n2 and v_n1 = (select count(*) from public.equipamento_dias_centro where dia = v_hoje) then
    v_rel := v_rel || format(E'\nOK   fechar 2x: %s linhas', v_n1);
  else v_falhas := v_falhas + 1; v_rel := v_rel || format(E'\nFALHA fechar 2x: %s / %s', v_n1, v_n2); end if;

  -- (g) linha de controle: o total bate com o mapa
  select count(*) into v_esperado from public.v_mapa_equipamentos v
   where v.ativo and v.no_mapa and v.estado_efetivo is distinct from 'fora_funcionamento';
  v_esperado := v_esperado + (select count(*) from public.equipamentos i
    join public.v_mapa_equipamentos h on h.equipamento_id = i.acoplado_em
    where i.ativo and i.tipo = 'Implementos' and h.ativo and h.no_mapa
      and h.estado_efetivo is distinct from 'fora_funcionamento'
      and not exists (select 1 from public.v_mapa_equipamentos s where s.equipamento_id = i.id and s.no_mapa));
  if v_n1 = v_esperado then v_rel := v_rel || format(E'\nOK   controle: %s = mapa', v_esperado);
  else v_falhas := v_falhas + 1; v_rel := v_rel || format(E'\nFALHA controle: fechou %s, mapa tem %s', v_n1, v_esperado); end if;

  -- (c) parado -> Sem Alocação; operando + vários -> Sem Alocação; desligar -> raiz da obra
  select m.equipamento_id into v_maq from public.mapa_equipamentos m
    join public.v_mapa_equipamentos v on v.equipamento_id = m.equipamento_id
   where v.ativo and v.no_mapa and v.estado_efetivo in ('operando','parado') and not public.fn_mapa_carreta_emt(m.equipamento_id)
   limit 1;
  update public.mapa_equipamentos set estado = 'parado', posicao = coalesce(posicao, extensions.st_setsrid(extensions.st_makepoint(-72.67, -7.63), 4326)) where equipamento_id = v_maq;
  perform public.fn_equip_dias_fechar();
  if (select centro_custo_id from public.equipamento_dias_centro where dia = v_hoje and equipamento_id = v_maq) = v_sem
  then v_rel := v_rel || E'\nOK   parado -> Sem Alocação';
  else v_falhas := v_falhas + 1; v_rel := v_rel || E'\nFALHA parado -> Sem Alocação'; end if;

  update public.mapa_equipamentos set estado = 'operando', obra_id = v_obra, varios_centros = true where equipamento_id = v_maq;
  perform public.fn_equip_dias_fechar();
  if (select centro_custo_id from public.equipamento_dias_centro where dia = v_hoje and equipamento_id = v_maq) = v_sem
  then v_rel := v_rel || E'\nOK   operando + vários -> Sem Alocação';
  else v_falhas := v_falhas + 1; v_rel := v_rel || E'\nFALHA operando + vários -> Sem Alocação'; end if;

  update public.mapa_equipamentos set varios_centros = false where equipamento_id = v_maq;
  perform public.fn_equip_dias_fechar();
  if (select centro_custo_id from public.equipamento_dias_centro where dia = v_hoje and equipamento_id = v_maq) = v_raiz
  then v_rel := v_rel || E'\nOK   operando na obra -> raiz da obra';
  else v_falhas := v_falhas + 1; v_rel := v_rel || E'\nFALHA operando na obra -> raiz da obra'; end if;

  -- (e) implemento acoplado herda
  select id into v_imp from public.equipamentos where tipo = 'Implementos' and ativo limit 1;
  update public.equipamentos set acoplado_em = v_maq where id = v_imp;
  perform public.fn_equip_dias_fechar();
  if exists (select 1 from public.equipamento_dias_centro where dia = v_hoje and equipamento_id = v_imp
             and centro_custo_id = v_raiz and motivo = 'acoplado' and acoplado_em = v_maq)
  then v_rel := v_rel || E'\nOK   implemento herda da hospedeira';
  else v_falhas := v_falhas + 1; v_rel := v_rel || E'\nFALHA implemento herda da hospedeira'; end if;

  -- (d) carreta EMT -> 001 (se houver carreta no mapa)
  select equipamento_id into v_maq from public.v_mapa_equipamentos v
   where v.ativo and v.no_mapa and public.fn_mapa_carreta_emt(v.equipamento_id) and v.estado_efetivo <> 'fora_funcionamento' limit 1;
  if v_maq is null then v_rel := v_rel || E'\n--   nenhuma carreta EMT no mapa agora';
  elsif (select centro_custo_id from public.equipamento_dias_centro where dia = v_hoje and equipamento_id = v_maq) = v_carretas
  then v_rel := v_rel || E'\nOK   carreta EMT -> 001';
  else v_falhas := v_falhas + 1; v_rel := v_rel || E'\nFALHA carreta EMT -> 001'; end if;

  -- relatório do mês e ficha não quebram, e não duplicam o hoje
  if (select coalesce(sum(dias), 0) from public.fn_mapa_rel_dias_centro(v_hoje) x)
     >= (select count(*) from public.equipamento_dias_centro where dia = v_hoje)
     and not exists (select 1 from (select equipamento_id, centro_custo_id, count(*) from public.fn_mapa_rel_dias_centro(v_hoje) group by 1,2 having count(*) > 1) d)
  then v_rel := v_rel || E'\nOK   relatório do mês';
  else v_falhas := v_falhas + 1; v_rel := v_rel || E'\nFALHA relatório do mês'; end if;
  perform public.fn_mapa_centros_equipamento(v_imp);

  -- (h) dia perdido pelo cron: o reparo refaz pela foto do mapa e não mexe em dia que já tem linha
  declare v_ontem date := v_hoje - 1; v_antes int; v_reparo int; v_de_novo int;
  begin
    select count(*) into v_antes from public.equipamento_dias_centro where dia = v_ontem;
    delete from public.equipamento_dias_centro where dia = v_ontem;
    v_reparo := public.fn_equip_dias_reparar(v_ontem);
    v_de_novo := public.fn_equip_dias_reparar(v_ontem);
    if not exists (select 1 from public.mapa_snapshots where data = v_ontem) then
      v_rel := v_rel || E'\n--   sem foto de ontem: reparo não testado com dado';
    elsif v_reparo > 0 and v_reparo = (select count(*) from public.equipamento_dias_centro where dia = v_ontem) and v_de_novo = 0
    then v_rel := v_rel || format(E'\nOK   reparo de ontem: %s linhas (antes %s), 2ª vez 0', v_reparo, v_antes);
    else v_falhas := v_falhas + 1; v_rel := v_rel || format(E'\nFALHA reparo de ontem: %s / %s', v_reparo, v_de_novo); end if;
    begin
      perform public.fn_equip_dias_reparar(v_hoje);
      v_falhas := v_falhas + 1; v_rel := v_rel || E'\nFALHA reparo aceitou hoje';
    exception when others then v_rel := v_rel || E'\nOK   reparo recusa hoje';
    end;
  end;

  -- (f) rateio indireto continua de pé com o centro novo
  perform count(*) from public.fn_rel_custos_indiretos(extract(year from v_hoje)::int);
  v_rel := v_rel || E'\nOK   fn_rel_custos_indiretos roda';

  raise exception E'PROVA (desfeita) — falhas: % %', v_falhas, v_rel;
end
$prova$;
