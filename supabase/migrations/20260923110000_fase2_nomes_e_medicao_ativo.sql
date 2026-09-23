-- Fase 2b: duas pontas que as telas da Manutenção acharam.
--
-- 1. O histórico da OS mostra quem mudou o status. As RPCs de nome que existem
--    (auditoria, compras, financeiro) devolvem vazio para quem só tem Manutenção, então a
--    trilha saía sem nome. Mesmo desenho de nomes_usuarios_compras.
-- 2. fn_registrar_medicao aceitava leitura de equipamento inativo; a tela recusava. Banco e
--    tela passam a concordar (a regra vale também para a fila offline do celular).

create or replace function public.nomes_usuarios_manutencao(p_ids uuid[])
returns table(id uuid, nome text)
language sql
stable
security definer
set search_path to ''
as $function$
  select u.id, u.nome from public.usuarios u
  where u.id = any (p_ids) and public.fn_ve_manutencao();
$function$;
revoke all on function public.nomes_usuarios_manutencao(uuid[]) from public, anon;
grant execute on function public.nomes_usuarios_manutencao(uuid[]) to authenticated;

create or replace function public.fn_registrar_medicao(p_equipamento uuid, p_data date, p_valor numeric,
  p_origem text default 'manual', p_id_cliente uuid default null, p_observacoes text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_controle text; v_ativo boolean; v_id uuid;
begin
  if not public.tem_permissao('manutencao.medicoes', 'criar') then raise exception 'Sem permissão para lançar horímetro ou km'; end if;
  if p_id_cliente is not null then
    select id into v_id from public.equipamento_medicoes where id_cliente = p_id_cliente;
    if v_id is not null then return v_id; end if;
  end if;
  select controle_por, ativo into v_controle, v_ativo from public.equipamentos where id = p_equipamento;
  if v_controle is null then raise exception 'Equipamento não encontrado'; end if;
  if not v_ativo then raise exception 'Equipamento inativo: reative no cadastro antes de lançar leitura'; end if;
  if v_controle not in ('horimetro', 'km') then raise exception 'Este equipamento não controla horímetro nem km'; end if;
  if p_data is null then raise exception 'Informe a data da leitura'; end if;
  if p_data > (now() at time zone 'America/Rio_Branco')::date + 1 then raise exception 'Data da leitura no futuro'; end if;
  if p_valor is null or p_valor < 0 or p_valor <> round(p_valor, 4) then raise exception 'Leitura inválida'; end if;
  insert into public.equipamento_medicoes (equipamento_id, data, tipo, valor, origem, id_cliente, observacoes, created_by)
  values (p_equipamento, p_data, v_controle, p_valor, coalesce(p_origem, 'manual'), p_id_cliente, nullif(btrim(p_observacoes), ''), (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.fn_registrar_medicao(uuid, date, numeric, text, uuid, text) from public, anon;
grant execute on function public.fn_registrar_medicao(uuid, date, numeric, text, uuid, text) to authenticated;
