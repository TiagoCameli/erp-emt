-- O percentual que o Tiago digita por pessoa na folha passa a DESCONTAR do
-- salario, em vez de somar no custo da empresa.
--
-- O que ele viu na tela: CLELTON, bruto R$ 1.907,00, digitou 7,5% e o app
-- mostrou custo R$ 2.028,58 e liquido R$ 1.907,00 -- o percentual SOMOU e o
-- salario dele nao mudou. Nao era erro de conta: o campo "Percentual de encargo
-- desta pessoa" e encargo PATRONAL (FGTS, INSS patronal), que por definicao
-- soma no custo da empresa e nunca sai do salario de ninguem. O desconto do
-- empregado tem lugar proprio (folha_itens.inss, calculado pelas faixas de
-- /rh/parametros-folha) e estava zerado porque as faixas nunca foram
-- cadastradas: fn_folha_inss(10000) devolvia R$ 0,00, em silencio.
--
-- Decisao do Tiago em 25/08/2026, com os numeros na frente: o percentual por
-- pessoa passa a ser DESCONTO, e a folha nao usa encargo patronal.
--
-- BASE DO DESCONTO = SALARIO BASE, nao base + gratificacao. E o numero que ele
-- aprovou (7,5% de 1.621,00 = 121,58, o mesmo que ja estava na tela) e a mesma
-- base que o encargo e a provisao usam. Se um dia o desconto tiver de incidir
-- sobre a gratificacao tambem, muda AQUI e em fn_gerar_folha, nos dois lugares.
--
-- O CUSTO DA EMPRESA NAO CAI com o desconto. O dinheiro sai da conta igual: o
-- desconto muda quem recebe o que (parte vai para o colaborador, parte fica),
-- nao quanto a empresa gasta. Custo total segue bruto + encargos + provisao.
--
-- A ESTRUTURA DE ENCARGO PATRONAL FICA NO BANCO, so sai da tela. folha_encargos,
-- folha_item_encargos e folha_guias continuam de pe e vazias: a folha oficial /
-- eSocial que ele aprovou no roadmap exige FGTS e INSS patronal, e apagar agora
-- seria refazer depois. Com folha_encargos vazia o encargo de todo item da 0, e
-- e por isso que sumir a coluna da tela nao esconde dinheiro nenhum.
--
-- Grants: nao ha grant por coluna nestas tabelas. As ACLs sao de TABELA
-- (folha_itens e folhas: authenticated=rm, so leitura; colaboradores:
-- authenticated=arwm), entao as colunas novas herdam exatamente o que as
-- vizinhas ja tinham e nada de escrita novo e aberto -- gravacao continua so
-- pelas RPCs security definer.

-- ---------------------------------------------------------------------------
-- 1. As colunas
-- ---------------------------------------------------------------------------

alter table public.folha_itens
  add column if not exists desconto_percentual numeric(7, 4)
    check (desconto_percentual is null
           or (desconto_percentual >= 0 and desconto_percentual <= 100)),
  add column if not exists descontos numeric(14, 2) not null default 0
    check (descontos >= 0);

comment on column public.folha_itens.desconto_percentual is
  'Percentual descontado do salario desta pessoa neste mes. NULO = sem desconto (diferente de 0, que e um desconto de zero declarado). Incide sobre o salario base.';
comment on column public.folha_itens.descontos is
  'Valor descontado do salario: salario_base * desconto_percentual / 100. Sai do liquido e NAO reduz o custo da empresa.';

alter table public.colaboradores
  add column if not exists desconto_percentual numeric(7, 4)
    check (desconto_percentual is null
           or (desconto_percentual >= 0 and desconto_percentual <= 100));

comment on column public.colaboradores.desconto_percentual is
  'Percentual padrao de desconto do salario desta pessoa. A folha nova herda daqui; editar a linha da folha sobrepoe so naquele mes.';

alter table public.folhas
  add column if not exists valor_descontos numeric(14, 2) not null default 0;

comment on column public.folhas.valor_descontos is
  'Soma dos descontos de salario dos itens. Nao entra no custo total da folha.';

