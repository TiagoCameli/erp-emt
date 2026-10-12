-- Prova: aba Custos indiretos. Por mes de 2026, a soma = custo_indireto_mes do
-- rateio do indireto; Oficina fora de Equipamentos e consorcios.
-- Rodar em begin/rollback depois da migration; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare v_m date; v_aba numeric; v_rateio numeric;
begin
  for v_m in select generate_series('2026-01-01'::date, '2026-09-01'::date, '1 month')::date loop
    select coalesce(sum(total), 0) into v_aba from public.fn_rel_custos_indiretos(2026) where mes = v_m;
    select coalesce(max(custo_indireto_mes), 0) into v_rateio from public.fn_rateio_indireto_mes(v_m);
    if v_aba <> v_rateio then raise exception 'FALHOU 1: % aba % x rateio %', v_m, v_aba, v_rateio; end if;
  end loop;
  if exists (select 1 from public.fn_rel_aquisicoes() a join public.centros_custo c on c.id = a.centro_id
              join public.centros_custo rz on rz.id = coalesce(c.pai_id, c.id) where rz.papel_rateio = 'indireto') then
    raise exception 'FALHOU 2: centro indireto em Equipamentos e consorcios';
  end if;
  raise exception 'PROVA OK';
end
$prova$;
