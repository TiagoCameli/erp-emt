-- Rescisão: o ERP calcula as verbas, o Tiago edita qualquer valor, a aprovação
-- desliga a pessoa e gera a conta a pagar.
--
-- Pedido de 29/08/2026: "quero também a opção de gerar rescisão de um
-- funcionário e já gera a rescisão desse funcionário e desliga ele da empresa".
-- Perguntado de onde sai o valor, ele respondeu: "ERP calcula mas eu posso
-- editar todos os valores".
--
-- =====================================================================
-- A MATRIZ DE VERBAS É DECLARAÇÃO DELE, NÃO DEDUÇÃO MINHA
-- =====================================================================
--
-- A regra de ouro do RH neste projeto é que eu não invento regra trabalhista.
-- Os quatro tipos foram escolhidos por ele numa pergunta em que CADA OPÇÃO
-- trazia escrito o que ela implica, e é isso que está implementado aqui:
--
--   sem_justa_causa     "Aviso prévio (indenizado ou trabalhado), 13º e férias
--                        proporcionais, e multa de 40% do FGTS."
--   pedido_demissao     "Sem multa de FGTS; se ele não cumprir o aviso, o aviso
--                        vira desconto."
--   termino_experiencia "O contrato acaba no prazo combinado. Sem aviso prévio
--                        e sem multa de FGTS."
--   justa_causa         "Só saldo de salário e férias vencidas + 1/3."
--
-- Férias VENCIDAS entram nos quatro tipos, inclusive na justa causa.
--
-- O que NÃO está aqui, e por quê:
--   - SALDO DE SALÁRIO. Ele escolheu que a folha do mês paga os dias
--     trabalhados (migration 20260829200000). Repetir aqui pagaria os mesmos
--     dias duas vezes.
--   - INSS e IRRF nascem ZERADOS e editáveis. As faixas estão com zero linha em
--     folha_inss_faixas / folha_irrf_faixas desde julho, e qual verba de
--     rescisão é tributada é regra fiscal que ninguém declarou. Ligar um cálculo
--     em cima de tabela vazia daria zero com aparência de conta feita; zero
--     declarado, com a tela dizendo o porquê, é honesto.
--
-- =====================================================================
-- POR QUE OS ITENS SÃO LINHAS, E NÃO COLUNAS DA RESCISÃO
-- =====================================================================
--
-- Porque "posso editar todos os valores" inclui apagar uma linha que não se
-- aplica e acrescentar uma que o contador mandou. Com uma coluna por verba,
-- toda verba nova é migration, e um desconto de pensão alimentícia não teria
-- onde morar. Com linhas, o documento impresso é a própria tabela na ordem em
-- que ela é lida.

-- =====================================================================
-- 1. Parâmetros
-- =====================================================================
--
-- Ficam em folha_parametros (singleton, id = 1), junto com FGTS e as faixas —
-- a rescisão usa os mesmos números da folha e ter dois lugares os faria
-- divergir.
--
-- SEED com os valores legais correntes, e isto é uma decisão consciente: o
-- Bloco 7 estabeleceu "config editável, sem seed de valor", mas ali o valor era
-- uma FAIXA de imposto que muda todo ano e que ninguém adivinha. Aqui são
-- constantes de aviso prévio e multa que o Tiago pediu para o ERP aplicar. Ele
-- vê e muda os quatro em RH > Parâmetros da folha.

alter table public.folha_parametros
  add column if not exists aviso_previo_dias_base smallint not null default 30,
  add column if not exists aviso_previo_dias_por_ano smallint not null default 3,
  add column if not exists aviso_previo_dias_teto smallint not null default 90,
  add column if not exists multa_fgts_percentual numeric(7,4) not null default 40;

comment on column public.folha_parametros.aviso_previo_dias_base is
  'Dias de aviso prévio antes do acréscimo por tempo de casa.';
comment on column public.folha_parametros.aviso_previo_dias_por_ano is
  'Dias somados ao aviso por ano completo de serviço.';
comment on column public.folha_parametros.aviso_previo_dias_teto is
  'Teto de dias de aviso prévio, contando base + acréscimo.';
comment on column public.folha_parametros.multa_fgts_percentual is
  'Percentual da multa rescisória sobre o saldo do FGTS informado. Só se aplica à demissão sem justa causa.';

-- =====================================================================
-- 2. As tabelas
-- =====================================================================

create table if not exists public.rh_rescisoes (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  colaborador_id uuid not null references public.colaboradores(id),
  tipo text not null,
  aviso text not null,
  data_aviso date,
  data_desligamento date not null,
  data_vencimento date,
  -- Congelada na geração: o cadastro pode ter o salário reajustado depois, e o
  -- documento tem de continuar explicando o número que ele pagou.
  remuneracao_base numeric(14,2) not null,
  saldo_fgts numeric(14,2) not null default 0,
  ferias_vencidas_periodos smallint not null default 0,
  observacao text,
  status text not null default 'rascunho',
  valor_proventos numeric(14,2) not null default 0,
  valor_descontos numeric(14,2) not null default 0,
  valor_liquido numeric(14,2) not null default 0,
  centro_custo_id uuid references public.centros_custo(id),
  lancamento_id uuid references public.lancamentos(id),
  aprovado_por uuid references public.usuarios(id),
  aprovado_em timestamptz,
  motivo_rejeicao text,
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint rh_rescisoes_tipo_check check (tipo in
    ('sem_justa_causa', 'pedido_demissao', 'termino_experiencia', 'justa_causa')),
  constraint rh_rescisoes_aviso_check check (aviso in
    ('indenizado', 'trabalhado', 'nao_cumprido', 'nao_se_aplica')),
  constraint rh_rescisoes_status_check check (status in
    ('rascunho', 'pendente_aprovacao', 'aprovado', 'rejeitado')),
  constraint rh_rescisoes_fgts_nao_negativo check (saldo_fgts >= 0),
  constraint rh_rescisoes_periodos_nao_negativo check (ferias_vencidas_periodos >= 0),
  constraint rh_rescisoes_aviso_antes_do_desligamento
    check (data_aviso is null or data_aviso <= data_desligamento)
);

