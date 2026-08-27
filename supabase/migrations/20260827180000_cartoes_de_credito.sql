-- Cadastro de cartões de crédito, e qual cartão pagou cada parte da compra.
--
-- Pedido do Tiago em 27/08/2026: "quando estou fazendo uma OC ou lançamento que
-- tem parcelas pagas em cartão de crédito, me peça os quatro últimos dígitos do
-- cartão". Ele escolheu o cadastro em vez do campo livre, porque digitar quatro
-- dígitos à mão em toda compra erra, não filtra e não concilia fatura.
--
-- POR QUE UMA TABELA NOVA E NÃO MAIS UMA FORMA DE PAGAMENTO POR CARTÃO: o TIPO
-- da forma é o que decide o caminho do pagamento em todo o app (fila de
-- aprovação, direto, cartão parcela a parcela). Cadastrar "Cartão de Crédito
-- 4829" e "Cartão de Crédito 7712" como formas resolveria a identificação e
-- estragaria o resto: o combo de forma cresce em toda tela, e cada cartão novo
-- vira uma linha a mais em todo relatório que agrupa por forma. Cartão é um
-- ATRIBUTO do pagamento em cartão, não uma forma de pagar diferente.
--
-- ONDE O CARTÃO VIVE: na FORMA da ordem (`oc_formas`) e na do lançamento
-- (`lancamento_formas`), não no cabeçalho. É o bloco de forma que sabe quanto
-- sai por cartão numa compra dividida entre PIX e cartão, e é dele que a parcela
-- pendura (`oc_parcelas.oc_forma_id`, `lancamento_parcelas.lancamento_forma_id`).
--
-- LIMITAÇÃO CONHECIDA, registrada de propósito: `uq_oc_formas_forma` é único em
-- (ordem, forma_pagamento_id), então uma OC não divide entre DOIS cartões
-- diferentes hoje — as duas linhas teriam a mesma forma "Cartão de Crédito".
-- Isso já era verdade antes desta migration e não apareceu em nenhuma das 36
-- ordens. Quando aparecer, o que muda é o índice, e junto com ele a ligação
-- parcela→forma de `fn_salvar_parcelas_oc`, que hoje casa por forma_pagamento_id.
--
-- ESTADO ATUAL DA BASE (conferido em 27/08/2026): 59 blocos de lançamento e 1 de
-- ordem apontam para forma do tipo cartao_credito. Nenhum deles tem cartão, e a
-- trigger abaixo não os toca: ela só dispara em INSERT e em UPDATE DAS COLUNAS
-- forma_pagamento_id/cartao_id. `fn_definir_parcelas_lancamento`, que faz
-- `update lancamento_formas set valor = ...` em lançamento manual, continua
-- passando. Quem reeditar um desses documentos pela tela vai ter que dizer o
-- cartão, que é o efeito pretendido.

-- =====================================================================
-- 1. A tabela
-- =====================================================================

create table if not exists public.cartoes_credito (
  id uuid primary key default gen_random_uuid(),
  -- Apelido de uso interno ("Cartão obra", "Cartão Tiago"). É por ele que a
  -- pessoa escolhe na OC; os dígitos entram no rótulo para desempatar.
  nome text not null,
  -- Os quatro últimos, exatamente. Guardar mais que isso seria guardar número de
  -- cartão, que é dado de pagamento e não tem por que morar num ERP de obra.
  ultimos_digitos text not null,
  bandeira text,
  -- Banco emissor. Texto livre de propósito: não é a conta bancária do sistema,
  -- porque a fatura do cartão não debita direto de `contas_bancarias` aqui.
  banco text,
  dia_fechamento smallint,
  dia_vencimento smallint,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),

  constraint cartoes_credito_nome_nao_vazio
    check (btrim(nome) <> ''),
  -- Quatro dígitos e nada mais: sem espaço, sem asterisco, sem "final 4829".
  constraint cartoes_credito_digitos
    check (ultimos_digitos ~ '^[0-9]{4}$'),
  constraint cartoes_credito_dia_fechamento
    check (dia_fechamento is null or dia_fechamento between 1 and 31),
  constraint cartoes_credito_dia_vencimento
    check (dia_vencimento is null or dia_vencimento between 1 and 31)
);

