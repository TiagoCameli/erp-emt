-- Módulo Mapa v1.23: desfazer a última movimentação de uma máquina pelo Histórico (16/10/2026).
--
-- Pedido do Tiago: "pelo histórico deletar a última movimentação feita, que apaga a última e
-- deixa a que estava anteriormente vigente". A trilha continua imutável no que importa: a linha
-- não é apagada, é marcada como DESFEITA (quando, quem, motivo), e a máquina volta ao que era.
--
-- O "antes" vem do audit_log de mapa_equipamentos da MESMA transação da movimentação (mesmo
-- now(): o criado_em das duas é idêntico, conferido 1 para 1 em 16/10 nos tipos transferência,
-- posição e estado). Restaura só as colunas que aquela transação mudou.
--
-- Regras:
--   - só transferência, posição e estado de máquina (as três só escrevem em mapa_equipamentos;
--     operador mexe na pessoa, locação e acoplamento têm efeito fora do mapa);
--   - só a ÚLTIMA movimentação ainda valendo da máquina (desfazer de novo volta mais um passo);
--   - recusa se a máquina mudou depois por outro caminho (o valor atual não é o que a
--     movimentação deixou), para não apagar essa mudança;
--   - motivo obrigatório; pede mapa.mapa/editar.

alter table public.mapa_movimentacoes
  add column if not exists desfeita_em timestamptz,
  add column if not exists desfeita_por uuid references public.usuarios (id),
  add column if not exists desfeita_motivo text;

comment on column public.mapa_movimentacoes.desfeita_em is
  'Quando a movimentação foi desfeita pelo Histórico (fn_mapa_desfazer_movimentacao); null = vale.';

-- A trilha só aceita uma mudança: marcar como desfeita, uma vez, sem tocar no resto.
create or replace function public.fn_mapa_trg_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_marcas text[] := array['desfeita_em', 'desfeita_por', 'desfeita_motivo'];
begin
  if tg_op = 'UPDATE' and tg_table_name = 'mapa_movimentacoes'
     and (to_jsonb(old)->>'desfeita_em') is null
     and (to_jsonb(new)->>'desfeita_em') is not null
     and (to_jsonb(new) - v_marcas) = (to_jsonb(old) - v_marcas) then
    return new;
  end if;
  raise exception 'mapa_movimentacoes é imutável: sem UPDATE nem DELETE (só marcar como desfeita, pelo Histórico)';
end
$function$;

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

  update public.mapa_movimentacoes m set
    desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = btrim(p_motivo)
  where m.id = p_id;
end
$function$;

comment on function public.fn_mapa_desfazer_movimentacao(bigint, text) is
  'Desfaz a última movimentação (transferência, posição ou estado) de uma máquina: restaura do audit_log o que ela mudou e marca a linha como desfeita.';
revoke all on function public.fn_mapa_desfazer_movimentacao(bigint, text) from public, anon;
grant execute on function public.fn_mapa_desfazer_movimentacao(bigint, text) to authenticated;

-- Histórico com a marca de desfeita e se a linha ainda pode ser desfeita. Muda o retorno, então
-- sai e volta (o cliente antigo lê por nome e ignora as colunas novas).
drop function if exists public.fn_mapa_historico(date, date, uuid, text);

create function public.fn_mapa_historico(
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
  fornecedor text,
  desfeita_em timestamptz,
  desfeita_por_nome text,
  desfeita_motivo text,
  pode_desfazer boolean
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
  with ultimas as (
    select distinct on (v.alvo, v.alvo_id) v.id
    from public.mapa_movimentacoes v
    where v.desfeita_em is null
    order by v.alvo, v.alvo_id, v.criado_em desc, v.id desc
  )
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
    coalesce(f.nome_fantasia, f.razao_social),
    m.desfeita_em,
    ud.nome,
    m.desfeita_motivo,
    (m.desfeita_em is null and m.alvo = 'equipamento'
      and m.tipo in ('transferencia', 'posicao', 'estado')
      and exists (select 1 from ultimas x where x.id = m.id))
  from public.mapa_movimentacoes m
  left join public.equipamentos e on m.alvo = 'equipamento' and e.id = m.alvo_id
  left join public.colaboradores c on m.alvo = 'colaborador' and c.id = m.alvo_id
  left join public.usuarios u on u.id = m.usuario_id
  left join public.usuarios ud on ud.id = m.desfeita_por
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
  'Trilha de mapa_movimentacoes com nomes resolvidos, marca de desfeita e se a linha pode ser desfeita, para /mapa/historico. Até 2000 linhas, mais recentes primeiro.';
revoke all on function public.fn_mapa_historico(date, date, uuid, text) from public, anon;
grant execute on function public.fn_mapa_historico(date, date, uuid, text) to authenticated;
