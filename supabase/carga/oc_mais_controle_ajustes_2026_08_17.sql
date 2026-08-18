-- Dois acertos nas ordens do Mais Controle, depois da carga de 17/08/2026.
--
-- ## 1. A data das ordens de caixa
--
-- Oito ordens têm na descrição o dia do caixa a que pertencem ("CAIXA DO DIA
-- 31/07/2026" e "CAIXA DO DIA 01/08/2026"), e todas ficaram com `data_compra` =
-- 14/08/2026, que é o dia em que ALGUÉM DIGITOU no Mais Controle, não o dia da
-- compra. O Mais Controle não tem campo de competência na ordem de compra, então
-- a carga não teve de onde tirar outra data.
--
-- Mas a própria ordem diz o dia. `data_compra` e `mes_competencia` passam a sair
-- da descrição:
--
--   2595, 2594, 2593 -> 31/07/2026, competência JULHO  (mudou de agosto)
--   2599, 2598, 2597, 2596, 2586 -> 01/08/2026, competência agosto (só a data)
--
-- São R$ 184,00 saindo de agosto para julho. Valor pequeno, atribuição certa.
--
-- Seguro de mexer, e conferido antes: as 17 ordens estão em rascunho, sem
-- parcela e sem lançamento — nada foi calculado em cima dessas datas. E o mês de
-- competência tem tela própria no app, então dá para voltar num clique.
--
-- As outras nove ordens não dizem o dia em lugar nenhum: ficam com a data de
-- criação do Mais Controle, que é o melhor que existe.
--
-- ## 2. A duplicata do MARANATA GÁS
--
-- Há dois cadastros: `M NASCIMENTO DA SILVA LTDA` / fantasia `MARANATA GÁS`
-- (26/06, 36 lançamentos, e as 2 ordens desta carga) e `MARANATA GÁS`
-- (05/08), este sem lançamento, sem ordem e sem cotação — órfão.
--
-- Ele fica INATIVO, não excluído. Inativo já some do seletor de fornecedor da OC
-- (a consulta filtra `ativo = true`), que é o problema prático. Excluir de
-- verdade grava na `lixeira` com `excluido_por` NOT NULL, e carga não tem
-- usuário: eu teria que carimbar o nome de uma pessoa numa exclusão que ela não
-- fez. Se for para sumir de vez, é um clique na tela de Fornecedores, com motivo
-- e autoria de verdade.

do $$
declare
  v_n int;
  v_julho int;
  v_agosto int;
  v_total_antes numeric;
  v_falta text;
  v_dup uuid := '9b61bde6-262b-4628-7fa4-fd405f787e73';
begin
  -- ------------------------------------------------------------------
  -- 1. Data e competência das ordens de caixa
  -- ------------------------------------------------------------------
  select sum(valor_total) into v_total_antes
    from public.ordens_compra where observacoes like 'Ordem de compra Mais Controle%';

  -- Nenhuma pode ter saído de rascunho, ganhado parcela ou lançamento.
  select string_agg(numero || ' (' || status || ')', ', ') into v_falta
    from public.ordens_compra
   where observacoes like 'Ordem de compra Mais Controle%'
     and descricao like 'CAIXA DO DIA%'
     and status <> 'rascunho';
  if v_falta is not null then
    raise exception 'ordem de caixa fora de rascunho, nao vou mexer na data: %', v_falta;
  end if;

  if exists (
    select 1 from public.oc_parcelas p
     join public.ordens_compra o on o.id = p.ordem_compra_id
    where o.observacoes like 'Ordem de compra Mais Controle%'
  ) then
    raise exception 'ha parcela gerada; mudar data_compra mexeria em vencimento';
  end if;

  if exists (
    select 1 from public.lancamentos l
     where l.origem = 'oc'
       and l.origem_id in (select id from public.ordens_compra
                            where observacoes like 'Ordem de compra Mais Controle%')
  ) then
    raise exception 'ha lancamento gerado a partir destas ordens';
  end if;

  update public.ordens_compra o
     set data_compra = d.dia,
         mes_competencia = date_trunc('month', d.dia)::date
    from (
      select id,
             to_date(substring(descricao from 'CAIXA DO DIA (\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY') as dia
        from public.ordens_compra
       where observacoes like 'Ordem de compra Mais Controle%'
         and descricao like 'CAIXA DO DIA%'
    ) d
   where o.id = d.id and d.dia is not null;
  get diagnostics v_n = row_count;

  if v_n <> 8 then
    raise exception 'esperava 8 ordens de caixa, atualizou %', v_n;
  end if;

  select count(*) filter (where mes_competencia = date '2026-07-01'),
         count(*) filter (where mes_competencia = date '2026-08-01')
    into v_julho, v_agosto
    from public.ordens_compra
   where observacoes like 'Ordem de compra Mais Controle%'
     and descricao like 'CAIXA DO DIA%';

  -- A linha de controle: se julho continuar zerado, o update nao fez nada e o
  -- "ok" seria mentira.
  if v_julho <> 3 or v_agosto <> 5 then
    raise exception 'esperava 3 em julho e 5 em agosto, ficou % e %', v_julho, v_agosto;
  end if;

  select string_agg(numero || ' (' || data_compra || ')', ', ') into v_falta
    from public.ordens_compra
   where observacoes like 'Ordem de compra Mais Controle%'
     and descricao like 'CAIXA DO DIA%'
     and data_compra <> to_date(substring(descricao from 'CAIXA DO DIA (\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY');
  if v_falta is not null then
    raise exception 'data_compra nao bate com a descricao em: %', v_falta;
  end if;

  -- Mexer na data nao pode ter mexido em dinheiro (o UPDATE passa pela trigger
  -- de total).
  if (select sum(valor_total) from public.ordens_compra
       where observacoes like 'Ordem de compra Mais Controle%') <> v_total_antes then
    raise exception 'o total das ordens mudou ao trocar a data';
  end if;

  -- ------------------------------------------------------------------
  -- 2. Duplicata do MARANATA GÁS
  -- ------------------------------------------------------------------
  if not exists (select 1 from public.fornecedores where id = v_dup) then
    raise exception 'o fornecedor duplicado nao existe mais';
  end if;

  select coalesce(
      (select count(*) from public.lancamentos where fornecedor_id = v_dup), 0)
    + coalesce(
      (select count(*) from public.ordens_compra where fornecedor_id = v_dup), 0)
    + coalesce(
      (select count(*) from public.cotacao_fornecedores where fornecedor_id = v_dup), 0)
    + coalesce(
      (select count(*) from public.cotacoes where vencedor_fornecedor_id = v_dup), 0)
    into v_n;

  if v_n <> 0 then
    raise exception 'o duplicado tem % referencia(s); nao e orfao, nao inativo', v_n;
  end if;

  update public.fornecedores
     set ativo = false,
         observacoes = coalesce(observacoes || E'\n', '')
           || 'Cadastro duplicado de MARANATA GÁS. O válido é M NASCIMENTO DA SILVA LTDA '
           || '(fantasia MARANATA GÁS), criado em 26/06/2026. Este ficou inativo em 17/08/2026 '
           || 'por não ter nenhum lançamento, ordem ou cotação.'
   where id = v_dup and ativo;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'esperava inativar 1 fornecedor, mexeu em %', v_n;
  end if;

  raise notice 'ok: 8 ordens de caixa com a data da descricao (3 julho, 5 agosto), duplicata inativada';
end $$;
