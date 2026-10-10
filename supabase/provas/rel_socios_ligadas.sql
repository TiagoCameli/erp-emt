-- Prova do relatorio Socios e ligadas (PR 2 do controle total). Rodar em
-- begin/rollback depois das migrations; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare v_n int; v_env numeric; v_dev numeric; v_saldo numeric; v_conf numeric;
begin
  -- 1. Lista os 5 centros (socio James, socio Tiago, Casa James, Amazonia, Jurua FM), mesmo com periodo vazio.
  select count(*) into v_n from public.fn_rel_socios_ligadas(date '1990-01-01', date '1990-02-01');
  if v_n <> 5 then raise exception 'FALHOU 1: % centros no periodo vazio (esperado 5)', v_n; end if;
  select count(*) into v_n from public.fn_rel_socios_ligadas(date '1990-01-01', date '1990-02-01') where enviado <> 0 or devolvido <> 0;
  if v_n <> 0 then raise exception 'FALHOU 2: periodo vazio com valor'; end if;

  -- 2. Amazonia em 2026 bate com a soma independente dos rateios.
  select enviado, devolvido, saldo into v_env, v_dev, v_saldo
    from public.fn_rel_socios_ligadas(date '2026-01-01', date '2027-01-01')
   where centro = 'Amazônia Agroindústria';
  select coalesce(sum(r.valor) filter (where l.tipo = 'a_pagar'), 0) into v_conf
    from public.lancamento_rateios r join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo c on c.id = r.centro_custo_id
   where l.status <> 'cancelado' and l.mes_competencia >= date '2026-01-01' and l.mes_competencia < date '2027-01-01'
     and (c.id = 'a6a1f57d-b8cb-4113-b694-58f34af7bdb4' or c.pai_id = 'a6a1f57d-b8cb-4113-b694-58f34af7bdb4'
          or c.pai_id in (select id from public.centros_custo where pai_id = 'a6a1f57d-b8cb-4113-b694-58f34af7bdb4'));
  if v_env <> v_conf then raise exception 'FALHOU 3: enviado % x soma independente %', v_env, v_conf; end if;
  if v_saldo <> v_env - v_dev then raise exception 'FALHOU 4: saldo nao e enviado - devolvido'; end if;

  raise exception 'PROVA OK';
end
$prova$;