-- Mesmo apelido duas vezes derrota o propósito de identificar o cartão. A chave
-- normalizada é a que o resto do app já usa para nome de cadastro (sem acento,
-- sem caixa, sem espaço dobrado).
create unique index if not exists uq_cartoes_credito_nome
  on public.cartoes_credito (public.fn_chave_nome(nome));

-- Dois cartões PODEM ter o mesmo final (bancos diferentes), então aqui não há
-- unicidade: o índice existe só para a busca por "4829" na tela.
create index if not exists idx_cartoes_credito_digitos
  on public.cartoes_credito (ultimos_digitos);

comment on table public.cartoes_credito is
  'Cartões de crédito da empresa. O que identifica a compra é o apelido + os quatro últimos dígitos.';

-- =====================================================================
-- 2. RLS e grants
-- =====================================================================
-- Mesmo desenho de `formas_pagamento`: SELECT para todo mundo logado, escrita só
-- pela RPC security definer. Ler é liberado porque quem enxerga a ordem precisa
-- enxergar o cartão dela — foi o que já mordeu com fornecedor e centro de custo
-- em 22/08/2026, quando quem não tinha o módulo Cadastros via a tela com UUID no
-- lugar do nome.

alter table public.cartoes_credito enable row level security;

drop policy if exists cartoes_credito_select on public.cartoes_credito;
create policy cartoes_credito_select
  on public.cartoes_credito for select
  to authenticated
  using (true);

revoke all on public.cartoes_credito from anon;
grant select on public.cartoes_credito to authenticated;

-- updated_at e auditoria: os mesmos gatilhos do resto dos cadastros.
drop trigger if exists trg_cartoes_credito_updated_at on public.cartoes_credito;
create trigger trg_cartoes_credito_updated_at
  before update on public.cartoes_credito
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_audit_cartoes_credito on public.cartoes_credito;
create trigger trg_audit_cartoes_credito
  after insert or delete or update on public.cartoes_credito
  for each row execute function public.fn_audit();

-- =====================================================================
-- 3. O cartão na forma da ordem e na do lançamento
-- =====================================================================

alter table public.oc_formas
  add column if not exists cartao_id uuid references public.cartoes_credito(id);

alter table public.lancamento_formas
  add column if not exists cartao_id uuid references public.cartoes_credito(id);

create index if not exists idx_oc_formas_cartao
  on public.oc_formas (cartao_id) where cartao_id is not null;

create index if not exists idx_lancamento_formas_cartao
  on public.lancamento_formas (cartao_id) where cartao_id is not null;

-- Grant de coluna: `lancamentos` tem grants POR COLUNA nesta base, mas
-- `oc_formas` e `lancamento_formas` têm SELECT na tabela inteira. Coluna nova
-- entra coberta pelo grant existente; nada a fazer aqui além de conferir, o que
-- a prova em supabase/provas faz.

-- =====================================================================
-- 4. A invariante: cartão de crédito tem cartão, o resto não tem
-- =====================================================================
-- Por que trigger e não CHECK: a regra olha o TIPO da forma, que mora noutra
-- tabela. CHECK não enxerga fora da linha.
--
-- Por que `UPDATE OF forma_pagamento_id, cartao_id` e não `UPDATE` seco: as 60
-- linhas de cartão que já existem não têm cartão nenhum, e
-- `fn_definir_parcelas_lancamento` mexe no `valor` delas quando o lançamento
-- manual muda de total. Com o gatilho em toda coluna, esse caminho passaria a
-- estourar num documento que ninguém pediu para migrar.

create or replace function public.fn_valida_cartao_da_forma()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tipo text;
  v_ativo boolean;
