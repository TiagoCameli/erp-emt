-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-14, versão
-- 20260814183909 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Teto de 100% na SOMA dos percentuais que multiplicam salário, uma trava por
-- tabela, mais o piso de zero no salário do colaborador (Bloco 8b, Task 5).
--
-- Por que a soma e não a linha: cada percentual já era conferido isolado
-- (folha_provisoes: > 0 e <= 100; folha_encargos: >= 0 e <= 100), mas a soma,
-- que é o que de fato multiplica o salário, não era conferida por nada. Cinco
-- provisões de 20% com um encargo de 20% levam o custo de um colaborador de
-- 3.000,00 de 3.600,00 para 7.200,00 sem ninguém tropeçar em erro nenhum.
--
-- 100% é sanidade de cadastro, não regra fiscal: acima do próprio salário é
-- sempre erro de digitação, e o teto é generoso (encargo patronal real soma
-- perto de 37%, provisão de 13º mais férias perto de 20%). O limite é
-- INCLUSIVO (a soma pode fechar exatamente 100) e é por tabela.
--
-- Duas funções com a consulta estática, uma por tabela, e não uma genérica com
-- execute format(TG_TABLE_NAME): SQL dinâmico em trava de dinheiro é mais
-- frágil, e são só duas.
--
-- SECURITY DEFINER, e isto é deliberado (o brief sugeria invoker): a policy de
-- SELECT das duas tabelas exige tem_permissao('rh.encargos','ver') e a de
-- INSERT exige 'criar'. Com invoker, um perfil com 'criar' sem 'ver' faria o
-- select da soma devolver zero e a trava falharia ABERTA — exatamente o
-- problema que fn_adiantamento_em_folha já documenta ("a trava falharia
-- ABERTA"). Definer lê a soma inteira e falha fechada. As funções não devolvem
-- dado nenhum ao chamador, só levantam exceção, e trigger não pode ser chamada
-- direto, então não há caminho de escalonamento; o EXECUTE sai do PUBLIC do
-- mesmo jeito, como em fn_audit.
--
-- Rollback:
--   drop trigger if exists trg_trava_soma_provisoes on public.folha_provisoes;
--   drop trigger if exists trg_trava_soma_encargos on public.folha_encargos;
--   drop function if exists public.fn_trava_soma_provisoes();
--   drop function if exists public.fn_trava_soma_encargos();
--   alter table public.colaboradores drop constraint if exists colaboradores_salario_nao_negativo;

create or replace function public.fn_trava_soma_provisoes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn_provisoes$
declare
  v_outras numeric;
begin
  -- Linha inativa não soma: desativar é como se desliga uma provisão sem
  -- apagá-la, e a folha só lê as ativas. Também é o que garante que DESATIVAR
  -- nunca seja recusado, mesmo com a soma no limite.
  if not new.ativo then
    return new;
  end if;

  -- Serializa as gravações que ativam percentual nesta tabela. Sem isto duas
  -- sessões simultâneas leem a mesma soma antiga e as duas passam (40 + 50 + 50
  -- fecha 140 sem erro), porque o select da trava não trava linha nenhuma.
  -- Mesmo recurso que fn_aprovar_medicao usa para serializar por obra.
  perform pg_advisory_xact_lock(hashtextextended('public.folha_provisoes.percentual', 0));

  -- id <> new.id cobre INSERT e UPDATE: o default gen_random_uuid() da coluna
  -- id já está aplicado quando o trigger BEFORE roda (default lido no banco
  -- antes de escrever isto), então no INSERT a exclusão não casa com linha
  -- nenhuma, e no UPDATE ela tira exatamente a própria linha — a linha em
  -- edição não é contada duas vezes. Reativar (ativo false -> true) cai aqui
  -- também, porque new.ativo é true e a soma exclui só ela mesma.
  select coalesce(sum(percentual), 0) into v_outras
  from public.folha_provisoes
  where ativo and id <> new.id;

  if v_outras + new.percentual > 100 then
    raise exception 'A soma dos percentuais das provisões ativas não pode passar de 100%%. As outras provisões ativas somam %, e esta acrescentaria %.',
      replace(trim_scale(v_outras)::text, '.', ',') || '%',
      replace(trim_scale(new.percentual)::text, '.', ',') || '%';
  end if;

  return new;
end;
$fn_provisoes$;

comment on function public.fn_trava_soma_provisoes() is
  'Teto de 100% na soma dos percentuais das provisões ATIVAS de folha_provisoes. Linha inativa fica fora da conta; o limite é inclusivo. DEFINER de propósito: com invoker, perfil com criar/editar sem ver leria soma zero e a trava falharia aberta.';

revoke execute on function public.fn_trava_soma_provisoes() from public;

drop trigger if exists trg_trava_soma_provisoes on public.folha_provisoes;
create trigger trg_trava_soma_provisoes
  before insert or update on public.folha_provisoes
  for each row execute function public.fn_trava_soma_provisoes();

create or replace function public.fn_trava_soma_encargos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn_encargos$
declare
  v_outros numeric;
begin
  if not new.ativo then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('public.folha_encargos.percentual', 0));

  select coalesce(sum(percentual), 0) into v_outros
  from public.folha_encargos
  where ativo and id <> new.id;

  if v_outros + new.percentual > 100 then
    raise exception 'A soma dos percentuais dos encargos ativos não pode passar de 100%%. Os outros encargos ativos somam %, e este acrescentaria %.',
      replace(trim_scale(v_outros)::text, '.', ',') || '%',
      replace(trim_scale(new.percentual)::text, '.', ',') || '%';
  end if;

  return new;
