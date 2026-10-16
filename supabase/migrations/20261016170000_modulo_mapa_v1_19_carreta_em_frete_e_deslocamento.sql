-- Módulo Mapa v1.19: carreta "Em frete" e "Em deslocamento" de volta à pedreira
--
-- Pedido do Tiago (16/10/2026): "em rota só serve para equipamento que faz frete, que são as
-- carretas EMT; tire o em rota e mude para em frete. Quando uma carreta está com frete que vem do
-- módulo do Frete, aparece em frete, e quando ela já chegou no destino aparece em deslocamento com
-- a rota para a última pedreira de onde saiu, a não ser que dito o contrário, como ser colocada em
-- parado. Se a carreta estiver indo para uma pedreira diferente, eu posso alterar para qual
-- pedreira ela está indo."
--
-- 1. mapa_equipamentos.retorno_frete_id / retorno_localidade_id: a pedreira escolhida na ficha
--    para a volta daquele frete. Vale só para o frete gravado: o frete seguinte volta ao padrão
--    (a última pedreira de onde a carreta saiu) sem ninguém precisar limpar.
-- 2. fn_mapa_escolher_pedreira(p_id, p_frete, p_localidade): grava a escolha (null = padrão) e
--    registra em mapa_movimentacoes como 'posicao' (não é marcação de estado: não pode vencer o
--    deslocamento).
-- 3. fn_mapa_estado (a partir da definição viva):
--    - cada máquina ganha 'marcado_em', a hora da última marcação de estado. estado_desde só anda
--      quando o estado MUDA; marcar "parado" numa carreta que já estava parada antes do frete não
--      mexia nele, e a marcação não venceria o deslocamento.
--    - 'carretas_retorno': por carreta casada pela placa, o último frete dela (60 dias) quando ele
--      tem chegada lançada nos últimos 7 dias; o destino desse frete, a pedreira da volta e o
--      traçado (o da volta, se o Frete mediu; senão o da ida, que a tela inverte).
--    A chegada do Frete é só data: a volta começa quando a chegada foi lançada (updated_at),
--    dentro do dia da chegada.
-- O estado 'em_rota' continua aceito no banco (cliente antigo durante o deploy), mas a tela não
-- oferece mais. Em 16/10 nenhuma máquina estava em 'em_rota'.

alter table public.mapa_equipamentos
  add column if not exists retorno_frete_id uuid references public.fretes (id) on delete set null,
  add column if not exists retorno_localidade_id uuid references public.localidades (id) on delete set null;

comment on column public.mapa_equipamentos.retorno_frete_id is
  'Frete a cuja volta vale retorno_localidade_id (Mapa v1.19). Outro frete: volta ao padrão.';
comment on column public.mapa_equipamentos.retorno_localidade_id is
  'Pedreira para onde a carreta volta depois da chegada do retorno_frete_id (Mapa v1.19).';

create or replace function public.fn_mapa_escolher_pedreira(p_id uuid, p_frete uuid, p_localidade uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_antes jsonb;
begin
  perform public.fn_mapa_exigir('editar');
  if not exists (select 1 from public.fretes f where f.id = p_frete and f.excluido_em is null) then
    raise exception 'Frete não encontrado';
  end if;
  if p_localidade is not null and not exists (
      select 1 from public.localidades l
      where l.id = p_localidade and l.ativo and l.posicao is not null and 'pedreira' = any(l.tipos)) then
    raise exception 'Escolha uma pedreira ativa e posicionada no mapa';
  end if;
  select jsonb_build_object('frete', m.retorno_frete_id, 'pedreira', m.retorno_localidade_id)
    into v_antes from public.mapa_equipamentos m where m.equipamento_id = p_id;
  if v_antes is null then
    insert into public.mapa_equipamentos (equipamento_id) values (p_id);
    v_antes := '{}'::jsonb;
  end if;
  update public.mapa_equipamentos m set
    retorno_frete_id = case when p_localidade is null then null else p_frete end,
    retorno_localidade_id = p_localidade,
    updated_by = auth.uid()
  where m.equipamento_id = p_id;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo)
  values ('posicao', 'equipamento', p_id, v_antes,
          jsonb_build_object('frete', p_frete, 'pedreira', p_localidade), 'Pedreira da volta');
end $function$;

