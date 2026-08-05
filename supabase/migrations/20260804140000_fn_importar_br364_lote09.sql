-- =====================================================================
-- Importacao do historico financeiro da obra BR-364 Lote 09
-- =====================================================================
-- Transforma as duas tabelas de staging (20260804130001_stg_br364_carga)
-- em cadastro + lancamento + parcela + rateio, numa transacao.
--
-- POR QUE ESTA FUNCAO EXISTE E NAO SE USA fn_pagar_parcela: o caminho normal
-- recusa, com razao, pagamento fora da data autorizada e pagamento sem saldo na
-- conta. Aqui as 1.696 baixas sao historico de set/2025 a ago/2026 (todas no
-- passado) e a ordem em que entram nao pode importar. Esta funcao grava a
-- parcela ja como 'pago' com a data historica, e por isso NAO deve ser chamada
-- fora desta migracao: ela e o unico caminho do sistema que baixa parcela sem
-- passar pela janela de pagamento nem pela conferencia de saldo.
--
-- O que ela NAO faz, de proposito:
--   - nao renomeia nem altera coluna, funcao ou constraint existente;
--   - nao cria condicao de pagamento "2X".."21X" (decisao do Tiago): o
--     parcelado entra SEM condicao, com as datas reais de vencimento;
--   - nao chama fn_aplicar_regra_pagamento (ela reavaliaria o status a partir
--     da forma de pagamento e, em lancamento de cartao, marcaria parcela como
--     paga na data da compra, inventando baixa que a planilha nao tem).
--
-- Auditoria: os triggers trg_audit_* de lancamentos, lancamento_parcelas,
-- lancamento_rateios, fornecedores, categorias_financeiras, formas_pagamento e
-- contas_bancarias gravam cada linha em audit_log. No fim, a funcao grava mais
-- uma linha de resumo (tabela='importacao_br364_lote09') com o relatorio
-- inteiro em dados_depois, para a importacao ter um registro unico e achavel.
--
-- Idempotencia: o id de cada lancamento, parcela e rateio e derivado por md5 do
-- indice da planilha. Rodar duas vezes nao duplica: a segunda passada nao acha
-- linha nova para inserir.
-- =====================================================================

