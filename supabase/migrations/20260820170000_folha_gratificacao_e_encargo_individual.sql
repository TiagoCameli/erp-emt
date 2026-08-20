-- Gratificacao salarial e encargo individual na folha gerencial.
--
-- Duas necessidades declaradas pelo Tiago que a folha nao atendia:
--
--   1. gratificacao salarial que NAO e afetada pelos encargos;
--   2. percentual de encargo proprio de cada pessoa, porque terceiro e
--      diarista nao carregam o mesmo encargo patronal de um CLT.
--
-- A gratificacao soma no bruto, no liquido e no custo da empresa, mas a base
-- dos encargos e da provisao continua sendo SO o salario base. Isso e regra do
-- Tiago, declarada, nao interpretacao fiscal.
--
-- Os campos vivem em DOIS lugares de proposito:
--   - no cadastro do colaborador: o valor recorrente, que repete todo mes e
--     sobrevive a qualquer regeracao;
--   - no item da folha: o snapshot daquela competencia, que o Tiago pode
--     ajustar a mao no rascunho. `editado_manualmente` marca a linha tocada, e
--     a fn_gerar_folha PRESERVA essas tres colunas ao regerar — senao um
--     Regerar apagaria calado a gratificacao que ele acabou de digitar.

/* ------------------------------------------------------------------ */
/* Cadastro do colaborador: os valores recorrentes                    */
/* ------------------------------------------------------------------ */

alter table public.colaboradores
  add column gratificacao numeric(14,2) not null default 0,
  add column encargos_percentual numeric(7,4);

alter table public.colaboradores
  add constraint colaboradores_gratificacao_nao_negativa
    check (gratificacao >= 0),
  -- Mesma faixa de folha_encargos.percentual (0..100), para os dois caminhos
  -- de encargo aceitarem exatamente o mesmo numero.
  add constraint colaboradores_encargos_percentual_valido
    check (encargos_percentual is null
           or (encargos_percentual >= 0 and encargos_percentual <= 100));

comment on column public.colaboradores.gratificacao is
  'Gratificacao salarial fixa mensal em R$. Soma no bruto, no liquido e no custo da empresa; NAO entra na base dos encargos nem da provisao. Copiada para folha_itens.gratificacao a cada geracao de folha.';

comment on column public.colaboradores.encargos_percentual is
  'Percentual de encargo patronal desta pessoa, sobre o salario base. null = usa os folha_encargos ativos (comportamento historico: uma linha discriminada por encargo). Preenchido = UMA linha "Encargos" em folha_item_encargos, sem grupo de recolhimento e portanto sem guia no Financeiro — e custo gerencial, nao guia a recolher.';

/* ------------------------------------------------------------------ */
/* Item da folha: o snapshot da competencia                           */
/* ------------------------------------------------------------------ */

alter table public.folha_itens
  add column gratificacao numeric(14,2) not null default 0,
  add column encargos_percentual numeric(7,4),
  add column editado_manualmente boolean not null default false;

alter table public.folha_itens
  add constraint folha_itens_gratificacao_nao_negativa
    check (gratificacao >= 0),
  add constraint folha_itens_encargos_percentual_valido
    check (encargos_percentual is null
           or (encargos_percentual >= 0 and encargos_percentual <= 100));

comment on column public.folha_itens.gratificacao is
  'Gratificacao salarial desta competencia, em R$. Fora da base de encargos e de provisao. Entra no bruto, no custo total e no liquido.';

comment on column public.folha_itens.encargos_percentual is
  'Percentual de encargo aplicado NESTE item. null = os encargos vieram discriminados dos folha_encargos ativos (uma linha por encargo). Preenchido = uma unica linha "Encargos" com este percentual sobre o salario base.';

comment on column public.folha_itens.editado_manualmente is
  'true = o Tiago ajustou salario base / gratificacao / percentual de encargo desta linha a mao, pela tela da folha. fn_gerar_folha PRESERVA esses tres valores ao regerar itens marcados assim, em vez de recalcular do cadastro: sem isso, um Regerar apagaria em silencio o que ele digitou.';

/* ------------------------------------------------------------------ */
/* Cabecalho da folha: total de gratificacoes                         */
/* ------------------------------------------------------------------ */

alter table public.folhas
  add column valor_gratificacoes numeric(14,2) not null default 0;

alter table public.folhas
  add constraint folhas_valor_gratificacoes_nao_negativo
    check (valor_gratificacoes >= 0);

comment on column public.folhas.valor_gratificacoes is
  'Soma de folha_itens.gratificacao da folha. Ja embutida em valor_bruto e em custo_total; existe separada so para a tela e a planilha mostrarem quanto do bruto e gratificacao.';

/* ------------------------------------------------------------------ */
/* Diaria: qual folha a assumiu                                       */
/* ------------------------------------------------------------------ */

-- A coluna vem nesta migration, e nao junto das funcoes que a usam, so por
-- ordem: a fn_gerar_folha da proxima migration ja le rh_diarias.folha_id.
--
-- Existem DOIS pagadores possiveis da mesma diaria: o fechamento em
-- /rh/diaristas (fn_fechar_diarias) e agora a folha, porque diarista passa a
-- entrar nela. `lancamento_id` sozinho nao serve como marca de "ja paga": um
-- item de folha com liquido zero (o adiantamento do mes comeu tudo) NAO gera
-- lancamento, e a diaria ficaria com lancamento_id null — em aberto aos olhos
-- do fechamento — mesmo tendo sido consumida pela folha. folha_id fecha esse
-- buraco: "esta diaria ja foi processada por esta folha", com ou sem caixa.
alter table public.rh_diarias
  add column folha_id uuid references public.folhas(id);

create index rh_diarias_folha_id_idx
  on public.rh_diarias (folha_id) where folha_id is not null;

comment on column public.rh_diarias.folha_id is
  'Folha que assumiu esta diaria (preenchido na aprovacao da folha, limpo na desaprovacao). Diaria com folha_id preenchido NAO esta mais em aberto: nem a folha nem o fechamento em /rh/diaristas podem paga-la de novo. Independente de lancamento_id, que fica null quando o item da folha sai com liquido zero.';
