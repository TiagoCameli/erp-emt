-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-20, versão
-- 20260820195531 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Segunda leva de reclassificação do mesmo dia, vinda de
-- "lancamentos-2026-08-20 (1).xlsx". Mesmo método da primeira (versão
-- 20260820164806): a linha se identifica por `lancamentos.numero`, que é único,
-- e a ordem dos nomes dentro da célula de centro é normalizada nos dois lados
-- antes de comparar.
--
-- 46 categorias e 132 centros de custo. O grosso é 93 lançamentos saindo do
-- Escritório Central para "Investimentos" — o centro criado horas antes nesta
-- mesma sessão (versão 20260820191509), que é o que o Tiago queria quando
-- escreveu esse nome na planilha anterior.
--
-- Criou a categoria financeira "Seguros", autorizada pelo Tiago: três apólices
-- de seguro de obra do DNIT e uma caução de apostilamento, R$ 97.928,93 no
-- total, estavam classificadas como "Investimentos". `tipo = 'despesa'` porque
-- o check da coluna só aceita receita ou despesa, e todas as categorias irmãs
-- são despesa na raiz.
--
-- A primeira tentativa desta migration FALHOU por não preencher `tipo`, que é
-- NOT NULL em categorias_financeiras. Nada foi aplicado: a transação abortou
-- inteira, que é o comportamento que as travas existem para garantir.
--
-- Os 132 lançamentos que mudam de centro têm EXATAMENTE UM rateio cada (medido
-- antes), então nenhuma troca é ambígua e nenhum valor de rateio foi tocado.
--
-- Fora de escopo: 6 lançamentos criados depois do export (LAN-2026-5933 a 5938)
-- e o rodapé "Total (5.929 lançamentos)" da planilha.
--
-- Conferido depois de aplicar: das 5.929 linhas comparadas, ZERO divergência de
-- categoria e ZERO de centro. O banco reflete a planilha inteira.
--
-- Três travas fail-closed, iguais às da primeira leva: o `where` exige o estado
-- de origem (rodar duas vezes não faz nada), as contagens têm que dar exatamente
-- 46 e 132, e a soma do rateio tem que continuar fechando com o valor em todos
-- os lançamentos com rateio.
--
-- Rollback: inverter os pares (de, para) de cada bloco; os nomes de origem estão
-- todos escritos aqui. A categoria "Seguros" sai por fn_excluir_cadastro.
do $$
declare v_n int; v_cat int := 0; v_cc int := 0; v_fora int; v_uid uuid;
begin
  select id into v_uid from public.usuarios where nome = 'Tiago de Melo Cameli';

  -- Categoria "Seguros" nao existia; o Tiago autorizou criar em 20/08/2026. Os
  -- tres lancamentos que vao para ela sao apolices de seguro de obra do DNIT e
  -- uma caucao de apostilamento, R$ 97.928,93 no total.
  -- tipo = 'despesa' porque o check so aceita receita ou despesa, e todas as
  -- categorias irmas (Investimentos, Outras despesas, Aquisicao de Equipamento)
  -- sao despesa na raiz, com pai_id nulo.
  if not exists (select 1 from public.categorias_financeiras where nome = 'Seguros') then
    insert into public.categorias_financeiras (nome, tipo, pai_id, ativo, created_by)
    values ('Seguros', 'despesa', null, true, v_uid);
  end if;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Aquisição de Equipamento' and ativo)
  where l.numero in ('LAN-2026-3300','LAN-2026-4282')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Investimentos');
  get diagnostics v_n = row_count; v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Seguros' and ativo)
  where l.numero in ('LAN-2026-1221','LAN-2026-2802','LAN-2026-5540')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Investimentos');
  get diagnostics v_n = row_count; v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Investimentos' and ativo)
  where l.numero in ('LAN-2026-2031','LAN-2026-3347')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Juros');
  get diagnostics v_n = row_count; v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Manutenção de equipamentos' and ativo)
  where l.numero in ('LAN-2026-1048','LAN-2026-2422','LAN-2026-2460')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Manutenção');
  get diagnostics v_n = row_count; v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Investimentos' and ativo)
  where l.numero in ('LAN-2026-0196','LAN-2026-0600','LAN-2026-0667','LAN-2026-0787','LAN-2026-0933','LAN-2026-1022','LAN-2026-1109','LAN-2026-1112','LAN-2026-1278','LAN-2026-1397','LAN-2026-1561','LAN-2026-1646','LAN-2026-1849','LAN-2026-2355','LAN-2026-3007','LAN-2026-3065','LAN-2026-3198','LAN-2026-3716','LAN-2026-3987','LAN-2026-4156','LAN-2026-4234','LAN-2026-4239','LAN-2026-4386','LAN-2026-4518','LAN-2026-4580','LAN-2026-4967','LAN-2026-5010','LAN-2026-5076','LAN-2026-5251','LAN-2026-5282','LAN-2026-5425','LAN-2026-5775','LAN-2026-5804','LAN-2026-5811')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Outras despesas');
  get diagnostics v_n = row_count; v_cat := v_cat + v_n;

  update public.lancamentos l
  set categoria_id = (select id from public.categorias_financeiras where nome = 'Investimentos' and ativo)
  where l.numero in ('LAN-2026-3771','LAN-2026-4345')
    and l.categoria_id = (select id from public.categorias_financeiras where nome = 'Tarifa Bancária');
  get diagnostics v_n = row_count; v_cat := v_cat + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = '002 - Equipamentos Colorado 2026' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-4048')
    and r.centro_custo_id = (select id from public.centros_custo where nome = '003 - Recuperação do Ramal do Gama');
  get diagnostics v_n = row_count; v_cc := v_cc + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = '002 - Equipamentos Colorado 2026' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-0665')
    and r.centro_custo_id = (select id from public.centros_custo where nome = '007 - AC 405 - Lote 2');
  get diagnostics v_n = row_count; v_cc := v_cc + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = 'Aquisição de Equipamentos' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-4839')
    and r.centro_custo_id = (select id from public.centros_custo where nome = '009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10');
  get diagnostics v_n = row_count; v_cc := v_cc + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = '001 - Carretas EMT' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-1152','LAN-2026-2013','LAN-2026-2862','LAN-2026-2870')
    and r.centro_custo_id = (select id from public.centros_custo where nome = 'Aquisição de Equipamentos');
  get diagnostics v_n = row_count; v_cc := v_cc + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = '002 - Equipamentos Colorado 2026' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-4306')
    and r.centro_custo_id = (select id from public.centros_custo where nome = 'Escritório Central');
  get diagnostics v_n = row_count; v_cc := v_cc + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = 'Investimentos' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-0034','LAN-2026-0058','LAN-2026-0186','LAN-2026-0196','LAN-2026-0198','LAN-2026-0251','LAN-2026-0282','LAN-2026-0489','LAN-2026-0540','LAN-2026-0600','LAN-2026-0623','LAN-2026-0667','LAN-2026-0787','LAN-2026-0853','LAN-2026-0873','LAN-2026-0933','LAN-2026-1022','LAN-2026-1108','LAN-2026-1109','LAN-2026-1112','LAN-2026-1167','LAN-2026-1260','LAN-2026-1278','LAN-2026-1397','LAN-2026-1527','LAN-2026-1561','LAN-2026-1601','LAN-2026-1646','LAN-2026-1661','LAN-2026-1849','LAN-2026-2031','LAN-2026-2215','LAN-2026-2355','LAN-2026-2366','LAN-2026-2394','LAN-2026-2585','LAN-2026-2739','LAN-2026-2765','LAN-2026-3007','LAN-2026-3043','LAN-2026-3065','LAN-2026-3198','LAN-2026-3212','LAN-2026-3311','LAN-2026-3347','LAN-2026-3366','LAN-2026-3374','LAN-2026-3413','LAN-2026-3439','LAN-2026-3542','LAN-2026-3569','LAN-2026-3699','LAN-2026-3716','LAN-2026-3771','LAN-2026-3886','LAN-2026-3987','LAN-2026-4094','LAN-2026-4156','LAN-2026-4206','LAN-2026-4234','LAN-2026-4239','LAN-2026-4345','LAN-2026-4355','LAN-2026-4386','LAN-2026-4518','LAN-2026-4559','LAN-2026-4580','LAN-2026-4663','LAN-2026-4813','LAN-2026-4844','LAN-2026-4883','LAN-2026-4967','LAN-2026-4984','LAN-2026-5010','LAN-2026-5076','LAN-2026-5094','LAN-2026-5108','LAN-2026-5251','LAN-2026-5282','LAN-2026-5322','LAN-2026-5425','LAN-2026-5611','LAN-2026-5613','LAN-2026-5737','LAN-2026-5775','LAN-2026-5804','LAN-2026-5807','LAN-2026-5808','LAN-2026-5809','LAN-2026-5810','LAN-2026-5811','LAN-2026-5898','LAN-2026-5901')
    and r.centro_custo_id = (select id from public.centros_custo where nome = 'Escritório Central');
  get diagnostics v_n = row_count; v_cc := v_cc + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = 'Manutenção/Documentação de Equipamentos' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-0983','LAN-2026-2895')
    and r.centro_custo_id = (select id from public.centros_custo where nome = 'Escritório Central');
  get diagnostics v_n = row_count; v_cc := v_cc + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = '001 - Carretas EMT' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-5645')
    and r.centro_custo_id = (select id from public.centros_custo where nome = 'Manutenção/Documentação de Equipamentos');
  get diagnostics v_n = row_count; v_cc := v_cc + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = '002 - Equipamentos Colorado 2026' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-0227','LAN-2026-0694','LAN-2026-0763','LAN-2026-1048','LAN-2026-1117','LAN-2026-1498','LAN-2026-1528','LAN-2026-1583','LAN-2026-1737','LAN-2026-2396','LAN-2026-2422','LAN-2026-2460','LAN-2026-2827','LAN-2026-2917','LAN-2026-3051','LAN-2026-3245','LAN-2026-3264','LAN-2026-3287','LAN-2026-3809','LAN-2026-3958','LAN-2026-4210','LAN-2026-4281','LAN-2026-4414','LAN-2026-4504')
    and r.centro_custo_id = (select id from public.centros_custo where nome = 'Manutenção/Documentação de Equipamentos');
  get diagnostics v_n = row_count; v_cc := v_cc + v_n;

  update public.lancamento_rateios r
  set centro_custo_id = (select id from public.centros_custo where nome = 'Aquisição de Equipamentos' and ativo)
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero in ('LAN-2026-3300','LAN-2026-4252','LAN-2026-4282','LAN-2026-5233')
    and r.centro_custo_id = (select id from public.centros_custo where nome = 'Manutenção/Documentação de Equipamentos');
  get diagnostics v_n = row_count; v_cc := v_cc + v_n;

  if v_cat <> 46 then
    raise exception 'categoria: esperava 46 linhas, mudou %', v_cat;
  end if;
  if v_cc <> 132 then
    raise exception 'centro de custo: esperava 132 linhas, mudou %', v_cc;
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