-- fn_gerar_decimo_terceiro: onde o dinheiro do 13o e calculado.
--
-- A conta vive AQUI e em lugar nenhum mais. Nao existe copia em TypeScript:
-- o calculo.ts do modulo so agrega o que esta gravado, para a tela conferir.
-- Prova: supabase/provas/decimo_terceiro.sql, com os numeros feitos a mao.

create or replace function public.fn_dt_recalcular_totais(p_lote uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.rh_decimo_terceiro l
     set valor_bruto = t.bruto,
         valor_descontos = t.descontos,
         valor_liquido = t.liquido,
         updated_at = now()
    from (
      -- O "bruto" do lote e o que ele ainda paga (bruto menos o ja pago na
      -- 1a parcela), nao o 13o inteiro do ano: o lote e um documento de
      -- pagamento, e o numero do cabecalho tem que casar com a soma das
      -- contas a pagar que ele gera.
      select coalesce(sum(valor_bruto - valor_ja_pago), 0) as bruto,
             coalesce(sum(valor_inss + valor_irrf), 0) as descontos,
             coalesce(sum(valor_liquido), 0) as liquido
        from public.rh_decimo_terceiro_itens
       where decimo_terceiro_id = p_lote
    ) t
   where l.id = p_lote;
end $$;

comment on function public.fn_dt_recalcular_totais(uuid) is
  'Recalcula os totais do lote a partir dos itens. O bruto do lote e o que ele paga (bruto - ja_pago), nao o 13o inteiro do ano.';

create or replace function public.fn_gerar_decimo_terceiro(
  p_ano smallint,
  p_parcela smallint,
  p_percentual numeric,
  p_com_desconto boolean,
  p_data_vencimento date default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_lote uuid;
  v_fim date := make_date(p_ano, 12, 31);
  v_col record;
  v_avos smallint;
  v_total_13 numeric(14,2);
  v_bruto numeric(14,2);
  v_ja_pago numeric(14,2);
  v_base numeric(14,2);
  v_inss numeric(14,2);
  v_irrf numeric(14,2);
  v_liquido numeric(14,2);
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'criar') then
    raise exception 'Sem permissao para gerar o 13o';
  end if;

  if p_percentual is null or p_percentual <= 0 or p_percentual > 1 then
    raise exception 'Percentual invalido: informe uma fracao entre 0 e 1.';
  end if;

  -- TRAVA 1: desconto ligado com faixa vazia devolve imposto ZERO (as duas
  -- funcoes de imposto retornam 0 sem faixa cadastrada, por desenho) e o lote
  -- fecharia "certo" sem imposto nenhum. Recusa nomeando a tabela vazia.
  if p_com_desconto then
    if not exists (select 1 from public.folha_inss_faixas) then
      raise exception 'Nao ha faixas de INSS cadastradas. Cadastre em /rh/parametros-folha antes de gerar uma parcela com desconto.';
    end if;
    if not exists (select 1 from public.folha_irrf_faixas) then
      raise exception 'Nao ha faixas de IRRF cadastradas. Cadastre em /rh/parametros-folha antes de gerar uma parcela com desconto.';
    end if;
  end if;

  if exists (select 1 from public.rh_decimo_terceiro
              where ano = p_ano and parcela = p_parcela and excluido_em is null) then
    raise exception 'Ja existe um lote de 13o da %a parcela de %.', p_parcela, p_ano;
  end if;

  insert into public.rh_decimo_terceiro
    (ano, parcela, percentual, com_desconto, data_vencimento, created_by)
  values (p_ano, p_parcela, p_percentual, p_com_desconto, p_data_vencimento, v_uid)
  returning id into v_lote;

  -- TRAVA 2: so CLT ativo COM data de admissao. Sem admissao,
  -- fn_rescisao_avos_13 devolve 0 e a pessoa receberia R$ 0,00 calado.
  -- Quem fica de fora e listado pela tela (listarForaDoLote), nao aqui.
  for v_col in
    select c.id, c.nome, c.salario, c.centro_custo_id, c.data_admissao
      from public.colaboradores c
     where c.ativo
       and c.vinculo = 'clt'
       and c.data_admissao is not null
     order by c.nome
  loop
    v_avos := public.fn_rescisao_avos_13(v_col.data_admissao, v_fim);

    -- Dividir ANTES de multiplicar, e o round envolve a divisao.
    -- salario * avos / 12 e round(salario/12,2) * avos divergem em centavos,
    -- e a divergencia aparece na conferencia do lote inteiro.
    v_total_13 := round(round(coalesce(v_col.salario, 0) / 12, 2) * v_avos, 2);
    v_bruto := round(v_total_13 * p_percentual, 2);

    -- Abate o BRUTO da 1a parcela, nao o liquido: o imposto e do 13o inteiro
    -- e e cobrado uma vez so, na parcela que tem a chave ligada. Abater
    -- liquido cobraria imposto sobre imposto.
    v_ja_pago := 0;
    if p_parcela = 2 then
      select coalesce(sum(i.valor_bruto), 0) into v_ja_pago
        from public.rh_decimo_terceiro_itens i
        join public.rh_decimo_terceiro l on l.id = i.decimo_terceiro_id
       where l.ano = p_ano and l.parcela = 1 and l.excluido_em is null
         and l.status = 'aprovado'
         and i.colaborador_id = v_col.id;
    end if;

    v_base := v_bruto - v_ja_pago;

    v_inss := 0;
    v_irrf := 0;
    if p_com_desconto and v_base > 0 then
      -- Tributacao EXCLUSIVA: a base e o 13o INTEIRO do ano (v_total_13), nao
      -- o que sobrou desta parcela e nao o salario do mes somado ao 13o.
      --
      -- NAO usar (v_bruto + v_ja_pago): na 2a parcela a 100% isso daria
      -- 100% + 50% = 1,5x o 13o, e o imposto sairia sobre uma vez e meia o
      -- devido.
      --
      -- fn_folha_irrf recebe a base BRUTA e o INSS separados, e subtrai por
      -- dentro junto com a deducao por dependente, que ela mesma busca em
      -- rh_dependentes. Nao passar base ja liquida de INSS: desconta duas vezes.
      v_inss := public.fn_folha_inss(v_total_13);
      v_irrf := public.fn_folha_irrf(v_total_13, v_inss, v_col.id);
    end if;

    v_liquido := v_base - v_inss - v_irrf;

    insert into public.rh_decimo_terceiro_itens
      (decimo_terceiro_id, colaborador_id, centro_custo_id, salario_base,
       avos, valor_bruto, valor_ja_pago, valor_inss, valor_irrf, valor_liquido)
    values
      (v_lote, v_col.id, v_col.centro_custo_id, coalesce(v_col.salario, 0),
       v_avos, v_bruto, v_ja_pago, v_inss, v_irrf, v_liquido);
  end loop;

  perform public.fn_dt_recalcular_totais(v_lote);
  return v_lote;
end $$;

comment on function public.fn_gerar_decimo_terceiro(smallint, smallint, numeric, boolean, date) is
  'Gera o lote de 13o. Dinheiro: total = round(salario/12,2) * avos; bruto da parcela = total * percentual; menos o BRUTO ja pago na 1a parcela. INSS/IRRF em tributacao EXCLUSIVA sobre o 13o INTEIRO do ano, so quando p_com_desconto. Recusa com faixa fiscal vazia. CLT ativo sem data_admissao NAO entra no lote.';
