-- Aplicada por apply_migration em 25/08/2026. Os COMANDOS aqui sao os que
-- rodaram, um por um; os comentarios da versao aplicada foram condensados, e os
-- longos abaixo sao a versao completa do raciocinio. A verdade sobre o banco esta
-- em pg_get_functiondef, nao neste arquivo.
--
-- Lançamento criado pelo RH nasce completo: quem recebe, em que categoria entra,
-- por qual forma sai e quando vence.
--
-- O que o dono viu: LAN-2026-6522, "Diarias MARIA EVANILDE SILVA NASCIMENTO
-- 08/2026", R$ 432,24, com fornecedor, categoria, forma, condição e vencimento
-- todos vazios. Medido antes de mexer: era o único lançamento de origem `diaria`
-- que existe, então dá para acertar o padrão antes do volume.
--
-- A divisão que organiza esta migration:
--
--   DERIVÁVEL  -> trigger. Colaborador e categoria saem do cadastro, sempre, sem
--                 ninguém digitar. Um trigger em `lancamentos` cobre os TRÊS
--                 caminhos do RH de uma vez (folha, diária, adiantamento) e
--                 cobre também o caminho que alguém criar amanhã.
--   ESCOLHIDO  -> parâmetro de função. Forma de pagamento e vencimento são
--                 decisão de quem fecha (decisão do dono), então têm de vir da
--                 tela; trigger nenhum pode adivinhá-los.
--
-- Fora desta migration, de propósito: os lançamentos de GUIA (INSS, FGTS), que
-- usam `origem = 'folha_guia'`. Eles são a empresa pagando o governo, não uma
-- pessoa: não têm colaborador, e a categoria de cada grupo de recolhimento é uma
-- decisão contábil em aberto. Hoje eles nem nascem, porque
-- `folha_parametros.grupo_recolhimento_inss/irrf` estão vazios -- a tabela inteira
-- está vazia. O `when` do trigger os exclui nominalmente.

-- ===========================================================================
-- 1. Quem recebe: o lançamento passa a apontar o COLABORADOR
-- ===========================================================================
-- Por que coluna nova em vez de reusar `fornecedor_id`: colaborador e fornecedor
-- são cadastros diferentes, e medido em 25/08/2026 só 9 dos 59 colaboradores
-- existem também como fornecedor (conferido por CPF, não por nome). Apontar
-- `fornecedor_id` exigiria cadastrar ~50 pessoas em dobro, e toda admissão nova
-- passaria a precisar de dois cadastros -- esquecer um devolve o campo vazio que
-- esta migration existe para fechar.
alter table public.lancamentos
  add column if not exists colaborador_id uuid references public.colaboradores(id);

comment on column public.lancamentos.colaborador_id is
  'Quem recebe, quando o pagamento vem do RH (folha, diária, adiantamento). '
  'Exclusivo com fornecedor_id na prática: empresa recebe por fornecedor, '
  'pessoa da folha recebe por aqui. Preenchido pelo trigger '
  'trg_rh_completar_lancamento a partir da origem, nunca digitado.';

-- Parcial: a esmagadora maioria dos lançamentos não é do RH, e índice que
-- indexa nulo em massa só ocupa página.
create index if not exists idx_lancamentos_colaborador
  on public.lancamentos (colaborador_id)
  where colaborador_id is not null;

-- `authenticated` tem SELECT no NÍVEL DA TABELA (conferido antes de escrever
-- isto), então a coluna nova já entra coberta e não precisa de grant novo. E
-- `authenticated` não tem INSERT nem UPDATE em `lancamentos`: toda escrita passa
-- por função SECURITY DEFINER, que é por onde o trigger age.

-- ===========================================================================
-- 2. A categoria que faltava: diária
-- ===========================================================================
-- Decisão do dono: diária ganha categoria própria, em vez de cair em "Salário
-- Mão de Obra" ou em "Mão de Obra Terceirizada". O motivo é comparar: com
-- categoria própria, o DRE mostra quanto custou diarista contra quanto custou
-- CLT; misturada, essa comparação deixa de existir no relatório.
--
-- Segue a forma das outras: `despesa`, `operacional`, sem pai (o cadastro de RH
-- é todo flat hoje).
insert into public.categorias_financeiras (nome, tipo, natureza, ativo)
select 'Diárias Mão de Obra', 'despesa', 'operacional', true
where not exists (
  select 1 from public.categorias_financeiras where nome = 'Diárias Mão de Obra'
);

-- ===========================================================================
-- 3. De onde sai a categoria de um lançamento do RH
-- ===========================================================================
create or replace function public.fn_categoria_do_rh(
  p_colaborador uuid,
  p_evento text
)
returns uuid
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_tipo_raiz text;
  v_base text;
  v_sufixo text;
  v_nome text;
  v_id uuid;