-- Uma rescisão viva por pessoa. Sem isto, dois cliques no botão geram dois
-- documentos que desligam a mesma pessoa e criam duas contas a pagar.
create unique index if not exists rh_rescisoes_uma_viva_por_colaborador
  on public.rh_rescisoes (colaborador_id) where excluido_em is null;

create index if not exists rh_rescisoes_status_idx on public.rh_rescisoes (status) where excluido_em is null;
create index if not exists rh_rescisoes_lancamento_idx on public.rh_rescisoes (lancamento_id);

create table if not exists public.rh_rescisao_itens (
  id uuid primary key default gen_random_uuid(),
  rescisao_id uuid not null references public.rh_rescisoes(id) on delete cascade,
  -- Null nas linhas livres, que o Tiago acrescenta. É o que deixa o unique
  -- abaixo valer só para as verbas calculadas (null nunca conflita com null).
  codigo text,
  descricao text not null,
  natureza text not null,
  -- "45 dias", "9/12 avos", "40% de R$ 12.000,00". É a coluna que faz o
  -- documento se explicar sem ninguém refazer a conta.
  referencia text,
  valor numeric(14,2) not null default 0,
  editado_manualmente boolean not null default false,
  ordem smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint rh_rescisao_itens_natureza_check check (natureza in ('provento', 'desconto')),
  constraint rh_rescisao_itens_valor_nao_negativo check (valor >= 0)
);

create unique index if not exists rh_rescisao_itens_codigo_unico
  on public.rh_rescisao_itens (rescisao_id, codigo) where codigo is not null;
create index if not exists rh_rescisao_itens_rescisao_idx on public.rh_rescisao_itens (rescisao_id);

-- =====================================================================
-- 3. RLS e grants
-- =====================================================================
--
-- SELECT pela permissão da tela. Nenhuma policy de INSERT/UPDATE/DELETE, e
-- nenhum grant além do SELECT: toda escrita passa pelas RPCs SECURITY DEFINER.
-- Não é preciosismo — gravar a rescisão e reconstruir os itens tem de acontecer
-- na mesma transação, e um insert solto deixaria um documento com cabeçalho e
-- sem verba, somando R$ 0,00 e parecendo pronto.

alter table public.rh_rescisoes enable row level security;
alter table public.rh_rescisao_itens enable row level security;

drop policy if exists rh_rescisoes_select on public.rh_rescisoes;
create policy rh_rescisoes_select on public.rh_rescisoes
  for select to authenticated
  using ((select public.tem_permissao('rh.rescisoes', 'ver')));

drop policy if exists rh_rescisao_itens_select on public.rh_rescisao_itens;
create policy rh_rescisao_itens_select on public.rh_rescisao_itens
  for select to authenticated
  using ((select public.tem_permissao('rh.rescisoes', 'ver')));

revoke all on table public.rh_rescisoes from anon, authenticated;
revoke all on table public.rh_rescisao_itens from anon, authenticated;
grant select on table public.rh_rescisoes to authenticated;
grant select on table public.rh_rescisao_itens to authenticated;

drop trigger if exists trg_audit_rh_rescisoes on public.rh_rescisoes;
create trigger trg_audit_rh_rescisoes
  after insert or update or delete on public.rh_rescisoes
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_rh_rescisao_itens on public.rh_rescisao_itens;
create trigger trg_audit_rh_rescisao_itens
  after insert or update or delete on public.rh_rescisao_itens
  for each row execute function public.fn_audit();

-- =====================================================================
-- 4. Os avos
-- =====================================================================
--
-- As duas funções contam MESES com pelo menos 15 dias trabalhados, e as duas
-- chamam `fn_folha_avos_do_mes` para decidir isso. É de propósito: a regra de
-- "quantos dias deste mês esta pessoa trabalhou" passa a existir num lugar só,
-- e a folha e a rescisão nunca podem discordar sobre o mesmo mês.

create or replace function public.fn_rescisao_avos_13(p_admissao date, p_data_fim date)
returns integer
language sql
stable
set search_path to ''
as $$
  select least(count(*), 12)::integer
  from generate_series(
    -- Começa em janeiro do ano do desligamento, ou no mês da admissão quando
    -- a pessoa entrou neste mesmo ano.
    greatest(date_trunc('year', p_data_fim)::date, date_trunc('month', coalesce(p_admissao, p_data_fim))::date),
    date_trunc('month', p_data_fim)::date,
    interval '1 month'
  ) m
  where p_admissao is not null
    and public.fn_folha_avos_do_mes(p_admissao, p_data_fim, m::date) >= 15;
$$;

comment on function public.fn_rescisao_avos_13(date, date) is
  'Avos de 12 do 13º: meses do ano do desligamento com 15 dias ou mais trabalhados. Sem data de admissão devolve 0 — não dá para contar mês de quem não tem começo.';

create or replace function public.fn_rescisao_avos_ferias(p_admissao date, p_data_fim date)
returns integer
language sql
stable
set search_path to ''
as $$
  -- O período aquisitivo em curso começa no último aniversário de admissão.
  -- `age` dá os anos COMPLETOS, então somar isso à admissão cai exatamente nele.
  select least(count(*), 12)::integer
  from (
    select (p_admissao + make_interval(years => extract(year from age(p_data_fim, p_admissao))::integer))::date as ini
    where p_admissao is not null
  ) p,
  lateral generate_series(date_trunc('month', p.ini)::date, date_trunc('month', p_data_fim)::date, interval '1 month') m
  -- Passa `p.ini` no lugar da admissão: o que se conta é o dia trabalhado
  -- DENTRO deste período aquisitivo, não desde que a pessoa foi contratada.
  where public.fn_folha_avos_do_mes(p.ini, p_data_fim, m::date) >= 15;
$$;