begin
  select tipo into v_tipo
  from public.formas_pagamento
  where id = new.forma_pagamento_id;

  if v_tipo = 'cartao_credito' then
    if new.cartao_id is null then
      raise exception 'Diga qual cartao de credito pagou: escolha o cartao na forma de pagamento';
    end if;

    select ativo into v_ativo from public.cartoes_credito where id = new.cartao_id;
    if v_ativo is null then
      raise exception 'Cartao de credito nao encontrado';
    end if;
    -- Cartão inativo continua valendo no documento ANTIGO (o histórico não se
    -- reescreve), mas não entra em documento novo: inativar existe justamente
    -- para tirar da lista de escolha.
    if not v_ativo then
      raise exception 'Cartao de credito inativo: escolha um cartao ativo';
    end if;
  elsif new.cartao_id is not null then
    raise exception 'So forma do tipo cartao de credito aceita cartao';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_oc_formas_cartao on public.oc_formas;
create constraint trigger trg_oc_formas_cartao
  after insert or update of forma_pagamento_id, cartao_id on public.oc_formas
  deferrable initially deferred
  for each row execute function public.fn_valida_cartao_da_forma();

drop trigger if exists trg_lancamento_formas_cartao on public.lancamento_formas;
create constraint trigger trg_lancamento_formas_cartao
  after insert or update of forma_pagamento_id, cartao_id on public.lancamento_formas
  deferrable initially deferred
  for each row execute function public.fn_valida_cartao_da_forma();

-- =====================================================================
-- 5. A RPC de escrita
-- =====================================================================
-- Mesmo formato de `fn_salvar_forma_pagamento`: p_id nulo cria, preenchido
-- edita, e a permissão é revalidada aqui dentro porque não há grant de INSERT
-- nem UPDATE para o client.

create or replace function public.fn_salvar_cartao_credito(
  p_id uuid,
  p_nome text,
  p_ultimos_digitos text,
  p_bandeira text,
  p_banco text,
  p_dia_fechamento smallint,
  p_dia_vencimento smallint,
  p_ativo boolean
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_nome text;
  v_digitos text;
begin
  if p_id is null then
    if not public.tem_permissao('cadastros.cartoes', 'criar') then
      raise exception 'Sem permissao para criar cartoes de credito';
    end if;
  else
    if not public.tem_permissao('cadastros.cartoes', 'editar') then
      raise exception 'Sem permissao para editar cartoes de credito';
    end if;
  end if;

  v_nome := btrim(coalesce(p_nome, ''));
  if v_nome = '' then
    raise exception 'Informe o nome do cartao';
  end if;

  -- Aceita o que a pessoa digitou com ruído ("**** 4829", "final 4829") e guarda
  -- só os dígitos: o campo da tela já filtra, mas a RPC é a fronteira real.
  v_digitos := regexp_replace(coalesce(p_ultimos_digitos, ''), '[^0-9]', '', 'g');
  if length(v_digitos) <> 4 then
    raise exception 'Informe os quatro ultimos digitos do cartao';
  end if;

  if p_id is null then
    insert into public.cartoes_credito
      (nome, ultimos_digitos, bandeira, banco, dia_fechamento, dia_vencimento, ativo, created_by)
    values (
      v_nome, v_digitos,
      nullif(btrim(coalesce(p_bandeira, '')), ''),
      nullif(btrim(coalesce(p_banco, '')), ''),
      p_dia_fechamento, p_dia_vencimento,
      coalesce(p_ativo, true), (select auth.uid())
    )
    returning id into v_id;
  else
    update public.cartoes_credito
    set nome = v_nome,
        ultimos_digitos = v_digitos,
        bandeira = nullif(btrim(coalesce(p_bandeira, '')), ''),
        banco = nullif(btrim(coalesce(p_banco, '')), ''),
        dia_fechamento = p_dia_fechamento,
        dia_vencimento = p_dia_vencimento,
        ativo = coalesce(p_ativo, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Cartao de credito nao encontrado';
    end if;
  end if;

  return v_id;
end;
$$;

-- Função nova nasce com EXECUTE para PUBLIC: sem o revoke, o `anon` entra.
revoke all on function public.fn_salvar_cartao_credito(uuid, text, text, text, text, smallint, smallint, boolean) from public, anon;
grant execute on function public.fn_salvar_cartao_credito(uuid, text, text, text, text, smallint, smallint, boolean) to authenticated;

revoke all on function public.fn_valida_cartao_da_forma() from public, anon;
