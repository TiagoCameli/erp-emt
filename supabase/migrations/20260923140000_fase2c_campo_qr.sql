-- Fase 2c: celular do equipamento (QR) e ficha técnica.
--
-- 1. A ficha técnica é lida por quem cuida da máquina: o mecânico que abre o QR tem
--    Manutenção e não tem Cadastros. Editar continua de cadastros.equipamentos/editar.
-- 2. O adesivo antigo do Gestão Obras carrega o id de lá (/m/eq/<id>). O de-para vive no
--    schema legado, sem grant para o app; esta função só devolve o id novo, e só para quem
--    já veria o equipamento.

drop policy if exists equipamento_especificacoes_select on public.equipamento_especificacoes;
create policy equipamento_especificacoes_select on public.equipamento_especificacoes
  for select to authenticated
  using ((select public.tem_permissao('cadastros.equipamentos', 'ver')) or (select public.fn_ve_manutencao()));

create or replace function public.fn_equipamento_do_legado(p_id_antigo text)
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select d.equipamento_id
  from legado.de_para_equipamentos d
  where d.gestao_obras_id = btrim(p_id_antigo)
    and (public.fn_ve_manutencao() or public.tem_permissao('cadastros.equipamentos', 'ver'))
  limit 1;
$function$;
revoke all on function public.fn_equipamento_do_legado(text) from public, anon;
grant execute on function public.fn_equipamento_do_legado(text) to authenticated;