-- Chave de comparacao de nome (fornecedor e categoria): sem acento, minusculo,
-- espaco colapsado. Existe porque a extensao unaccent nao esta instalada neste
-- projeto e o casamento de nome precisa ser identico dos dois lados: com uma
-- funcao, a regra e uma so; repetindo o translate em cada consulta, uma delas
-- acabaria diferente. O conjunto de acentos e o que de fato aparece nas duas
-- planilhas, mais o resto do Latin-1 para nao quebrar com dado novo.
create or replace function public.fn_chave_nome(p_texto text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select regexp_replace(
           btrim(
             lower(
               translate(
                 p_texto,
                 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
               )
             )
           ),
           '\s+', ' ', 'g'
         );
$function$;

comment on function public.fn_chave_nome(text) is
  'Chave de comparacao de nome (sem acento, minusculo, espaco colapsado). Usada no casamento de fornecedor e categoria da importacao BR-364.';


create or replace function public.fn_importar_br364_lote09(
  p_usuario_id uuid default null,
  p_criar_lancamento_orfao boolean default true,
  p_ajustar_saldo_conta boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  -- Marca de origem. Entra no id (por md5) e no texto de observacoes, para a
  -- linha importada ser reconhecivel mesmo depois de a staging ser derrubada.
  c_marca constant text := 'br364-lote09';
  c_centro constant text := '009 - Manutenção da Rodovia BR-364/AC - Lote 09';

  v_usuario uuid := coalesce(p_usuario_id, (select auth.uid()));
  v_centro_id uuid;
  v_qtd integer;
  v_txt text;
  v_rel jsonb;
  v_fech jsonb;
  v_forn_novos jsonb;
  v_cat_novas jsonb;
  v_orfaos jsonb;
  v_sem_forma jsonb;
  v_desconto jsonb;
  v_contas jsonb;
  v_banco jsonb;
begin
  -- ------------------------------------------------------------------ guardas
  -- Esta funcao baixa parcela sem janela de pagamento e sem conferir saldo.
  -- Chamada pela API (PostgREST manda as claims do JWT no request) ela seria um
  -- jeito de quitar qualquer coisa: recusa. A defesa que vale e o revoke no fim
  -- do arquivo; este teste e o aviso para quem tentar.
  if current_setting('request.jwt.claims', true) is not null then
    raise exception 'fn_importar_br364_lote09 e caminho de migracao e nao roda pela aplicacao. Use o SQL da migration.';
  end if;

  if to_regclass('public.stg_br364_lancamentos') is null
     or to_regclass('public.stg_br364_pagamentos') is null then
    raise exception 'As tabelas de staging nao existem: aplique 20260804130001_stg_br364_carga.sql antes.';
  end if;

  -- As temporarias sao "on commit drop", mas se a funcao for chamada duas vezes
  -- na MESMA transacao (e a prova de idempotencia faz exatamente isso) o create
  -- da segunda vez falharia. Limpa antes. So entra no drop se a sessao ja tiver
  -- schema temporario: sem isso, "pg_temp." nao resolve na primeira chamada.
  if pg_catalog.pg_my_temp_schema() <> 0 then
    execute 'drop table if exists pg_temp.wrk_lanc, pg_temp.wrk_pag, pg_temp.wrk_slot,'
         || ' pg_temp.wrk_par, pg_temp.wrk_orfao, pg_temp.wrk_forn, pg_temp.wrk_cat,'
         || ' pg_temp.wrk_forma, pg_temp.wrk_conta, pg_temp.wrk_imp, pg_temp.wrk_parcela';
  end if;

  select id into v_centro_id
  from public.centros_custo
  where nome = c_centro;
  if v_centro_id is null then
    raise exception 'Centro de custo % nao encontrado: o rateio de 100%% nao tem onde cair.', c_centro;
  end if;

  -- ------------------------------------------------- 1. work set: lancamentos
  -- Converte texto para date/numeric aqui, uma vez, e ja recusa formato
  -- inesperado: e melhor a importacao parar apontando a linha do que gravar
  -- data errada em 1.593 lancamentos.
  create temp table wrk_lanc on commit drop as
  select
    s.linha_planilha,
    btrim(s.indice)                                          as indice,
    round(s.valor::numeric, 2)                               as valor,
    to_date(s.lancamento, 'DD/MM/YYYY')                      as data_compra,
    date_trunc('month', to_date(s.competencia, 'DD/MM/YYYY'))::date as mes_competencia,
    btrim(s.pago_a)                                          as forn_nome,
    public.fn_chave_nome(s.pago_a)                           as forn_chave,
    nullif(regexp_replace(coalesce(s.cnpj_cpf, ''), '\D', '', 'g'), '') as forn_doc,
    btrim(s.descricao)                                       as descricao,
    s.quem_paga,
    nullif(btrim(coalesce(s.numero_documento, '')), '')      as numero_documento,
    btrim(s.categoria)                                       as categoria,
    btrim(s.condicao_pagamento)                              as condicao,
    nullif(btrim(coalesce(s.forma_pagamento, '')), '')       as forma_nome,
    s.vencimento                                             as vencimento_txt,
    btrim(s.conta)                                           as conta_nome,
    nullif(btrim(coalesce(s.plano_contas, '')), '')          as plano_contas,
    nullif(btrim(coalesce(s.observacoes, '')), '')           as observacoes,
    case when btrim(s.condicao_pagamento) = 'À Vista'
         then 1
         else nullif(regexp_replace(btrim(s.condicao_pagamento), '^(\d+)X$', '\1'), btrim(s.condicao_pagamento))::integer
    end                                                      as n_parcelas
  from public.stg_br364_lancamentos s;

  -- guarda de formato: data e valor
  select count(*) into v_qtd
  from public.stg_br364_lancamentos s
  where s.lancamento !~ '^\d{2}/\d{2}/\d{4}$'
     or s.competencia !~ '^\d{2}/\d{2}/\d{4}$'
     or s.valor !~ '^\d+(\.\d{1,2})?$';
  if v_qtd > 0 then
    raise exception 'stg_br364_lancamentos: % linha(s) com data ou valor fora do formato esperado.', v_qtd;
  end if;

  select count(*) into v_qtd from pg_temp.wrk_lanc where n_parcelas is null;
  if v_qtd > 0 then
    raise exception 'stg_br364_lancamentos: % linha(s) com condicao de pagamento que nao e "À Vista" nem "NX".', v_qtd;
  end if;

  -- ------------------------------------------------- 2. work set: pagamentos
  select count(*) into v_qtd
  from public.stg_br364_pagamentos s
  where s.data_vencimento !~ '^\d{2}/\d{2}/\d{4}$'
     or s.data_pagamento  !~ '^\d{2}/\d{2}/\d{4}$'
     or s.data_competencia !~ '^\d{2}/\d{2}/\d{4}$'
     or s.valor_parcela !~ '^\d+(\.\d{1,2})?$'
     or s.valor_total_pago !~ '^\d+(\.\d{1,2})?$';
  if v_qtd > 0 then
    raise exception 'stg_br364_pagamentos: % linha(s) com data ou valor fora do formato esperado.', v_qtd;
  end if;

  create temp table wrk_pag on commit drop as
  select
    s.linha_planilha,
    btrim(s.indice)                                          as indice,
    public.fn_chave_nome(s.fornecedor)                        as forn_chave,
    btrim(s.fornecedor)                                       as forn_nome,
    nullif(regexp_replace(coalesce(s.cnpj_cpf_fornecedor, ''), '\D', '', 'g'), '') as forn_doc,
    to_date(s.data_vencimento, 'DD/MM/YYYY')                  as data_vencimento,
    to_date(s.data_pagamento, 'DD/MM/YYYY')                   as data_pagamento,
    date_trunc('month', to_date(s.data_competencia, 'DD/MM/YYYY'))::date as mes_competencia,
    round(s.valor_parcela::numeric, 2)                        as valor_parcela,
    round(s.valor_total_pago::numeric, 2)                     as valor_total_pago,
    round(coalesce(s.descontos, '0')::numeric, 2)             as descontos,
    s.quem_paga,
    btrim(s.conta_bancaria)                                   as conta_nome,
    nullif(btrim(coalesce(s.forma_pagamento, '')), '')        as forma_nome,
    btrim(s.categoria)                                        as categoria,
    nullif(btrim(coalesce(s.grupo, '')), '')                  as grupo,
    btrim(s.descricao)                                        as descricao,
    nullif(btrim(coalesce(s.numero_documento, '')), '')       as numero_documento,
    nullif(btrim(coalesce(s.plano_contas, '')), '')           as plano_contas,
    nullif(btrim(coalesce(s.dados_bancarios_fornecedor, '')), '') as dados_bancarios,
    -- "À Vista" = parcela 1 de 1; senao "k/N parcelas".
    case when btrim(s.condicao_pagamento) = 'À Vista' then 1
         else (regexp_match(btrim(s.condicao_pagamento), '^(\d+)/(\d+) parcelas$'))[1]::integer end as k,
    case when btrim(s.condicao_pagamento) = 'À Vista' then 1
         else (regexp_match(btrim(s.condicao_pagamento), '^(\d+)/(\d+) parcelas$'))[2]::integer end as n_parcelas
  from public.stg_br364_pagamentos s;

  select count(*) into v_qtd from pg_temp.wrk_pag where k is null or n_parcelas is null;
  if v_qtd > 0 then
    raise exception 'stg_br364_pagamentos: % linha(s) com condicao de pagamento fora de "À Vista" / "k/N parcelas".', v_qtd;
  end if;

  -- Esta funcao rateia 100% num centro de custo fixo. Se a staging tiver linha
  -- de outra obra, o rateio mentiria: para. Em Lancamentos a obra esta em
  -- "Centro de Custo"; em Pagamentos essa coluna vale 'Obra' literal e a obra
  -- de verdade esta em "Obra".
  select count(*) into v_qtd from public.stg_br364_lancamentos where btrim(centro_custo) <> c_centro;
  if v_qtd > 0 then
    raise exception 'stg_br364_lancamentos: % linha(s) com Centro de Custo diferente de "%".', v_qtd, c_centro;
  end if;
  select count(*) into v_qtd from public.stg_br364_pagamentos where btrim(obra) <> c_centro;
  if v_qtd > 0 then
    raise exception 'stg_br364_pagamentos: % linha(s) com Obra diferente de "%".', v_qtd, c_centro;
  end if;

  -- --------------------------------------- 3. parcelas previstas do lancamento
  -- A planilha de Lancamentos ja traz TODAS as datas de vencimento do
  -- parcelado, separadas por ";" (conferido na carga: a quantidade de datas e
  -- sempre igual ao N do "NX"). Ou seja, a parcela em aberto de um parcelado
  -- tem data REAL de planilha e nao precisa ser estimada por intervalo mensal.
  create temp table wrk_slot on commit drop as
  select
    l.linha_planilha                                          as lanc_linha,
    l.indice                                                  as lanc_indice,
    l.forn_chave,
    l.n_parcelas,
    d.ord::integer                                            as k,
    to_date(btrim(d.txt), 'DD/MM/YYYY')                       as data_vencimento,
    l.valor                                                   as valor_lanc
  from pg_temp.wrk_lanc l
  cross join lateral unnest(string_to_array(l.vencimento_txt, ';')) with ordinality as d(txt, ord);

  -- a quantidade de datas tem de bater com o N da condicao
  select count(*) into v_qtd
  from (select lanc_linha, n_parcelas, count(*) as datas
        from pg_temp.wrk_slot group by 1, 2) t
  where t.datas <> t.n_parcelas;
  if v_qtd > 0 then
    raise exception 'stg_br364_lancamentos: % lancamento(s) com quantidade de datas de vencimento diferente do N da condicao.', v_qtd;
  end if;

  select count(*) into v_qtd from pg_temp.wrk_slot where data_vencimento is null;
  if v_qtd > 0 then
    raise exception 'stg_br364_lancamentos: % data(s) de vencimento invalida(s) na lista.', v_qtd;
  end if;

  -- --------------------------------------------------- 4. casamento 1 para 1
  -- Chave: A Vista casa por (fornecedor, vencimento, valor); parcelado casa por
  -- (fornecedor, N, vencimento, numero da parcela). Empate (mesmo fornecedor,
  -- mesma data, mesmo valor) resolve por ordem de linha da planilha nos dois
  -- lados: com a chave igual em tudo o que decide dinheiro, qualquer par serve
  -- e a escolha nao muda soma nem conta.
  create temp table wrk_par on commit drop as
  with slot as (
    select s.*,
           case when s.n_parcelas = 1
                then s.forn_chave || '|1|' || s.data_vencimento::text || '|' || s.valor_lanc::text
                else s.forn_chave || '|' || s.n_parcelas::text || '|' || s.data_vencimento::text || '|k' || s.k::text
           end as chave,
           row_number() over (
             partition by case when s.n_parcelas = 1
                  then s.forn_chave || '|1|' || s.data_vencimento::text || '|' || s.valor_lanc::text
                  else s.forn_chave || '|' || s.n_parcelas::text || '|' || s.data_vencimento::text || '|k' || s.k::text
             end
             order by s.lanc_linha
           ) as rn
    from pg_temp.wrk_slot s
  ),
  pag as (
    select p.*,
           case when p.n_parcelas = 1
                then p.forn_chave || '|1|' || p.data_vencimento::text || '|' || p.valor_parcela::text
                else p.forn_chave || '|' || p.n_parcelas::text || '|' || p.data_vencimento::text || '|k' || p.k::text
           end as chave,
           row_number() over (
             partition by case when p.n_parcelas = 1
                  then p.forn_chave || '|1|' || p.data_vencimento::text || '|' || p.valor_parcela::text
                  else p.forn_chave || '|' || p.n_parcelas::text || '|' || p.data_vencimento::text || '|k' || p.k::text
             end
             order by p.linha_planilha
           ) as rn
    from pg_temp.wrk_pag p
  )
  select
    s.lanc_linha, s.lanc_indice, s.k, s.data_vencimento, s.n_parcelas, s.valor_lanc,
    p.linha_planilha as pag_linha,
    p.indice         as pag_indice,
    p.valor_parcela,
    p.valor_total_pago,
    p.descontos,
    p.data_pagamento,
    p.conta_nome     as pag_conta,
    p.forma_nome     as pag_forma,
    p.grupo          as pag_grupo
  from slot s
  left join pag p on p.chave = s.chave and p.rn = s.rn;

  -- pagamento que nao achou lancamento nenhum
  create temp table wrk_orfao on commit drop as
  select p.*
  from pg_temp.wrk_pag p
  where not exists (
    select 1 from pg_temp.wrk_par r where r.pag_linha = p.linha_planilha
  );

  -- ------------------------------------------------------- 5. competencia
  -- Regra 7: competencia fechada nao pode falhar em silencio nem ser reaberta
  -- por conta propria. Relata e para.
  select jsonb_agg(distinct to_char(m, 'MM/YYYY') order by to_char(m, 'MM/YYYY'))
  into v_fech
  from (
    select mes_competencia as m from pg_temp.wrk_lanc where quem_paga = 'Empresa'
    union
    select mes_competencia from pg_temp.wrk_orfao where quem_paga = 'Empresa'
  ) t
  where public.fn_competencia_fechada(t.m);
  if v_fech is not null then
    raise exception 'Competencia fechada no ERP para o(s) mes(es) %: reabra em Financeiro > Competencias ou decida outro mes antes de importar.', v_fech;
  end if;

  -- --------------------------------------------------------- 6. fornecedores
  -- Casa por documento (so digitos) e depois por nome normalizado. Nao achou,
  -- cria. Um nome por fornecedor: a planilha nao tem dois documentos para o
  -- mesmo nome nem dois nomes para o mesmo documento (conferido).
  -- So os fornecedores das linhas que vao entrar. Sem o filtro de Quem Paga, a
  -- importacao cadastraria fornecedor que aparece unicamente em linha de
  -- Cliente (sao 7 na planilha) e que nenhum lancamento importado usa.
  create temp table wrk_forn on commit drop as
  with nomes as (
    select forn_chave,
           min(forn_nome)  as forn_nome,
           min(forn_doc)   as forn_doc
    from (
      select forn_chave, forn_nome, forn_doc from pg_temp.wrk_lanc
       where quem_paga = 'Empresa'
      union all
      select forn_chave, forn_nome, forn_doc from pg_temp.wrk_orfao
       where quem_paga = 'Empresa' and p_criar_lancamento_orfao
    ) t
    group by forn_chave
  )
  select
    n.forn_chave,
    n.forn_nome,
    n.forn_doc,
    coalesce(
      (select f.id from public.fornecedores f
        where n.forn_doc is not null
          and regexp_replace(coalesce(f.cnpj_cpf, ''), '\D', '', 'g') = n.forn_doc
        order by f.created_at, f.id limit 1),
      (select f.id from public.fornecedores f
        where public.fn_chave_nome(f.razao_social) = n.forn_chave
        order by f.created_at, f.id limit 1)
    ) as fornecedor_id,
    (select f.id from public.fornecedores f
      where n.forn_doc is not null
        and regexp_replace(coalesce(f.cnpj_cpf, ''), '\D', '', 'g') = n.forn_doc
      order by f.created_at, f.id limit 1) is not null as casou_doc
  from nomes n;

  insert into public.fornecedores (id, tipo, razao_social, cnpj_cpf, observacoes, created_by)
  select
    md5(c_marca || ':forn:' || w.forn_chave)::uuid,
    case when length(w.forn_doc) = 11 then 'pf' else 'pj' end,
    w.forn_nome,
    w.forn_doc,
    'Cadastrado na importacao do historico financeiro BR-364 Lote 09.',
    v_usuario
  from pg_temp.wrk_forn w
  where w.fornecedor_id is null
  on conflict (id) do nothing;

  select jsonb_agg(jsonb_build_object(
           'nome', w.forn_nome, 'documento', w.forn_doc,
           'tipo', case when length(w.forn_doc) = 11 then 'pf' else 'pj' end)
         order by w.forn_nome)
  into v_forn_novos
  from pg_temp.wrk_forn w where w.fornecedor_id is null;

  update pg_temp.wrk_forn w
  set fornecedor_id = md5(c_marca || ':forn:' || w.forn_chave)::uuid
  where w.fornecedor_id is null;

  -- ----------------------------------------------------------- 7. categorias
  -- Mesmo cuidado do fornecedor: categoria de linha de Cliente nao entra.
  create temp table wrk_cat on commit drop as
  with nomes as (
    select distinct categoria from (
      select categoria from pg_temp.wrk_lanc where quem_paga = 'Empresa'
      union all
      select categoria from pg_temp.wrk_orfao
       where quem_paga = 'Empresa' and p_criar_lancamento_orfao
    ) t
  )
  select
    n.categoria,
    (select c.id from public.categorias_financeiras c
      where c.tipo = 'despesa'
        and public.fn_chave_nome(c.nome) = public.fn_chave_nome(n.categoria)
      order by c.created_at, c.id limit 1) as categoria_id
  from nomes n;

  insert into public.categorias_financeiras (id, nome, tipo, created_by)
  select md5(c_marca || ':cat:' || public.fn_chave_nome(w.categoria))::uuid,
         w.categoria, 'despesa', v_usuario
  from pg_temp.wrk_cat w
  where w.categoria_id is null
  on conflict (id) do nothing;

  select jsonb_agg(w.categoria order by w.categoria) into v_cat_novas
  from pg_temp.wrk_cat w where w.categoria_id is null;

  update pg_temp.wrk_cat w
  set categoria_id = md5(c_marca || ':cat:' || public.fn_chave_nome(w.categoria))::uuid
  where w.categoria_id is null;

  -- ------------------------------------------------------ 8. formas e contas
  -- Grafia da planilha -> forma que ja existe no ERP. "Débito Automático" nao
  -- existe: cria como bancario (decisao do Tiago). Nada e renomeado.
  create temp table wrk_forma on commit drop as
  select p.planilha, p.erp,
         (select f.id from public.formas_pagamento f where f.nome = p.erp
           order by f.created_at, f.id limit 1) as forma_id
  from (values
    ('Pix', 'PIX'),
    ('Cartão de crédito', 'Cartão de Credito'),
    ('Transferência Bancária', 'Transferencia'),
    ('Boleto', 'Boleto'),
    ('Dinheiro', 'Dinheiro'),
    ('Cheque', 'Cheque'),
    ('Débito Automático', 'Débito Automático')
  ) as p(planilha, erp);

  insert into public.formas_pagamento (id, nome, tipo, created_by)
  select md5(c_marca || ':forma:' || w.erp)::uuid, w.erp, 'bancario', v_usuario
  from pg_temp.wrk_forma w
  where w.forma_id is null
  on conflict (nome) do nothing;

  update pg_temp.wrk_forma w
  set forma_id = (select f.id from public.formas_pagamento f where f.nome = w.erp
                   order by f.created_at, f.id limit 1)
  where w.forma_id is null;

  select count(*) into v_qtd from pg_temp.wrk_forma where forma_id is null;
  if v_qtd > 0 then
    raise exception 'Ficaram % forma(s) de pagamento sem id no ERP.', v_qtd;
  end if;

  -- forma da planilha que nao esta no mapa: para, nao chuta
  select string_agg(distinct t.forma_nome, ', ') into v_txt
  from (
    select forma_nome from pg_temp.wrk_lanc where forma_nome is not null
    union select forma_nome from pg_temp.wrk_pag where forma_nome is not null
  ) t
  where not exists (select 1 from pg_temp.wrk_forma f where f.planilha = t.forma_nome);
  if v_txt is not null then
    raise exception 'Forma de pagamento da planilha sem mapeamento: %. Decida o destino antes de importar.', v_txt;
  end if;

  create temp table wrk_conta on commit drop as
  select t.conta_nome,
         (select c.id from public.contas_bancarias c where c.nome = t.conta_nome
           order by c.created_at, c.id limit 1) as conta_id
  from (
    select distinct conta_nome from pg_temp.wrk_lanc
    union select conta_nome from pg_temp.wrk_pag
  ) t;

  select string_agg(conta_nome, ' | ') into v_txt
  from pg_temp.wrk_conta where conta_id is null;
  if v_txt is not null then
    raise exception 'Conta bancaria da planilha que nao existe no ERP: %. Nao crio conta nesta importacao.', v_txt;
  end if;

  -- ------------------------------------------------ 9. lancamentos a importar
  -- Fora as linhas "Quem Paga = Cliente" (decisao do Tiago): elas e os
  -- pagamentos delas ficam de fora e saem em lista separada.
  create temp table wrk_imp on commit drop as
  select
    md5(c_marca || ':lanc:' || l.indice)::uuid as lanc_id,
    l.linha_planilha, l.indice, l.valor, l.data_compra, l.mes_competencia,
    l.descricao, l.numero_documento, l.observacoes, l.plano_contas,
    l.condicao, l.n_parcelas, l.conta_nome,
    f.fornecedor_id, c.categoria_id,
    fp.forma_id,
    -- Vencimento do cabecalho do lancamento: a primeira parcela. As listas de
    -- data da planilha sao crescentes (conferido), entao "primeira" e a que
    -- vence antes.
    (select min(s.data_vencimento) from pg_temp.wrk_slot s where s.lanc_linha = l.linha_planilha) as data_vencimento,
    (select string_agg(distinct r.pag_grupo, ' / ' order by r.pag_grupo)
       from pg_temp.wrk_par r where r.lanc_linha = l.linha_planilha and r.pag_grupo is not null) as grupo,
    false as orfao
  from pg_temp.wrk_lanc l
  join pg_temp.wrk_forn f on f.forn_chave = l.forn_chave
  join pg_temp.wrk_cat c on c.categoria = l.categoria
  left join pg_temp.wrk_forma fp on fp.planilha = l.forma_nome
  where l.quem_paga = 'Empresa';

  -- Pagamento sem lancamento na planilha de origem. Sem ele o dinheiro que saiu
  -- da conta nao tem contrapartida e a conta nao fecha em zero. Entra como
  -- lancamento proprio, marcado, com os dados que a propria linha de pagamento
  -- traz (fornecedor, CNPJ, categoria, forma, conta, competencia, descricao).
  if p_criar_lancamento_orfao then
    insert into pg_temp.wrk_imp (
      lanc_id, linha_planilha, indice, valor, data_compra, mes_competencia,
      descricao, numero_documento, observacoes, plano_contas, condicao,
      n_parcelas, conta_nome, fornecedor_id, categoria_id, forma_id, data_vencimento,
      grupo, orfao)
    select
      md5(c_marca || ':pag-orfao:' || o.indice)::uuid,
      o.linha_planilha, o.indice, o.valor_parcela, o.data_vencimento, o.mes_competencia,
      o.descricao, o.numero_documento, null, o.plano_contas, 'À Vista',
      1, o.conta_nome, f.fornecedor_id, c.categoria_id, fp.forma_id, o.data_vencimento,
      o.grupo, true
    from pg_temp.wrk_orfao o
    join pg_temp.wrk_forn f on f.forn_chave = o.forn_chave
    join pg_temp.wrk_cat c on c.categoria = o.categoria
    left join pg_temp.wrk_forma fp on fp.planilha = o.forma_nome
    where o.quem_paga = 'Empresa';
  end if;

  -- --------------------------------------------------------- 10. as parcelas
  -- Valor da parcela paga = Valor Total Pago (o que de fato saiu da conta), e
  -- nao Valor da Parcela: e assim que o saldo da conta fecha no que o Tiago
  -- mandou lancar. A diferenca (desconto) vai para as observacoes.
  -- Valor da parcela em ABERTO = o que sobra do valor do lancamento depois de
  -- tirar o valor BRUTO (Valor da Parcela) das pagas, dividido pelas abertas.
  -- Bruto e nao liquido de proposito: o desconto ja obtido nao aumenta o que
  -- ainda se deve.
  create temp table wrk_parcela on commit drop as
  with base as (
    select
      i.lanc_id, i.linha_planilha, i.indice, i.valor as valor_lanc,
      r.k, r.data_vencimento, r.pag_linha, r.valor_total_pago, r.valor_parcela,
      r.descontos, r.data_pagamento, r.pag_conta,
      count(*) filter (where r.pag_linha is null) over (partition by i.lanc_id) as abertas,
      i.valor - coalesce(sum(r.valor_parcela) filter (where r.pag_linha is not null)
                         over (partition by i.lanc_id), 0) as residuo,
      row_number() over (partition by i.lanc_id, (r.pag_linha is null) order by r.k) as rn_aberta
    from pg_temp.wrk_imp i
    join pg_temp.wrk_par r on r.lanc_linha = i.linha_planilha
    where not i.orfao
  )
  select
    md5(c_marca || ':parc:' || indice || ':' || k::text)::uuid as parcela_id,
    lanc_id, k::smallint as numero_parcela, data_vencimento, pag_linha,
    case
      when pag_linha is not null then valor_total_pago
      -- ultima aberta absorve a diferenca de arredondamento para a soma das
      -- parcelas fechar exatamente no residuo
      when rn_aberta < abertas then round(residuo / abertas, 2)
      else residuo - round(residuo / abertas, 2) * (abertas - 1)
    end as valor,
    data_pagamento, pag_conta, descontos, valor_parcela
  from base
  union all
  -- parcela unica dos orfaos: paga, no valor que saiu da conta
  select
    md5(c_marca || ':parc-orfao:' || o.indice || ':1')::uuid,
    md5(c_marca || ':pag-orfao:' || o.indice)::uuid,
    1::smallint, o.data_vencimento, o.linha_planilha,
    o.valor_total_pago, o.data_pagamento, o.conta_nome, o.descontos, o.valor_parcela
  from pg_temp.wrk_orfao o
  where p_criar_lancamento_orfao and o.quem_paga = 'Empresa';

  -- --------------------------------------------------------- 11. a gravacao
  insert into public.lancamentos (
    id, tipo, origem, origem_id, fornecedor_id, categoria_id, forma_pagamento_id,
    condicao_pagamento_id, descricao, observacoes, valor, status, data_compra,
    mes_competencia, data_vencimento, numero, created_by)
  select
    i.lanc_id, 'a_pagar', 'manual', null,
    i.fornecedor_id, i.categoria_id, i.forma_id,
    -- Sem condicao de pagamento: "2X".."21X" nao diz intervalo e nao se
    -- inventa condicao nova (decisao do Tiago). A verdade do parcelamento
    -- esta nas datas das parcelas.
    null,
    i.descricao,
    -- Regra 8: nada da planilha se perde. Plano de Contas e Grupo nao tem
    -- campo no ERP, entao vao para observacoes junto com a marca de origem.
    concat_ws(E'\n',
      i.observacoes,
      -- "Numero do Documento" da planilha nao e o numero do lancamento no ERP
      -- (esse e gerado, LAN-2026-...): sem campo proprio, vai para observacoes
      -- em vez de se perder.
      case when i.numero_documento is not null then 'Numero do Documento: ' || i.numero_documento end,
      case when i.plano_contas is not null then 'Plano de Contas: ' || i.plano_contas end,
      case when i.grupo is not null then 'Grupo: ' || i.grupo end,
      -- A conta de onde o dinheiro saiu fica na parcela paga. Mas em lancamento
      -- com parcela AINDA ABERTA nao ha parcela paga que guarde a conta, e no
      -- ERP a conta da pendente e escolhida na aprovacao: registra aqui a conta
      -- que a planilha indicava, para quem for pagar depois nao ter de adivinhar.
      case when i.conta_nome is not null
             and exists (select 1 from pg_temp.wrk_parcela p
                          where p.lanc_id = i.lanc_id and p.pag_linha is null)
           then 'Conta indicada na planilha: ' || i.conta_nome end,
      case when i.condicao <> 'À Vista' then 'Condicao na planilha de origem: ' || i.condicao ||
        ' (importado sem condicao de pagamento, com as datas reais de vencimento)' end,
      (select string_agg('Desconto de R$ ' || to_char(p.descontos, 'FM999999990.00') ||
                         ' na parcela ' || p.numero_parcela::text ||
                         ' (Valor da Parcela R$ ' || to_char(p.valor_parcela, 'FM999999990.00') ||
                         ', Valor Total Pago R$ ' || to_char(p.valor, 'FM999999990.00') || ')',
                         E'\n' order by p.numero_parcela)
         from pg_temp.wrk_parcela p
        where p.lanc_id = i.lanc_id and p.descontos <> 0),
      case when i.orfao then
        'ATENCAO: esta linha nao existe na planilha de Lancamentos. Foi criada a partir da parcela paga (Pagamentos, indice '
        || i.indice || '), porque o dinheiro saiu da conta e precisava de contrapartida.' end,
      'Importado da planilha BR-364 Lote 09 (' ||
        case when i.orfao then 'Pagamentos' else 'Lancamentos' end ||
        ', indice ' || i.indice || ', linha ' || i.linha_planilha::text || ').'
    ),
    i.valor,
    -- status pelo que as parcelas dizem, sem passar por
    -- fn_aplicar_regra_pagamento (que reinterpretaria pela forma de pagamento)
    case when exists (select 1 from pg_temp.wrk_parcela p
                       where p.lanc_id = i.lanc_id and p.pag_linha is null)
         then 'a_pagar' else 'pago' end,
    i.data_compra, i.mes_competencia, i.data_vencimento,
    null, v_usuario
  from pg_temp.wrk_imp i
  where not exists (select 1 from public.lancamentos l where l.id = i.lanc_id)
  on conflict (id) do nothing;

  insert into public.lancamento_parcelas (
    id, lancamento_id, numero_parcela, valor, data_vencimento, status,
    conta_bancaria_id, data_pagamento, data_programada, data_programada_origem,
    pago_por, pago_em, created_by)
  select
    p.parcela_id, p.lanc_id, p.numero_parcela, p.valor, p.data_vencimento,
    case when p.pag_linha is not null then 'pago' else 'pendente' end,
    case when p.pag_linha is not null then ct.conta_id end,
    p.data_pagamento,
    -- data programada = o vencimento, so na parcela paga: a pendente nao esta
    -- aprovada e nao pode ter data autorizada.
    case when p.pag_linha is not null then p.data_vencimento end,
    case when p.pag_linha is not null then 'vencimento' end,
    case when p.pag_linha is not null then v_usuario end,
    case when p.pag_linha is not null then now() end,
    v_usuario
  from pg_temp.wrk_parcela p
  left join pg_temp.wrk_conta ct on ct.conta_nome = p.pag_conta
  where exists (select 1 from public.lancamentos l where l.id = p.lanc_id)
    and not exists (select 1 from public.lancamento_parcelas x where x.id = p.parcela_id)
  on conflict (id) do nothing;

  -- Rateio 100% no centro 009. Nao uso lancamentos.centro_custo_id: o
  -- financeiro le centro de custo de lancamento_rateios (e o que
  -- fn_salvar_lancamento grava e o que as telas mostram).
  insert into public.lancamento_rateios (id, lancamento_id, centro_custo_id, valor, created_by)
  select md5(c_marca || ':rat:' || i.indice || case when i.orfao then ':o' else ':l' end)::uuid,
         i.lanc_id, v_centro_id, i.valor, v_usuario
  from pg_temp.wrk_imp i
  where exists (select 1 from public.lancamentos l where l.id = i.lanc_id)
    and not exists (select 1 from public.lancamento_rateios r where r.lancamento_id = i.lanc_id)
  on conflict (id) do nothing;

  -- ------------------------------------------------------- 12. saldo inicial
  -- Decisao do Tiago: cada conta comeca com exatamente o que saiu dela, para
  -- fechar em R$ 0,00 depois da importacao. Atribuicao absoluta (nao soma),
  -- para rodar duas vezes dar o mesmo saldo.
  if p_ajustar_saldo_conta then
    update public.contas_bancarias c
    set saldo_inicial = coalesce(t.saiu, 0)
    from (
      -- Todas as contas que aparecem na planilha, inclusive a que nao teve
      -- saida nenhuma (AMAZONIA, cujos pagamentos sao todos do Cliente): ela
      -- tem de ficar em 0,00 explicitamente, e nao "no que estava antes".
      select k.conta_id, coalesce(sum(p.valor), 0) as saiu
      from pg_temp.wrk_conta k
      left join pg_temp.wrk_parcela p
        on p.pag_conta = k.conta_nome and p.pag_linha is not null
      group by k.conta_id
    ) t
    where c.id = t.conta_id;
  end if;

  -- --------------------------------------------------------- 13. relatorio
  -- saldo_final sai da TABELA, com a mesma formula que fn_pagar_parcela usa
  -- para conferir saldo (saldo_inicial + recebido - pago). Assim o "fecha em
  -- R$ 0,00" e medido no banco depois da gravacao, e nao no meu rascunho: se
  -- houver qualquer outra parcela paga naquela conta, aparece aqui.
  select jsonb_agg(jsonb_build_object(
           'conta', c.nome,
           'parcelas_importadas', coalesce(t.qtd, 0),
           'saiu_na_importacao', coalesce(t.saiu, 0),
           'saldo_inicial', c.saldo_inicial,
           'saldo_final', c.saldo_inicial + coalesce(m.mov, 0))
         order by c.nome)
  into v_contas
  from public.contas_bancarias c
  left join (
    select ct.conta_id, count(*) as qtd, sum(p.valor) as saiu
    from pg_temp.wrk_parcela p
    join pg_temp.wrk_conta ct on ct.conta_nome = p.pag_conta
    where p.pag_linha is not null
    group by ct.conta_id
  ) t on t.conta_id = c.id
  left join (
    select p.conta_bancaria_id,
           sum(case when l.tipo = 'a_receber' then p.valor else -p.valor end) as mov
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where p.status = 'pago'
    group by p.conta_bancaria_id
  ) m on m.conta_bancaria_id = c.id;

  select jsonb_agg(jsonb_build_object(
           'pagamentos_linha', o.linha_planilha, 'indice', o.indice,
           'fornecedor', o.forn_nome, 'vencimento', o.data_vencimento,
           'pago_em', o.data_pagamento, 'valor', o.valor_total_pago,
           'conta', o.conta_nome) order by o.linha_planilha)
  into v_orfaos
  from pg_temp.wrk_orfao o where o.quem_paga = 'Empresa';

  select jsonb_agg(jsonb_build_object(
           'lancamentos_linha', i.linha_planilha, 'indice', i.indice,
           'valor', i.valor, 'descricao', left(i.descricao, 60))
         order by i.linha_planilha)
  into v_sem_forma
  from pg_temp.wrk_imp i where i.forma_id is null;

  -- "Dados Bancarios do Fornecedor" nao tem campo em fornecedores. Nao invento
  -- coluna nem enfio em observacoes de cadastro: relato para o Tiago decidir.
  select jsonb_agg(distinct jsonb_build_object(
           'fornecedor', p.forn_nome, 'dados_bancarios', p.dados_bancarios))
  into v_banco
  from pg_temp.wrk_pag p
  where p.dados_bancarios is not null and p.quem_paga = 'Empresa';

  select jsonb_agg(jsonb_build_object(
           'lancamento_indice', i.indice, 'lancamentos_linha', i.linha_planilha,
           'valor_lancamento', i.valor,
           'soma_parcelas', (select sum(p.valor) from pg_temp.wrk_parcela p where p.lanc_id = i.lanc_id),
           'desconto', i.valor - (select sum(p.valor) from pg_temp.wrk_parcela p where p.lanc_id = i.lanc_id))
         order by i.linha_planilha)
  into v_desconto
  from pg_temp.wrk_imp i
  where i.valor <> (select coalesce(sum(p.valor), 0) from pg_temp.wrk_parcela p where p.lanc_id = i.lanc_id);

  v_rel := jsonb_build_object(
    'obra', c_centro,
    'usuario_id', v_usuario,
    'criou_lancamento_orfao', p_criar_lancamento_orfao,
    'ajustou_saldo_conta', p_ajustar_saldo_conta,
    'staging', jsonb_build_object(
      'lancamentos', (select count(*) from public.stg_br364_lancamentos),
      'pagamentos', (select count(*) from public.stg_br364_pagamentos)),
    'excluidos_cliente', jsonb_build_object(
      'lancamentos', (select count(*) from pg_temp.wrk_lanc where quem_paga = 'Cliente'),
      'valor', (select coalesce(sum(valor), 0) from pg_temp.wrk_lanc where quem_paga = 'Cliente'),
      'pagamentos', (select count(*) from pg_temp.wrk_pag where quem_paga = 'Cliente'),
      'valor_pago', (select coalesce(sum(valor_total_pago), 0) from pg_temp.wrk_pag where quem_paga = 'Cliente')),
    'lancamentos', jsonb_build_object(
      'da_planilha_lancamentos', (select count(*) from pg_temp.wrk_imp where not orfao),
      'valor_da_planilha', (select coalesce(sum(valor), 0) from pg_temp.wrk_imp where not orfao),
      'de_pagamento_orfao', (select count(*) from pg_temp.wrk_imp where orfao),
      'valor_orfao', (select coalesce(sum(valor), 0) from pg_temp.wrk_imp where orfao),
      'total', (select count(*) from pg_temp.wrk_imp),
      'valor_total', (select coalesce(sum(valor), 0) from pg_temp.wrk_imp),
      'presentes_no_banco', (select count(*) from public.lancamentos l join pg_temp.wrk_imp i on i.lanc_id = l.id)),
    'parcelas', jsonb_build_object(
      'pagas', (select count(*) from pg_temp.wrk_parcela where pag_linha is not null),
      'valor_pago', (select coalesce(sum(valor), 0) from pg_temp.wrk_parcela where pag_linha is not null),
      'em_aberto', (select count(*) from pg_temp.wrk_parcela where pag_linha is null),
      'valor_em_aberto', (select coalesce(sum(valor), 0) from pg_temp.wrk_parcela where pag_linha is null),
      'total', (select count(*) from pg_temp.wrk_parcela),
      'presentes_no_banco', (select count(*) from public.lancamento_parcelas p join pg_temp.wrk_parcela w on w.parcela_id = p.id)),
    'em_aberto_por_lancamento', jsonb_build_object(
      'lancamentos_com_parcela_aberta', (select count(distinct lanc_id) from pg_temp.wrk_parcela where pag_linha is null),
      'valor_cheio_desses_lancamentos', (select coalesce(sum(i.valor), 0) from pg_temp.wrk_imp i
        where exists (select 1 from pg_temp.wrk_parcela p where p.lanc_id = i.lanc_id and p.pag_linha is null)),
      'lancamentos_sem_nenhum_pagamento', (select count(*) from pg_temp.wrk_imp i
        where not exists (select 1 from pg_temp.wrk_parcela p where p.lanc_id = i.lanc_id and p.pag_linha is not null)),
      'valor_sem_nenhum_pagamento', (select coalesce(sum(i.valor), 0) from pg_temp.wrk_imp i
        where not exists (select 1 from pg_temp.wrk_parcela p where p.lanc_id = i.lanc_id and p.pag_linha is not null))),
    'parcelas_abertas_com_data_da_planilha', (select count(*) from pg_temp.wrk_parcela where pag_linha is null),
    'parcelas_abertas_com_data_estimada', 0,
    'rateios', (select count(*) from public.lancamento_rateios r join pg_temp.wrk_imp i on i.lanc_id = r.lancamento_id),
    'cadastros', jsonb_build_object(
      'fornecedores_planilha', (select count(*) from pg_temp.wrk_forn),
      'fornecedores_casados_por_documento', (select count(*) from pg_temp.wrk_forn where casou_doc),
      'fornecedores_criados', coalesce(jsonb_array_length(v_forn_novos), 0),
      'categorias_planilha', (select count(*) from pg_temp.wrk_cat),
      'categorias_criadas', coalesce(jsonb_array_length(v_cat_novas), 0),
      'formas_criadas', (select jsonb_agg(erp order by erp) from pg_temp.wrk_forma
                          where forma_id = md5(c_marca || ':forma:' || erp)::uuid)),
    'contas', v_contas,
    'fornecedores_criados', v_forn_novos,
    'categorias_criadas', v_cat_novas,
    'pagamentos_sem_lancamento', v_orfaos,
    'lancamentos_sem_forma_pagamento', v_sem_forma,
    'lancamentos_com_desconto', v_desconto,
    'dados_bancarios_sem_campo_no_erp', v_banco
  );

  -- Uma linha de resumo em audit_log, alem do que os triggers ja gravaram por
  -- registro: a importacao inteira fica achavel por um registro so.
  insert into public.audit_log (tabela, registro_id, acao, usuario_id, dados_depois)
  values ('importacao_br364_lote09', c_marca, 'INSERT', v_usuario, v_rel);

  return v_rel;
end;
$function$;

comment on function public.fn_importar_br364_lote09(uuid, boolean, boolean) is
  'Caminho de MIGRACAO da carga historica BR-364 Lote 09: grava a parcela ja como paga com a data historica, pulando a janela de pagamento e a conferencia de saldo que fn_pagar_parcela exige. Nao use fora desta migracao: para lancamento do dia a dia o caminho e fn_salvar_lancamento + fn_aprovar_parcela + fn_pagar_parcela.';

-- Funcao de migracao nao e para a aplicacao. Sem o revoke ela nasceria com
-- execute para public (default do Postgres), ou seja, qualquer usuario logado
-- poderia rodar a importacao inteira pela API.
revoke all on function public.fn_importar_br364_lote09(uuid, boolean, boolean) from public;
revoke all on function public.fn_importar_br364_lote09(uuid, boolean, boolean) from anon, authenticated;
revoke all on function public.fn_chave_nome(text) from public;
revoke all on function public.fn_chave_nome(text) from anon;
grant execute on function public.fn_chave_nome(text) to authenticated;