begin
  -- ONDE a pessoa trabalha decide metade do nome da categoria. O cadastro já vem
  -- nesse par ("Salário Mão de Obra" x "Salário Pessoal Administrativo"), o que é
  -- sinal de que essa era a intenção desde o começo.
  --
  -- Quem responde "de que lado" é o centro de custo RAIZ: `tipo` só existe na
  -- raiz (o CHECK do banco exige nulo nos níveis 2 e 3), então subir pelo
  -- `pai_id` não é refinamento, é a única leitura possível.
  select coalesce(r.tipo, cc.tipo) into v_tipo_raiz
  from public.colaboradores c
  join public.centros_custo cc on cc.id = c.centro_custo_id
  left join public.centros_custo r on r.id = cc.pai_id
  where c.id = p_colaborador;

  v_sufixo := case
                when v_tipo_raiz = 'escritorio' then 'Pessoal Administrativo'
                else 'Mão de Obra'
              end;

  v_base := case p_evento
              when 'salario' then 'Salário'
              when 'diaria' then 'Diárias'
              when 'adiantamento' then 'Adiantamento Salarial'
            end;
  if v_base is null then
    raise exception 'Evento de RH sem categoria mapeada: %', p_evento;
  end if;

  v_nome := v_base || ' ' || v_sufixo;

  select id into v_id
  from public.categorias_financeiras
  where nome = v_nome and tipo = 'despesa' and ativo;

  -- Recusar é melhor que deixar nulo, e isto é o coração da correção: era a
  -- categoria NULA que fazia R$ 432,24 entrar no DRE como "sem categoria". Uma
  -- exceção que diz o nome exato da categoria a criar é acionável; um nulo
  -- calado só aparece meses depois, num relatório que não fecha.
  --
  -- Caso real esperando acontecer: existe "Férias Mão de Obra" e NÃO existe
  -- "Férias Pessoal Administrativo". No dia em que a folha passar a gerar
  -- lançamento de férias de alguém do escritório, isto avisa em vez de
  -- classificar a férias do escritório como mão de obra.
  if v_id is null then
    raise exception
      'Cadastre a categoria financeira "%" (despesa, operacional) antes de gerar este lancamento do RH',
      v_nome;
  end if;

  return v_id;
end;
$function$;

-- Função interna: só o trigger chama. Sem grant para `authenticated` -- e o
-- revoke é obrigatório, porque função nova em Postgres já nasce com EXECUTE para
-- PUBLIC e só o grant não fecha nada.
revoke all on function public.fn_categoria_do_rh(uuid, text) from public;

-- ===========================================================================
-- 4. O trigger que completa o que é derivável
-- ===========================================================================
create or replace function public.fn_rh_completar_lancamento()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_colab uuid;
  v_evento text;
begin
  v_evento := case new.origem
                when 'folha' then 'salario'
                when 'diaria' then 'diaria'
                when 'adiantamento' then 'adiantamento'
              end;
  if v_evento is null then
    return new;
  end if;

  -- Cada origem guarda o vínculo com a pessoa num lugar diferente, e o
  -- `origem_id` NÃO significa a mesma coisa nas três: na diária ele já é o
  -- colaborador; na folha é o item da folha; no adiantamento é o adiantamento.
  -- Tratar os três como se fossem iguais penduraria o lançamento na pessoa
  -- errada, o que é pior que deixar vazio.
  v_colab := new.colaborador_id;
  if v_colab is null then
    v_colab := case new.origem
                 when 'diaria' then new.origem_id
                 when 'folha' then (
                   select colaborador_id from public.folha_itens
                   where id = new.origem_id
                 )
                 when 'adiantamento' then (
                   select colaborador_id from public.rh_adiantamentos
                   where id = new.origem_id
                 )
               end;
  end if;
  new.colaborador_id := v_colab;

  -- Só preenche o que veio vazio: se um dia uma função passar a mandar a
  -- categoria explicitamente, quem manda é ela.
  if new.categoria_id is null and v_colab is not null then
    new.categoria_id := public.fn_categoria_do_rh(v_colab, v_evento);
  end if;

  return new;
end;
$function$;

revoke all on function public.fn_rh_completar_lancamento() from public;

drop trigger if exists trg_rh_completar_lancamento on public.lancamentos;

-- O `when` lista as origens NOMINALMENTE em vez de excluir as que não quer. É de
-- propósito: assim `folha_guia` (empresa pagando o governo) fica fora por
-- construção, e uma origem nova amanhã também fica fora até alguém decidir que
-- ela tem pessoa e categoria.
create trigger trg_rh_completar_lancamento
  before insert on public.lancamentos
  for each row
  when (new.origem in ('folha', 'diaria', 'adiantamento'))
  execute function public.fn_rh_completar_lancamento();

