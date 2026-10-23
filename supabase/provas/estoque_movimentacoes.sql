-- Prova da aba Estoque > Movimentações (migration 20261023120000_estoque_movimentacoes).
-- NÃO GRAVA: termina em raise exception com o resultado. Cada caso vira uma chave em r.
-- Esperado:
--   1 linhas = soma das fontes (estoque, combustível em tanque, transferência nas duas pontas, peças)
--   2 todo movimento tem local com nome
--   3 o último saldo de cada local bate com a Posição: 0 divergências, 0 locais faltando
--   4 id único
--   5 sem permissão: recusou
do $prova$
declare
  v_admin constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := gen_random_uuid();
  v_n bigint; v_esperado bigint; v_txt text; r jsonb := '{}'::jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  create temp table mv on commit drop as select * from public.fn_estoque_movimentacoes();
  create temp table pos on commit drop as select * from public.fn_estoque_posicao();
  reset role;

  select count(*) into v_n from mv;
  select (select count(*) from public.estoque_entradas where excluido_em is null)
       + (select count(*) from public.estoque_saidas where excluido_em is null)
       + (select count(*) from public.combustivel_entradas where excluido_em is null)
       + (select count(*) from public.combustivel_saidas where excluido_em is null and tanque_id is not null)
       + (select count(*) * 2 from public.combustivel_transferencias where excluido_em is null)
       + (select count(*) from public.combustivel_esvaziamentos where excluido_em is null)
       + (select count(*) from public.almoxarifado_entradas where excluido_em is null)
       + (select count(*) from public.almoxarifado_saidas where estornada_em is null)
    into v_esperado;
  r := r || jsonb_build_object('1_linhas', v_n, '1_esperado', v_esperado);

  select count(*) into v_n from mv where local_id is null or local_nome = '';
  r := r || jsonb_build_object('2_sem_local', v_n);

  -- Último saldo de cada local (o tanque de combustível é um saldo só).
  create temp table ult on commit drop as
  select distinct on (origem, local_id, case when origem = 'combustivel' then null else insumo_id end)
         origem, local_id, case when origem = 'combustivel' then null else insumo_id end as insumo_id, saldo
  from mv
  order by origem, local_id, case when origem = 'combustivel' then null else insumo_id end,
           momento desc, lancado_em desc, id desc;
  select count(*) into v_n
  from pos p
  left join ult u on u.origem = p.origem and u.local_id = p.local_id
                  and u.insumo_id is not distinct from (case when p.origem = 'combustivel' then null else p.insumo_id end)
  where u.local_id is null and p.quantidade <> 0;
  r := r || jsonb_build_object('3_locais_faltando', v_n);

  select count(*), string_agg(p.local_nome || ' ' || coalesce(p.insumo_nome, '') || ': posição ' || p.quantidade || ' x ' || u.saldo, '; ')
    into v_n, v_txt
  from pos p
  join ult u on u.origem = p.origem and u.local_id = p.local_id
            and u.insumo_id is not distinct from (case when p.origem = 'combustivel' then null else p.insumo_id end)
  where round(u.saldo, 4) <> round(p.quantidade, 4);
  r := r || jsonb_build_object('3_divergencias', v_n, '3_detalhe', v_txt);

  -- Local com saldo nas movimentações e fora da Posição (a Posição corta o zero e o tanque inativo).
  select count(*) into v_n from ult u
  where round(u.saldo, 4) <> 0
    and not exists (select 1 from pos p where p.origem = u.origem and p.local_id = u.local_id
                      and u.insumo_id is not distinct from (case when p.origem = 'combustivel' then null else p.insumo_id end));
  r := r || jsonb_build_object('3_saldo_fora_da_posicao', v_n);

  select count(*) - count(distinct id) into v_n from mv;
  r := r || jsonb_build_object('4_id_repetido', v_n);

  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.fn_estoque_movimentacoes();
    r := r || jsonb_build_object('5_sem_permissao', 'PASSOU (errado)');
  exception when others then
    r := r || jsonb_build_object('5_sem_permissao', 'recusou: ' || sqlerrm);
  end;
  reset role;

  raise exception 'RESULTADO %', r;
end $prova$;
