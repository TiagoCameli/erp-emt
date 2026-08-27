-- Permissão de ver o SALDO, conta por conta. PARTE 1 de 2: o que é ADITIVO.
--
-- =====================================================================
-- POR QUE ESTA MIGRATION NÃO FECHA NADA (leia antes de mexer)
-- =====================================================================
--
-- A versão original desta migration terminava revogando o SELECT da coluna
-- `contas_bancarias.saldo_inicial` e o EXECUTE das três agregadas de dinheiro
-- por conta. Aplicada no projeto vivo em 27/08/2026 18:41, ela DERRUBOU A
-- PRODUÇÃO: o código que estava em `main` naquele momento ainda pedia
-- `saldo_inicial` no select de quatro telas (Contas bancárias, Pagamentos,
-- Transferências e Relatórios), e todas passaram a responder "permission denied
-- for table contas_bancarias" para todo mundo, inclusive Admin. Outra frente teve
-- que aplicar `20260827185747_reabre_saldo_ate_o_codigo_do_saldo_por_conta_subir`
-- para reabrir. A trava de UPDATE do saldo inicial saiu depois, pelo mesmo
-- motivo: ela recusava a Dora (que edita contas, não é Admin e não tinha conta
-- marcada) antes de existir tela para liberá-la.
--
-- A LIÇÃO, que vale para qualquer estreitamento de privilégio neste projeto:
-- migration aqui vai direto para o banco de produção, então revogar acesso é uma
-- quebra imediata para o código que já está no ar. A ordem obrigatória é
--   (1) subir o código que para de usar o acesso,
--   (2) só então revogar.
-- Por isso as duas metades são migrations SEPARADAS, e a segunda
-- (`..._saldo_por_conta_fecha_as_portas.sql`) só pode ser aplicada DEPOIS do
-- deploy desta obra. Enquanto ela não roda, a permissão existe e a tela obedece,
-- mas quem quiser burlar por consulta direta ainda consegue — é um estado
-- intermediário conhecido, não um esquecimento.
--
-- O pedido: na matriz de permissões, escolher de quais contas cada usuário pode
-- ver o saldo atual. Quem não tem a permissão de uma conta continua vendo o
-- NOME dela em todos os lugares do app (Pagamentos, Programados, Aprovação,
-- Conciliação, Transferências, espelho) — só não vê o valor.
--
-- Isso NÃO cabe em `usuario_permissoes`, que é (recurso, ação): aqui a permissão
-- é por LINHA de uma tabela. Daí a tabela nova.
--
-- =====================================================================
-- AS TRÊS DECISÕES DO TIAGO (27/08/2026), porque nenhuma se adivinha do código
-- =====================================================================
--
-- 1. ADMIN VÊ TUDO SEMPRE. Quem tem `administracao.usuarios / editar` — isto é,
--    quem manda nas permissões dos outros — vê o saldo de todas as contas, sem
--    depender de marcação. A matriz restringe os demais. Efeito colateral aceito
--    e declarado: não dá para esconder uma conta de outro Admin.
-- 2. CONTA NOVA NASCE FECHADA. Nenhuma linha é criada automaticamente. Como o
--    Admin escapa da regra, quem cadastra a conta (que precisa de permissão de
--    criar em Contas bancárias) na prática vê o saldo dela na hora.
-- 3. O EXTRATO DA CONTA ABRE sem permissão de saldo, só sem os números de saldo
--    (isso é decisão de tela, não vive aqui).
--
-- =====================================================================
-- POR QUE `fn_rel_posicao_bancaria` NÃO É FILTRADA — a parte que evita estrago
-- =====================================================================
--
-- O caminho óbvio seria pôr o filtro de permissão dentro da agregada que já
-- calcula o movimento por conta. Seria um defeito grave: `fn_pagar_parcela` é
-- SECURITY DEFINER e chama `fn_saldo_conta`, que lê `fn_rel_posicao_bancaria`
-- para decidir se há saldo para pagar. `auth.uid()` continua sendo o do CHAMADOR
-- dentro de uma função SECURITY DEFINER, então o filtro esconderia o movimento
-- justamente de quem está pagando: o guard passaria a comparar o pagamento
-- contra `saldo_inicial` puro e liberaria (ou barraria) pagamento pelo saldo
-- errado, calado.
--
-- Então a agregada continua VERDADEIRA para os guards, e o que muda é o alcance:
-- ela perde o EXECUTE do `authenticated` (nenhum client a chama direto) e o
-- saldo passa a sair de `fn_saldos_das_contas`, que é filtrada.
--
-- O mesmo vale para `fn_rel_movimento_antes_do_corte` e
-- `fn_rel_posicao_aplicacao`: as duas devolvem dinheiro por conta e eram
-- chamáveis pelo client. As três viram uso interno.