-- ---------------------------------------------------------------------------
-- 2. O dado que ja existe
--
-- Uma folha, em rascunho, 58 itens, e UM com percentual proprio: o CLELTON com
-- 7,5%. Foi digitado querendo desconto, entao vira desconto -- e o encargo que
-- ele gerou por engano (R$ 121,58 no custo) vai embora junto com a linha de
-- discriminacao.
--
-- A conversao vale SO para folha em rascunho. Folha aprovada ou paga teria
-- dinheiro ja lancado no Financeiro, e mudar o liquido dela por migration
-- cobraria do colaborador um valor que o lancamento nao conhece. Hoje nao existe
-- nenhuma nessa situacao (medido: 0 aprovadas, 0 pagas, 0 itens com lancamento),
-- e o filtro esta aqui para o caso de esta migration rodar num banco onde exista.
-- ---------------------------------------------------------------------------

update public.folha_itens i
set desconto_percentual = i.encargos_percentual,
    descontos = round(i.salario_base * i.encargos_percentual / 100.0, 2),
    encargos_percentual = null,
    encargos = 0
from public.folhas f
where f.id = i.folha_id
  and f.status = 'rascunho'
  and i.encargos_percentual is not null;

delete from public.folha_item_encargos ie
using public.folha_itens i, public.folhas f
where ie.folha_item_id = i.id
  and f.id = i.folha_id
  and f.status = 'rascunho'
  and ie.nome = 'Encargos individuais';

