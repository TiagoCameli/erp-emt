-- Fix round 1 da Task 2 do Bloco 8a. Dois problemas achados no review, ambos
-- na abertura de UPDATE direto que a Task 2 fez em `folhas`:
--
--   1) `grant update on public.folhas` (sem lista de coluna) abriu a tabela
--      inteira para authenticated. trg_guarda_status_folha e BEFORE UPDATE OF
--      status, entao so dispara quando `status` esta no SET da instrucao: um
--      UPDATE que mexe so em valor_liquido/custo_total/competencia/aprovado_por
--      passa batido pela guarda. Corrigido espelhando o precedente do proprio
--      modulo, rh_pontos (grant update por coluna + condicao de status na
--      policy, com o wrapper (select tem_permissao(...)) que e o padrao
--      dominante do repo).
--
--   2) O ramo pendente_aprovacao -> rascunho do trigger (rejeitar) nao exigia
--      motivo_rejeicao. A Server Action ja barra motivo vazio, mas com UPDATE
--      direto liberado, quem tem 'aprovar' consegue rejeitar sem motivo
--      chamando a API crua (PostgREST), o que apagaria o rastro que a Trilha
--      rotula. Corrigido so nesse ramo, sem mexer em nenhum outro.

-- ============ 1) grant por coluna + policy com status ============

revoke update on public.folhas from authenticated;

grant update (status, motivo_rejeicao) on public.folhas to authenticated;

drop policy folhas_update on public.folhas;

create policy folhas_update
  on public.folhas
  for update
  to authenticated
  using (
    (
      (select public.tem_permissao('rh.folha', 'editar'))
      or (select public.tem_permissao('rh.folha', 'aprovar'))
    )
    and status <> 'aprovado'
  )
  with check (
    (
      (select public.tem_permissao('rh.folha', 'editar'))
      or (select public.tem_permissao('rh.folha', 'aprovar'))
    )
    and status <> 'aprovado'
  );

-- ============ 2) motivo obrigatorio ao rejeitar, no trigger ============

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
  -- existe status 'rejeitado' aqui (seria beco sem saida). Motivo obrigatorio
  -- aqui, no banco: a Server Action ja barra motivo vazio, mas o UPDATE direto
  -- pela RLS nao passa por ela, e rejeitar sem motivo apagaria o rastro que a
  -- Trilha rotula (fix round 1).
  if old.status = 'pendente_aprovacao' and new.status = 'rascunho'
     and public.tem_permissao('rh.folha', 'aprovar') then
    if new.motivo_rejeicao is null or length(btrim(new.motivo_rejeicao)) = 0 then
      raise exception 'Rejeitar a folha de %/% exige motivo.',
        to_char(new.competencia, 'MM'), to_char(new.competencia, 'YYYY');
    end if;
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

-- ============ 3) travas fail-closed ============

do $$
begin
  -- authenticated so pode ter UPDATE em status e motivo_rejeicao, nada mais.
  if exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'folhas'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
      and column_name not in ('status', 'motivo_rejeicao')
  ) then
    raise exception 'authenticated nao pode ter UPDATE em coluna de folhas alem de status/motivo_rejeicao';
  end if;

  -- as duas colunas liberadas realmente estao concedidas (nao sobrou so uma).
  if not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'folhas' and grantee = 'authenticated'
      and privilege_type = 'UPDATE' and column_name = 'status'
  ) then
    raise exception 'authenticated perdeu o UPDATE em folhas.status';
  end if;
  if not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'folhas' and grantee = 'authenticated'
      and privilege_type = 'UPDATE' and column_name = 'motivo_rejeicao'
  ) then
    raise exception 'authenticated perdeu o UPDATE em folhas.motivo_rejeicao';
  end if;

  -- anon continua sem nada em folhas.
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'folhas' and grantee = 'anon'
  ) then
    raise exception 'anon nao pode ter privilegio algum em public.folhas';
  end if;

  -- authenticated segue sem INSERT/DELETE em folhas.
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'folhas' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'DELETE')
  ) then
    raise exception 'authenticated nao pode ter INSERT nem DELETE em public.folhas';
  end if;
end $$;
