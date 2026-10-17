-- Módulo Mapa v1.27: transferência mantém o estado e o Histórico sem ajuste de posição (17/10/2026).
--
-- Pedido do Tiago (17/10/2026): "não quero que o histórico mostre os ajustes de posição; quando uma
-- máquina é transferida de um lugar para outro, o status dela não deve alterar". Caso: US-001
-- parada no Silo, transferida para o Lote 09 da BR-364, virou "Operando" (o estado da zona) e ele
-- teve de marcar "Parado" de novo.
--
-- 1. fn_mapa_mover_equipamentos: o estado era coalesce(pedido, zona) para todas as máquinas. Agora,
--    por máquina: o pedido explícito vence; se a máquina já tem posição no mapa, fica o estado que
--    ela tem (inclusive conserto, quebrada e fora de funcionamento); o estado da zona só vale na
--    primeira entrada (Posicionar, entrada em locação). "Fora de qualquer zona: informe o estado"
--    passa a valer só para quem ainda não tinha estado.
--
-- 2. Ajuste de posição = mapa_movimentacoes tipo 'posicao' com coordenada no `para` e sem estado
--    (o ajuste de localização e a organização do pátio do reset de 16/10). A primeira entrada no
--    mapa grava estado no `para`, e a "Pedreira da volta" não tem coordenada: essas continuam.
--    - fn_mapa_historico deixa de listar os ajustes, e "a última da máquina" (pode_desfazer)
--      passa a ignorá-los, para o Desfazer ficar na última linha que aparece.
--    - fn_mapa_desfazer_movimentacao: ajuste depois da linha não impede desfazê-la. Desfazer uma
--      transferência devolve o ponto de antes dela, então os ajustes posteriores caem juntos
--      (marcados como desfeitos) e as colunas que eles mexem não contam como "mudou por outro
--      caminho".
--    Os ajustes continuam gravados (e no audit_log); só não aparecem.
--
-- A edição parte do corpo VIVO de cada função (pg_get_functiondef + âncoras conferidas), para não
-- desfazer o que outras frentes do Mapa aplicaram nelas. Idempotente.

do $migracao$
declare
  v_def text;
  v_ancora text;
  v_trocas text[][];
  i int;
begin
  ---------------------------------------------------------------------------------------------
  -- 1. fn_mapa_mover_equipamentos
  ---------------------------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_mapa_mover_equipamentos';
  if v_def is null then raise exception 'fn_mapa_mover_equipamentos não encontrada'; end if;

  if position('v1.27' in v_def) > 0 then
    raise notice 'v1.27 já aplicada em fn_mapa_mover_equipamentos';
  else
    v_trocas := array[
      -- A recusa de ponto livre sem estado sai daqui e vai para dentro do laço (por máquina).
      array[$a$  if v_estado is null and not v_ajuste then raise exception 'Fora de qualquer zona: informe o estado (operando, parado ou em_rota)'; end if;
$a$, ''],
      array[$a$    -- v1.21: não perde a obra calado. Tinha obra e o ponto não é de nenhuma: a pessoa escolhe.
$a$, $a$    -- v1.27: transferir não muda o estado. O pedido explícito vence; quem já está no mapa fica
    -- com o estado que tem; o da zona só vale na primeira entrada.
    v_estado := coalesce(p_destino->>'estado',
                         case when (v_antes->>'posicao') is not null then v_antes->>'estado' end,
                         v_dest->>'estado');
    if v_estado is null then
      raise exception 'Fora de qualquer zona: informe o estado (operando, parado ou em_rota)';
    end if;
    -- v1.21: não perde a obra calado. Tinha obra e o ponto não é de nenhuma: a pessoa escolhe.
$a$]
    ];
    for i in 1 .. array_length(v_trocas, 1) loop
      v_ancora := v_trocas[i][1];
      if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
        raise exception 'fn_mapa_mover_equipamentos: âncora % não encontrada uma vez só', i;
      end if;
      v_def := replace(v_def, v_ancora, v_trocas[i][2]);
    end loop;
    execute v_def;
  end if;

  ---------------------------------------------------------------------------------------------
  -- 2. fn_mapa_historico
  ---------------------------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_mapa_historico';
  if v_def is null then raise exception 'fn_mapa_historico não encontrada'; end if;

  if position('v1.27' in v_def) > 0 then
    raise notice 'v1.27 já aplicada em fn_mapa_historico';
  else
    v_trocas := array[
      array[$a$    where v.desfeita_em is null
$a$, $a$    where v.desfeita_em is null
      -- v1.27: ajuste de posição não aparece, então não é "a última" da máquina.
      and not (v.tipo = 'posicao' and v.para ? 'lng' and not v.para ? 'estado')
$a$],
      array[$a$  where (p_de is null or m.data_efetiva >= p_de)
$a$, $a$  where (p_de is null or m.data_efetiva >= p_de)
    -- v1.27: sem os ajustes de posição (Tiago, 17/10/2026).
    and not (m.tipo = 'posicao' and m.para ? 'lng' and not m.para ? 'estado')
$a$]
    ];
    for i in 1 .. array_length(v_trocas, 1) loop
      v_ancora := v_trocas[i][1];
      if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
        raise exception 'fn_mapa_historico: âncora % não encontrada uma vez só', i;
      end if;
      v_def := replace(v_def, v_ancora, v_trocas[i][2]);
    end loop;
    execute v_def;
  end if;

  ---------------------------------------------------------------------------------------------
  -- 3. fn_mapa_desfazer_movimentacao
  ---------------------------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_mapa_desfazer_movimentacao';
  if v_def is null then raise exception 'fn_mapa_desfazer_movimentacao não encontrada'; end if;

  if position('v1.27' in v_def) > 0 then
    raise notice 'v1.27 já aplicada em fn_mapa_desfazer_movimentacao';
  else
    v_trocas := array[
      array[$a$  v_cols text;
begin
$a$, $a$  v_cols text;
  v_ajuste_depois boolean;
begin
$a$],
      -- Ajuste depois da linha não a impede de ser desfeita.
      array[$a$      and (m.criado_em, m.id) > (r.criado_em, r.id)
  ) then
$a$, $a$      and (m.criado_em, m.id) > (r.criado_em, r.id)
      and not (m.tipo = 'posicao' and m.para ? 'lng' and not m.para ? 'estado')
  ) then
