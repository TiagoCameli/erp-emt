-- Colunas de rastro da aprovação. aprovado_por/aprovado_em espelham rh_pontos;
-- motivo_rejeicao espelha ordens_compra (o trilha-helpers.ts já rotula os três).
alter table public.folhas
  add column if not exists aprovado_por uuid references public.usuarios(id),
  add column if not exists aprovado_em timestamptz,
  add column if not exists motivo_rejeicao text;

-- Status novo. 'fechada' sai: dois nomes para o mesmo estado é dívida.
-- Seguro sem migrar dado porque a tabela está vazia (conferido no Step 1).
alter table public.folhas drop constraint folhas_status_check;
alter table public.folhas add constraint folhas_status_check
  check (status in ('rascunho', 'pendente_aprovacao', 'aprovado'));

-- data_fechamento sai: aprovado_em passa a ser a única data de conclusão.
alter table public.folhas drop column data_fechamento;

-- Guarda de transição: cópia estrutural de fn_guarda_status_oc.
create or replace function public.fn_guarda_status_folha()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Dentro das RPCs (security definer, dono postgres) current_user deixa de ser
  -- 'authenticated'. Elas sao a maquina de status e ja checam tudo, entao passam.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Enviar para aprovacao: exige a mesma permissao da Server Action, e folha
  -- vazia nao vai para aprovacao (a checagem vivia na fn_fechar_folha).
  if old.status = 'rascunho' and new.status = 'pendente_aprovacao'
     and public.tem_permissao('rh.folha', 'editar') then
    if not exists (select 1 from public.folha_itens where folha_id = new.id) then
      raise exception 'A folha de %/% esta vazia: gere a folha antes de enviar para aprovacao.',
        to_char(new.competencia, 'MM'), to_char(new.competencia, 'YYYY');
    end if;
    return new;
  end if;

  -- Rejeitar: volta para rascunho com motivo. A folha e recalculavel, entao nao
  -- existe status 'rejeitado' aqui (seria beco sem saida).
  if old.status = 'pendente_aprovacao' and new.status = 'rascunho'
     and public.tem_permissao('rh.folha', 'aprovar') then
    return new;
  end if;

  if old.status = 'aprovado' then
    raise exception 'Para desfazer a aprovacao da folha de %/% use a acao Desaprovar: ela exige motivo, recusa se houver pagamento aprovado, pago ou conciliado, e apaga os lancamentos gerados. Mudar o status direto deixaria os lancamentos pendurados.',
      to_char(new.competencia, 'MM'), to_char(new.competencia, 'YYYY');
  end if;

  raise exception 'Mudanca de status nao permitida na folha de %/%: de "%" para "%". Use as acoes da folha (enviar para aprovacao, aprovar, rejeitar, desaprovar), que sao o unico caminho com permissao, motivo e efeito financeiro.',
    to_char(new.competencia, 'MM'), to_char(new.competencia, 'YYYY'), old.status, new.status;
end;
$function$;

drop trigger if exists trg_guarda_status_folha on public.folhas;
create trigger trg_guarda_status_folha
  before update of status on public.folhas
  for each row execute function public.fn_guarda_status_folha();

-- As duas funções antigas SAEM nesta migration: elas escrevem 'fechada', que o
-- check acima não aceita mais, e ficariam no banco como armadilha.
-- A guarda de status da fn_gerar_folha ("só gera em rascunho") entra na Task 4
-- Step 8, junto com a reescrita dela para o snapshot do grupo.
drop function public.fn_fechar_folha(uuid);
drop function public.fn_reabrir_folha(uuid);

-- As duas RPCs de aprovação nascem aqui fazendo SÓ a transição de status, para
-- que existam em database.types.ts quando a Task 2 escrever as actions. As
-- Tasks 4 e 5 substituem por create or replace acrescentando o dinheiro.
create or replace function public.fn_aprovar_folha(p_folha uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_status text; v_comp date; v_uid uuid := (select auth.uid());
begin
  if not public.tem_permissao('rh.folha', 'aprovar') then
    raise exception 'Sem permissao para aprovar a folha';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha for update;

  if v_status is null then raise exception 'Folha nao encontrada'; end if;
  if v_status <> 'pendente_aprovacao' then
    raise exception 'A folha de %/% esta em "%": só da para aprovar o que esta pendente de aprovacao.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;
  if not exists (select 1 from public.folha_itens where folha_id = p_folha) then
    raise exception 'A folha esta vazia';
  end if;

  update public.folhas
  set status = 'aprovado', aprovado_por = v_uid, aprovado_em = now(), motivo_rejeicao = null
  where id = p_folha;
end;
$function$;

create or replace function public.fn_desaprovar_folha(p_folha uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_status text; v_comp date;
begin
  if not public.tem_permissao('rh.folha', 'desaprovar') then
    raise exception 'Sem permissao para desaprovar a folha';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'Informe o motivo da desaprovacao';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha for update;

  if v_status is null then raise exception 'Folha nao encontrada'; end if;
  if v_status <> 'aprovado' then
    raise exception 'A folha de %/% esta em "%": só da para desaprovar folha aprovada.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;

  update public.folhas
  set status = 'rascunho', aprovado_por = null, aprovado_em = null,
      motivo_rejeicao = btrim(p_motivo)
  where id = p_folha;
end;
$function$;

revoke all on function public.fn_aprovar_folha(uuid) from public;
revoke all on function public.fn_desaprovar_folha(uuid, text) from public;
grant execute on function public.fn_aprovar_folha(uuid) to authenticated;
grant execute on function public.fn_desaprovar_folha(uuid, text) to authenticated;
