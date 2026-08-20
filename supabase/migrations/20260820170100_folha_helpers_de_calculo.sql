-- Extrai da fn_gerar_folha a matematica que a edicao de item vai precisar usar
-- IGUAL. Antes desta migration o calculo de INSS, de IRRF, das linhas de
-- encargo e das linhas de provisao morava inteiro dentro do loop da geracao.
-- Editar um valor a mao (a proxima migration) obrigaria a REESCREVER as mesmas
-- formulas num segundo lugar, e duas copias de uma conta de dinheiro divergem
-- na primeira vez que uma das duas for corrigida.
--
-- Nenhuma formula muda aqui: e o mesmo codigo, movido. Quem confere isso e a
-- prova gravada em docs/ e o teste do proprio Bloco 7, que continua passando.
--
-- Os quatro helpers sao INTERNOS: `revoke` de todo mundo. Quem chama e sempre
-- uma funcao SECURITY DEFINER de dono postgres (a geracao, a edicao), que
-- executa como postgres e portanto passa. Expor no PostgREST daria ao cliente
-- um jeito de escrever em folha_item_encargos sem passar pela folha.

/* ------------------------------------------------------------------ */
/* INSS progressivo                                                   */
/* ------------------------------------------------------------------ */

-- Para cada faixa (ordenada por limite_ate), a aliquota incide SO sobre a
-- porcao da base entre o limite anterior e o limite_ate; porcao negativa vira
-- 0, o que trava no teto. round(,2) na soma, nao por faixa. Espelha
-- calcularINSS em src/modules/rh/folha/calculo-imposto.ts.
create or replace function public.fn_folha_inss(p_base numeric)
returns numeric
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(round(sum(t.porcao * t.aliquota / 100.0), 2), 0)
  from (
    select greatest(
             least(p_base, f.limite_ate)
             - coalesce(lag(f.limite_ate) over (order by f.limite_ate), 0),
             0) as porcao,
           f.aliquota
    from public.folha_inss_faixas f
  ) t;
$function$;

comment on function public.fn_folha_inss(numeric) is
  'INSS progressivo do trabalhador sobre p_base. Sem faixas cadastradas devolve 0. Espelha calcularINSS do TS. Interna: chamada por fn_gerar_folha e fn_editar_item_folha.';

/* ------------------------------------------------------------------ */
/* IRRF: menor entre completo e simplificado                          */
/* ------------------------------------------------------------------ */