$a$],
      array[$a$  if v_campos is not null then
    select to_jsonb(m) into v_atual$a$, $a$  -- v1.27: ajustes de posição depois desta linha. Desfazer devolve o ponto de antes dela, então
  -- o que eles mexeram não é "mudança por outro caminho", e eles caem juntos.
  select exists (
    select 1 from public.mapa_movimentacoes m
    where m.alvo = r.alvo and m.alvo_id = r.alvo_id and m.desfeita_em is null
      and (m.criado_em, m.id) > (r.criado_em, r.id)
      and m.tipo = 'posicao' and m.para ? 'lng' and not m.para ? 'estado'
  ) into v_ajuste_depois;

  if v_campos is not null then
    select to_jsonb(m) into v_atual$a$],
      array[$a$    where (v_atual->k) is distinct from (v_depois->k);
$a$, $a$    where (v_atual->k) is distinct from (v_depois->k)
      and not (v_ajuste_depois and 'posicao' = any (v_campos)
               and k in ('posicao', 'trecho_id', 'area_id', 'localidade_id', 'km_atual'));
$a$],
      array[$a$  update public.mapa_movimentacoes m set
    desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = btrim(p_motivo)
  where m.id = p_id;
$a$, $a$  update public.mapa_movimentacoes m set
    desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = btrim(p_motivo)
  where m.id = p_id;

  -- v1.27: o ponto voltou para antes desta linha; os ajustes posteriores caem com ela.
  if v_ajuste_depois and 'posicao' = any (coalesce(v_campos, '{}')) then
    update public.mapa_movimentacoes m set
      desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = btrim(p_motivo)
    where m.alvo = r.alvo and m.alvo_id = r.alvo_id and m.desfeita_em is null
      and (m.criado_em, m.id) > (r.criado_em, r.id)
      and m.tipo = 'posicao' and m.para ? 'lng' and not m.para ? 'estado';
  end if;
$a$]
    ];
    for i in 1 .. array_length(v_trocas, 1) loop
      v_ancora := v_trocas[i][1];
      if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
        raise exception 'fn_mapa_desfazer_movimentacao: âncora % não encontrada uma vez só', i;
      end if;
      v_def := replace(v_def, v_ancora, v_trocas[i][2]);
    end loop;
    execute v_def;
  end if;
end
$migracao$;