end;
$fn_encargos$;

comment on function public.fn_trava_soma_encargos() is
  'Teto de 100% na soma dos percentuais dos encargos ATIVOS de folha_encargos. Gêmea de fn_trava_soma_provisoes, mesma regra e mesmo motivo de ser DEFINER.';

revoke execute on function public.fn_trava_soma_encargos() from public;

drop trigger if exists trg_trava_soma_encargos on public.folha_encargos;
create trigger trg_trava_soma_encargos
  before insert or update on public.folha_encargos
  for each row execute function public.fn_trava_soma_encargos();

-- O Zod já recusa salário negativo (colaboradores/schemas.ts), mas o banco não
-- tinha nada. Antes da provisão, salário -1.000,00 gerava item com custo_total
-- -1.200,00: lixo silencioso de um colaborador só. Depois da provisão, a folha
-- INTEIRA aborta (23514 no check de folha_item_provisoes.valor_encargos) e
-- nenhum item de nenhum colaborador é gravado — um cadastro errado bloqueia a
-- folha dos outros 199. Nulo é permitido: colaborador sem salário definido
-- existe (diarista, terceiro).
alter table public.colaboradores
  drop constraint if exists colaboradores_salario_nao_negativo;

alter table public.colaboradores
  add constraint colaboradores_salario_nao_negativo
  check (salario is null or salario >= 0);

do $guarda$
declare
  v_def text;
  v_md5 text;
  v_ruins text;
begin
  select pg_get_triggerdef(t.oid) into v_def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'folha_provisoes'
    and t.tgname = 'trg_trava_soma_provisoes' and not t.tgisinternal;
  if v_def is null or v_def not like '%BEFORE INSERT OR UPDATE ON public.folha_provisoes FOR EACH ROW%' then
    raise exception 'trg_trava_soma_provisoes nao ficou BEFORE INSERT OR UPDATE FOR EACH ROW em public.folha_provisoes (achado: %)', coalesce(v_def, '(trigger inexistente)');
  end if;

  select pg_get_triggerdef(t.oid) into v_def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'folha_encargos'
    and t.tgname = 'trg_trava_soma_encargos' and not t.tgisinternal;
  if v_def is null or v_def not like '%BEFORE INSERT OR UPDATE ON public.folha_encargos FOR EACH ROW%' then
    raise exception 'trg_trava_soma_encargos nao ficou BEFORE INSERT OR UPDATE FOR EACH ROW em public.folha_encargos (achado: %)', coalesce(v_def, '(trigger inexistente)');
  end if;

  select string_agg(p.proname, ', ') into v_ruins
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('fn_trava_soma_provisoes', 'fn_trava_soma_encargos')
    and (not p.prosecdef or p.proconfig is distinct from array['search_path=""']);
  if v_ruins is not null then
    raise exception 'funcao de trava sem SECURITY DEFINER ou sem search_path travado: %', v_ruins;
  end if;

  if not exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'colaboradores'
      and con.conname = 'colaboradores_salario_nao_negativo'
      and con.contype = 'c' and con.convalidated
  ) then
    raise exception 'check colaboradores_salario_nao_negativo nao ficou validado em public.colaboradores';
  end if;

  select md5(prosrc) into v_md5
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';
  if v_md5 is distinct from '0705f9c753f84e16f411ef4e35ec9b9c' then
    raise exception 'fn_gerar_folha mudou (esperado 0705f9c753f84e16f411ef4e35ec9b9c, achado %). Esta migration NAO toca nela: se mudou, foi outra sessao aplicando migration neste mesmo banco.', coalesce(v_md5, '(funcao inexistente)');
  end if;

  select md5(prosrc) into v_md5
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_folha';
  if v_md5 is distinct from 'a1261a1ccbff886980f0991da47a2446' then
    raise exception 'fn_aprovar_folha mudou (esperado a1261a1ccbff886980f0991da47a2446, achado %). Esta migration NAO toca nela.', coalesce(v_md5, '(funcao inexistente)');
  end if;
end
$guarda$;
