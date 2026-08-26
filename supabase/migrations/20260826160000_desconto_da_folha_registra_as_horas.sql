-- O desconto da folha passa a poder ser informado pelas HORAS nao trabalhadas,
-- e nao so pelo valor.
--
-- Pedido do Tiago (26/08/2026): "eu posso tanto colocar o desconto de faltas
-- pelas horas nao trabalhadas como pelo valor das horas e o app deve fazer o
-- calculo inverso". Divisor: "coloque 200h fixas para todos por agora".
--
-- QUEM MANDA CONTINUA SENDO O VALOR. `descontos` (reais) e o que sai do liquido,
-- e segue digitavel. `desconto_horas` guarda o MOTIVO ("foram 8 horas") e serve
-- de atalho para preencher o valor na tela. As duas colunas convivem SEM
-- invariante entre elas, e isso e deliberado: em 26/08/2026 o percentual foi
-- removido justamente porque 7,5% de R$ 1.621,00 da 121,575 -- a metade exata do
-- centavo -- e o contracheque desceu para 121,57 enquanto o sistema subia para
-- 121,58. Quando o numero tem de casar com documento emitido por outro sistema,
-- ele entra digitado. Forcar `descontos = horas x valor_hora` aqui recriaria
-- exatamente o problema que aquela migration resolveu: o contracheque pode
-- legitimamente dizer "8h, R$ 64,83", e o sistema tem de gravar os dois numeros
-- como vieram.
--
-- Por isso a conversao acontece na TELA (src/modules/rh/folha/horas-e-valor.ts),
-- nao aqui: o banco recebe os dois numeros ja resolvidos e guarda. A constante
-- 200 vive num lugar so no app; a unica coisa que ela faz neste arquivo e a
-- trava de sanidade das horas.
--
-- Grants: `folha_itens` tem ACL de TABELA (authenticated=rm, so leitura), entao a
-- coluna nova herda o SELECT e nada de escrita e aberto -- gravacao segue pela
-- RPC security definer.

alter table public.folha_itens
  add column if not exists desconto_horas numeric(8, 2)
    check (desconto_horas is null
           or (desconto_horas >= 0 and desconto_horas <= 200));

comment on column public.folha_itens.desconto_horas is
  'Horas nao trabalhadas que motivaram o desconto. NULO = o desconto nao foi informado por horas (foi digitado em reais direto). Nao ha invariante com `descontos`: o valor e a fonte da verdade, estas horas sao o motivo. Teto de 200 = as horas do mes (mesma constante de horas-e-valor.ts).';

-- ---------------------------------------------------------------------------
-- fn_editar_item_folha ganha o parametro das horas
--
-- Base desta versao: a definicao viva lida imediatamente antes deste apply
-- (md5 520182488104b5e25e1e2ce09f4aef3b), que e a da 20260826100000 com o
-- desconto em valor e a trava explicita em reais. Daqui saem TRES acrescimos:
--   1. o parametro p_desconto_horas, com faixa 0..200
--   2. a gravacao de desconto_horas
--   3. nada mais -- a trava do valor, o INSS/IRRF e a cascata de adiantamento
--      seguem letra por letra como estavam.
--
-- Parametro novo com DEFAULT: a migration entra antes do deploy, e a tela antiga
-- (que nao manda horas) continua gravando desconto sem horas.
-- ---------------------------------------------------------------------------

create or replace function public.fn_editar_item_folha(
  p_item uuid,
  p_salario_base numeric,
  p_gratificacao numeric,
  p_desconto numeric default 0,
  p_desconto_horas numeric default null
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
  -- As horas nao trabalhadas: 200 e o mes inteiro (a mesma constante da tela).
  -- Nulo e legitimo e significa "o desconto nao foi informado por horas".
  if p_desconto_horas is not null
     and (p_desconto_horas < 0 or p_desconto_horas > 200) then
    raise exception 'As horas nao trabalhadas precisam estar entre 0 e 200 (o mes inteiro)';
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
         -- As horas do desconto. Nulo quando o valor foi digitado direto: a
         -- coluna guarda o MOTIVO, e "sem motivo declarado" e um estado legitimo.
         desconto_horas = p_desconto_horas,
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

revoke all on function public.fn_editar_item_folha(uuid, numeric, numeric, numeric, numeric) from public;
revoke all on function public.fn_editar_item_folha(uuid, numeric, numeric, numeric, numeric) from anon;
grant execute on function public.fn_editar_item_folha(uuid, numeric, numeric, numeric, numeric) to authenticated;

-- A sobrecarga de 4 argumentos sai: com as duas vivas e todos os argumentos com
-- default, a chamada por NOME que o PostgREST faz viraria ambigua em runtime,
-- com build verde. Ja aconteceu neste projeto (fn_rel_custo_centro_custo).
drop function if exists public.fn_editar_item_folha(uuid, numeric, numeric, numeric);