-- =====================================================================
-- 1. A tabela da permissão
-- =====================================================================

create table if not exists public.usuario_conta_saldo (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  conta_bancaria_id uuid not null references public.contas_bancarias(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  -- A PRESENÇA do par é a permissão. Não há coluna "pode": linha que existe e
  -- diz `pode = false` é um terceiro estado que ninguém lê igual.
  primary key (usuario_id, conta_bancaria_id)
);

comment on table public.usuario_conta_saldo is
  'Par usuario+conta: a presença da linha permite ver o SALDO daquela conta. O nome da conta nunca depende disto.';

-- A PK cobre buscas por usuario_id; a FK de conta precisa do índice próprio,
-- senão o advisor do Supabase reclama e apagar uma conta faz varredura.
create index if not exists idx_usuario_conta_saldo_conta
  on public.usuario_conta_saldo (conta_bancaria_id);

alter table public.usuario_conta_saldo enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='usuario_conta_saldo' and policyname='usuario_conta_saldo_select') then
    -- Ler a PRÓPRIA marcação é inofensivo (não revela valor nenhum) e deixa a
    -- tela poder explicar por que um saldo está escondido. `editar` entra ao
    -- lado de `ver` de propósito: DELETE também passa pela policy de SELECT, e
    -- sem isto um Admin com editar e sem ver apagaria ZERO linhas sem erro.
    create policy usuario_conta_saldo_select on public.usuario_conta_saldo
      for select to authenticated using (
        usuario_id = (select auth.uid())
        or (select public.tem_permissao('administracao.usuarios', 'ver'))
        or (select public.tem_permissao('administracao.usuarios', 'editar'))
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='usuario_conta_saldo' and policyname='usuario_conta_saldo_insert') then
    create policy usuario_conta_saldo_insert on public.usuario_conta_saldo
      for insert to authenticated with check (
        (select public.tem_permissao('administracao.usuarios', 'editar'))
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='usuario_conta_saldo' and policyname='usuario_conta_saldo_delete') then
    create policy usuario_conta_saldo_delete on public.usuario_conta_saldo
      for delete to authenticated using (
        (select public.tem_permissao('administracao.usuarios', 'editar'))
      );
  end if;
end $$;

-- Grants explícitos, só do que as policies permitem. Sem policy de UPDATE, sem
-- grant de UPDATE: o par É a linha inteira, então mudar de ideia é apagar e
-- inserir. `anon` não recebe nada.
grant select, insert, delete on table public.usuario_conta_saldo to authenticated;

-- Auditoria e autoria, iguais às de `usuario_permissoes`: mudar quem vê saldo é
-- exatamente o tipo de alteração que alguém vai querer rastrear depois.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_usuario_conta_saldo') then
    create trigger trg_audit_usuario_conta_saldo
      after insert or delete or update on public.usuario_conta_saldo
      for each row execute function public.fn_audit();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_usuario_conta_saldo_created_by') then
    create trigger trg_usuario_conta_saldo_created_by
      before insert on public.usuario_conta_saldo
      for each row execute function public.fn_set_created_by();
  end if;
end $$;

-- =====================================================================
-- 2. A pergunta: posso ver o saldo desta conta?
-- =====================================================================