-- ---------------------------------------------------------------------------
-- 3. Os totais da folha ganham o desconto
-- ---------------------------------------------------------------------------

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
    valor_descontos = coalesce((select sum(descontos)
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

-- ---------------------------------------------------------------------------
-- 4. A edicao de linha grava desconto, nao encargo
--
-- DROP+CREATE porque o quarto parametro TROCA DE NOME (p_encargos_percentual ->
-- p_desconto_percentual) e o Postgres recusa renomear parametro com OR REPLACE.
-- Assinatura de tipos identica, entao nao ha risco de sobrecarga sobrando.
-- ---------------------------------------------------------------------------

drop function if exists public.fn_editar_item_folha(uuid, numeric, numeric, numeric);

create or replace function public.fn_editar_item_folha(
  p_item uuid,
  p_salario_base numeric,
  p_gratificacao numeric,
  p_desconto_percentual numeric default null::numeric
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_folha uuid; v_status text; v_comp date;
  v_colab uuid; v_vinculo text; v_nome text;
  v_extras numeric; v_adiant numeric;
  v_inss numeric; v_irrf numeric;
  v_desconto numeric;
  v_encargos numeric; v_provisoes numeric;
  v_disponivel numeric; v_liquido numeric;
begin
  if not public.tem_permissao('rh.folha', 'editar') then
    raise exception 'Sem permissao para editar a folha';
  end if;

  -- Faixas dos parametros, antes de qualquer leitura: mensagem de entrada ruim
  -- e mais util que constraint violation.
  if p_salario_base is null or p_salario_base < 0 then
    raise exception 'O salario base nao pode ser negativo';
  end if;
  if p_gratificacao is null or p_gratificacao < 0 then
    raise exception 'A gratificacao nao pode ser negativa';
  end if;
  if p_desconto_percentual is not null
     and (p_desconto_percentual < 0 or p_desconto_percentual > 100) then
    raise exception 'O percentual de desconto precisa estar entre 0 e 100';
  end if;

  -- Descobre a folha sem lock, trava a folha, e so depois trava o item. Nesta
  -- ordem porque a fn_aprovar_folha tambem trava folhas primeiro: inverter aqui
  -- criaria deadlock entre editar e aprovar.
  select folha_id into v_folha from public.folha_itens where id = p_item;
  if v_folha is null then raise exception 'Item da folha nao encontrado'; end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = v_folha for update;

  if v_status <> 'rascunho' then
    raise exception 'A folha de %/% esta em "%": só da para alterar valores em rascunho. Rejeite ou desaprove antes de editar.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;

  select fi.colaborador_id, fi.valor_extras, fi.adiantamentos, c.vinculo, c.nome
  into v_colab, v_extras, v_adiant, v_vinculo, v_nome
  from public.folha_itens fi
  join public.colaboradores c on c.id = fi.colaborador_id
  where fi.id = p_item
  for update of fi;

  if v_colab is null then raise exception 'Item da folha nao encontrado'; end if;

  if p_salario_base = 0 and p_gratificacao = 0 then
    raise exception 'Salario base e gratificacao nao podem ser os dois zero: uma linha de R$ 0,00 nao tem por que existir na folha. Se % nao entra nesta folha, tire o valor do cadastro e regere.', v_nome;
  end if;

  -- Descontos legais so para CLT, mesma regra da geracao, e pelas MESMAS
  -- funcoes. Base = salario base + gratificacao.
  if v_vinculo = 'clt' then
    v_inss := public.fn_folha_inss(p_salario_base + p_gratificacao);
    v_irrf := public.fn_folha_irrf(p_salario_base + p_gratificacao, v_inss, v_colab);
  else
    v_inss := 0;
    v_irrf := 0;
  end if;

  -- O desconto por pessoa. Incide sobre o SALARIO BASE (a gratificacao fica
  -- fora, mesma base do encargo e da provisao). NULO e zero dao os dois R$ 0,00
  -- de desconto, mas se guardam diferente: nulo e "nao tem desconto", zero e
  -- "tem, e vale zero" -- e e o que a tela mostra de um jeito ou de outro.
  v_desconto := case
    when p_desconto_percentual is null then 0
    else round(p_salario_base * p_desconto_percentual / 100.0, 2)
  end;

  -- O adiantamento NAO e recalculado aqui, de proposito. A cascata de desconto
  -- atravessa competencias (o que nao cabe no mes vira parcela nova na proxima
  -- folha, marcada com a folha que a empurrou), e refazer isso a cada edicao de
  -- linha moveria dinheiro de OUTROS meses sem que ninguem tenha pedido.
  -- Quando o valor novo nao cobre o que ESTA folha ja descontou, a edicao para
  -- e manda regerar — o Regerar e quem sabe refazer a cascata inteira, com as
  -- travas dele. Alternativa recusada: cortar o adiantamento para caber, que
  -- cobraria do colaborador menos do que o plano diz sem registrar em lugar
  -- nenhum que o plano mudou.
  --
  -- O DESCONTO ENTRA NESTA CONTA. Sem ele, um percentual alto passaria a trava e
  -- o liquido sairia negativo: o colaborador "devendo" para a folha, que e
  -- estado impossivel e ninguem cobraria.
  v_disponivel := greatest(
    p_salario_base + p_gratificacao + v_extras - v_inss - v_irrf - v_desconto, 0);
  if v_disponivel < v_adiant then
    raise exception 'Nao da para deixar % com esse valor: o adiantamento ja descontado dele nesta folha e % e o valor novo deixa so % disponivel, o que daria liquido negativo. Regere a folha para recalcular o adiantamento.',
      v_nome, v_adiant, v_disponivel;
  end if;
  v_liquido := v_disponivel - v_adiant;

  -- Reescreve as linhas de encargo e de provisao ANTES do update final, para
  -- que o custo total seja fechado numa unica escrita no item. A base e o
  -- SALARIO BASE: a gratificacao nao entra em encargo nem em provisao.
  --
  -- Passa NULL como percentual de encargo: o encargo patronal vem so da
  -- configuracao (folha_encargos) agora, porque o percentual que a tela oferece
  -- deixou de ser encargo e passou a ser desconto. Com folha_encargos vazia isso
  -- da encargo 0; se um dia ele cadastrar FGTS e INSS patronal, volta a somar no
  -- custo, para TODO mundo, sem ninguem digitar linha por linha.
  perform public.fn_folha_aplicar_encargos_e_provisoes(
    p_item, p_salario_base, null);

  select encargos, provisoes into v_encargos, v_provisoes
  from public.folha_itens where id = p_item;

  update public.folha_itens
     set salario_base = p_salario_base,
         gratificacao = p_gratificacao,
         desconto_percentual = p_desconto_percentual,
         descontos = v_desconto,
         encargos_percentual = null,
         inss = v_inss,
         irrf = v_irrf,
         valor_liquido = v_liquido,
         -- Custo da empresa: o desconto NAO entra. O dinheiro sai da conta
         -- igual; o desconto so muda quem fica com ele.
         custo_total = p_salario_base + p_gratificacao + v_extras
                       + v_encargos + v_provisoes,
         editado_manualmente = true
   where id = p_item;

  perform public.fn_folha_recalcular_totais(v_folha);
end;
$function$;

revoke all on function public.fn_editar_item_folha(uuid, numeric, numeric, numeric) from public;
revoke all on function public.fn_editar_item_folha(uuid, numeric, numeric, numeric) from anon;
grant execute on function public.fn_editar_item_folha(uuid, numeric, numeric, numeric) to authenticated;
