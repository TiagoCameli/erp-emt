-- Prova: CC do cadastro segue a ultima folha; 13o e ferias diluidos nos 12
-- meses do ano e tratados como custo indireto (Escritorio Central) nos
-- relatorios. Rodar em begin/rollback depois da migration; termina com
-- raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_ec uuid; v_tot numeric; v_view numeric; v_meses int; v_ccs int; v_cc uuid; v_dif numeric; v_n int;
  v_l uuid; v_obra uuid; v_v numeric; v_mar date := date '2026-03-01';
  v_obra0 numeric; v_obra1 numeric; v_ec0 numeric; v_ec1 numeric; v_ano0 numeric; v_ano1 numeric;
  v_rat numeric; v_nao numeric; v_ind numeric;
  v_colab uuid; v_item8 uuid; v_item9 uuid; v_cc_novo uuid; v_cad uuid;
begin
  select id into v_ec from public.centros_custo
   where pai_id is null and tipo = 'escritorio' and papel_rateio = 'indireto';

  -- 1. O 13o de 2026 (competencia 12/2026) vira 12 fatias, uma por mes do ano,
  --    todas no Escritorio Central, somando o mesmo valor.
  select sum(r.valor) into v_tot from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
   where l.origem = 'decimo_terceiro' and l.mes_competencia = date '2026-12-01';
  if coalesce(v_tot, 0) <= 0 then raise exception 'FALHOU 0: sem 13o lancado em 2026'; end if;
  select sum(v.valor), count(distinct v.mes_competencia), count(distinct v.centro_custo_id), max(v.centro_custo_id::text)::uuid
    into v_view, v_meses, v_ccs, v_cc
    from public.vw_custo_rateios v join public.lancamentos l on l.id = v.lancamento_id
   where l.origem = 'decimo_terceiro' and l.mes_competencia = date '2026-12-01';
  if v_view <> v_tot then raise exception 'FALHOU 1: view soma % <> rateios %', v_view, v_tot; end if;
  if v_meses <> 12 then raise exception 'FALHOU 2: % meses', v_meses; end if;
  if v_ccs <> 1 or v_cc <> v_ec then raise exception 'FALHOU 3: centro % (esperado Escritorio Central)', v_cc; end if;
  select count(*) into v_n from public.vw_custo_rateios v join public.lancamentos l on l.id = v.lancamento_id
   where l.origem = 'decimo_terceiro' and extract(year from v.mes_competencia) <> extract(year from l.mes_competencia);
  if v_n <> 0 then raise exception 'FALHOU 4: % fatia(s) fora do ano', v_n; end if;
  select max(d) into v_dif from (
    select max(v.valor) - min(v.valor) as d from public.vw_custo_rateios v
      join public.lancamentos l on l.id = v.lancamento_id
     where l.origem = 'decimo_terceiro' group by v.id) x;
  if v_dif > 0.01 then raise exception 'FALHOU 5: fatias do mesmo rateio diferem %', v_dif; end if;

  -- 2. Lancamento comum nao muda: mesma linha, mesmo mes, mesmo centro.
  select count(*) into v_n from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
   where coalesce(l.origem, '') not in ('decimo_terceiro', 'decimo_terceiro_guia', 'ferias', 'ferias_guia')
     and not exists (select 1 from public.vw_custo_rateios v
                      where v.id = r.id and v.centro_custo_id = r.centro_custo_id
                        and v.valor = r.valor and v.mes_competencia = l.mes_competencia);
  if v_n <> 0 then raise exception 'FALHOU 6: % rateio(s) comum(ns) mudaram', v_n; end if;

  -- 3. Nos relatorios: um lancamento de obra que vira ferias sai da obra em
  --    marco, entra 1/12 no Escritorio Central em cada mes, e o total do ano
  --    nao muda.
  select l.id, r.centro_custo_id, r.valor into v_l, v_obra, v_v
    from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id = l.id
    join public.centros_custo c on c.id = r.centro_custo_id
    left join public.categorias_financeiras cat on cat.id = coalesce(r.categoria_id, l.categoria_id)
   where l.tipo = 'a_pagar' and l.status <> 'cancelado' and l.mes_competencia = v_mar
     and c.pai_id is null and c.tipo = 'obra' and c.papel_rateio is null
     and coalesce(cat.natureza, 'operacional') = 'operacional' and r.valor >= 12
     and (select count(*) from public.lancamento_rateios r2 where r2.lancamento_id = l.id) = 1
   order by r.valor desc limit 1;
  if v_l is null then raise exception 'FALHOU 7: sem lancamento de obra em marco'; end if;

  select coalesce(sum(total), 0) into v_obra0 from public.fn_rel_custo_receita(array[v_mar]) where tipo = 'a_pagar' and centro_custo_id = v_obra;
  select coalesce(sum(total), 0) into v_ec0 from public.fn_rel_custo_receita(array[date '2026-01-01']) where tipo = 'a_pagar' and centro_custo_id = v_ec;
  select coalesce(sum(total), 0) into v_ano0 from public.fn_rel_custo_centro_custo(date '2026-01-01', date '2027-01-01');

  update public.lancamentos set origem = 'ferias' where id = v_l;

  select coalesce(sum(total), 0) into v_obra1 from public.fn_rel_custo_receita(array[v_mar]) where tipo = 'a_pagar' and centro_custo_id = v_obra;
  select coalesce(sum(total), 0) into v_ec1 from public.fn_rel_custo_receita(array[date '2026-01-01']) where tipo = 'a_pagar' and centro_custo_id = v_ec;
  select coalesce(sum(total), 0) into v_ano1 from public.fn_rel_custo_centro_custo(date '2026-01-01', date '2027-01-01');
  if v_obra1 <> v_obra0 - v_v then raise exception 'FALHOU 8: obra em marco % -> % (valor %)', v_obra0, v_obra1, v_v; end if;
  if abs((v_ec1 - v_ec0) - v_v / 12) > 0.01 then raise exception 'FALHOU 9: EC em janeiro subiu % (esperado ~%)', v_ec1 - v_ec0, round(v_v / 12, 2); end if;
  if v_ano1 <> v_ano0 then raise exception 'FALHOU 10: total do ano % -> %', v_ano0, v_ano1; end if;

  -- 4. O rateio do indireto continua fechando com a fatia nova.
  select coalesce(sum(indireto), 0), coalesce(max(nao_rateado), 0) into v_rat, v_nao from public.fn_rateio_indireto_mes(date '2026-01-01');
  select coalesce(sum(total), 0) into v_ind from public.fn_rel_custo_receita(array[date '2026-01-01']) r
    join public.centros_custo c on c.id = r.centro_custo_id where r.tipo = 'a_pagar' and c.papel_rateio = 'indireto';
  if v_rat + v_nao <> v_ind then raise exception 'FALHOU 11: rateado % + nao % <> indireto %', v_rat, v_nao, v_ind; end if;
  select count(*) into v_n from public.fn_rel_custos_indiretos(2026) where mes = date '2026-01-01' and centro_id = v_ec;
  if v_n = 0 then raise exception 'FALHOU 12: custos indiretos sem o Escritorio Central em janeiro'; end if;

  -- 5. Cadastro igual a ultima folha: ninguem diverge depois da carga.
  select count(*) into v_n from (
    select distinct on (fi.colaborador_id) fi.colaborador_id, fi.centro_custo_id
      from public.folha_itens fi join public.folhas f on f.id = fi.folha_id
     where fi.centro_custo_id is not null
     order by fi.colaborador_id, f.competencia desc) u
    join public.colaboradores c on c.id = u.colaborador_id
   where c.centro_custo_id is distinct from u.centro_custo_id;
  if v_n <> 0 then raise exception 'FALHOU 13: % cadastro(s) diferente(s) da ultima folha', v_n; end if;

  -- 6. Trocar o CC numa folha antiga nao mexe no cadastro; na ultima, mexe.
  select a.colaborador_id, a.id, b.id into v_colab, v_item8, v_item9
    from public.folha_itens a join public.folhas fa on fa.id = a.folha_id
    join public.folha_itens b on b.colaborador_id = a.colaborador_id
    join public.folhas fb on fb.id = b.folha_id
   where fa.competencia = date '2026-08-01' and fb.competencia = date '2026-09-01'
     and not exists (select 1 from public.folha_itens x join public.folhas fx on fx.id = x.folha_id
                      where x.colaborador_id = a.colaborador_id and fx.competencia > date '2026-09-01')
   limit 1;
  if v_colab is null then raise exception 'FALHOU 14: sem colaborador em 08 e 09'; end if;
  select id into v_cc_novo from public.centros_custo
   where ativo and nivel = 1 and id <> (select centro_custo_id from public.folha_itens where id = v_item9) limit 1;

  update public.folha_itens set centro_custo_id = v_cc_novo where id = v_item8;
  select centro_custo_id into v_cad from public.colaboradores where id = v_colab;
  if v_cad = v_cc_novo then raise exception 'FALHOU 15: folha antiga mudou o cadastro'; end if;

  update public.folha_itens set centro_custo_id = v_cc_novo where id = v_item9;
  select centro_custo_id into v_cad from public.colaboradores where id = v_colab;
  if v_cad is distinct from v_cc_novo then raise exception 'FALHOU 16: ultima folha nao mudou o cadastro (%)', v_cad; end if;

  raise exception 'PROVA OK';
end
$prova$;