-- ===========================================================================
-- 5. Diárias: forma de pagamento e vencimento passam a ser exigidos
-- ===========================================================================
-- Decisão do dono: quem fecha escolhe a forma e informa o vencimento. O
-- vencimento ERA opcional (`DEFAULT NULL`) e foi exatamente isso que deixou o
-- LAN-2026-6522 sem data -- a action só mandava o parâmetro quando a tela tinha
-- valor. Opcional num campo que todo lançamento precisa é um vazio esperando.
--
-- DROP + CREATE porque a assinatura muda. Sobrecarga com argumento opcional
-- quebraria em runtime com build verde: o PostgREST escolheria uma das duas.
drop function if exists public.fn_fechar_diarias(uuid, date, date);

create function public.fn_fechar_diarias(
  p_colaborador uuid,
  p_competencia date,
  p_data_vencimento date,
  p_forma_pagamento uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_total numeric; v_nome text; v_cc uuid; v_lanc uuid; v_comp date;
begin
  if not public.tem_permissao('rh.diaristas', 'criar') then raise exception 'Sem permissao para fechar diarias'; end if;
  v_comp := date_trunc('month', p_competencia)::date;

  -- As duas exigências novas. Mensagem que fala do campo da tela, não da coluna.
  if p_data_vencimento is null then
    raise exception 'Informe o vencimento do pagamento das diarias';
  end if;
  if p_forma_pagamento is null then
    raise exception 'Escolha a forma de pagamento das diarias';
  end if;
  if not exists (
    select 1 from public.formas_pagamento where id = p_forma_pagamento and ativo
  ) then
    raise exception 'Forma de pagamento invalida ou inativa';
  end if;

  perform public.fn_exigir_competencia_aberta(v_comp, 'lancamento', null);

  -- "Em aberto" tem DUAS condicoes: sem lancamento e sem folha. A folha
  -- aprovada marca folha_id nas diarias que pagou (inclusive quando o item saiu
  -- com liquido zero e nao gerou lancamento nenhum), e sem esta segunda
  -- condicao o fechamento pagaria de novo o mes que a folha ja pagou.
  perform 1 from public.rh_diarias
  where colaborador_id = p_colaborador and competencia = v_comp
    and lancamento_id is null and folha_id is null for update;

  select coalesce(sum(valor), 0) into v_total from public.rh_diarias
  where colaborador_id = p_colaborador and competencia = v_comp
    and lancamento_id is null and folha_id is null;
  if v_total <= 0 then raise exception 'Nao ha diarias em aberto nessa competencia'; end if;

  select nome, centro_custo_id into v_nome, v_cc from public.colaboradores where id = p_colaborador;

  -- colaborador_id e categoria_id NÃO entram aqui: quem preenche é o trigger
  -- trg_rh_completar_lancamento, para os três caminhos do RH no mesmo lugar.
  insert into public.lancamentos (tipo, origem, origem_id, centro_custo_id, descricao, valor, status, data_compra, mes_competencia, data_vencimento, forma_pagamento_id, created_by)
  values ('a_pagar', 'diaria', p_colaborador, v_cc, 'Diarias ' || coalesce(v_nome, '') || ' ' || to_char(v_comp, 'MM/YYYY'), v_total, 'a_pagar',
          (now() at time zone 'America/Rio_Branco')::date, v_comp, p_data_vencimento, p_forma_pagamento, (select auth.uid()))
  returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  values (v_lanc, 1, v_total, p_data_vencimento, 'pendente', (select auth.uid()));
  if v_cc is not null then
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_lanc, v_cc, v_total, (select auth.uid()));
  end if;

  update public.rh_diarias set lancamento_id = v_lanc
  where colaborador_id = p_colaborador and competencia = v_comp
    and lancamento_id is null and folha_id is null;
  return v_lanc;
end;
$function$;

revoke all on function public.fn_fechar_diarias(uuid, date, date, uuid) from public;
grant execute on function public.fn_fechar_diarias(uuid, date, date, uuid) to authenticated;