comment on function public.fn_rescisao_avos_ferias(date, date) is
  'Avos de 12 das férias proporcionais: meses do período aquisitivo em curso com 15 dias ou mais trabalhados.';

create or replace function public.fn_rescisao_periodos_vencidos(p_colaborador uuid, p_data_fim date)
returns integer
language sql
stable
set search_path to ''
as $$
  -- Períodos aquisitivos COMPLETOS desde a admissão, menos os que já foram
  -- gozados. É uma PISTA para a tela, não o valor que entra na conta: rh_ferias
  -- está com zero linha, então para quem trabalha desde 2010 este número diria
  -- 16 períodos vencidos, que é falso e caro. Quem informa é o Tiago.
  select greatest(
    extract(year from age(p_data_fim, c.data_admissao))::integer
      - (select count(*) from public.rh_ferias f
         where f.colaborador_id = c.id and f.status = 'gozada'),
    0)
  from public.colaboradores c
  where c.id = p_colaborador and c.data_admissao is not null;
$$;

comment on function public.fn_rescisao_periodos_vencidos(uuid, date) is
  'PISTA para a tela: períodos aquisitivos completos menos as férias registradas como gozadas. Não alimenta o cálculo — rh_ferias está vazia e o número seria alto e falso.';

revoke all on function public.fn_rescisao_avos_13(date, date) from public;
revoke all on function public.fn_rescisao_avos_ferias(date, date) from public;
revoke all on function public.fn_rescisao_periodos_vencidos(uuid, date) from public;
grant execute on function public.fn_rescisao_avos_13(date, date) to authenticated;
grant execute on function public.fn_rescisao_avos_ferias(date, date) to authenticated;
grant execute on function public.fn_rescisao_periodos_vencidos(uuid, date) to authenticated;

-- =====================================================================
-- 5. Gravar um item, respeitando a edição manual
-- =====================================================================
--
-- Um lugar só decide "o valor calculado vale, a não ser que alguém tenha
-- digitado outro". Espalhar esse `coalesce` pelas nove verbas faria a décima
-- nascer sem ele, e o valor digitado sumiria em silêncio no primeiro Recalcular
-- — exatamente o defeito que o snapshot da folha existe para evitar.