revoke all on function public.fn_mapa_escolher_pedreira(uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_mapa_escolher_pedreira(uuid, uuid, uuid) to authenticated;

do $migracao$
declare
  v_def text := pg_get_functiondef('public.fn_mapa_estado()'::regprocedure);
  v_marcado text := $t$'estado', v.estado_efetivo, 'estado_mapa', v.estado_mapa,$t$;
  v_locais text := $t$    'localidades_sem_posicao', (select coalesce(jsonb_agg(jsonb_build_object($t$;
  -- A máquina do frete pela placa da carreta: o mesmo casamento de 'fretes_em_rota'.
  v_casa text := $t$(
          select case when count(*) = 1 then min(e.id::text)::uuid end
          from public.equipamentos e
          where e.ativo
            and length(regexp_replace(upper(coalesce(f.placa_carreta, '')), '[^A-Z0-9]', '', 'g')) >= 7
            and regexp_replace(upper(coalesce(e.placa, '') || ' ' || coalesce(e.descricao, '')), '[^A-Z0-9]', '', 'g')
                like '%' || regexp_replace(upper(f.placa_carreta), '[^A-Z0-9]', '', 'g') || '%')$t$;
begin
  if (length(v_def) - length(replace(v_def, v_marcado, ''))) / length(v_marcado) <> 1 then
    raise exception 'fn_mapa_estado sem o estado marcado esperado; nada alterado';
  end if;
  if (length(v_def) - length(replace(v_def, v_locais, ''))) / length(v_locais) <> 1 then
    raise exception 'fn_mapa_estado sem a lista de locais sem posição esperada; nada alterado';
  end if;
  if position('carretas_retorno' in v_def) > 0 then
    raise exception 'fn_mapa_estado já tem carretas_retorno; nada alterado';
  end if;

  v_def := replace(v_def, v_marcado, v_marcado || $t$
      'marcado_em', (select max(mv.criado_em) from public.mapa_movimentacoes mv
                     where mv.alvo = 'equipamento' and mv.alvo_id = v.equipamento_id and mv.tipo = 'estado'),$t$);

  v_def := replace(v_def, v_locais, $t$    'carretas_retorno', (
      with fe as (
        select f.id, f.data, f.created_at, f.updated_at, f.data_chegada,
               f.origem_localidade_id, f.destino_localidade_id,
               $t$ || v_casa || $t$ as equipamento_id
        from public.fretes f
        where f.excluido_em is null and f.data >= v_hoje - 60),
      ultimo as (
        select distinct on (fe.equipamento_id) fe.*
        from fe where fe.equipamento_id is not null
        order by fe.equipamento_id, fe.data desc, fe.created_at desc),
      volta as (
        select u.*, me.retorno_localidade_id is not null as escolhida,
               coalesce(me.retorno_localidade_id,
                 (select g.origem_localidade_id from fe g
                  join public.localidades lg on lg.id = g.origem_localidade_id
                  where g.equipamento_id = u.equipamento_id and 'pedreira' = any(lg.tipos)
                  order by g.data desc, g.created_at desc limit 1)) as pedreira_id
        from ultimo u
        left join public.mapa_equipamentos me
          on me.equipamento_id = u.equipamento_id and me.retorno_frete_id = u.id
        where u.data_chegada is not null and u.data_chegada >= v_hoje - 7)
      select coalesce(jsonb_agg(jsonb_build_object(
          'equipamento_id', r.equipamento_id, 'frete_id', r.id, 'chegada', r.data_chegada,
          'chegada_em', greatest(r.data_chegada::timestamp at time zone 'America/Rio_Branco',
                                 least(r.updated_at, (r.data_chegada + 1)::timestamp at time zone 'America/Rio_Branco')),
          'de', ld.nome, 'de_lng', extensions.st_x(ld.posicao), 'de_lat', extensions.st_y(ld.posicao),
          'pedreira_id', lp.id, 'pedreira', lp.nome,
          'pedreira_lng', extensions.st_x(lp.posicao), 'pedreira_lat', extensions.st_y(lp.posicao),
          'pedreira_escolhida', r.escolhida,
          'horas', coalesce(rv.horas_mapa, ri.horas_mapa), 'km', coalesce(rv.km_mapa, ri.km_mapa),
          'tracado_volta', rv.tracado, 'tracado_ida', ri.tracado) order by r.equipamento_id), '[]'::jsonb)
      from volta r
      join public.localidades ld on ld.id = r.destino_localidade_id and ld.posicao is not null
      join public.localidades lp on lp.id = r.pedreira_id and lp.posicao is not null
      left join public.frete_rotas_tracado ri
        on ri.origem_localidade_id = r.pedreira_id and ri.destino_localidade_id = r.destino_localidade_id
      left join public.frete_rotas_tracado rv
        on rv.origem_localidade_id = r.destino_localidade_id and rv.destino_localidade_id = r.pedreira_id
      where r.pedreira_id is distinct from r.destino_localidade_id),
$t$ || v_locais);
  execute v_def;
end
$migracao$;

revoke all on function public.fn_mapa_estado() from public, anon;
grant execute on function public.fn_mapa_estado() to authenticated;
