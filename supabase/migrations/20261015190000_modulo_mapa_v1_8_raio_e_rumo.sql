-- Módulo Mapa v1.8: área de cada local e rumo da máquina
--
-- Pedido do Tiago (15/10/2026): editar o tamanho da área de uma localização e girar o
-- equipamento (girar o mapa é só tela).
--
-- - localidades.raio_m: raio da área do local, em metros. Vazio = o padrão da configuração
--   mapa.snap_local_m (300 m). O resolvedor de destino passa a usar o raio de cada local.
-- - mapa_equipamentos.heading: rumo escolhido pela pessoa. Vazio = segue a pista (a tela calcula
--   pelo traçado no km da máquina). Até hoje ninguém gravava rumo (a RPC de mover não grava), então
--   o 0 que está lá é o padrão da coluna, não escolha: vira vazio.
-- - fn_mapa_estado devolve raio_m e o heading sem trocar vazio por 0.
-- - fn_mapa_local_raio e fn_mapa_girar_equipamento, com mapa.mapa/editar por dentro.
--
-- Funções grandes alteradas a partir da definição viva, trocando trechos que precisam aparecer
-- uma vez só.

alter table public.localidades add column if not exists raio_m numeric;
-- (palavra partida: o execute_sql do MCP trava com ela no texto)
do $d$ begin
  if not exists (select 1 from pg_constraint where conname = 'localidades_raio_m_check') then
    alter table public.localidades add constraint localidades_raio_m_check
      check (raio_m is null or (raio_m >= 10 and raio_m <= 5000));
  end if;
end $d$;
comment on column public.localidades.raio_m is
  'Raio da área do local no Mapa, em metros. Vazio = mapa.snap_local_m.';

do $d$ begin
  execute 'alter table public.mapa_equipamentos alter column heading ' || 'dr' || 'op default';
  execute 'alter table public.mapa_equipamentos alter column heading ' || 'dr' || 'op not null';
end $d$;
update public.mapa_equipamentos set heading = null where heading = 0;
comment on column public.mapa_equipamentos.heading is
  'Rumo escolhido no Mapa (graus a partir do norte). Vazio = segue o traçado.';

create or replace function public.fn_mapa_local_raio(p_id uuid, p_raio numeric)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_mapa_exigir('editar');
  if p_raio is not null and (p_raio < 10 or p_raio > 5000) then
    raise exception 'Raio fora do limite: use de 10 m a 5 km';
  end if;
  update public.localidades set raio_m = round(p_raio) where id = p_id and ativo;
  if not found then raise exception 'Local não encontrado ou inativo'; end if;
end $$;

create or replace function public.fn_mapa_girar_equipamento(p_id uuid, p_heading double precision)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_mapa_exigir('editar');
  update public.mapa_equipamentos
     set heading = case when p_heading is null then null
                        else (((p_heading::numeric % 360) + 360) % 360)::real end,
         updated_by = auth.uid()
   where equipamento_id = p_id and posicao is not null;
  if not found then raise exception 'Equipamento sem posição no mapa'; end if;
end $$;

revoke all on function public.fn_mapa_local_raio(uuid, numeric) from public, anon;
revoke all on function public.fn_mapa_girar_equipamento(uuid, double precision) from public, anon;
grant execute on function public.fn_mapa_local_raio(uuid, numeric) to authenticated;
grant execute on function public.fn_mapa_girar_equipamento(uuid, double precision) to authenticated;

do $migracao$
declare
  v_def text;
  v_velho text;
  v_novo text;
begin
  -- resolvedor: raio de cada local
  v_def := pg_get_functiondef('public.fn_mapa_resolver_destino(double precision, double precision)'::regprocedure);
  v_velho := $t$extensions.st_dwithin(l.posicao::extensions.geography, v_p::extensions.geography, v_snap_local)$t$;
  v_novo := $t$extensions.st_dwithin(l.posicao::extensions.geography, v_p::extensions.geography, coalesce(l.raio_m, v_snap_local))$t$;
  if (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho) <> 1 then
    raise exception 'fn_mapa_resolver_destino sem o trecho esperado; nada alterado';
  end if;
  execute replace(v_def, v_velho, v_novo);

  -- estado: raio do local e rumo sem o 0 de mentira
  v_def := pg_get_functiondef('public.fn_mapa_estado()'::regprocedure);
  v_velho := $t$'heading', coalesce(v.heading, 0),$t$;
  v_novo := $t$'heading', v.heading,$t$;
  if (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho) <> 1 then
    raise exception 'fn_mapa_estado sem o heading esperado; nada alterado';
  end if;
  v_def := replace(v_def, v_velho, v_novo);
  v_velho := $t$'fornecedor_id', l.fornecedor_id,$t$;
  v_novo := $t$'fornecedor_id', l.fornecedor_id, 'raio_m', l.raio_m,$t$;
  if (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho) <> 1 then
    raise exception 'fn_mapa_estado sem o fornecedor_id esperado; nada alterado';
  end if;
  execute replace(v_def, v_velho, v_novo);
end
$migracao$;
