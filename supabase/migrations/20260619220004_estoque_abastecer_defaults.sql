-- =============================================================
-- Fase 4 / Migration: defaults nos parâmetros opcionais de fn_abastecer
-- Horímetro, km, operador, data e observação são opcionais (um veículo
-- por km não tem horímetro e vice-versa). Sem default, o tipo gerado os
-- marca como obrigatórios. CREATE OR REPLACE mantém o corpo e só adiciona
-- os defaults (não muda a assinatura/identidade da função).
-- =============================================================

create or replace function public.fn_abastecer(
  p_tanque uuid, p_equipamento uuid, p_quantidade numeric,
  p_horimetro numeric default null, p_km numeric default null,
  p_operador uuid default null, p_data date default null, p_obs text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_insumo uuid; v_cc uuid; v_mov uuid; v_custo numeric; v_abast uuid;
begin
  if not public.tem_permissao('estoque.tanques', 'criar') then raise exception 'Sem permissao para registrar abastecimento'; end if;
  if p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;

  select insumo_id into v_insumo from public.depositos where id = p_tanque;
  if v_insumo is null then raise exception 'O deposito informado nao e um tanque com insumo'; end if;

  select id into v_cc from public.centros_custo where equipamento_id = p_equipamento limit 1;

  v_mov := public.fn_estoque_saida_interna(v_insumo, p_tanque, p_quantidade, 'consumo', v_cc, 'abastecimento', null, p_data, p_obs, p_equipamento);
  select custo_total into v_custo from public.estoque_movimentos where id = v_mov;

  insert into public.abastecimentos (movimento_id, equipamento_id, deposito_id, insumo_id, quantidade, custo_total, horimetro, km, operador_id, data_abastecimento, observacao, created_by)
  values (v_mov, p_equipamento, p_tanque, v_insumo, p_quantidade, v_custo, p_horimetro, p_km, p_operador, coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date), p_obs, (select auth.uid()))
  returning id into v_abast;
  return v_abast;
end $$;
revoke all on function public.fn_abastecer(uuid, uuid, numeric, numeric, numeric, uuid, date, text) from public, anon;
grant execute on function public.fn_abastecer(uuid, uuid, numeric, numeric, numeric, uuid, date, text) to authenticated;
