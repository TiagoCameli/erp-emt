-- Prova: aba Equipamentos e consorcios. Soma do relatorio = soma dos rateios
-- de imobilizado ou com categoria de compra de equipamento/consorcio; pago + a pagar = valor; as 9 linhas de consorcio.
-- Rodar em begin/rollback depois da migration; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare v_rel numeric; v_base numeric; v_n int; v_msg text;
begin
  select sum(valor) into v_rel from public.fn_rel_aquisicoes();
  select sum(r.valor) into v_base from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id and l.status <> 'cancelado' and l.tipo = 'a_pagar'
    join public.centros_custo e on e.id = r.centro_custo_id
    join public.centros_custo rz on rz.id = coalesce(e.pai_id, e.id)
    left join public.categorias_financeiras cf on cf.id = coalesce(r.categoria_id, l.categoria_id)
   where rz.tipo = 'imobilizado' or (cf.tipo = 'despesa' and cf.nome in ('Aquisição de Equipamento', 'Consórcio a contemplar'));
  if v_rel <> v_base then raise exception 'FALHOU 1: relatorio % x rateios %', v_rel, v_base; end if;
  if exists (select 1 from public.fn_rel_aquisicoes() where pago + a_pagar <> valor or pago < 0 or a_pagar < 0) then
    raise exception 'FALHOU 2: pago + a pagar';
  end if;
  select count(*) into v_n from public.fn_rel_aquisicoes() where tipo = 'consorcio';
  if v_n <> 9 then raise exception 'FALHOU 3: % consorcios', v_n; end if;
  -- 4. Pago da cota = parcelas pagas do lancamento (LAN-2026-3649: 6 de 8).
  if (select pago from public.fn_rel_aquisicoes() where numero = 'LAN-2026-3649')
     <> (select sum(p.valor) from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
          where l.numero = 'LAN-2026-3649' and p.status = 'pago') then
    raise exception 'FALHOU 4: pago da cota';
  end if;

  perform set_config('request.jwt.claims', '{"sub":"a7324fb8-8311-4986-b975-8a8141ec7efc","role":"authenticated"}', true);
  if not public.tem_permissao('financeiro.relatorios', 'ver') then
    v_msg := 'FALHOU 5: viu sem permissao';
    begin perform public.fn_rel_aquisicoes(); exception when others then v_msg := null; end;
    if v_msg is not null then raise exception '%', v_msg; end if;
  end if;
  raise exception 'PROVA OK';
end
$prova$;