-- p_inss entra como parametro em vez de ser recalculado aqui: quem chama ja
-- calculou, e recalcular abriria a porta para a base do desconto completo usar
-- um INSS diferente do que foi gravado no item.
create or replace function public.fn_folha_irrf(
  p_base numeric,
  p_inss numeric,
  p_colaborador uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_dep integer; v_ded numeric; v_simpl numeric;
  v_base_c numeric; v_base_s numeric;
  v_aliq numeric; v_parc numeric;
  v_completo numeric; v_simplificado numeric;
begin
  -- Sem faixas de IRRF cadastradas => 0 (espelha calcularIRRF com faixas
  -- vazias). E o estado de producao hoje: a folha sai sem desconto legal.
  if not exists (select 1 from public.folha_irrf_faixas) then
    return 0;
  end if;

  -- folha_parametros e linha unica id=1. Sem linha, o select into deixa as duas
  -- variaveis nulas e os coalesce abaixo zeram: sem deducao, sem simplificado.
  select coalesce(irrf_deducao_por_dependente, 0), coalesce(irrf_desconto_simplificado, 0)
  into v_ded, v_simpl
  from public.folha_parametros where id = 1;
  v_ded := coalesce(v_ded, 0);
  v_simpl := coalesce(v_simpl, 0);

  select count(*) into v_dep
  from public.rh_dependentes
  where colaborador_id = p_colaborador and dependente_irrf;

  v_base_c := p_base - p_inss - v_dep * v_ded;
  v_base_s := p_base - v_simpl;

  -- Faixa = a 1a cujo limite_ate >= max(base,0); se nenhuma alcanca, a ultima.
  -- imposto = max(0, max(base,0) * aliquota/100 - parcela), round(,2).
  select fx.aliquota, fx.parcela_deduzir into v_aliq, v_parc
  from public.folha_irrf_faixas fx
  where fx.id = coalesce(
    (select id from public.folha_irrf_faixas
      where limite_ate >= greatest(v_base_c, 0) order by limite_ate asc limit 1),
    (select id from public.folha_irrf_faixas order by limite_ate desc limit 1));
  v_completo := round(greatest(greatest(v_base_c, 0) * v_aliq / 100.0 - v_parc, 0), 2);

  select fx.aliquota, fx.parcela_deduzir into v_aliq, v_parc
  from public.folha_irrf_faixas fx
  where fx.id = coalesce(
    (select id from public.folha_irrf_faixas
      where limite_ate >= greatest(v_base_s, 0) order by limite_ate asc limit 1),
    (select id from public.folha_irrf_faixas order by limite_ate desc limit 1));
  v_simplificado := round(greatest(greatest(v_base_s, 0) * v_aliq / 100.0 - v_parc, 0), 2);

  return least(v_completo, v_simplificado);
end;
$function$;

comment on function public.fn_folha_irrf(numeric, numeric, uuid) is
  'IRRF do trabalhador: menor entre o desconto completo (base - INSS - dependentes) e o simplificado. Sem faixas cadastradas devolve 0. Espelha calcularIRRF do TS. Interna.';

/* ------------------------------------------------------------------ */
/* Linhas de encargo e de provisao de um item                         */
/* ------------------------------------------------------------------ */

-- A BASE E O SALARIO BASE, sem gratificacao: e a regra do Tiago, e o motivo de
-- p_base ser um parametro separado do item em vez de ser lido de dentro dele.
--
-- Dois caminhos de encargo, e o item grava qual foi (folha_itens.encargos_percentual):
--
--   p_encargos_percentual null  -> uma linha por folha_encargos ativo, cada uma
--     com o seu grupo_recolhimento. E o caminho historico, e o unico que gera
--     guia no Financeiro (a fn_aprovar_folha monta a guia pelo grupo).
--   p_encargos_percentual preenchido -> UMA linha "Encargos", grupo null.
--     Percentual proprio de uma pessoa e custo gerencial: nao existe guia de
--     "os encargos do Joao". Sem grupo, a aprovacao nao inventa guia nenhuma.
--
-- Arredondamento por LINHA nas duas pontas, entao sum(linhas) == folha_itens.encargos
-- e sum(linhas) == folha_itens.provisoes por construcao, nao por sorte.
create or replace function public.fn_folha_aplicar_encargos_e_provisoes(
  p_item uuid,
  p_base numeric,
  p_encargos_percentual numeric
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_enc record; v_prov record;
  v_valor numeric; v_encargos numeric := 0; v_provisoes numeric := 0;
  v_pct_total numeric; v_pct_provisao numeric;
  v_prov_principal numeric; v_prov_encargos numeric;
begin
  -- Recalcular e sempre apagar e reescrever: a edicao de um item precisa
  -- desfazer as linhas anteriores, e a geracao chama isto num item recem
  -- inserido, onde o delete nao encontra nada.
  delete from public.folha_item_encargos where folha_item_id = p_item;
  delete from public.folha_item_provisoes where folha_item_id = p_item;

  if p_encargos_percentual is not null then
    v_valor := round(p_base * p_encargos_percentual / 100.0, 2);
    -- Grava a linha mesmo com 0,00: e ela que explica na tela POR QUE o
    -- encargo de um terceiro e zero ("Encargos 0%"), em vez de deixar o
    -- numero pelado e parecer config faltando.
    insert into public.folha_item_encargos
      (folha_item_id, nome, percentual, valor, grupo_recolhimento)
    values (p_item, 'Encargos', p_encargos_percentual, v_valor, null);
    v_encargos := v_valor;
  else
    for v_enc in
      select nome, percentual, grupo_recolhimento
      from public.folha_encargos where ativo order by nome
    loop
      v_valor := round(p_base * v_enc.percentual / 100.0, 2);
      insert into public.folha_item_encargos
        (folha_item_id, nome, percentual, valor, grupo_recolhimento)
      values (p_item, v_enc.nome, v_enc.percentual, v_valor, v_enc.grupo_recolhimento);
      v_encargos := v_encargos + v_valor;
    end loop;
  end if;

  -- Provisao de 13o e ferias: custo do mes, SEM caixa (nao gera lancamento nem
  -- guia). Principal + os encargos que vao incidir quando o 13o e as ferias
  -- forem pagos, usando a MESMA base de encargo deste item — global quando o
  -- item segue a config, individual quando ele tem percentual proprio. Se
  -- usasse sempre o total global, um terceiro com 0% de encargo provisionaria
  -- encargo de CLT.
  -- O percentual da provisao JA EMBUTE o terco constitucional (regra do
  -- Tiago): nao se soma terco nenhum aqui.
  select coalesce(sum(percentual), 0) into v_pct_total
  from public.folha_encargos where ativo;
  v_pct_provisao := coalesce(p_encargos_percentual, v_pct_total);

  for v_prov in
    select nome, percentual from public.folha_provisoes where ativo order by nome
  loop
    v_prov_principal := round(p_base * v_prov.percentual / 100.0, 2);
    v_prov_encargos := round(v_prov_principal * v_pct_provisao / 100.0, 2);

    insert into public.folha_item_provisoes
      (folha_item_id, nome, percentual, valor_principal, valor_encargos)
    values (p_item, v_prov.nome, v_prov.percentual, v_prov_principal, v_prov_encargos);

    v_provisoes := v_provisoes + v_prov_principal + v_prov_encargos;
  end loop;

  update public.folha_itens
     set encargos = v_encargos, provisoes = v_provisoes
   where id = p_item;
end;
$function$;

comment on function public.fn_folha_aplicar_encargos_e_provisoes(uuid, numeric, numeric) is
  'Reescreve as linhas de folha_item_encargos e folha_item_provisoes de um item sobre p_base (o SALARIO BASE, sem gratificacao) e atualiza os totais encargos/provisoes do item. p_encargos_percentual null = discrimina os folha_encargos ativos (com grupo, gera guia); preenchido = uma linha "Encargos" sem grupo (custo gerencial, sem guia). Interna.';

/* ------------------------------------------------------------------ */
/* Totais do cabecalho da folha                                       */
/* ------------------------------------------------------------------ */

-- Uma unica definicao de "os totais da folha", para geracao e edicao nunca
-- fecharem o cabecalho de formas diferentes. O bruto inclui a gratificacao;
-- valor_gratificacoes existe so para a tela poder dizer quanto do bruto e
-- gratificacao.
create or replace function public.fn_folha_recalcular_totais(p_folha uuid)
returns void
language sql
security definer
set search_path to ''
as $function$
  update public.folhas f set
    valor_bruto = coalesce((select sum(salario_base + valor_extras + gratificacao)
                            from public.folha_itens where folha_id = p_folha), 0),
    valor_gratificacoes = coalesce((select sum(gratificacao)
                            from public.folha_itens where folha_id = p_folha), 0),
    valor_encargos = coalesce((select sum(encargos)
                            from public.folha_itens where folha_id = p_folha), 0),
    valor_adiantamentos = coalesce((select sum(adiantamentos)
                            from public.folha_itens where folha_id = p_folha), 0),
    valor_liquido = coalesce((select sum(valor_liquido)
                            from public.folha_itens where folha_id = p_folha), 0),
    valor_provisoes = coalesce((select sum(provisoes)
                            from public.folha_itens where folha_id = p_folha), 0),
    custo_total = coalesce((select sum(custo_total)
                            from public.folha_itens where folha_id = p_folha), 0)
  where f.id = p_folha;
$function$;

comment on function public.fn_folha_recalcular_totais(uuid) is
  'Fecha o cabecalho de folhas a partir da soma dos folha_itens. valor_bruto = salario base + extras + gratificacao. Interna: chamada pela geracao e pela edicao de item.';

/* ------------------------------------------------------------------ */
/* Grants: os quatro sao internos                                     */
/* ------------------------------------------------------------------ */

-- `from public` sozinho nao basta: as default privileges do projeto podem ter
-- dado EXECUTE a anon e authenticated por nome, e revogar de PUBLIC nao mexe
-- num grant nominal. Os tres alvos, explicitos.
revoke all on function public.fn_folha_inss(numeric)
  from public, anon, authenticated;
revoke all on function public.fn_folha_irrf(numeric, numeric, uuid)
  from public, anon, authenticated;
revoke all on function public.fn_folha_aplicar_encargos_e_provisoes(uuid, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.fn_folha_recalcular_totais(uuid)
  from public, anon, authenticated;
