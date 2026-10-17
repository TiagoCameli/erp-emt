-- Módulo Mapa v1.27 (17/10/2026): o rolo Dynapac CA 25 usa o modelo 3D do Caterpillar CP-56
--
-- Pedido do Tiago: "o rolo Dynapac CA 25 deve usar o mesmo modelo 3D do rolo Caterpillar CP-56",
-- mesma geometria e mesma escala (3x o real), mantendo cadastro, nome e identificação do CA 25
-- no pop-up e no cartão. Os CP-56 (RPC-001, RPC-002) usam o modelo 'rolo_pe_carneiro'
-- (public/mapa-modelos/rolo_pe_carneiro.glb, escala 1 x ESCALA_MAQUINA = 3 na tela). O CA 25
-- está cadastrado como "Rolo de Pneu" e por isso caiu em 'rolo_pneu' na carga da v1.
--
-- O modelo é escolhido por equipamento (mapa_equipamentos.tipo_modelo_3d), não por tipo, e uma
-- linha nova nasce sem modelo (vira o genérico). Para valer em todo CA 25, presente e futuro:
--   1. fn_mapa_eh_ca25: o equipamento é CA 25 pelo modelo ou pela descrição ("CA 25", "CA25",
--      "CA-25"; CA250/CA260 não contam).
--   2. Trigger BEFORE INSERT em mapa_equipamentos: CA 25 entra com 'rolo_pe_carneiro'.
--   3. Trigger AFTER UPDATE OF modelo, descricao em equipamentos: virou CA 25 no cadastro,
--      o mapa troca o modelo.
--   4. Os CA 25 de hoje passam a apontar para 'rolo_pe_carneiro'.
-- O cadastro (tipo, marca, modelo, descrição) não é tocado: pop-up e cartão leem de lá.

begin;

create or replace function public.fn_mapa_eh_ca25(p_equipamento_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce(
    (select concat_ws(' ', e.modelo, e.descricao) ~* '\mCA[ -]?25\M'
       from public.equipamentos e where e.id = p_equipamento_id),
    false);
$function$;
revoke all on function public.fn_mapa_eh_ca25(uuid) from public, anon, authenticated;

create or replace function public.fn_mapa_trg_modelo_3d_ca25()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if public.fn_mapa_eh_ca25(new.equipamento_id) then
    new.tipo_modelo_3d := 'rolo_pe_carneiro';
  end if;
  return new;
end $function$;
revoke all on function public.fn_mapa_trg_modelo_3d_ca25() from public, anon, authenticated;

drop trigger if exists trg_mapa_equipamentos_modelo_ca25 on public.mapa_equipamentos;
create trigger trg_mapa_equipamentos_modelo_ca25 before insert on public.mapa_equipamentos
  for each row execute function public.fn_mapa_trg_modelo_3d_ca25();

create or replace function public.fn_mapa_trg_equipamento_modelo_ca25()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if public.fn_mapa_eh_ca25(new.id) then
    update public.mapa_equipamentos set tipo_modelo_3d = 'rolo_pe_carneiro'
     where equipamento_id = new.id and tipo_modelo_3d is distinct from 'rolo_pe_carneiro';
  end if;
  return new;
end $function$;
revoke all on function public.fn_mapa_trg_equipamento_modelo_ca25() from public, anon, authenticated;

drop trigger if exists trg_equipamento_mapa_modelo_ca25 on public.equipamentos;
create trigger trg_equipamento_mapa_modelo_ca25 after update of modelo, descricao on public.equipamentos
  for each row execute function public.fn_mapa_trg_equipamento_modelo_ca25();

update public.mapa_equipamentos m set tipo_modelo_3d = 'rolo_pe_carneiro'
 where public.fn_mapa_eh_ca25(m.equipamento_id)
   and m.tipo_modelo_3d is distinct from 'rolo_pe_carneiro';

commit;
