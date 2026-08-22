-- =============================================================
-- Centro de custo: de regra escrita a invariante de banco, e o rateio
-- visivel para quem so ve Pagamentos
--
-- PEDIDO DO TIAGO (22/08/2026): "todos lancamentos tanto de pagamentos como de
-- recebimentos devem exigir um centro de custo", e as colunas de Lancamentos,
-- Pagamentos e Recebimentos passam a mostrar o centro.
--
-- ============================================================
-- PARTE 1 - A EXIGENCIA PASSA A SER DO BANCO, NAO DE UM CAMINHO
-- ============================================================
-- A regra ja existia em tres lugares (schema Zod da tela, schema da Server
-- Action e um raise dentro de fn_salvar_lancamento), e o dado esta limpo:
-- medido em 22/08/2026, ZERO dos 6.462 lancamentos estao sem rateio.
--
-- O problema e que a exigencia mora no CAMINHO, e existem SEIS caminhos que
-- criam lancamento: fn_salvar_lancamento, fn_aprovar_ordem_compra,
-- fn_aprovar_folha, fn_fechar_diarias, fn_registrar_adiantamento e
-- fn_importar_br364_lote09. So o primeiro levanta "nenhum custo existe sem
-- centro de custo". Os outros cinco derivam o rateio da origem e hoje nao
-- produzem lancamento sem centro -- mas "hoje nao produz" nao e invariante, e o
-- setimo caminho (ou um UPDATE manual) nao teria nada segurando.
--
-- Vira CONSTRAINT TRIGGER DEFERRABLE, que confere no COMMIT. Tem que ser
-- deferida porque todo caminho insere o lancamento ANTES dos rateios: uma
-- trigger comum reprovaria a propria fn_salvar_lancamento na primeira linha.
--
-- Conferido antes de aplicar: 0 itens de OC sem centro de custo (140 itens em
-- 57 ordens), entao a aprovacao de OC nao passa a falhar.
--
-- ============================================================
-- PARTE 2 - O RATEIO VISIVEL PARA QUEM SO VE PAGAMENTOS
-- ============================================================
-- A policy de SELECT de `lancamento_rateios` aceitava financeiro.lancamentos,
-- financeiro.recebimentos, financeiro.relatorios e compras.ordens -- e NAO
-- aceitava financeiro.pagamentos nem financeiro.aprovacao-pagamentos, que sao
-- justamente as duas telas que passam a mostrar a coluna de centro de custo.
--
-- Sem este ajuste a coluna nova mentiria em silencio: quem tem Pagamentos e nao
-- tem Recebimentos veria "-" em toda linha, como se o lancamento nao tivesse
-- centro. O mesmo vale para a secao "Rateio por centro de custo" do detalhe do
-- pagamento, que ja existia e ja dizia "este lancamento nao tem rateio" para
-- esse perfil.
--
-- Nao ha ampliacao real de acesso: quem tem Pagamentos JA le `lancamentos` e
-- `lancamento_parcelas` do mesmo documento pelas policies existentes. O rateio e
-- detalhe do mesmo documento.
--
-- Medido em 22/08/2026: os 5 usuarios que veem Pagamentos tambem veem
-- Recebimentos, entao ninguem esta afetado hoje -- o furo e latente, e fecha
-- antes de morder.
-- =============================================================

-- ---------- PARTE 1 ----------

create or replace function public.fn_exigir_centro_de_custo()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_numero text;
begin
  -- No COMMIT o lancamento pode ter sido apagado nesta mesma transacao (lixeira,
  -- cancelamento de OC). Sem esta saida, apagar um lancamento reprovaria a
  -- transacao por falta de rateio de uma linha que nao existe mais.
  if not exists (select 1 from public.lancamentos where id = new.id) then
    return null;
  end if;

  if exists (
    select 1 from public.lancamento_rateios r where r.lancamento_id = new.id
  ) then
    return null;
  end if;

  select numero into v_numero from public.lancamentos where id = new.id;
  raise exception
    'Escolha o centro de custo: nenhum custo existe sem centro de custo (lancamento %)',
    coalesce(v_numero, new.id::text);
end;
$function$;

revoke all on function public.fn_exigir_centro_de_custo() from public, anon;

drop trigger if exists trg_lancamento_exige_centro on public.lancamentos;
create constraint trigger trg_lancamento_exige_centro
  after insert or update on public.lancamentos
  deferrable initially deferred
  for each row execute function public.fn_exigir_centro_de_custo();

-- Apagar o ULTIMO rateio de um lancamento vivo deixaria ele sem centro por outro
-- caminho, entao a mesma invariante e conferida do lado de la.
create or replace function public.fn_rateio_nao_deixa_lancamento_sem_centro()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (
    select 1 from public.lancamentos where id = old.lancamento_id
  ) then
    return null;  -- o lancamento inteiro se foi: nao ha invariante a defender
  end if;

  if not exists (
    select 1 from public.lancamento_rateios r
    where r.lancamento_id = old.lancamento_id
  ) then
    raise exception
      'Este lancamento ficaria sem centro de custo: troque o rateio em vez de apagar o ultimo';
  end if;

  return null;
end;
$function$;

revoke all on function public.fn_rateio_nao_deixa_lancamento_sem_centro() from public, anon;

drop trigger if exists trg_rateio_exige_centro on public.lancamento_rateios;
create constraint trigger trg_rateio_exige_centro
  after delete on public.lancamento_rateios
  deferrable initially deferred
  for each row execute function public.fn_rateio_nao_deixa_lancamento_sem_centro();

-- ---------- PARTE 2 ----------

drop policy if exists lancamento_rateios_select on public.lancamento_rateios;
create policy lancamento_rateios_select on public.lancamento_rateios
  for select using (
    (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.recebimentos', 'ver'))
    or (select public.tem_permissao('financeiro.relatorios', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
    -- Novos em 22/08/2026: as duas telas que passaram a mostrar a coluna de
    -- centro de custo. Sem elas a coluna diria "-" para quem paga.
    or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
  );

comment on policy lancamento_rateios_select on public.lancamento_rateios is
  'Quem ve o documento le o rateio dele. As telas de Pagamentos e de Aprovacao entraram em 22/08/2026, quando ganharam a coluna de centro de custo.';