create or replace function public.fn_pode_ver_saldo(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    -- Decisão 1: Admin vê tudo. `administracao.usuarios / editar` é o que
    -- significa "manda nas permissões dos outros", e quem manda nelas poderia se
    -- dar a permissão de qualquer forma — esconder dele seria teatro.
    (select public.tem_permissao('administracao.usuarios', 'editar'))
    or exists (
      select 1 from public.usuario_conta_saldo x
      where x.usuario_id = (select auth.uid())
        and x.conta_bancaria_id = p_conta
    );
$function$;

comment on function public.fn_pode_ver_saldo(uuid) is
  'O usuário logado pode ver o SALDO desta conta? Admin (administracao.usuarios/editar) sempre pode.';

-- =====================================================================
-- 3. A única fonte de dinheiro por conta que o client pode chamar
-- =====================================================================

create or replace function public.fn_saldos_das_contas()
returns table (
  conta_bancaria_id uuid,
  saldo_inicial numeric,
  saldo_inicial_data date,
  entradas numeric,
  saidas numeric,
  saldo numeric,
  anterior_parcelas integer,
  anterior_recebido numeric,
  anterior_pago numeric,
  aplicado numeric,
  resgatado numeric,
  posicao_aplicacao numeric
)
language sql
stable
security definer
set search_path to ''
as $function$
  with permitidas as (
    select c.id, c.saldo_inicial, c.saldo_inicial_data
    from public.contas_bancarias c
    where public.fn_pode_ver_saldo(c.id)
  ),
  mov as (
    select
      m.conta_bancaria_id as conta,
      -- MESMA regra de sinal de `saldo.ts` e de `fn_saldo_conta`: as duas
      -- entradas são nomeadas e QUALQUER OUTRO tipo subtrai. Listar as saídas
      -- pelo nome faria um tipo novo cair fora das duas somas e desaparecer.
      coalesce(sum(m.total) filter (
        where m.tipo in ('a_receber', 'transferencia_entrada')), 0) as entradas,
      coalesce(sum(m.total) filter (
        where m.tipo not in ('a_receber', 'transferencia_entrada')), 0) as saidas
    from public.fn_rel_posicao_bancaria() m
    group by m.conta_bancaria_id
  ),
  antes as (select * from public.fn_rel_movimento_antes_do_corte()),
  apl as (select * from public.fn_rel_posicao_aplicacao())
  select
    p.id,
    p.saldo_inicial,
    p.saldo_inicial_data,
    coalesce(mov.entradas, 0),
    coalesce(mov.saidas, 0),
    -- Tem que dar EXATAMENTE o mesmo número de `fn_saldo_conta`, que é o que o
    -- guard do pagamento usa. Uma tela que mostra saldo diferente do que o
    -- pagamento considera é pior que tela sem saldo.
    round(p.saldo_inicial + coalesce(mov.entradas, 0) - coalesce(mov.saidas, 0), 2),
    antes.parcelas,
    antes.recebido,
    antes.pago,
    apl.aplicado,
    apl.resgatado,
    apl.posicao
  from permitidas p
  left join mov on mov.conta = p.id
  left join antes on antes.conta_bancaria_id = p.id
  left join apl on apl.conta_bancaria_id = p.id
$function$;

comment on function public.fn_saldos_das_contas() is
  'Dinheiro por conta bancária, SÓ das contas cujo saldo o usuário logado pode ver. Conta ausente da resposta = sem permissão, não saldo zero.';

-- SECURITY DEFINER de propósito, por DUAS razões independentes:
--   1. ela lê `contas_bancarias.saldo_inicial`, coluna que o `authenticated`
--      perde o SELECT no fim desta migration;
--   2. o saldo de uma conta não pode variar com quem olha. As agregadas que ela
--      chama passam pela RLS de `lancamento_parcelas`; rodando como owner, o
--      número é o mesmo para todos que têm permissão de vê-lo. Saldo diferente
--      por observador seria defeito, não privacidade.
-- O filtro de permissão continua sendo do CHAMADOR: `auth.uid()` dentro de uma
-- função SECURITY DEFINER segue lendo o JWT de quem chamou.
revoke all on function public.fn_saldos_das_contas() from public;
revoke all on function public.fn_pode_ver_saldo(uuid) from public;
grant execute on function public.fn_saldos_das_contas() to authenticated;
grant execute on function public.fn_pode_ver_saldo(uuid) to authenticated;

-- =====================================================================
-- 4. Salvar a marcação (molde de `salvar_matriz_usuario`)
-- =====================================================================

create or replace function public.salvar_saldos_usuario(
  p_usuario_id uuid,
  p_contas uuid[]
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_editor uuid := (select auth.uid());
begin
  if not public.tem_permissao('administracao.usuarios', 'editar') then
    raise exception 'Sem permissao para editar permissoes de usuarios';
  end if;

  -- Não há trava de auto-lockout aqui, ao contrário de `salvar_matriz_usuario`,
  -- e o motivo é a decisão 1: quem chega a esta função tem
  -- `administracao.usuarios / editar` e por isso vê o saldo de todas as contas
  -- de qualquer forma. Não existe como se trancar fora do próprio saldo.
  delete from public.usuario_conta_saldo where usuario_id = p_usuario_id;

  insert into public.usuario_conta_saldo (usuario_id, conta_bancaria_id, created_by)
  select distinct p_usuario_id, conta, v_editor
  from unnest(coalesce(p_contas, array[]::uuid[])) as conta
  -- Ignora id que não é conta: array vem do client, e uma FK estourando aqui
  -- viraria erro de banco na tela em vez de "salvo".
  where exists (select 1 from public.contas_bancarias c where c.id = conta);
end $function$;

comment on function public.salvar_saldos_usuario(uuid, uuid[]) is
  'Substitui as contas cujo saldo um usuário pode ver. Exige administracao.usuarios/editar.';

revoke all on function public.salvar_saldos_usuario(uuid, uuid[]) from public;
grant execute on function public.salvar_saldos_usuario(uuid, uuid[]) to authenticated;

-- =====================================================================
-- 5. A FUNÇÃO da trava do saldo inicial (o trigger vem na parte 2)
-- =====================================================================
--
-- `saldo_inicial` é editável no formulário de conta bancária. Quem tem permissão
-- de editar a conta mas não de ver o saldo dela abriria o formulário com o campo
-- vazio (ele não pode ler a coluna) e salvaria ZERO em cima do saldo real.
--
-- RLS não filtra coluna e grant de coluna é do role inteiro, então a trava vira
-- trigger. Ela só vale quando há sessão: `auth.uid()` nulo é carga por psql ou
-- MCP, que precisa continuar funcionando.
--
-- Aqui fica só a FUNÇÃO, que sem trigger não faz nada. O trigger é criado na
-- parte 2, junto dos revokes: ligado antes do deploy, ele recusa a Dora (que
-- edita contas, não é Admin) antes de existir a tela que a libera — foi o que
-- aconteceu, e por isso ele saiu daqui.

create or replace function public.fn_trava_saldo_inicial()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if (new.saldo_inicial is distinct from old.saldo_inicial
      or new.saldo_inicial_data is distinct from old.saldo_inicial_data)
     and not public.fn_pode_ver_saldo(old.id) then
    raise exception 'Sem permissao para alterar o saldo inicial desta conta';
  end if;

  return new;
end $function$;

-- =====================================================================
-- 6. O guard do pagamento para de contar o saldo
-- =====================================================================
--
-- `fn_pagar_parcela` recusa com "Saldo insuficiente na conta: saldo atual
-- R$ 0,00, pagamento de R$ 240,00" — a mensagem CONTA o saldo para quem não pode
-- vê-lo. A conta do guard fica IDÊNTICA (ela é a que decide se o dinheiro sai);
-- muda só o texto quando quem paga não tem a permissão.
--
-- A recusa ainda revela uma DESIGUALDADE (o saldo é menor que o pagamento), e
-- isso é inevitável numa recusa útil. É muito menos que o valor.
--
-- A migration EDITA a função a partir dela mesma, com âncora conferida, em vez
-- de reescrevê-la: ela é grande, outras frentes mexem nela, e um
-- `create or replace` com a versão que eu li hoje apagaria o trabalho de quem
-- alterou entre a leitura e o apply, sem conflito nenhum.

do $$
declare
  v_oid oid;
  v_def text;
  v_ancora text := '    if coalesce(v_saldo, 0) - v_liquido < 0 then
      raise exception ''Saldo insuficiente na conta: saldo atual R$ %, pagamento de R$ %.'',
        round(coalesce(v_saldo, 0), 2), round(v_liquido, 2);
    end if;';
  v_novo text := '    if coalesce(v_saldo, 0) - v_liquido < 0 then
      if public.fn_pode_ver_saldo(p_conta_id) then
        raise exception ''Saldo insuficiente na conta: saldo atual R$ %, pagamento de R$ %.'',
          round(coalesce(v_saldo, 0), 2), round(v_liquido, 2);
      else
        raise exception ''Saldo insuficiente nesta conta para o pagamento de R$ %.'',
          round(v_liquido, 2);
      end if;
    end if;';
begin
  -- Resolve por NOME, e não por assinatura fixa: a ordem dos 7 parâmetros já
  -- mudou uma vez nesta função, e uma assinatura errada aqui faria a migration
  -- estourar num "function does not exist" que não diz nada sobre a causa.
  select p.oid into strict v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_pagar_parcela';

  v_def := pg_get_functiondef(v_oid);

  -- Conferir a âncora ANTES de trocar. Sem isto, uma mudança de indentação feita
  -- por outra frente faria o replace não casar, a função seria recriada
  -- IDÊNTICA e a migration terminaria com `success` sem ter feito nada.
  if position(v_ancora in v_def) = 0 then
    raise exception 'Ancora do guard de saldo nao encontrada em fn_pagar_parcela: revisar a migration contra a definicao atual';
  end if;

  execute replace(v_def, v_ancora, v_novo);

  -- E conferir DEPOIS que a troca entrou: `execute` de um create or replace não
  -- reclama se o texto trocado for igual ao original.
  if position(v_novo in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'A troca do guard nao entrou em fn_pagar_parcela';
  end if;
end $$;

