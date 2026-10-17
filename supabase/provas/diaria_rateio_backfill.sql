-- Backfill de 17/10/2026: toda diária ganha rateio, e os lançamentos de diária
-- passam a ter o rateio pela obra das diárias. Pedido do Tiago, com as decisões:
--   * as 8 diárias que já tinham obra -> 100% no centro da obra;
--   * as 15 sem obra -> pela obra escrita na observação; "Variante" = 009;
--     Luiz Felipe -> Manutenção/Documentação; Maria Vanessa (Silo) -> 009;
--   * Edivaldo R$ 3.850 = 7 diárias no Ramal do Gama + 4 na Variante (7/11, 4/11).
-- Os lançamentos se corrigem pela fn_diaria_refazer_rateio_lancamento, que
-- deixa a troca na trilha (rateio_eventos) e não muda o total.
-- Roda DEPOIS da migration 20261017150001_diaria_rateio_obra.

-- Autoria do rateio_eventos e do audit: o Tiago, que pediu a correção.
select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $$
declare
  c003 constant uuid := 'ad8061a7-4b7b-4881-8b45-161c8c2881e8';
  c007 constant uuid := 'b2607766-d4eb-4b5e-993a-442ae8de18a9';
  c009 constant uuid := 'fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0';
  cman constant uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  m record;
  v_id uuid;
  v_n int;
  v_lanc uuid;
begin
  -- 1. As que já têm obra: 100% no centro dela.
  for v_id in select id from public.rh_diarias where obra_id is not null loop
    perform public.fn_diaria_gravar_rateio(v_id,
      public.fn_diaria_rateio_da_obra((select obra_id from public.rh_diarias where id = v_id)));
  end loop;

  -- 2. As 15 sem obra, uma a uma pelo prefixo do id (conferido contra a
  --    observação em 17/10/2026).
  for m in
    select * from (values
      ('a4173e3f', jsonb_build_array(jsonb_build_object('centro_custo_id', c003, 'percentual', 100))),
      ('bc918b9e', jsonb_build_array(jsonb_build_object('centro_custo_id', cman, 'percentual', 100))),
      ('661a4f3b', jsonb_build_array(jsonb_build_object('centro_custo_id', c009, 'percentual', 100))),
      ('b15a3b43', jsonb_build_array(
                     jsonb_build_object('centro_custo_id', c003, 'percentual', 63.6364),
                     jsonb_build_object('centro_custo_id', c009, 'percentual', 36.3636))),
      ('3eb3736e', jsonb_build_array(jsonb_build_object('centro_custo_id', c007, 'percentual', 100))),
      ('41339d7a', jsonb_build_array(jsonb_build_object('centro_custo_id', c007, 'percentual', 100))),
      ('cf80c4fa', jsonb_build_array(jsonb_build_object('centro_custo_id', c007, 'percentual', 100))),
      ('6f8181f0', jsonb_build_array(jsonb_build_object('centro_custo_id', c007, 'percentual', 100))),
      ('d3b915f2', jsonb_build_array(jsonb_build_object('centro_custo_id', c007, 'percentual', 100))),
      ('f870e6b0', jsonb_build_array(jsonb_build_object('centro_custo_id', c007, 'percentual', 100))),
      ('810f6135', jsonb_build_array(jsonb_build_object('centro_custo_id', c007, 'percentual', 100))),
      ('537cb7cd', jsonb_build_array(jsonb_build_object('centro_custo_id', c007, 'percentual', 100))),
      ('ca9bba20', jsonb_build_array(jsonb_build_object('centro_custo_id', c007, 'percentual', 100))),
      ('dfa061a1', jsonb_build_array(jsonb_build_object('centro_custo_id', c009, 'percentual', 100))),
      ('5b3b4353', jsonb_build_array(jsonb_build_object('centro_custo_id', c007, 'percentual', 100)))
    ) as t(prefixo, rateio)
  loop
    select count(*), min(id::text)::uuid into v_n, v_id
    from public.rh_diarias where left(id::text, 8) = m.prefixo and obra_id is null;
    if v_n <> 1 then
      raise exception 'Prefixo % casou % diarias sem obra (esperado 1)', m.prefixo, v_n;
    end if;
    perform public.fn_diaria_gravar_rateio(v_id, m.rateio);
  end loop;

  -- 3. Lançamentos de diária: rateio pelas obras. Onde já bate, não faz nada.
  for v_lanc in
    select distinct lancamento_id from public.rh_diarias where lancamento_id is not null
  loop
    perform public.fn_diaria_refazer_rateio_lancamento(v_lanc,
      'Correcao 17/10/2026: rateio pela obra de cada diaria (antes ia todo para o centro do cadastro do diarista)');
  end loop;
end $$;
