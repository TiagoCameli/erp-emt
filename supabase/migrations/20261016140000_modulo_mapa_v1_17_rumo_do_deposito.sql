-- Módulo Mapa v1.17: girar o depósito no mapa
--
-- Pedido do Tiago (16/10/2026): "quero poder rotacionar o almoxarifado". A caixa do depósito era
-- sempre alinhada ao norte. Cada depósito guarda o rumo em graus (0 = comprimento no sentido
-- norte-sul, sentido horário; nulo = 0), escolhido na ficha como o rumo da máquina.
--
-- A v1.16 (tamanho do depósito, 20261016130000) foi aplicada sem registro em schema_migrations;
-- é registrada aqui.

alter table public.almoxarifado_depositos
  add column if not exists mapa_rumo numeric(5,1)
    constraint almoxarifado_depositos_mapa_rumo_faixa check (mapa_rumo >= 0 and mapa_rumo < 360);

comment on column public.almoxarifado_depositos.mapa_rumo is
  'Rumo do depósito no Mapa, em graus a partir do norte, sentido horário. Nulo = 0.';

create or replace function public.fn_mapa_deposito_rumo(p_id uuid, p_rumo numeric)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_mapa_exigir('editar');
  if p_rumo is null then
    raise exception 'Informe o rumo';
  end if;
  update public.almoxarifado_depositos
     set mapa_rumo = round(((p_rumo % 360) + 360) % 360, 1) % 360
   where id = p_id and ativo;
  if not found then raise exception 'Depósito não encontrado ou inativo'; end if;
end $$;

revoke all on function public.fn_mapa_deposito_rumo(uuid, numeric) from public, anon;
grant execute on function public.fn_mapa_deposito_rumo(uuid, numeric) to authenticated;

do $migracao$
declare
  v_def text := pg_get_functiondef('public.fn_mapa_estado()'::regprocedure);
  v_velho text := $t$'altura_m', d.mapa_altura_m) order by d.nome)$t$;
begin
  if (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho) <> 1 then
    raise exception 'fn_mapa_estado sem a lista de depósitos esperada (v1.16); nada alterado';
  end if;
  v_def := replace(v_def, v_velho, $t$'altura_m', d.mapa_altura_m, 'rumo', d.mapa_rumo) order by d.nome)$t$);
  execute v_def;
end
$migracao$;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261016130000', 'modulo_mapa_v1_16_tamanho_do_deposito')
on conflict (version) do nothing;