-- ===========================================================================
-- 6. Adiantamento: forma de pagamento passa a ser exigida
-- ===========================================================================
-- Aqui a assinatura NÃO muda (o payload é jsonb), então é CREATE OR REPLACE com
-- o corpo lido do banco imediatamente antes de escrever isto, mais a forma. O
-- vencimento já vinha preenchido (é a data do adiantamento).
create or replace function public.fn_registrar_adiantamento(p_dados jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_colab uuid := (p_dados->>'colaborador_id')::uuid;
  v_comp date := date_trunc('month', (p_dados->>'competencia')::date)::date;
  v_valor numeric(14,2) := (p_dados->>'valor')::numeric;
  v_data date := (p_dados->>'data')::date;
  v_desc text := nullif(btrim(coalesce(p_dados->>'descricao', '')), '');
  v_forma uuid := (p_dados->>'forma_pagamento_id')::uuid;
  v_uid uuid := (select auth.uid());
  v_nome text; v_cc uuid; v_adiant uuid; v_lanc uuid;
  v_qtd integer; v_total_cent bigint; v_base_cent bigint; v_sobra_cent bigint;
begin
  if not public.tem_permissao('rh.adiantamentos', 'criar') then
    raise exception 'Sem permissao para criar adiantamentos';
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'O valor do adiantamento tem que ser maior que zero';
  end if;
  if v_forma is null then
    raise exception 'Escolha a forma de pagamento do adiantamento';
  end if;
  if not exists (
    select 1 from public.formas_pagamento where id = v_forma and ativo
  ) then
    raise exception 'Forma de pagamento invalida ou inativa';
  end if;

  perform public.fn_exigir_competencia_aberta(v_comp, 'adiantamento', null);

  select nome, centro_custo_id into v_nome, v_cc
  from public.colaboradores where id = v_colab;
  if v_nome is null then raise exception 'Colaborador nao encontrado'; end if;

  insert into public.rh_adiantamentos
    (colaborador_id, competencia, valor, data, descricao, created_by)
  values (v_colab, v_comp, v_valor, v_data, v_desc, v_uid)
  returning id into v_adiant;

  insert into public.lancamentos
    (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
     data_compra, mes_competencia, data_vencimento, forma_pagamento_id, created_by)
  values
    ('a_pagar', 'adiantamento', v_adiant, v_cc,
     'Adiantamento ' || v_nome || ' ' || to_char(v_comp, 'MM/YYYY'),
     v_valor, 'a_pagar',
     (now() at time zone 'America/Rio_Branco')::date, v_comp, v_data, v_forma, v_uid)
  returning id into v_lanc;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  values (v_lanc, 1, v_valor, v_data, 'pendente', v_uid);

  if v_cc is not null then
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_lanc, v_cc, v_valor, v_uid);
  end if;

  update public.rh_adiantamentos set lancamento_id = v_lanc where id = v_adiant;

  -- Plano de desconto. Parcelas iguais em centavos, sobra na primeira, a partir
  -- da competencia informada. Sem a chave 'parcelas' no payload, 1 parcela: e o
  -- adiantamento a vista de sempre, sem ramo especial. A conta e a mesma de
  -- dividirEmParcelas() em src/modules/rh/adiantamentos/parcelamento.ts, feita
  -- em centavos inteiros para as duas fecharem no mesmo centavo.
  v_qtd := coalesce((p_dados->>'parcelas')::integer, 1);
  if v_qtd < 1 or v_qtd > 60 then
    raise exception 'Parcelas fora do limite (1 a 60): %', v_qtd;
  end if;
  v_total_cent := round(v_valor * 100)::bigint;
  if v_qtd > v_total_cent then
    raise exception 'Parcelas demais para o valor: cada parcela ficaria em zero';
  end if;
  v_base_cent := v_total_cent / v_qtd;
  v_sobra_cent := v_total_cent - v_base_cent * v_qtd;

  insert into public.rh_adiantamento_parcelas
    (adiantamento_id, numero, competencia, valor_previsto)
  select v_adiant,
         n,
         (date_trunc('month', v_comp) + ((n - 1) || ' month')::interval)::date,
         ((v_base_cent + case when n = 1 then v_sobra_cent else 0 end)::numeric / 100)
  from generate_series(1, v_qtd) n;

  return v_adiant;
end;
$function$;

revoke all on function public.fn_registrar_adiantamento(jsonb) from public;
grant execute on function public.fn_registrar_adiantamento(jsonb) to authenticated;

-- ===========================================================================
-- 7. Conserto do lançamento que já existe
-- ===========================================================================
-- O LAN-2026-6522 nasceu antes do trigger. Preenche o que é DERIVÁVEL
-- (colaborador e categoria) e deixa forma e vencimento para o dono: os dois são
-- escolha dele, e chutar uma data de vencimento em conta a pagar é inventar
-- compromisso que ninguém assumiu.
update public.lancamentos l
set colaborador_id = l.origem_id,
    categoria_id = public.fn_categoria_do_rh(l.origem_id, 'diaria')
where l.origem = 'diaria'
  and l.status <> 'cancelado'
  and (l.colaborador_id is null or l.categoria_id is null);
