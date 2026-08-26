-- =============================================================
-- O desconto da folha passa a ser digitado em VALOR, não em percentual
--
-- PEDIDO DO TIAGO (26/08/2026): "Preciso que a coluna do desconto não seja em
-- porcentagem e sim em valor. Porque o desconto de 7,5% em cima do salário
-- mínimo o sistema está arredondando porém no contracheque não vem
-- arredondado. Exemplo: sistema 1.621,00 - 7,5% = desconto de 121,58; valor
-- real = desconto de 121,57."
--
-- ============================================================
-- O CENTAVO NÃO É BUG DE ARREDONDAMENTO: É A METADE EXATA
-- ============================================================
-- 1.621,00 × 7,5% = 121,575. Não existe "o arredondamento certo" aqui: o valor
-- cai exatamente na metade do centavo. O banco usa round(), que sobe (121,58);
-- a folha de pagamento de verdade desce (121,57). Qualquer regra que eu
-- escolhesse -- round, trunc, banker's rounding -- acertaria alguns casos e
-- erraria outros, porque quem decide o centavo é o sistema que emite o
-- contracheque, não uma fórmula que eu deduzo.
--
-- Por isso a solução não é trocar a função de arredondamento: é PARAR DE
-- CALCULAR. O número que importa é o que está no contracheque, e o jeito de ele
-- estar certo é sendo digitado. Percentual passa a ser problema de quem calcula
-- a folha oficial; aqui entra o resultado.
--
-- ============================================================
-- O QUE MUDA NO MODELO
-- ============================================================
-- `folha_itens` tinha DUAS colunas para a mesma ideia: `desconto_percentual`
-- (7,5000) e `descontos` (121,58), a segunda derivada da primeira. Some a
-- derivada: fica só `descontos`, que agora é o que se digita, não o que se
-- calcula. Nenhum dado é convertido porque não há o que converter -- os dois
-- itens que têm desconto já guardam 121,58 em `descontos`, e conferi antes que
-- em nenhuma das 58 linhas `descontos` divergia da fórmula.
--
-- `colaboradores.desconto_percentual` vira `desconto_valor`. Essa coluna é lida
-- pela geração da folha e NENHUMA tela escreve nela: os 59 colaboradores estão
-- todos com ela nula, e não existe campo de desconto no formulário do
-- colaborador. Ela é convertida junto porque deixá-la em percentual faria a
-- fn_gerar_folha ler um percentual e tratá-lo como valor -- um 7,5 viraria
-- R$ 7,50 de desconto, calado. Se um dia ele quiser desconto recorrente por
-- pessoa, o campo já está no tipo certo; hoje continua sem tela, como estava.
--
-- ============================================================
-- SOME TAMBÉM A DISTINÇÃO ENTRE VAZIO E ZERO
-- ============================================================
-- No modelo antigo, `desconto_percentual` nulo era "não tem desconto" e 0 era
-- "tem, e é 0%" -- duas coisas que davam o mesmo R$ 0,00 e só se distinguiam na
-- legenda da tela. Com valor a distinção perde função: R$ 0,00 é R$ 0,00, e
-- quem diz que a linha foi mexida à mão é `editado_manualmente`, que é
-- justamente o que o Regerar consulta. Um estado a menos para explicar.
--
-- ============================================================
-- A TRAVA QUE O PERCENTUAL DAVA DE GRAÇA
-- ============================================================
-- Percentual entre 0 e 100 impedia sozinho que o desconto passasse do salário.
-- Valor livre não impede nada: um R$ 12.100,00 digitado no lugar de R$ 121,00
-- faria `greatest(..., 0)` zerar o líquido e a folha aprovaria com a pessoa
-- recebendo nada, sem erro nenhum. Então a trava passa a ser explícita e no
-- lugar certo: o desconto não pode ser maior do que sobra do bruto depois do
-- INSS e do IRRF. É a mesma fronteira de antes, dita em reais.
--
-- ============================================================
-- POR QUE fn_gerar_folha É EDITADA POR ÂNCORA
-- ============================================================
-- Ela tem mais de duzentas linhas e várias frentes mexem nela (a cascata de
-- adiantamento, os encargos, o centro de custo do diarista). Colar aqui uma
-- versão inteira apagaria em silêncio qualquer coisa que outra frente tenha
-- posto lá desde que eu li -- CREATE OR REPLACE não dá conflito, ele sobrescreve
-- e pronto. Então esta migration LÊ a definição viva e troca sete trechos
-- pontuais, conferindo que cada âncora aparece o número exato de vezes que eu
-- esperava. Se o texto tiver mudado, ela aborta em vez de sobrescrever.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. As duas colunas
-- ---------------------------------------------------------------
do $colunas$
declare
  v_n int;
