-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-20, versão
-- 20260820164806 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Reclassificação de categoria financeira e centro de custo vinda da planilha
-- lancamentos-2026-08-20.xlsx, que o Tiago exportou da tela de Lançamentos,
-- editou à mão e devolveu.
--
-- COMO A LINHA FOI IDENTIFICADA: por `lancamentos.numero`, que é único desde
-- 18/08 (índice único; medido 5.924 de 5.924 distintos, zero nulo). Isto é o que
-- mudou em relação ao round-trip anterior desta base, que precisou de assinatura
-- de colunas porque `numero` repetia em até 10 lançamentos diferentes. Posição
-- na planilha continua não servindo de âncora: o Excel reordena ao abrir.
--
-- A ordem dos nomes DENTRO da célula "Centro de custo" foi normalizada nos dois
-- lados antes de comparar. O export monta a célula com `join('; ')` e não garante
-- ordem, então comparar cru acusaria mudança onde não houve.
--
-- O QUE MUDOU: 65 categorias e 25 centros de custo. O grosso é 46 lançamentos
-- de "Outras despesas" para "Investimentos" e 15 do "Escritório Central" para
-- "Aquisição de Equipamentos" — a separação de investimento e equipamento do
-- custo do escritório.
--
-- O QUE FICOU DE FORA, de propósito:
--   - 7 lançamentos criados depois do export (LAN-2026-5922 a 5928). A planilha
--     não os conhece e mexer neles seria inventar.
--   - a linha "Total (5.918 lançamentos)", que é o rodapé da planilha.
--   - LAN-2026-1047: a planilha traz "Investimentos" na coluna Centro de custo,
--     e "Investimentos" existe como CATEGORIA, não como centro. Decisão do Tiago
--     em 20/08: não mexer nesse lançamento, nem no centro nem na categoria.
--
-- UMA CORREÇÃO AUTORIZADA: LAN-2026-5876 vinha com "Aquisição de Equipamento"
-- (singular), que não existe como centro de custo; o Tiago confirmou que é o
-- plural, "Aquisição de Equipamentos", igual aos outros 14 da mesma leva.
--
-- Todos os 25 lançamentos que mudam de centro têm EXATAMENTE UM rateio (medido
-- antes), então a troca não tem ambiguidade sobre qual linha muda, e nenhum
-- valor de rateio foi tocado.
--
-- TRÊS TRAVAS FAIL-CLOSED, e é por isso que aplicar duas vezes é inofensivo:
--   1. cada `where` exige o estado de ORIGEM (categoria/centro de onde a linha
--      saiu), então a segunda execução casa zero linhas;
--   2. as contagens têm que dar exatamente 65 e 25, senão a transação inteira
--      aborta em vez de aplicar metade;
--   3. a soma do rateio tem que continuar fechando com o valor do lançamento em
--      TODOS os lançamentos com rateio, não só nos tocados.
--
-- Conferido depois de aplicar: das 5.918 linhas comparadas, ZERO divergência de
-- categoria e apenas as duas divergências de centro esperadas (o LAN-2026-1047
-- deixado de fora e o singular do LAN-2026-5876 corrigido para o plural).
--
-- Rollback: inverter os pares (de, para) de cada bloco. Os nomes de origem estão
-- todos escritos aqui, então o caminho de volta é mecânico.
do $$
declare v_n int; v_cat int := 0; v_cc int := 0; v_fora int;
begin
  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Aquisição de Equipamento' and ativo)
  where l.numero in ('LAN-2026-5099')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Despesas financeiras');
  get diagnostics v_n = row_count;
  v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Aquisição de Equipamento' and ativo)
  where l.numero in ('LAN-2026-4608')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Hospedagem');
  get diagnostics v_n = row_count;
  v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Aquisição de Equipamento' and ativo)
  where l.numero in ('LAN-2026-0871','LAN-2026-1026')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Investimentos');
  get diagnostics v_n = row_count;
  v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Investimentos' and ativo)
  where l.numero in ('LAN-2026-2215','LAN-2026-3569')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Juros');
  get diagnostics v_n = row_count;
  v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Aquisição de Equipamento' and ativo)
  where l.numero in ('LAN-2026-0224')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Manutenção');
  get diagnostics v_n = row_count;
  v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Aquisição de Equipamento' and ativo)
  where l.numero in ('LAN-2026-2184','LAN-2026-4376')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Manutenção de equipamentos');
  get diagnostics v_n = row_count;
  v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Aquisição de Equipamento' and ativo)
  where l.numero in ('LAN-2026-1152','LAN-2026-1532','LAN-2026-1639','LAN-2026-2870','LAN-2026-3649','LAN-2026-5876')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Outras despesas');
  get diagnostics v_n = row_count;
  v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Investimentos' and ativo)
  where l.numero in ('LAN-2026-0034','LAN-2026-0058','LAN-2026-0186','LAN-2026-0198','LAN-2026-0251','LAN-2026-0282','LAN-2026-0489','LAN-2026-0540','LAN-2026-0623','LAN-2026-0853','LAN-2026-0873','LAN-2026-1108','LAN-2026-1260','LAN-2026-1527','LAN-2026-1601','LAN-2026-1661','LAN-2026-2366','LAN-2026-2394','LAN-2026-2585','LAN-2026-2739','LAN-2026-2765','LAN-2026-3212','LAN-2026-3311','LAN-2026-3366','LAN-2026-3374','LAN-2026-3413','LAN-2026-3542','LAN-2026-3699','LAN-2026-4094','LAN-2026-4206','LAN-2026-4355','LAN-2026-4559','LAN-2026-4813','LAN-2026-4844','LAN-2026-4883','LAN-2026-4984','LAN-2026-5094','LAN-2026-5108','LAN-2026-5611','LAN-2026-5737','LAN-2026-5807','LAN-2026-5808','LAN-2026-5809','LAN-2026-5810','LAN-2026-5898','LAN-2026-5901')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Outras despesas');
  get diagnostics v_n = row_count;
  v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Manutenção de equipamentos' and ativo)
  where l.numero in ('LAN-2026-2195')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Outras despesas');
  get diagnostics v_n = row_count;
  v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Aquisição de Equipamento' and ativo)
  where l.numero in ('LAN-2026-4889')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Reembolso');
  get diagnostics v_n = row_count;
  v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Aquisição de Equipamento' and ativo)
  where l.numero in ('LAN-2026-2257')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Salário Mão de Obra');
  get diagnostics v_n = row_count;
  v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Investimentos' and ativo)
  where l.numero in ('LAN-2026-1167')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Tarifa Bancária');
  get diagnostics v_n = row_count;
  v_cat := v_cat + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = 'Aquisição de Equipamentos' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-2257','LAN-2026-4376','LAN-2026-4608','LAN-2026-4889')
    and r.centro_custo_id = (select id from public.centros_custo where nome = '001 - Carretas EMT');
  get diagnostics v_n = row_count;
  v_cc := v_cc + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = '001 - Carretas EMT' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-2195')
    and r.centro_custo_id = (select id from public.centros_custo where nome = 'Escritório Central');
  get diagnostics v_n = row_count;
  v_cc := v_cc + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = '007 - AC 405 - Lote 2' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-4115','LAN-2026-5566')
    and r.centro_custo_id = (select id from public.centros_custo where nome = 'Escritório Central');
  get diagnostics v_n = row_count;
  v_cc := v_cc + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = '009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-0327','LAN-2026-1474','LAN-2026-4904')
    and r.centro_custo_id = (select id from public.centros_custo where nome = 'Escritório Central');
  get diagnostics v_n = row_count;
  v_cc := v_cc + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = 'Aquisição de Equipamentos' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-0053','LAN-2026-0224','LAN-2026-0871','LAN-2026-1026','LAN-2026-1152','LAN-2026-1532','LAN-2026-1639','LAN-2026-2013','LAN-2026-2862','LAN-2026-2870','LAN-2026-3649','LAN-2026-5099','LAN-2026-5217','LAN-2026-5754','LAN-2026-5876')
    and r.centro_custo_id = (select id from public.centros_custo where nome = 'Escritório Central');
  get diagnostics v_n = row_count;
  v_cc := v_cc + v_n;

  if v_cat <> 65 then
    raise exception 'categoria: esperava 65 linhas, mudou %', v_cat;
  end if;
  if v_cc <> 25 then
    raise exception 'centro de custo: esperava 25 linhas, mudou %', v_cc;
  end if;

  select count(*) into v_fora
  from (select lancamento_id, round(sum(valor), 2) as soma
        from public.lancamento_rateios group by lancamento_id) x
  join public.lancamentos l on l.id = x.lancamento_id
  where round(l.valor, 2) <> x.soma;
  if v_fora <> 0 then
    raise exception 'desbalanceou % lancamento(s): soma do rateio nao fecha com o valor', v_fora;
  end if;
end $$;