create or replace function public.fn_rescisao_gravar_item(
  p_rescisao uuid,
  p_ordem smallint,
  p_codigo text,
  p_descricao text,
  p_natureza text,
  p_referencia text,
  p_calculado numeric,
  p_manuais jsonb
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_editado boolean := p_manuais ? p_codigo;
begin
  insert into public.rh_rescisao_itens
    (rescisao_id, ordem, codigo, descricao, natureza, referencia, valor, editado_manualmente)
  values
    (p_rescisao, p_ordem, p_codigo, p_descricao, p_natureza,
     -- A referência do calculado deixa de valer quando o valor foi digitado:
     -- "9/12 avos" ao lado de um número que não é 9/12 do salário é pior que
     -- referência nenhuma.
     case when v_editado then null else p_referencia end,
     round(coalesce(case when v_editado then (p_manuais ->> p_codigo)::numeric end, p_calculado), 2),
     v_editado);
end $$;

revoke all on function public.fn_rescisao_gravar_item(uuid, smallint, text, text, text, text, numeric, jsonb) from public, anon, authenticated;

create or replace function public.fn_rescisao_recalcular_totais(p_rescisao uuid)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.rh_rescisoes r
  set valor_proventos = t.proventos,
      valor_descontos = t.descontos,
      -- O líquido não desce de zero: rescisão em que o desconto passa o
      -- provento é dívida do colaborador com a empresa, e isso é cobrança, não
      -- conta a pagar. O número negativo viraria um pagamento invertido.
      valor_liquido = greatest(t.proventos - t.descontos, 0),
      updated_at = now()
  from (
    select coalesce(sum(valor) filter (where natureza = 'provento'), 0) as proventos,
           coalesce(sum(valor) filter (where natureza = 'desconto'), 0) as descontos
    from public.rh_rescisao_itens where rescisao_id = p_rescisao
  ) t
  where r.id = p_rescisao;
$$;

revoke all on function public.fn_rescisao_recalcular_totais(uuid) from public, anon, authenticated;

-- =====================================================================
-- 6. Gerar (e regerar) a rescisão
-- =====================================================================
--
-- Regerar é o mesmo caminho de gerar, como na folha: apaga os itens e
-- reconstrói. E, como na folha, o que o Tiago digitou sobrevive — por SNAPSHOT
-- tirado antes do delete, indexado por `codigo` (o id do item morre no delete).
-- As linhas LIVRES também são fotografadas e recolocadas: elas não têm cálculo
-- que as recrie, e um Recalcular que as apagasse comeria a pensão alimentícia
-- que alguém acabou de lançar.

create or replace function public.fn_gerar_rescisao(
  p_colaborador uuid,
  p_tipo text,
  p_data_desligamento date,
  p_aviso text,
  p_data_aviso date default null,
  p_saldo_fgts numeric default 0,
  p_ferias_vencidas_periodos integer default 0,
  p_remuneracao_base numeric default null,
  p_data_vencimento date default null,
  p_observacao text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_res uuid; v_status text;
  v_nome text; v_sal numeric; v_adm date; v_cc uuid; v_vinculo text;
  v_manuais jsonb := '{}'::jsonb;
  v_livres jsonb := '[]'::jsonb;
  v_liv jsonb;
  v_rem numeric;
  v_dias_base smallint; v_dias_ano smallint; v_dias_teto smallint; v_multa_pct numeric;
  v_anos integer; v_dias_aviso integer; v_data_proj date;
  v_avos13 integer; v_avosf integer;
  v_valor numeric;
  v_ordem smallint;
begin
  if not public.tem_permissao('rh.rescisoes', 'criar') then
    raise exception 'Sem permissao para gerar rescisao';
  end if;

  select c.nome, coalesce(c.salario, 0), c.data_admissao, c.centro_custo_id, c.vinculo
    into v_nome, v_sal, v_adm, v_cc, v_vinculo
  from public.colaboradores c where c.id = p_colaborador;

  if v_nome is null then raise exception 'Colaborador nao encontrado'; end if;

  -- Rescisao e do contrato CLT. Terceiro e diarista nao tem aviso previo, 13o
  -- proporcional nem multa de FGTS -- o vinculo e outro. Desligar um terceiro
  -- se faz pelo cadastro (data de demissao e motivo), sem documento de
  -- rescisao, que ali significaria zero.
  if v_vinculo <> 'clt' then
    raise exception 'A rescisao e do contrato CLT, e % esta cadastrado como "%". Para desligar, preencha a data de demissao no cadastro do colaborador.', v_nome, v_vinculo;
  end if;

  v_rem := round(coalesce(nullif(p_remuneracao_base, 0), v_sal), 2);
  if v_rem <= 0 then
    raise exception 'A rescisao de % nao tem remuneracao base: o cadastro esta sem salario. Preencha o salario no colaborador, ou informe a base na propria rescisao.', v_nome;
  end if;

  if v_adm is not null and p_data_desligamento < v_adm then
    raise exception 'O desligamento (%) e anterior a admissao (%).', p_data_desligamento, v_adm;
  end if;

  -- O aviso que cada tipo admite. Recusar aqui, com o nome do tipo na mensagem,
  -- e melhor que aceitar e depois nao gerar a verba: uma demissao sem justa
  -- causa marcada como "nao se aplica" sairia sem aviso nenhum, parecendo certa.
  if p_tipo = 'sem_justa_causa' and p_aviso not in ('indenizado', 'trabalhado') then
    raise exception 'Demissao sem justa causa tem aviso previo indenizado ou trabalhado.';
  elsif p_tipo = 'pedido_demissao' and p_aviso not in ('trabalhado', 'nao_cumprido') then
    raise exception 'No pedido de demissao o aviso e trabalhado ou nao cumprido.';
  elsif p_tipo in ('termino_experiencia', 'justa_causa') and p_aviso <> 'nao_se_aplica' then
    raise exception 'Nao ha aviso previo em termino de experiencia nem em justa causa.';
  end if;

  select aviso_previo_dias_base, aviso_previo_dias_por_ano, aviso_previo_dias_teto, multa_fgts_percentual
    into v_dias_base, v_dias_ano, v_dias_teto, v_multa_pct
  from public.folha_parametros where id = 1;

  select id, status into v_res, v_status
  from public.rh_rescisoes where colaborador_id = p_colaborador and excluido_em is null;

  if v_res is not null and v_status <> 'rascunho' then
    raise exception 'A rescisao de % esta em "%": so da para recalcular em rascunho. Rejeite ou desaprove antes.', v_nome, v_status;
  end if;

  if v_res is not null then
    -- Snapshot ANTES do delete: os valores digitados e as linhas livres.
    select coalesce(jsonb_object_agg(codigo, valor) filter (where editado_manualmente and codigo is not null), '{}'::jsonb),
           coalesce(jsonb_agg(jsonb_build_object('descricao', descricao, 'natureza', natureza, 'valor', valor))
                    filter (where codigo is null), '[]'::jsonb)
      into v_manuais, v_livres
    from public.rh_rescisao_itens where rescisao_id = v_res;

    delete from public.rh_rescisao_itens where rescisao_id = v_res;

    update public.rh_rescisoes
       set tipo = p_tipo, aviso = p_aviso, data_aviso = p_data_aviso,
           data_desligamento = p_data_desligamento,
           data_vencimento = coalesce(p_data_vencimento, p_data_desligamento + 10),
           remuneracao_base = v_rem, saldo_fgts = coalesce(p_saldo_fgts, 0),
           ferias_vencidas_periodos = coalesce(p_ferias_vencidas_periodos, 0),
           observacao = p_observacao, centro_custo_id = v_cc, updated_at = now()
     where id = v_res;
  else
    insert into public.rh_rescisoes
      (numero, colaborador_id, tipo, aviso, data_aviso, data_desligamento, data_vencimento,
       remuneracao_base, saldo_fgts, ferias_vencidas_periodos, observacao, centro_custo_id, created_by)
    values
      (public.proximo_numero_documento('RES'), p_colaborador, p_tipo, p_aviso, p_data_aviso,
       p_data_desligamento, coalesce(p_data_vencimento, p_data_desligamento + 10),
       v_rem, coalesce(p_saldo_fgts, 0), coalesce(p_ferias_vencidas_periodos, 0),
       p_observacao, v_cc, (select auth.uid()))
    returning id into v_res;
  end if;

  -- ===== Aviso previo =====
  v_anos := case when v_adm is null then 0
                 else extract(year from age(p_data_desligamento, v_adm))::integer end;
  v_dias_aviso := least(v_dias_base + v_dias_ano * v_anos, v_dias_teto);

  -- Projecao: o aviso INDENIZADO conta como tempo de servico para os avos, e e
  -- por isso que ele muda o 13o e as ferias. Aviso trabalhado nao projeta nada:
  -- os dias ja sao dias trabalhados de verdade, e a folha os paga.
  v_data_proj := case when p_aviso = 'indenizado' then p_data_desligamento + v_dias_aviso
                      else p_data_desligamento end;

  if p_tipo = 'sem_justa_causa' and p_aviso = 'indenizado' then
    perform public.fn_rescisao_gravar_item(v_res, 10::smallint, 'aviso_previo_indenizado',
      'Aviso previo indenizado', 'provento',
      v_dias_aviso || ' dias' ||
        case when v_anos > 0 then ' (' || v_dias_base || ' + ' || (v_dias_ano * v_anos) || ' por ' || v_anos || ' anos)' else '' end,
      round(v_rem / 30 * v_dias_aviso, 2), v_manuais);
  end if;

  -- ===== 13o proporcional =====
  if p_tipo <> 'justa_causa' then
    v_avos13 := public.fn_rescisao_avos_13(v_adm, v_data_proj);
    perform public.fn_rescisao_gravar_item(v_res, 20::smallint, 'decimo_terceiro_proporcional',
      '13o salario proporcional', 'provento',
      v_avos13 || '/12 avos',
      round(v_rem / 12 * v_avos13, 2), v_manuais);
  end if;

  -- ===== Ferias vencidas + 1/3 =====
  -- Entram nos QUATRO tipos, justa causa inclusive: e periodo aquisitivo ja
  -- completado que a pessoa nao gozou.
  -- Duas linhas, e nao uma de 4/3: e assim que o TRCT mostra, e separadas as
  -- duas ficam editaveis em separado.
  v_valor := round(v_rem * coalesce(p_ferias_vencidas_periodos, 0), 2);
  perform public.fn_rescisao_gravar_item(v_res, 30::smallint, 'ferias_vencidas',
    'Ferias vencidas', 'provento',
    coalesce(p_ferias_vencidas_periodos, 0) || ' periodo(s)', v_valor, v_manuais);
  perform public.fn_rescisao_gravar_item(v_res, 31::smallint, 'ferias_vencidas_terco',
    '1/3 sobre ferias vencidas', 'provento', '1/3', round(v_valor / 3, 2), v_manuais);

  -- ===== Ferias proporcionais + 1/3 =====
  if p_tipo <> 'justa_causa' then
    v_avosf := public.fn_rescisao_avos_ferias(v_adm, v_data_proj);
    v_valor := round(v_rem / 12 * v_avosf, 2);
    perform public.fn_rescisao_gravar_item(v_res, 40::smallint, 'ferias_proporcionais',
      'Ferias proporcionais', 'provento', v_avosf || '/12 avos', v_valor, v_manuais);
    perform public.fn_rescisao_gravar_item(v_res, 41::smallint, 'ferias_proporcionais_terco',
      '1/3 sobre ferias proporcionais', 'provento', '1/3', round(v_valor / 3, 2), v_manuais);
  end if;

  -- ===== Multa do FGTS =====
  -- O ERP nao conhece o saldo do FGTS (ele vive na Caixa), entao o saldo e
  -- informado e o percentual e aplicado sobre ele. A linha aparece com zero
  -- quando o saldo nao foi informado: some-la esconderia do documento que a
  -- multa existe e ficou faltando.
  if p_tipo = 'sem_justa_causa' then
    perform public.fn_rescisao_gravar_item(v_res, 50::smallint, 'multa_fgts',
      'Multa rescisoria do FGTS', 'provento',
      trim(to_char(v_multa_pct, 'FM999990.####')) || '% de ' ||
        trim(to_char(coalesce(p_saldo_fgts, 0), 'FM999G999G990D00')),
      round(coalesce(p_saldo_fgts, 0) * v_multa_pct / 100, 2), v_manuais);
  end if;

  -- ===== Aviso nao cumprido =====
  -- Desconto dos dias BASE, sem o acrescimo por tempo de casa: o acrescimo e
  -- direito do empregado, nao obrigacao dele quando e ele quem pede para sair.
  if p_tipo = 'pedido_demissao' and p_aviso = 'nao_cumprido' then
    perform public.fn_rescisao_gravar_item(v_res, 70::smallint, 'aviso_nao_cumprido',
      'Aviso previo nao cumprido', 'desconto',
      v_dias_base || ' dias', round(v_rem / 30 * v_dias_base, 2), v_manuais);
  end if;

  -- ===== INSS e IRRF =====
  -- Nascem ZERADOS e editaveis, de proposito. folha_inss_faixas e
  -- folha_irrf_faixas estao com zero linha desde julho, e quais verbas de
  -- rescisao sao tributadas e regra fiscal que ninguem declarou aqui. Um
  -- calculo em cima de tabela vazia daria zero com cara de conta feita.
  perform public.fn_rescisao_gravar_item(v_res, 60::smallint, 'inss',
    'INSS', 'desconto', null, 0, v_manuais);
  perform public.fn_rescisao_gravar_item(v_res, 61::smallint, 'irrf',
    'IRRF', 'desconto', null, 0, v_manuais);

  -- ===== Linhas livres, de volta =====
  v_ordem := 90;
  for v_liv in select * from jsonb_array_elements(v_livres)
  loop
    insert into public.rh_rescisao_itens
      (rescisao_id, ordem, codigo, descricao, natureza, valor, editado_manualmente)
    values
      (v_res, v_ordem, null, v_liv ->> 'descricao', v_liv ->> 'natureza',
       (v_liv ->> 'valor')::numeric, true);
    v_ordem := v_ordem + 1;
  end loop;

  perform public.fn_rescisao_recalcular_totais(v_res);
  return v_res;
end $$;

revoke all on function public.fn_gerar_rescisao(uuid, text, date, text, date, numeric, integer, numeric, date, text) from public, anon;
grant execute on function public.fn_gerar_rescisao(uuid, text, date, text, date, numeric, integer, numeric, date, text) to authenticated;

-- =====================================================================
-- 7. Editar valor, e as linhas livres
-- =====================================================================
--
-- "ERP calcula mas eu posso editar todos os valores" (Tiago, 29/08/2026). A
-- marca `editado_manualmente` e o que faz o valor digitado sobreviver ao
-- Recalcular; sem ela o proximo clique devolveria o numero calculado em
-- silencio, que e o defeito que o snapshot da folha existe para evitar.

create or replace function public.fn_editar_item_rescisao(p_item uuid, p_valor numeric)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_res uuid; v_status text; v_nome text;
begin
  if not public.tem_permissao('rh.rescisoes', 'editar') then
    raise exception 'Sem permissao para editar a rescisao';
  end if;
  if p_valor is null or p_valor < 0 then
    raise exception 'O valor da verba nao pode ser negativo. Para inverter o sinal, use uma linha de desconto.';
  end if;

  select i.rescisao_id, r.status, c.nome into v_res, v_status, v_nome
  from public.rh_rescisao_itens i
  join public.rh_rescisoes r on r.id = i.rescisao_id
  join public.colaboradores c on c.id = r.colaborador_id
  where i.id = p_item;

  if v_res is null then raise exception 'Verba nao encontrada'; end if;
  if v_status <> 'rascunho' then
    raise exception 'A rescisao de % esta em "%": so da para editar em rascunho.', v_nome, v_status;
  end if;

  update public.rh_rescisao_itens
     set valor = round(p_valor, 2), editado_manualmente = true,
         -- A referencia do calculo deixa de valer: "9/12 avos" ao lado de um
         -- numero que nao e 9/12 do salario mente mais do que nao dizer nada.
         referencia = null
   where id = p_item;

  perform public.fn_rescisao_recalcular_totais(v_res);
end $$;

create or replace function public.fn_adicionar_item_rescisao(
  p_rescisao uuid, p_descricao text, p_natureza text, p_valor numeric
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text; v_nome text; v_id uuid; v_ordem smallint;
begin
  if not public.tem_permissao('rh.rescisoes', 'editar') then
    raise exception 'Sem permissao para editar a rescisao';
  end if;
  if p_descricao is null or length(btrim(p_descricao, E' \t\r\n')) = 0 then
    raise exception 'Descreva a verba';
  end if;
  if p_natureza not in ('provento', 'desconto') then
    raise exception 'A verba e provento ou desconto';
  end if;
  if p_valor is null or p_valor < 0 then
    raise exception 'O valor da verba nao pode ser negativo';
  end if;

  select r.status, c.nome into v_status, v_nome
  from public.rh_rescisoes r join public.colaboradores c on c.id = r.colaborador_id
  where r.id = p_rescisao and r.excluido_em is null;

  if v_status is null then raise exception 'Rescisao nao encontrada'; end if;
  if v_status <> 'rascunho' then
    raise exception 'A rescisao de % esta em "%": so da para editar em rascunho.', v_nome, v_status;
  end if;

  select coalesce(max(ordem), 89) + 1 into v_ordem
  from public.rh_rescisao_itens where rescisao_id = p_rescisao;

  insert into public.rh_rescisao_itens
    (rescisao_id, ordem, codigo, descricao, natureza, valor, editado_manualmente)
  values
    (p_rescisao, greatest(v_ordem, 90)::smallint, null,
     btrim(p_descricao, E' \t\r\n'), p_natureza, round(p_valor, 2), true)
  returning id into v_id;

  perform public.fn_rescisao_recalcular_totais(p_rescisao);
  return v_id;
end $$;

create or replace function public.fn_remover_item_rescisao(p_item uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_res uuid; v_status text; v_codigo text; v_nome text;
begin
  if not public.tem_permissao('rh.rescisoes', 'editar') then
    raise exception 'Sem permissao para editar a rescisao';
  end if;

  select i.rescisao_id, i.codigo, r.status, c.nome into v_res, v_codigo, v_status, v_nome
  from public.rh_rescisao_itens i
  join public.rh_rescisoes r on r.id = i.rescisao_id
  join public.colaboradores c on c.id = r.colaborador_id
  where i.id = p_item;

  if v_res is null then raise exception 'Verba nao encontrada'; end if;
  if v_status <> 'rascunho' then
    raise exception 'A rescisao de % esta em "%": so da para editar em rascunho.', v_nome, v_status;
  end if;

  -- So a linha acrescentada a mao some. Apagar uma verba CALCULADA seria uma
  -- armadilha: ela voltaria sozinha no proximo Recalcular, e quem apagou nao
  -- ficaria sabendo. Para tirar uma verba calculada da conta, zere o valor —
  -- ela continua no documento, dizendo que vale R$ 0,00, que e informacao.
  if v_codigo is not null then
    raise exception 'Esta verba e calculada pelo sistema e voltaria no proximo Recalcular. Para tira-la da conta, coloque o valor em R$ 0,00.';
  end if;

  delete from public.rh_rescisao_itens where id = p_item;
  perform public.fn_rescisao_recalcular_totais(v_res);
end $$;

revoke all on function public.fn_editar_item_rescisao(uuid, numeric) from public, anon;
revoke all on function public.fn_adicionar_item_rescisao(uuid, text, text, numeric) from public, anon;
revoke all on function public.fn_remover_item_rescisao(uuid) from public, anon;
grant execute on function public.fn_editar_item_rescisao(uuid, numeric) to authenticated;
grant execute on function public.fn_adicionar_item_rescisao(uuid, text, text, numeric) to authenticated;
grant execute on function public.fn_remover_item_rescisao(uuid) to authenticated;

-- =====================================================================
-- 8. A maquina de status
-- =====================================================================

create or replace function public.fn_enviar_rescisao_aprovacao(p_rescisao uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text; v_nome text; v_itens int;
begin
  if not public.tem_permissao('rh.rescisoes', 'editar') then
    raise exception 'Sem permissao para editar a rescisao';
  end if;

  select r.status, c.nome into v_status, v_nome
  from public.rh_rescisoes r join public.colaboradores c on c.id = r.colaborador_id
  where r.id = p_rescisao and r.excluido_em is null for update;

  if v_status is null then raise exception 'Rescisao nao encontrada'; end if;
  if v_status <> 'rascunho' then
    raise exception 'A rescisao de % esta em "%": so da para enviar rascunho para aprovacao.', v_nome, v_status;
  end if;

  select count(*) into v_itens
  from public.rh_rescisao_itens where rescisao_id = p_rescisao and valor > 0;
  if v_itens = 0 then
    raise exception 'A rescisao de % esta zerada. Confira as verbas antes de enviar para aprovacao.', v_nome;
  end if;

  update public.rh_rescisoes
     set status = 'pendente_aprovacao', motivo_rejeicao = null, updated_at = now()
   where id = p_rescisao;
end $$;

create or replace function public.fn_rejeitar_rescisao(p_rescisao uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text; v_nome text;
begin
  if not public.tem_permissao('rh.rescisoes', 'aprovar') then
    raise exception 'Sem permissao para aprovar ou rejeitar a rescisao';
  end if;
  if p_motivo is null or length(btrim(p_motivo, E' \t\r\n')) = 0 then
    raise exception 'Informe o motivo da rejeicao';
  end if;

  select r.status, c.nome into v_status, v_nome
  from public.rh_rescisoes r join public.colaboradores c on c.id = r.colaborador_id
  where r.id = p_rescisao and r.excluido_em is null for update;

  if v_status is null then raise exception 'Rescisao nao encontrada'; end if;
  if v_status <> 'pendente_aprovacao' then
    raise exception 'A rescisao de % esta em "%": so da para rejeitar o que esta pendente de aprovacao.', v_nome, v_status;
  end if;

  update public.rh_rescisoes
     set status = 'rascunho', motivo_rejeicao = btrim(p_motivo, E' \t\r\n'), updated_at = now()
   where id = p_rescisao;
end $$;

-- Aprovar faz TRES coisas na mesma transacao: muda o status, DESLIGA a pessoa e
-- gera a conta a pagar. E o que o pedido descreve ("gera a rescisao e desliga
-- ele da empresa"), e as tres juntas porque separadas produziriam estados sem
-- sentido: rescisao aprovada com a pessoa ainda ativa, ou pessoa desligada sem
-- ninguem devendo o acerto a ela.
create or replace function public.fn_aprovar_rescisao(p_rescisao uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_r record; v_nome text; v_comp date;
  v_uid uuid := (select auth.uid());
  v_lanc uuid; v_parcela uuid; v_venc date;
  v_aprova_pgto boolean := public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar');
  v_st_parcela text;
begin
  if not public.tem_permissao('rh.rescisoes', 'aprovar') then
    raise exception 'Sem permissao para aprovar a rescisao';
  end if;

  select r.*, c.nome into v_r
  from public.rh_rescisoes r join public.colaboradores c on c.id = r.colaborador_id
  where r.id = p_rescisao and r.excluido_em is null for update;

  -- `found`, e nao `v_r.id is null`: ler campo de record depois de um SELECT
  -- INTO sem linha e caminho para erro de runtime, e o erro nao diria que a
  -- rescisao simplesmente nao existe.
  if not found then raise exception 'Rescisao nao encontrada'; end if;
  v_nome := v_r.nome;

  if v_r.status <> 'pendente_aprovacao' then
    raise exception 'A rescisao de % esta em "%": so da para aprovar o que esta pendente de aprovacao.', v_nome, v_r.status;
  end if;

  v_comp := date_trunc('month', v_r.data_desligamento)::date;
  perform public.fn_exigir_competencia_aberta(v_comp, 'rescisao', p_rescisao);

  v_st_parcela := case when v_aprova_pgto then 'aprovado' else 'pendente' end;
  v_venc := coalesce(v_r.data_vencimento, v_r.data_desligamento + 10);

  -- ===== 1. Desliga =====
  -- `ativo = false` E a data: a data e o que a folha usa para proporcionalizar
  -- o mes da saida (ver fn_folha_avos_do_mes), e `ativo` e o que tira a pessoa
  -- das telas e das folhas seguintes. Uma sem a outra deixa metade do
  -- desligamento feito.
  update public.colaboradores
     set ativo = false,
         data_demissao = v_r.data_desligamento,
         tipo_rescisao = v_r.tipo,
         motivo_desligamento = coalesce(nullif(btrim(coalesce(v_r.observacao, ''), E' \t\r\n'), ''),
                                        'Rescisao ' || v_r.numero),
         updated_at = now()
   where id = v_r.colaborador_id;

  -- ===== 2. A conta a pagar =====
  -- Liquido zero nao gera lancamento: pode acontecer (justa causa sem periodo
  -- vencido), e conta a pagar de R$ 0,00 e sujeira na fila de pagamento.
  if v_r.valor_liquido > 0 then
    if v_aprova_pgto and v_venc is null then
      raise exception 'A rescisao esta sem data de vencimento, e o pagamento nasce aprovado. Volte para rascunho e informe a data.';
    end if;

    insert into public.lancamentos
      (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
       data_compra, mes_competencia, data_vencimento, created_by)
    values
      ('a_pagar', 'rescisao', p_rescisao, v_r.centro_custo_id,
       'Rescisao ' || v_nome || ' ' || v_r.numero,
       v_r.valor_liquido, 'a_pagar',
       (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc, v_uid)
    returning id into v_lanc;

    insert into public.lancamento_parcelas
      (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by,
       aprovado_por, aprovado_em, data_programada, data_programada_origem)
    values (v_lanc, 1, v_r.valor_liquido, v_venc, v_st_parcela, v_uid,
       case when v_aprova_pgto then v_uid end,
       case when v_aprova_pgto then now() end,
       case when v_aprova_pgto then v_venc end,
       case when v_aprova_pgto then 'vencimento' end)
    returning id into v_parcela;

    if v_aprova_pgto then
      insert into public.parcela_eventos (parcela_id, tipo, data_para, created_by)
      values (v_parcela, 'aprovou', v_venc, v_uid);
    end if;

    if v_r.centro_custo_id is not null then
      insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
      values (v_lanc, v_r.centro_custo_id, v_r.valor_liquido, v_uid);
    end if;
  end if;

  update public.rh_rescisoes
     set status = 'aprovado', aprovado_por = v_uid, aprovado_em = now(),
         motivo_rejeicao = null, lancamento_id = v_lanc, updated_at = now()
   where id = p_rescisao;
end $$;

create or replace function public.fn_desaprovar_rescisao(p_rescisao uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text; v_nome text; v_lanc uuid; v_colab uuid; v_qtd int;
begin
  if not public.tem_permissao('rh.rescisoes', 'desaprovar') then
    raise exception 'Sem permissao para desaprovar a rescisao';
  end if;
  if p_motivo is null or length(btrim(p_motivo, E' \t\r\n')) = 0 then
    raise exception 'Informe o motivo da desaprovacao';
  end if;

  select r.status, r.lancamento_id, r.colaborador_id, c.nome
    into v_status, v_lanc, v_colab, v_nome
  from public.rh_rescisoes r join public.colaboradores c on c.id = r.colaborador_id
  where r.id = p_rescisao and r.excluido_em is null for update;

  if v_status is null then raise exception 'Rescisao nao encontrada'; end if;
  if v_status <> 'aprovado' then
    raise exception 'A rescisao de % esta em "%": so da para desaprovar rescisao aprovada.', v_nome, v_status;
  end if;

  if v_lanc is not null then
    -- Trava as parcelas ANTES de olhar o status delas. Sem o lock a consulta e
    -- um SELECT em read committed: leria a versao anterior de uma parcela sendo
    -- paga em outra sessao, passaria, e a cascade do delete a apagaria pelo
    -- match da FK. Mesma protecao da fn_desaprovar_folha.
    perform 1 from public.lancamento_parcelas pa
    where pa.lancamento_id = v_lanc for update of pa;

    select count(*) into v_qtd
    from public.lancamento_parcelas pa
    left join public.extrato_transacoes et on et.parcela_id = pa.id
    where pa.lancamento_id = v_lanc and (pa.status = 'pago' or et.id is not null);

    if v_qtd > 0 then
      raise exception 'Nao da para desaprovar a rescisao de %: o pagamento ja foi pago ou conciliado com o extrato. Estorne o pagamento primeiro.', v_nome;
    end if;

    -- Solta o vinculo antes do delete: rh_rescisoes.lancamento_id e FK simples,
    -- sem on delete set null, e apagar o lancamento com a rescisao ainda
    -- apontando para ele estoura a FK no meio da desaprovacao.
    update public.rh_rescisoes set lancamento_id = null where id = p_rescisao;
    delete from public.lancamentos where id = v_lanc;
  end if;

  -- Religa a pessoa. Desaprovar a rescisao e dizer que o desligamento nao
  -- valeu: deixar `ativo = false` e a data no cadastro faria a folha do mes
  -- seguinte continuar sem ela, sem nenhum documento explicando por que.
  update public.colaboradores
     set ativo = true, data_demissao = null, tipo_rescisao = null,
         motivo_desligamento = null, updated_at = now()
   where id = v_colab;

  update public.rh_rescisoes
     set status = 'rascunho', aprovado_por = null, aprovado_em = null,
         motivo_rejeicao = btrim(p_motivo, E' \t\r\n'), updated_at = now()
   where id = p_rescisao;
end $$;

create or replace function public.fn_excluir_rescisao(p_rescisao uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text; v_nome text;
begin
  if not public.tem_permissao('rh.rescisoes', 'excluir') then
    raise exception 'Sem permissao para excluir a rescisao';
  end if;
  if p_motivo is null or length(btrim(p_motivo, E' \t\r\n')) = 0 then
    raise exception 'Informe o motivo da exclusao';
  end if;

  select r.status, c.nome into v_status, v_nome
  from public.rh_rescisoes r join public.colaboradores c on c.id = r.colaborador_id
  where r.id = p_rescisao and r.excluido_em is null for update;

  if v_status is null then raise exception 'Rescisao nao encontrada'; end if;
  if v_status = 'aprovado' then
    raise exception 'A rescisao de % esta aprovada e ja desligou a pessoa. Desaprove antes de excluir.', v_nome;
  end if;

  update public.rh_rescisoes
     set excluido_em = now(), excluido_por = (select auth.uid()),
         motivo_exclusao = btrim(p_motivo, E' \t\r\n'), updated_at = now()
   where id = p_rescisao;
end $$;

revoke all on function public.fn_enviar_rescisao_aprovacao(uuid) from public, anon;
revoke all on function public.fn_rejeitar_rescisao(uuid, text) from public, anon;
revoke all on function public.fn_aprovar_rescisao(uuid) from public, anon;
revoke all on function public.fn_desaprovar_rescisao(uuid, text) from public, anon;
revoke all on function public.fn_excluir_rescisao(uuid, text) from public, anon;
grant execute on function public.fn_enviar_rescisao_aprovacao(uuid) to authenticated;
grant execute on function public.fn_rejeitar_rescisao(uuid, text) to authenticated;
grant execute on function public.fn_aprovar_rescisao(uuid) to authenticated;
grant execute on function public.fn_desaprovar_rescisao(uuid, text) to authenticated;
grant execute on function public.fn_excluir_rescisao(uuid, text) to authenticated;

-- =====================================================================
-- 9. O lancamento aceita a origem "rescisao"
-- =====================================================================
--
-- Sem isto o `insert` da aprovacao estoura no CHECK, e o erro sairia como
-- violacao de constraint no meio de uma transacao que ja desligou a pessoa.

alter table public.lancamentos drop constraint if exists lancamentos_origem_check;
alter table public.lancamentos add constraint lancamentos_origem_check
  check (origem = any (array['oc', 'manual', 'diaria', 'folha', 'folha_guia', 'adiantamento', 'rescisao']));

-- =====================================================================
-- 10. Permissao da aba
-- =====================================================================
--
-- Sem esta parte a aba nasce invisivel para todo mundo, inclusive para o Tiago:
-- `getUsuarioLogado` le `usuario_permissoes` (permissao EFETIVA), nao
-- `perfil_permissoes`, entao conceder ao perfil sem sincronizar o usuario nao
-- faz a tela aparecer.

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'rh.rescisoes', a.acao
from public.perfis p
cross join (values ('ver'), ('criar'), ('editar'), ('excluir'), ('aprovar'), ('desaprovar')) a(acao)
where p.nome in ('Admin', 'RH')
on conflict do nothing;

insert into public.usuario_permissoes (usuario_id, recurso, acao)
select u.id, 'rh.rescisoes', a.acao
from public.usuarios u
join public.perfis p on p.id = u.perfil_id
cross join (values ('ver'), ('criar'), ('editar'), ('excluir'), ('aprovar'), ('desaprovar')) a(acao)
where p.nome in ('Admin', 'RH')
on conflict do nothing;
