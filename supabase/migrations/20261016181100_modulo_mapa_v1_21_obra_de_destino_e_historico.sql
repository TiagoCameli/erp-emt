-- Módulo Mapa v1.21: obra de destino na transferência e histórico de movimentações (16/10/2026).
--
-- 1. fn_mapa_mover_equipamentos: a obra vinha só do ponto onde a máquina caía. Soltar fora de
--    área, trecho ou local de obra gravava obra_id nulo e a máquina perdia a obra sem aviso.
--    Agora:
--      - p_destino.sem_obra = true tira a obra de propósito (pátio central, oficina, trânsito);
--      - na transferência, se a máquina tinha obra e ficaria sem, sem esse pedido explícito, a
--        RPC recusa e diz o que fazer. O ajuste de localização não mexe na obra e fica como está.
--    p_destino.obra_id (obra escolhida, vence a zona) já existia desde a v1; a tela passa a usar.
--    A edição parte do corpo VIVO da função (pg_get_functiondef + âncoras conferidas), para não
--    desfazer o que outras frentes do Mapa aplicaram nela. Idempotente.
--
-- 2. fn_mapa_historico: a trilha de mapa_movimentacoes com os nomes já resolvidos (máquina, obra,
--    lugar, estado, operador, quem fez), para a tela /mapa/historico. Só leitura; pede
--    mapa.historico/ver ou mapa.mapa/ver, como a RLS da tabela.

do $migracao$
declare
  v_def text;
  v_novo text;
  v_ancora text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_mapa_mover_equipamentos';
  if v_def is null then raise exception 'fn_mapa_mover_equipamentos não encontrada'; end if;

  if position('sem_obra' in v_def) > 0 then
    raise notice 'v1.21 já aplicada em fn_mapa_mover_equipamentos';
    return;
  end if;

  -- Âncora 1: depois de a obra ser decidida (zona, escolha ou frente do dia).
  v_ancora := $a$  if v_obra is null and v_frente is not null then select obra_id into v_obra from public.mapa_frentes where id = v_frente; end if;
$a$;
  if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'Âncora 1 (obra da frente) não encontrada uma vez só';
  end if;
  v_novo := replace(v_def, v_ancora, v_ancora || $a$  -- v1.21: "Sem obra" escolhido de propósito vence a obra da zona.
  if coalesce((p_destino->>'sem_obra')::boolean, false) then v_obra := null; end if;
$a$);
  v_def := v_novo;

  -- Âncora 2: o update da transferência (o do ajuste é outro, com outra indentação).
  v_ancora := $a$    update public.mapa_equipamentos m set
      no_mapa = true,
$a$;
  if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'Âncora 2 (update da transferência) não encontrada uma vez só';
  end if;
  v_novo := replace(v_def, v_ancora, $a$    -- v1.21: não perde a obra calado. Tinha obra e o ponto não é de nenhuma: a pessoa escolhe.
    if v_obra is null and (v_antes->>'obra_id') is not null
       and not coalesce((p_destino->>'sem_obra')::boolean, false) then
      raise exception '% sairia da obra: o ponto não é de nenhuma obra. Escolha a obra de destino, ou "Sem obra"',
        coalesce((select e.codigo from public.equipamentos e where e.id = v_id), 'O equipamento');
    end if;
$a$ || v_ancora);
  v_def := v_novo;

  execute v_def;
end
$migracao$;

create or replace function public.fn_mapa_historico(
  p_de date default null,
  p_ate date default null,
  p_alvo uuid default null,
  p_tipo text default null
)
returns table (
  id bigint,
  tipo text,
  alvo text,
  alvo_id uuid,
  alvo_codigo text,
  alvo_nome text,
  data_efetiva date,
  criado_em timestamptz,
  usuario_nome text,
  motivo text,
  de_obra text,
  para_obra text,
  de_lugar text,
  para_lugar text,
  de_km numeric,
  para_km numeric,
  de_estado text,
  para_estado text,
  de_pessoa text,
  para_pessoa text,
  de_acoplado text,
  para_acoplado text,
  fornecedor text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (public.tem_permissao('mapa.historico', 'ver') or public.tem_permissao('mapa.mapa', 'ver')) then
    raise exception 'Sem permissão para ver o histórico do Mapa' using errcode = '42501';
  end if;
  return query
  select
    m.id, m.tipo, m.alvo, m.alvo_id,
    coalesce(e.codigo, ''),
    coalesce(e.descricao, c.nome, ''),
    m.data_efetiva, m.criado_em,
    coalesce(u.nome, ''),
    coalesce(m.motivo, ''),
    od.nome, op.nome,
    coalesce(ad.nome, ld.nome, td.nome),
    coalesce(ap.nome, lp.nome, tp.nome),
    nullif(m.de->>'km', '')::numeric,
    nullif(m.para->>'km', '')::numeric,
    m.de->>'estado', m.para->>'estado',
    cd.nome, cp.nome,
    ed.codigo, ep.codigo,
    coalesce(f.nome_fantasia, f.razao_social)
  from public.mapa_movimentacoes m
  left join public.equipamentos e on m.alvo = 'equipamento' and e.id = m.alvo_id
  left join public.colaboradores c on m.alvo = 'colaborador' and c.id = m.alvo_id
  left join public.usuarios u on u.id = m.usuario_id
  left join public.obras od on od.id = nullif(m.de->>'obra_id', '')::uuid
  left join public.obras op on op.id = nullif(m.para->>'obra_id', '')::uuid
  left join public.mapa_areas ad on ad.id = nullif(m.de->>'area_id', '')::uuid
  left join public.mapa_areas ap on ap.id = nullif(m.para->>'area_id', '')::uuid
  left join public.localidades ld on ld.id = nullif(m.de->>'localidade_id', '')::uuid
  left join public.localidades lp on lp.id = nullif(m.para->>'localidade_id', '')::uuid
  left join public.mapa_trechos td on td.id = nullif(m.de->>'trecho_id', '')::uuid
  left join public.mapa_trechos tp on tp.id = nullif(m.para->>'trecho_id', '')::uuid
  left join public.colaboradores cd on cd.id = nullif(m.de->>'colaborador_id', '')::uuid
  left join public.colaboradores cp on cp.id = nullif(m.para->>'colaborador_id', '')::uuid
  left join public.equipamentos ed on ed.id = nullif(m.de->>'acoplado_em', '')::uuid
  left join public.equipamentos ep on ep.id = nullif(m.para->>'acoplado_em', '')::uuid
  left join public.fornecedores f on f.id = nullif(m.para->>'fornecedor_id', '')::uuid
  where (p_de is null or m.data_efetiva >= p_de)
    and (p_ate is null or m.data_efetiva <= p_ate)
    and (p_alvo is null or m.alvo_id = p_alvo)
    and (p_tipo is null or m.tipo = p_tipo)
  order by m.criado_em desc, m.id desc
  limit 2000;
end
$$;

comment on function public.fn_mapa_historico(date, date, uuid, text) is
  'Trilha de mapa_movimentacoes com nomes resolvidos (máquina, obra, lugar, estado, operador, quem fez) para /mapa/historico. Até 2000 linhas, mais recentes primeiro.';

revoke all on function public.fn_mapa_historico(date, date, uuid, text) from public, anon;
grant execute on function public.fn_mapa_historico(date, date, uuid, text) to authenticated;
