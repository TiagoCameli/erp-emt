-- As observacoes da OC descem para o lancamento gerado na aprovacao.
--
-- Motivo (pedido do Tiago, 20/08/2026): a observacao digitada na OC tem de
-- estar presente em TODO o caminho, da OC ate o pagamento. As telas ja estavam
-- prontas -- detalhe da OC, espelho da OC, detalhe do lancamento, espelho do
-- lancamento, Excel de lancamentos, fila de aprovacao, drawer da parcela em
-- Pagamentos e espelho do pagamento todos renderizam "Observacoes" --, mas o
-- dado nunca descia: esta funcao copiava descricao, categoria, numero do
-- documento e os anexos, e deixava observacoes para tras. Resultado: quem paga
-- nao lia a chave PIX, o CNPJ nem o "PAGAMENTO PARA DIA X" que Compras
-- escreveu.
--
-- Nao existe risco de divergencia depois da copia: OC aprovada nao pode ser
-- editada (editarOrdem exige rascunho ou pendente) e lancamento de origem 'oc'
-- e somente-leitura no Financeiro. Desaprovar APAGA o lancamento
-- (fn_desaprovar_ordem_compra), e a re-aprovacao o recria com o texto novo.
--
-- ATENCAO ao mexer nesta funcao: ela recebeu DUAS alteracoes independentes em
-- 20/08/2026 com minutos de diferenca (o BLOCO de forma, em
-- 20260820194612_aprovar_oc_cria_bloco_de_forma, e esta copia de observacoes),
-- e a segunda -- escrita a partir de uma leitura feita ANTES da primeira --
-- apagou a primeira sem conflito nem aviso, porque CREATE OR REPLACE substitui
-- o corpo inteiro. Este arquivo e a versao MESCLADA das duas: reler a definicao
-- viva (pg_get_functiondef) imediatamente antes de escrever o replace e a unica
-- protecao que existe.
--
-- Assinatura inalterada: CREATE OR REPLACE basta, sem DROP e sem re-grant.

-- Reparo do bloco de forma nos lancamentos que nasceram na janela em que a
-- copia de observacoes esteve no ar sem o bloco. Mesmos dois updates da
-- 194612, e idempotentes: nao encostam em quem ja tem bloco.
insert into public.lancamento_formas (lancamento_id, forma_pagamento_id, valor, created_by)
select l.id, l.forma_pagamento_id, l.valor, l.created_by
from public.lancamentos l
where l.forma_pagamento_id is not null
  and not exists (
    select 1 from public.lancamento_formas lf where lf.lancamento_id = l.id
  );

update public.lancamento_parcelas p
set lancamento_forma_id = lf.id
from public.lancamento_formas lf
where lf.lancamento_id = p.lancamento_id
  and p.lancamento_forma_id is null;

