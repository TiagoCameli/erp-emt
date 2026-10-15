-- Módulo Mapa v1.11: tanques, pilhas e depósitos com lugar próprio no mapa
--
-- Pedido do Tiago (15/10/2026): todos os tanques e pilhas ativos aparecem no mapa (com 3D), e
-- depósito, tanque e pilha novos já nascem com o lugar escolhido no mapa.
--
-- Cada um ganha latitude/longitude e uma posição gerada (mesmo desenho de localidades). Tudo
-- opcional no banco: quem cadastra pelo Estoque (e quem ainda não foi atualizado) continua
-- gravando sem coordenada; a exigência do lugar na criação fica no formulário. O vínculo com o
-- local (localidade_id) continua: o ponto próprio diz onde está, o local diz a que pátio pertence.
--
-- fn_mapa_objeto_posicionar põe ou move qualquer um dos três (mapa.mapa/editar);
-- fn_mapa_estado passa a devolver tanques e depósitos com ponto, e as pilhas.
-- A pilha vai sem o material: a coluna do insumo da pilha está sendo renomeada por outra frente
-- (insumo_id -> insumo_atual_id) e o estado do mapa inteiro não pode cair por causa dela; o nome
-- da pilha já diz o material ("Brita 1 - Pátio Colorado").

do $d$
declare
  v_tabela text;
begin
  foreach v_tabela in array array['tanques', 'estoque_pilhas', 'almoxarifado_depositos'] loop
    execute format('alter table public.%I add column if not exists latitude numeric', v_tabela);
    execute format('alter table public.%I add column if not exists longitude numeric', v_tabela);
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = v_tabela and column_name = 'posicao') then
      execute format($f$alter table public.%I add column posicao extensions.geometry(Point, 4326)
        generated always as (case when latitude is not null and longitude is not null
          then extensions.st_setsrid(extensions.st_makepoint(longitude::double precision, latitude::double precision), 4326)
        end) stored$f$, v_tabela);
    end if;
    if not exists (select 1 from pg_constraint where conname = v_tabela || '_coordenada_check') then
      execute format($f$alter table public.%I add constraint %I check (
        (latitude is null) = (longitude is null)
        and (latitude is null or (latitude between -90 and 90 and longitude between -180 and 180)))$f$,
        v_tabela, v_tabela || '_coordenada_check');
    end if;
  end loop;
end $d$;

create or replace function public.fn_mapa_objeto_posicionar(
  p_alvo text, p_id uuid, p_lng double precision, p_lat double precision)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_mapa_exigir('editar');
  if p_lng is null or p_lat is null or p_lng not between -180 and 180 or p_lat not between -90 and 90 then
    raise exception 'Ponto inválido';
  end if;
  if p_alvo = 'tanque' then
    update public.tanques set latitude = round(p_lat::numeric, 7), longitude = round(p_lng::numeric, 7)
     where id = p_id and ativo;
  elsif p_alvo = 'pilha' then
    begin
      update public.estoque_pilhas set latitude = round(p_lat::numeric, 7), longitude = round(p_lng::numeric, 7)
       where id = p_id and ativo;
    exception when check_violation then
      -- A pilha sem material não aceita alteração nenhuma (regra do Estoque: a pilha nasce com o insumo).
      raise exception 'Pilha sem material: preencha o material dela no Estoque antes de pôr no mapa';
    end;
  elsif p_alvo = 'deposito' then
    update public.almoxarifado_depositos set latitude = round(p_lat::numeric, 7), longitude = round(p_lng::numeric, 7)
     where id = p_id and ativo;
  else
    raise exception 'Alvo inválido: %', p_alvo;
  end if;
  if not found then raise exception 'Cadastro não encontrado ou inativo'; end if;
end $$;

revoke all on function public.fn_mapa_objeto_posicionar(text, uuid, double precision, double precision) from public, anon;
grant execute on function public.fn_mapa_objeto_posicionar(text, uuid, double precision, double precision) to authenticated;

-- fn_mapa_estado: ponto e números de tanques e depósitos, e a lista de pilhas
do $migracao$
declare
  v_def text := pg_get_functiondef('public.fn_mapa_estado()'::regprocedure);
  v_velho text;
  v_novo text;
begin
  v_velho := $t$'localidade_id', t.localidade_id, 'equipamento_id', t.equipamento_id) order by t.nome), '[]'::jsonb)
      from public.tanques t where t.ativo),$t$;
  v_novo := $t$'localidade_id', t.localidade_id, 'equipamento_id', t.equipamento_id,
        'lng', extensions.st_x(t.posicao), 'lat', extensions.st_y(t.posicao),
        'capacidade', t.capacidade_litros, 'nivel', t.nivel_atual_litros, 'unidade', t.capacidade_unidade,
        'insumo', (select i.nome from public.insumos i where i.id = t.combustivel_atual_id)) order by t.nome), '[]'::jsonb)
      from public.tanques t where t.ativo),
    'pilhas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'saldo', p.saldo,
        'lng', extensions.st_x(p.posicao), 'lat', extensions.st_y(p.posicao)) order by p.nome), '[]'::jsonb)
      from public.estoque_pilhas p where p.ativo),$t$;
  if (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho) <> 1 then
    raise exception 'fn_mapa_estado sem a lista de tanques esperada; nada alterado';
  end if;
  v_def := replace(v_def, v_velho, v_novo);
  v_velho := $t$'id', d.id, 'nome', d.nome, 'localidade_id', d.localidade_id) order by d.nome)$t$;
  if (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho) <> 1 then
    raise exception 'fn_mapa_estado sem a lista de depósitos esperada; nada alterado';
  end if;
  v_def := replace(v_def, v_velho, $t$'id', d.id, 'nome', d.nome, 'localidade_id', d.localidade_id,
        'lng', extensions.st_x(d.posicao), 'lat', extensions.st_y(d.posicao)) order by d.nome)$t$);
  execute v_def;
end
$migracao$;
