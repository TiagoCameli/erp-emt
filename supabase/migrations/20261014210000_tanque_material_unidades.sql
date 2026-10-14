-- Tanque de material em qualquer unidade (14/10/2026).
--
-- Pedido do Tiago: "esses tanques de materiais tem que ser compatíveis com várias unidades
-- de medida, ainda mais para betumes que tem densidade muito parecida à água". Antes, a
-- capacidade era só em litros e o saldo vinha na unidade do insumo (kg, t): o card desistia
-- ("capacidade em litros, saldo em outra unidade") e a trava de capacidade só valia para
-- material medido em litro. O tanque de RR estava com 20.000 kg num cadastro de 100 L.
--
-- - capacidade_litros continua sendo o VOLUME do tanque, sempre em litros (o Combustível
--   lê essa coluna). capacidade_unidade guarda só em que unidade a pessoa digitou (L, m³,
--   kg, t), para o cadastro reabrir do mesmo jeito.
-- - densidade_kg_l é a do material guardado (um por vez). É a ponte entre massa e volume:
--   litros = kg / densidade. Capacidade digitada em kg ou t exige densidade.
-- - A trava converte o saldo para litros: L e m³ sempre; kg e t quando há densidade. Outras
--   unidades (un, sc...) não têm conversão e seguem sem trava.
-- - A trava só recusa quando o saldo SOBE (entrada, ou troca de material). Uma saída nunca é
--   barrada por um tanque que já estava acima da capacidade (os 100 L provisórios de hoje).
--
-- Os três tanques de material existentes começam com densidade 1,00 (betume ≈ água, palavra
-- do Tiago); o cadastro deixa corrigir.

alter table public.tanques add column capacidade_unidade text not null default 'L';
alter table public.tanques add constraint tanques_capacidade_unidade_valida
  check (capacidade_unidade in ('L', 'm3', 'kg', 't'));
alter table public.tanques add column densidade_kg_l numeric(8,4);
alter table public.tanques add constraint tanques_densidade_positiva
  check (densidade_kg_l is null or densidade_kg_l > 0);
alter table public.tanques add constraint tanques_capacidade_em_massa_tem_densidade
  check (capacidade_unidade in ('L', 'm3') or densidade_kg_l is not null);
grant insert (capacidade_unidade, densidade_kg_l), update (capacidade_unidade, densidade_kg_l)
  on public.tanques to authenticated;

comment on column public.tanques.capacidade_unidade is
  'Unidade em que a capacidade foi digitada (L, m3, kg, t). A capacidade em si fica sempre em capacidade_litros.';
comment on column public.tanques.densidade_kg_l is
  'Densidade do material do tanque, em kg/L. Converte saldo e capacidade entre massa e volume.';

update public.tanques set densidade_kg_l = 1 where uso = 'material' and densidade_kg_l is null;

-- Quantidade de um material em litros, pela sigla da unidade. Null = sem conversão.
create or replace function public.fn_tanque_em_litros(p_quantidade numeric, p_sigla text, p_densidade numeric)
returns numeric language sql immutable set search_path to '' as $$
  select case lower(btrim(coalesce(p_sigla, '')))
    when 'l' then p_quantidade
    when 'lt' then p_quantidade
    when 'litro' then p_quantidade
    when 'litros' then p_quantidade
    when 'm3' then p_quantidade * 1000
    when 'm³' then p_quantidade * 1000
    when 'kg' then case when p_densidade > 0 then p_quantidade / p_densidade end
    when 't' then case when p_densidade > 0 then p_quantidade * 1000 / p_densidade end
    when 'ton' then case when p_densidade > 0 then p_quantidade * 1000 / p_densidade end
  end
$$;
revoke all on function public.fn_tanque_em_litros(numeric, text, numeric) from public, anon;
grant execute on function public.fn_tanque_em_litros(numeric, text, numeric) to authenticated;

create or replace function public.fn_estoque_atualizar_tanque(p_tanque uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_tanque record;
  v_n int;
  v_insumo uuid;
  v_saldo numeric;
  v_unidade text;
  v_nome text;
  v_litros numeric;
begin
  select id, nome, capacidade_litros, densidade_kg_l, nivel_atual_litros, combustivel_atual_id
    into v_tanque from public.tanques where id = p_tanque;
  with mov as (
    select insumo_id, quantidade as q from public.estoque_entradas where tanque_id = p_tanque and excluido_em is null
    union all
    select insumo_id, -quantidade from public.estoque_saidas where tanque_id = p_tanque and excluido_em is null
  ), s as (select insumo_id, sum(q) as saldo from mov group by insumo_id having sum(q) > 0)
  select count(*), min(insumo_id::text)::uuid, sum(saldo) into v_n, v_insumo, v_saldo from s;

  if v_n > 1 then
    raise exception 'O tanque % ficaria com dois materiais ao mesmo tempo: esvazie antes de pôr outro', v_tanque.nome;
  end if;

  -- Só confere quando o saldo sobe: saída de tanque já acima da capacidade passa.
  if v_n = 1 and v_tanque.capacidade_litros > 0
     and (v_insumo is distinct from v_tanque.combustivel_atual_id or v_saldo > v_tanque.nivel_atual_litros) then
    select u.sigla, i.nome into v_unidade, v_nome
    from public.insumos i left join public.unidades_medida u on u.id = i.unidade_id where i.id = v_insumo;
    v_litros := public.fn_tanque_em_litros(v_saldo, v_unidade, v_tanque.densidade_kg_l);
    if v_litros > v_tanque.capacidade_litros then
      raise exception 'O tanque % comporta % L e ficaria com % % de % (% L)', v_tanque.nome,
        trim(trailing ',' from trim(trailing '0' from replace(round(v_tanque.capacidade_litros, 2)::text, '.', ','))),
        trim(trailing ',' from trim(trailing '0' from replace(v_saldo::text, '.', ','))), v_unidade, v_nome,
        trim(trailing ',' from trim(trailing '0' from replace(round(v_litros, 2)::text, '.', ',')));
    end if;
  end if;

  update public.tanques
  set nivel_atual_litros = coalesce(v_saldo, 0), combustivel_atual_id = v_insumo
  where id = p_tanque
    and (nivel_atual_litros, combustivel_atual_id) is distinct from (coalesce(v_saldo, 0), v_insumo);
end $$;