create or replace function public.fn_aprovar_ordem_compra(p_oc_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_fornecedor uuid;
  v_total numeric(14, 2);
  v_numero text;
  v_forma uuid;
  v_compra date;
  v_mes date;
  v_lanc_id uuid;
  v_qtd_parcelas int;
  v_soma_parcelas numeric(14, 2);
  v_descricao text;
  v_categoria uuid;
  v_numero_documento text;
  v_observacoes text;
  v_bloco uuid;
begin
  if not public.tem_permissao('compras.ordens', 'aprovar') then
    raise exception 'Sem permissao para aprovar ordens de compra';
  end if;

  select status, fornecedor_id, valor_total, numero, forma_pagamento_id,
         data_compra, mes_competencia, descricao, categoria_id, numero_documento,
         observacoes
  into v_status, v_fornecedor, v_total, v_numero, v_forma, v_compra, v_mes,
       v_descricao, v_categoria, v_numero_documento, v_observacoes
  from public.ordens_compra where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status <> 'pendente_aprovacao' then
    raise exception 'A ordem de compra precisa estar pendente de aprovacao';
  end if;

  if exists (
    select 1 from public.oc_itens oi
    join public.insumos i on i.id = oi.insumo_id
    where oi.ordem_compra_id = p_oc_id and i.categoria_financeira_id is null
  ) then
    raise exception 'Ha item sem categoria de custo. Classifique o insumo antes de aprovar';
  end if;

  perform public.fn_exigir_competencia_aberta(v_mes, 'ordem_compra', p_oc_id);

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd_parcelas, v_soma_parcelas
  from public.oc_parcelas
  where ordem_compra_id = p_oc_id;

  if v_qtd_parcelas > 0 and v_soma_parcelas <> round(v_total, 2) then
    raise exception 'A soma das parcelas da ordem (R$ %) nao fecha com o total (R$ %). Ajuste as parcelas antes de aprovar.',
      v_soma_parcelas, round(v_total, 2);
  end if;

  select coalesce(
    (select i.categoria_financeira_id
     from public.oc_itens oi
     join public.insumos i on i.id = oi.insumo_id
     where oi.ordem_compra_id = p_oc_id and i.categoria_financeira_id is not null
     group by i.categoria_financeira_id
     order by sum(oi.quantidade * oi.preco_unitario) desc, i.categoria_financeira_id
     limit 1),
    v_categoria)
  into v_categoria;

  update public.ordens_compra
  set status = 'aprovado', aprovado_por = (select auth.uid()), aprovado_em = now(),
      categoria_id = v_categoria
  where id = p_oc_id;

  -- O numero do documento desce junto: sem isto o lancamento nascido da OC
  -- apareceria em branco na coluna do Financeiro, e a mesma compra teria numero
  -- em Compras e nada aqui.
  --
  -- As observacoes descem pelo mesmo motivo, e o efeito e maior: elas carregam
  -- chave PIX, CNPJ, data combinada de pagamento e avisos que Compras escreveu
  -- PARA quem paga.
  --
  -- Normalizadas para que branco nao se disfarce de observacao: a tela testa
  -- `observacoes ? ...`, e uma string de espacos e TRUTHY -- desenharia a secao
  -- "Observacoes" vazia no detalhe, no espelho e no drawer do pagamento.
  --
  -- O conjunto de caracteres vai EXPLICITO no btrim. `btrim(x)` sozinho corta
  -- so espaco: E'  \n \t ' sobrevive como E'\n \t' e passa pelo nullif. A prova
  -- supabase/provas/observacoes_da_oc_descem_ate_o_pagamento.sql pegou isso.
  insert into public.lancamentos (
    tipo, origem, origem_id, fornecedor_id, forma_pagamento_id, descricao,
    categoria_id, valor, status, data_compra, mes_competencia,
    numero_documento, observacoes, created_by
  )
  values (
    'a_pagar', 'oc', p_oc_id, v_fornecedor, v_forma,
    coalesce(
      nullif(btrim(coalesce(v_descricao, '')), ''),
      'Ordem de compra ' || coalesce(v_numero, '')
    ),
    v_categoria,
    v_total, 'previsto', v_compra, v_mes,
    v_numero_documento,
    nullif(btrim(coalesce(v_observacoes, ''), E' \t\r\n'), ''),
    (select auth.uid())
  )
  returning id into v_lanc_id;

  -- O BLOCO de forma. A OC tem uma forma so, entao desce um bloco com o total.
  -- Sem forma na OC nao ha bloco (o lancamento roteia como bancario, pelo
  -- caminho antigo), que e o mesmo comportamento de antes.
  if v_forma is not null then
    insert into public.lancamento_formas
      (lancamento_id, forma_pagamento_id, valor, created_by)
    values (v_lanc_id, v_forma, v_total, (select auth.uid()))
    returning id into v_bloco;
  end if;

  if v_qtd_parcelas > 0 then
    insert into public.lancamento_parcelas (
      lancamento_id, numero_parcela, valor, data_vencimento, status,
      lancamento_forma_id, created_by
    )
    select v_lanc_id, p.numero_parcela, p.valor, p.data_vencimento, 'pendente',
           v_bloco, (select auth.uid())
    from public.oc_parcelas p
    where p.ordem_compra_id = p_oc_id
    order by p.numero_parcela;

    update public.lancamentos
    set data_vencimento = (
      select min(p.data_vencimento) from public.oc_parcelas p
      where p.ordem_compra_id = p_oc_id
    )
    where id = v_lanc_id;
  end if;

  with fatia as (
    select oi.centro_custo_id,
           i.categoria_financeira_id as categoria_id,
           round(sum(oi.quantidade * oi.preco_unitario), 2) as bruto
    from public.oc_itens oi
    join public.insumos i on i.id = oi.insumo_id
    where oi.ordem_compra_id = p_oc_id
    group by oi.centro_custo_id, i.categoria_financeira_id
  ),
  base as (select coalesce(sum(bruto), 0) as total_itens from fatia),
  proporcional as (
    select f.centro_custo_id, f.categoria_id,
           case when b.total_itens = 0 then 0
                else round(f.bruto * v_total / b.total_itens, 2) end as valor,
           row_number() over (order by f.bruto desc, f.centro_custo_id) as ordem
    from fatia f cross join base b
  ),
  resto as (select v_total - coalesce(sum(valor), 0) as sobra from proporcional)
  insert into public.lancamento_rateios
    (lancamento_id, centro_custo_id, categoria_id, valor, created_by)
  select v_lanc_id, p.centro_custo_id, p.categoria_id,
         p.valor + case when p.ordem = 1 then (select sobra from resto) else 0 end,
         (select auth.uid())
  from proporcional p;

  perform public.fn_propagar_anexos('ordem_compra', p_oc_id, 'lancamento', v_lanc_id);

  perform public.fn_aplicar_regra_pagamento(v_lanc_id);
end;
$function$;

-- Backfill: os lancamentos ja nascidos de OC com observacao ficaram em branco.
-- Medido em 20/08/2026: 12 de 27 lancamentos de OC, com chave PIX, CNPJ e
-- "PAGAMENTO PARA DIA 19/08/2026" dentro.
--
-- So preenche o que esta VAZIO. Lancamento que ja tem texto proprio nao e
-- sobrescrito: mesmo hoje ninguem consegue digitar ali (origem 'oc' e
-- somente-leitura no Financeiro), mas a carga historica pode ter escrito, e
-- apagar observacao existente para por outra nao e o que esta sendo pedido.
--
-- Mesmo conjunto de caracteres do btrim da funcao, e pelo mesmo motivo: sem o
-- E' \t\r\n' explicito, um lancamento com so quebras de linha conta como "ja
-- preenchido" e o backfill passa por cima dele sem preencher.
update public.lancamentos l
set observacoes = nullif(btrim(oc.observacoes, E' \t\r\n'), '')
from public.ordens_compra oc
where l.origem = 'oc'
  and l.origem_id = oc.id
  and btrim(coalesce(l.observacoes, ''), E' \t\r\n') = ''
  and btrim(coalesce(oc.observacoes, ''), E' \t\r\n') <> '';
