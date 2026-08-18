-- Desfaz supabase/carga/oc_mais_controle_ajustes_2026_08_17.sql.
--
-- Volta as oito ordens de caixa para 14/08/2026 (a data de criação no Mais
-- Controle, que era o que a carga original tinha posto) com competência de
-- agosto, e reativa o cadastro duplicado do MARANATA GÁS.
--
-- Recusa a rodar se alguma dessas ordens tiver saído de rascunho, ganhado
-- parcela ou virado lançamento: aí a data já foi usada para calcular alguma
-- coisa, e voltar sozinho estragaria mais do que conserta.
--
-- Não é preciso rodar isto para trocar só a competência: a tela da OC tem
-- diálogo próprio de mês de competência.

do $$
declare
  v_n int;
  v_falta text;
  v_total_antes numeric;
  v_dup uuid := '9b61bde6-262b-4628-7fa4-fd405f787e73';
begin
  select sum(valor_total) into v_total_antes
    from public.ordens_compra where observacoes like 'Ordem de compra Mais Controle%';

  select string_agg(numero || ' (' || status || ')', ', ') into v_falta
    from public.ordens_compra
   where observacoes like 'Ordem de compra Mais Controle%'
     and descricao like 'CAIXA DO DIA%'
     and status <> 'rascunho';
  if v_falta is not null then
    raise exception 'ordem de caixa fora de rascunho: %', v_falta;
  end if;

  if exists (
    select 1 from public.oc_parcelas p
     join public.ordens_compra o on o.id = p.ordem_compra_id
    where o.observacoes like 'Ordem de compra Mais Controle%'
      and o.descricao like 'CAIXA DO DIA%'
  ) then
    raise exception 'ha parcela gerada em cima destas datas';
  end if;

  update public.ordens_compra
     set data_compra = date '2026-08-14',
         mes_competencia = date '2026-08-01'
   where observacoes like 'Ordem de compra Mais Controle%'
     and descricao like 'CAIXA DO DIA%';
  get diagnostics v_n = row_count;
  if v_n <> 8 then
    raise exception 'esperava 8 ordens de caixa, voltou %', v_n;
  end if;

  if (select sum(valor_total) from public.ordens_compra
       where observacoes like 'Ordem de compra Mais Controle%') <> v_total_antes then
    raise exception 'o total mudou ao voltar a data';
  end if;

  update public.fornecedores
     set ativo = true,
         observacoes = nullif(btrim(replace(
           coalesce(observacoes, ''),
           'Cadastro duplicado de MARANATA GÁS. O válido é M NASCIMENTO DA SILVA LTDA '
             || '(fantasia MARANATA GÁS), criado em 26/06/2026. Este ficou inativo em 17/08/2026 '
             || 'por não ter nenhum lançamento, ordem ou cotação.',
           '')), '')
   where id = v_dup and not ativo;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise notice 'o duplicado ja estava ativo (ou nao existe); segui em frente';
  end if;

  raise notice 'rollback ok: 8 ordens de volta para 14/08/2026 em agosto, duplicata reativada';
end $$;