begin
  -- Guarda antes de dropar: se alguém preencheu o percentual do cadastro entre
  -- a minha conferência e este apply, o valor tem de ser convertido à mão e não
  -- jogado fora.
  select count(*) into v_n from public.colaboradores where desconto_percentual is not null;
  if v_n > 0 then
    raise exception 'Existem % colaboradores com desconto_percentual preenchido. Converter para valor à mão antes de dropar a coluna.', v_n;
  end if;

  -- Guarda da folha: `descontos` tem de estar coerente com o percentual em toda
  -- linha, senão dropar o percentual perde a informação de qual dos dois valia.
  select count(*) into v_n
  from public.folha_itens
  where desconto_percentual is not null
    and descontos <> round(salario_base * desconto_percentual / 100.0, 2);
  if v_n > 0 then
    raise exception 'Existem % itens de folha em que `descontos` nao confere com o percentual. Conferir antes de dropar.', v_n;
  end if;
end $colunas$;

-- O drop derruba junto o `colaboradores_desconto_percentual_check` (0 a 100),
-- que era a trava do percentual. O CHECK novo é o equivalente em reais: só o
-- piso, porque valor não tem teto natural como 100% tinha -- o teto de verdade
-- é "não passar do que sobra do salário", e isso depende de INSS e IRRF, então
-- mora na fn_editar_item_folha, onde esses números existem.
alter table public.colaboradores drop column desconto_percentual;
alter table public.colaboradores add column desconto_valor numeric(14,2);
alter table public.colaboradores add constraint colaboradores_desconto_valor_nao_negativo
  check (desconto_valor is null or desconto_valor >= 0);

comment on column public.colaboradores.desconto_valor is
  'Desconto fixo em reais aplicado ao salário desta pessoa na geração da folha. Nulo = sem desconto. Valor, não percentual: o centavo do contracheque não se deduz por fórmula. Hoje sem campo no formulário: só a fn_gerar_folha lê.';

alter table public.folha_itens drop column desconto_percentual;

comment on column public.folha_itens.descontos is
  'Desconto do salário desta linha, em reais, DIGITADO e não calculado. Sai do líquido do colaborador e não entra no custo da empresa.';

-- ---------------------------------------------------------------
-- 2. fn_editar_item_folha: recebe valor
-- ---------------------------------------------------------------
-- A assinatura muda (p_desconto_percentual -> p_desconto), então é DROP+CREATE.
-- CREATE OR REPLACE criaria uma SOBRECARGA: as duas conviveriam e a chamada do
-- app, que manda um parâmetro nomeado, resolveria para uma delas de um jeito que
-- o build não acusa.
drop function if exists public.fn_editar_item_folha(uuid, numeric, numeric, numeric);

create function public.fn_editar_item_folha(
  p_item uuid,
  p_salario_base numeric,
  p_gratificacao numeric,
  p_desconto numeric default 0
) returns void
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
  v_sobra numeric;
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
  -- Nulo vale zero: o campo vazio na tela e "sem desconto", e sem desconto e
  -- R$ 0,00. Nao ha mais dois jeitos de dizer a mesma coisa.
  v_desconto := coalesce(p_desconto, 0);
  if v_desconto < 0 then
    raise exception 'O desconto nao pode ser negativo';
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

  -- A TRAVA QUE O PERCENTUAL DAVA DE GRACA. Entre 0 e 100 por cento, o desconto
  -- nunca passava do salario. Em reais nao ha limite implicito: R$ 12.100,00
  -- digitado no lugar de R$ 121,00 zeraria o liquido pelo greatest() la embaixo e
  -- a folha aprovaria com a pessoa recebendo nada, sem erro nenhum. A fronteira
  -- e a mesma de antes, dita em reais: o desconto nao pode comer mais do que
  -- sobra do bruto depois dos descontos legais.
  v_sobra := p_salario_base + p_gratificacao + v_extras - v_inss - v_irrf;
  if v_desconto > v_sobra then
    raise exception 'O desconto de R$ % passa do que sobra do salario de %: bruto R$ % menos INSS R$ % e IRRF R$ % deixa R$ %. Liquido negativo nao existe.',
      to_char(v_desconto, 'FM999999999990.00'), v_nome,
      to_char(p_salario_base + p_gratificacao + v_extras, 'FM999999999990.00'),
      to_char(v_inss, 'FM999999999990.00'), to_char(v_irrf, 'FM999999999990.00'),
      to_char(v_sobra, 'FM999999999990.00');
  end if;

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
  -- O DESCONTO ENTRA NESTA CONTA. Sem ele, um desconto alto passaria a trava e
  -- o liquido sairia negativo: o colaborador "devendo" para a folha, que e
  -- estado impossivel e ninguem cobraria.
  v_disponivel := greatest(v_sobra - v_desconto, 0);
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
  -- configuracao (folha_encargos) agora, porque o percentual que a tela oferecia
  -- deixou de ser encargo, virou desconto, e agora nem percentual e mais.
  perform public.fn_folha_aplicar_encargos_e_provisoes(
    p_item, p_salario_base, null);

  select encargos, provisoes into v_encargos, v_provisoes
  from public.folha_itens where id = p_item;

  update public.folha_itens
     set salario_base = p_salario_base,
         gratificacao = p_gratificacao,
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

