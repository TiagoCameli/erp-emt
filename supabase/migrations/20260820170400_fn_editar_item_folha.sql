-- Editar a linha de um colaborador na folha em rascunho: salario base,
-- gratificacao e percentual de encargo.
--
-- E o pedido direto do Tiago ("opcao para alterar os valores que estao la para
-- eu poder incluir as gratificacoes para quem tem"). Nao e um UPDATE solto pela
-- tela por dois motivos:
--
--   1. mexer no salario base ou na gratificacao muda INSS, IRRF, as linhas de
--      encargo, as de provisao, o custo total, o liquido e os sete totais do
--      cabecalho. Um UPDATE de coluna deixaria todos esses derivados mentindo,
--      e a folha fecharia com o rodape diferente da soma das linhas;
--   2. as formulas tem de ser AS MESMAS da geracao. Por isso esta funcao chama
--      fn_folha_inss, fn_folha_irrf e fn_folha_aplicar_encargos_e_provisoes, e
--      nao reescreve nenhuma conta.
--
-- O item fica marcado editado_manualmente = true, e a partir dai o Regerar
-- preserva estes tres valores em vez de recalcular do cadastro.
--
-- A auditoria e automatica: folha_itens ja tem trg_audit_folha_itens, que grava
-- valores antes/depois de cada UPDATE.

create or replace function public.fn_editar_item_folha(
  p_item uuid,
  p_salario_base numeric,
  p_gratificacao numeric,
  p_encargos_percentual numeric default null
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
  v_encargos numeric; v_provisoes numeric;
  v_disponivel numeric; v_liquido numeric;
begin
  if not public.tem_permissao('rh.folha', 'editar') then
    raise exception 'Sem permissao para editar a folha';
  end if;

  -- Faixas dos parametros, antes de qualquer leitura: mensagem de entrada ruim
  -- e mais util que constraint violation. Mesma faixa 0..100 de
  -- folha_encargos.percentual.
  if p_salario_base is null or p_salario_base < 0 then
    raise exception 'O salario base nao pode ser negativo';
  end if;
  if p_gratificacao is null or p_gratificacao < 0 then
    raise exception 'A gratificacao nao pode ser negativa';
  end if;
  if p_encargos_percentual is not null
     and (p_encargos_percentual < 0 or p_encargos_percentual > 100) then
    raise exception 'O percentual de encargo precisa estar entre 0 e 100';
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

  -- O adiantamento NAO e recalculado aqui, de proposito. A cascata de desconto
  -- atravessa competencias (o que nao cabe no mes vira parcela nova na proxima
  -- folha, marcada com a folha que a empurrou), e refazer isso a cada edicao de
  -- linha moveria dinheiro de OUTROS meses sem que ninguem tenha pedido.
  -- Quando o valor novo nao cobre o que ESTA folha ja descontou, a edicao para
  -- e manda regerar — o Regerar e quem sabe refazer a cascata inteira, com as
  -- travas dele. Alternativa recusada: cortar o adiantamento para caber, que
  -- cobraria do colaborador menos do que o plano diz sem registrar em lugar
  -- nenhum que o plano mudou.
  v_disponivel := greatest(p_salario_base + p_gratificacao + v_extras - v_inss - v_irrf, 0);
  if v_disponivel < v_adiant then
    raise exception 'Nao da para deixar % com esse valor: o adiantamento ja descontado dele nesta folha e % e o valor novo deixa so % disponivel, o que daria liquido negativo. Regere a folha para recalcular o adiantamento.',
      v_nome, v_adiant, v_disponivel;
  end if;
  v_liquido := v_disponivel - v_adiant;

  -- Reescreve as linhas de encargo e de provisao ANTES do update final, para
  -- que o custo total seja fechado numa unica escrita no item. A base e o
  -- SALARIO BASE: a gratificacao nao entra em encargo nem em provisao.
  perform public.fn_folha_aplicar_encargos_e_provisoes(
    p_item, p_salario_base, p_encargos_percentual);

  select encargos, provisoes into v_encargos, v_provisoes
  from public.folha_itens where id = p_item;

  update public.folha_itens
     set salario_base = p_salario_base,
         gratificacao = p_gratificacao,
         encargos_percentual = p_encargos_percentual,
         inss = v_inss,
         irrf = v_irrf,
         valor_liquido = v_liquido,
         custo_total = p_salario_base + p_gratificacao + v_extras
                       + v_encargos + v_provisoes,
         editado_manualmente = true
   where id = p_item;

  perform public.fn_folha_recalcular_totais(v_folha);
end;
$function$;

comment on function public.fn_editar_item_folha(uuid, numeric, numeric, numeric) is
$doc$Altera salario base, gratificacao e percentual de encargo de UM item da folha, so em rascunho, e refaz tudo que depende deles: INSS/IRRF (so CLT), linhas de encargo, linhas de provisao, custo total, liquido e os totais do cabecalho. Usa as mesmas funcoes de calculo da fn_gerar_folha.

p_encargos_percentual null volta o item a usar os folha_encargos globais.

Marca editado_manualmente = true: dali em diante o Regerar preserva estes tres valores.

Recusa quando o valor novo nao cobre o adiantamento ja descontado nesta folha — a cascata de adiantamento so e refeita pelo Regerar.$doc$;

revoke all on function public.fn_editar_item_folha(uuid, numeric, numeric, numeric)
  from public, anon;
grant execute on function public.fn_editar_item_folha(uuid, numeric, numeric, numeric)
  to authenticated;
