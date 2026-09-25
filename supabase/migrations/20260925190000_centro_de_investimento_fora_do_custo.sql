-- =============================================================
-- CC Investimentos vira centro de INVESTIMENTO, fora do custo
--
-- PEDIDO DO TIAGO (24/09/2026): "cc de investimentos deve funcionar igual cc de
-- emprestimos e ter o seu proprio aba de relatorios [...] esse lancamento nao e
-- de uma despesa e sim um dinheiro que fica separado e pode trazer um rendimento
-- para a empresa."
--
-- ============================================================
-- O QUE ESTAVA ERRADO
-- ============================================================
-- O centro "Investimentos" nasceu em 20/08 de uma OBRA (trigger
-- fn_obra_cria_centro_custo), entao tinha tipo 'obra' e entrava em todo
-- relatorio de custo. Oito lancamentos de aplicacao estavam em categorias
-- operacionais ("Investimentos", "Outras despesas", "Outras receitas") e
-- apareciam como R$ 8,1 mi de custo e R$ 1,98 mi de receita -- o agosto de
-- 2026 do Custo x receita mostrava R$ 4,5 mi de "APLICACAO CDB 95" como custo.
--
-- ============================================================
-- O QUE MUDA AQUI
-- ============================================================
-- 1. Novo tipo de raiz, 'investimento', ao lado de 'financeiro' (Emprestimos).
--    Tipo proprio, e nao reaproveitar 'financeiro', porque o relatorio Creditos
--    le "raiz.tipo = 'financeiro'" como a lista de CONTRATOS DE EMPRESTIMO: uma
--    aplicacao la viraria um emprestimo tomado.
-- 2. Todo corte "fora do custo" que hoje diz <> 'financeiro' passa a dizer
--    not in ('financeiro', 'investimento'). Sao 10 ocorrencias em 9 funcoes,
--    todas escritas do mesmo jeito; a troca e mecanica e CONFERIDA (a migration
--    aborta se o numero de trocas nao for exatamente 10).
-- 3. O centro Investimentos solta da obra, vira tipo 'investimento' e ganha uma
--    etapa por aplicacao, como Emprestimos tem uma por contrato. A obra
--    "Investimentos" (sem colaborador, ponto nem diaria) e desativada: nao e obra.
-- =============================================================

-- ---------- 1. o tipo ----------
alter table public.centros_custo drop constraint centros_custo_tipo_check;
alter table public.centros_custo add constraint centros_custo_tipo_check
  check (tipo = any (array['obra', 'escritorio', 'manutencao', 'financeiro', 'investimento']));

-- ---------- 2. os cortes de custo ----------
do $cortes$
declare
  v_funcao record;
  v_def text;
  v_novo text;
  v_trocas int := 0;
  v_aqui int;
begin
  for v_funcao in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      -- So funcao comum: pg_get_functiondef quebra em agregacao (array_agg).
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) like '%, '''') <> ''financeiro''%'
  loop
    v_def := pg_get_functiondef(v_funcao.oid);
    v_aqui := (length(v_def) - length(replace(v_def, ', '''') <> ''financeiro''', '')))
              / length(', '''') <> ''financeiro''');
    v_novo := replace(
      v_def,
      ', '''') <> ''financeiro''',
      ', '''') not in (''financeiro'', ''investimento'')'
    );
    execute v_novo;
    v_trocas := v_trocas + v_aqui;
    raise notice '%: % corte(s) trocado(s)', v_funcao.proname, v_aqui;
  end loop;

  if v_trocas <> 10 then
    raise exception 'Esperava 10 cortes "<> financeiro" em 9 funcoes e troquei %. Nada aplicado.', v_trocas;
  end if;
end $cortes$;

-- ---------- 3. o centro ----------
do $centro$
declare
  v_raiz uuid;
  v_obra uuid;
begin
  select c.id, c.obra_id into v_raiz, v_obra
  from public.centros_custo c
  where c.nivel = 1 and c.nome = 'Investimentos';

  if v_raiz is null then
    raise exception 'Centro "Investimentos" nao encontrado';
  end if;

  update public.centros_custo
  set tipo = 'investimento', obra_id = null, ativo = true
  where id = v_raiz;

  if v_obra is not null then
    update public.obras set ativo = false where id = v_obra;
  end if;

  insert into public.centros_custo (nome, nivel, pai_id, tipo, ativo)
  select e.nome, 2, v_raiz, null, true
  from (values ('Caixa Econômica - CDB 95'), ('Caixa Econômica - Fundo')) as e(nome)
  where not exists (
    select 1 from public.centros_custo x where x.pai_id = v_raiz and x.nome = e.nome
  );
end $centro$;