-- `grant` sem `revoke` nao fecha nada: funcao nova ja nasce com EXECUTE para
-- PUBLIC, e PUBLIC inclui o `anon`.
revoke all on function public.fn_editar_item_folha(uuid, numeric, numeric, numeric) from public;
grant execute on function public.fn_editar_item_folha(uuid, numeric, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------
-- 3. fn_gerar_folha: sete trocas pontuais, por âncora
-- ---------------------------------------------------------------
do $gerar$
declare
  v_def text;
  v_novo text;
  v_troca record;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  if v_def is null then
    raise exception 'fn_gerar_folha nao existe.';
  end if;

  v_novo := v_def;

  for v_troca in
    select * from (values
      -- (1) a variavel do percentual passa a guardar valor
      ('v_base numeric; v_grat numeric; v_desc_pct numeric; v_manual boolean;',
       'v_base numeric; v_grat numeric; v_desc_val numeric; v_manual boolean;', 1),

      -- (2) o snapshot da edicao manual guarda o VALOR do desconto, nao o
      --     percentual. E `descontos`, a coluna que sobrou.
      ($$             'desconto_percentual', desconto_percentual)), '{}'::jsonb)$$,
       $$             'descontos', descontos)), '{}'::jsonb)$$, 1),

      -- (3) o cadastro passa a dar valor
      ('           c.desconto_percentual' || chr(10),
       '           c.desconto_valor' || chr(10), 1),

      -- (4) e a leitura dele tambem
      ('    v_desc_pct := v_colab.desconto_percentual;',
       '    v_desc_val := v_colab.desconto_valor;', 1),

      -- (5) a reaplicacao da edicao manual le a chave nova
      ($$      v_desc_pct := (v_man ->> 'desconto_percentual')::numeric;$$,
       $$      v_desc_val := (v_man ->> 'descontos')::numeric;$$, 1),

      -- (6) O CORACAO DA MUDANCA: nao ha mais conta. O valor digitado E o
      --     desconto. Era aqui que 1.621,00 x 7,5% virava 121,58 em vez dos
      --     121,57 do contracheque.
      ('    v_desconto := case' || chr(10) ||
       '      when v_desc_pct is null then 0' || chr(10) ||
       '      else round(v_base * v_desc_pct / 100.0, 2)' || chr(10) ||
       '    end;',
       '    v_desconto := coalesce(v_desc_val, 0);', 1),

      -- (7) o insert perde a coluna dropada, nas duas metades
      ('       desconto_percentual, descontos,',
       '       descontos,', 1),
      ('       v_desc_pct, v_desconto,',
       '       v_desconto,', 1),

      -- (8) o COMENTARIO que explicava a distincao entre vazio e zero. Nao e
      --     zelo: a guarda no fim recusa qualquer mencao sobrevivente a
      --     desconto_percentual, e foi ela que pegou esta linha na primeira
      --     tentativa. Comentario que descreve modelo que nao existe mais e
      --     pior que comentario nenhum -- o proximo a ler acredita nele.
      ('    -- numero. `->>` num JSON null devolve SQL null, e null em' || chr(10) ||
       '    -- desconto_percentual significa "sem desconto" — ou seja, a edicao consegue' || chr(10) ||
       '    -- dizer as duas coisas.',
       '    -- numero. `->>` num JSON null devolve SQL null, e null no desconto vale' || chr(10) ||
       '    -- zero: desde 26/08/2026 o desconto e um VALOR digitado, e vazio na tela' || chr(10) ||
       '    -- e R$ 0,00 -- um jeito so de dizer "sem desconto".', 1)
    ) as t(de, para, vezes)
  loop
    if (length(v_novo) - length(replace(v_novo, v_troca.de, ''))) / length(v_troca.de)
       <> v_troca.vezes then
      raise exception 'A ancora [%] aparece % vez(es) e eu esperava %. A fn_gerar_folha mudou desde que eu a li: conferir antes de sobrescrever.',
        left(v_troca.de, 60),
        (length(v_novo) - length(replace(v_novo, v_troca.de, ''))) / length(v_troca.de),
        v_troca.vezes;
    end if;
    v_novo := replace(v_novo, v_troca.de, v_troca.para);
  end loop;

  -- Nenhuma mencao ao percentual de desconto pode sobrar: se sobrou, a funcao
  -- referencia coluna que acabou de ser dropada e o proximo Regerar quebra.
  if v_novo like '%desconto_percentual%' or v_novo like '%v_desc_pct%' then
    raise exception 'Sobrou referencia a desconto_percentual/v_desc_pct na fn_gerar_folha.';
  end if;

  -- E a troca tem de ter mudado algo de verdade.
  if v_novo = v_def then
    raise exception 'A fn_gerar_folha saiu identica: nenhuma troca pegou.';
  end if;

  execute v_novo;
end $gerar$;

revoke all on function public.fn_gerar_folha(date, numeric) from public;
grant execute on function public.fn_gerar_folha(date, numeric) to authenticated;
