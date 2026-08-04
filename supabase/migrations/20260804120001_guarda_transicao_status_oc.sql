-- A maquina de status da ordem de compra deixa de ser burlavel por UPDATE direto.
--
-- O DEFEITO: `authenticated` tem UPDATE em ordens_compra e a policy
-- ordens_compra_update so checa permissao ("editar OU aprovar"), nem status nem
-- coluna. Quem tem compras.ordens:editar devolve uma OC APROVADA para
-- 'pendente_aprovacao' com um PATCH direto na tabela, pulando
-- fn_desaprovar_ordem_compra, que e o unico lugar que exige motivo, recusa se
-- houver pagamento aprovado, pago ou conciliado e APAGA o lancamento financeiro
-- daquela OC. Resultado: OC pendente com lancamento vivo pendurado, que e o
-- estado inconsistente por onde apareceu a OC com dois lancamentos e o custo
-- dobrado nos quatro cortes do painel de Gestao (ver 20260801120001). O indice
-- uq_lancamentos_oc_origem_id barrou a duplicata; o pulo da etapa continuava de
-- pe. Medido no banco vivo, e reproduzido no caso 2 da prova.
--
-- O mesmo furo aceitava coisa pior: 'pendente_aprovacao' -> 'aprovado' por
-- UPDATE direto (auto-aprovacao de quem so tem 'editar', sem gerar lancamento,
-- sem checar competencia aberta nem soma das parcelas), 'aprovado' -> 'recebido'
-- e -> 'pago' (efeito financeiro sem nota, sem recebimento e sem parcela paga).
-- Casos 3, 5 e 6 da prova.
--
-- POR QUE TRIGGER E NAO POLICY: uma policy de UPDATE nao consegue comparar OLD
-- com NEW. O USING ve a linha velha, o WITH CHECK ve a nova, e nenhuma expressao
-- ve as duas, entao "de aprovado nao volta para pendente" nao se escreve em
-- policy. Daria para listar em WITH CHECK os status permitidos, mas
-- 'pendente_aprovacao' TEM de estar na lista (e o destino de enviarParaAprovacao)
-- e e exatamente ele o destino do pulo: a policy nao fecharia o furo. A outra
-- saida de policy, `revoke update (status)`, fecha o furo e quebra as duas telas
-- de uso diario: enviarParaAprovacao e rejeitarOrdem trocam status por UPDATE
-- direto hoje (transicionarStatus em src/modules/compras/ordens/actions.ts), e
-- mover as duas para RPC e mudanca grande numa tela de compras para resolver o
-- que o trigger resolve vendo OLD e NEW.
--
-- COMO A GUARDA SEPARA O CAMINHO LEGITIMO DO PULO: as sete funcoes que escrevem
-- status em ordens_compra sao todas SECURITY DEFINER com dono `postgres`
-- (fn_aprovar_ordem_compra, fn_desaprovar_ordem_compra, fn_cancelar_ordem_compra,
-- fn_registrar_recebimento, fn_recalcular_status_lancamento,
-- fn_alterar_mes_competencia e fn_recalcular_total_oc), entao dentro delas
-- current_user nao e mais 'authenticated'. Elas SAO a maquina de status: cada uma
-- ja checa permissao, motivo, competencia e efeito posterior, e por isso passam
-- inteiras. A guarda vale para o UPDATE direto na tabela, e ali libera so as duas
-- transicoes que o app faz assim hoje, cada uma com a permissao que a Server
-- Action correspondente exige:
--   rascunho -> pendente_aprovacao  (enviarParaAprovacao, exige 'editar')
--   pendente_aprovacao -> rejeitado (rejeitarOrdem, exige 'aprovar')
-- Todo o resto passa a vir com mensagem dizendo qual acao usar.
--
-- NADA E RENOMEADO e NENHUMA funcao existente e reescrita: a migration so
-- acrescenta uma funcao nova e um trigger. Prova em
-- supabase/provas/guarda_transicao_status_oc.sql (16 casos, o 16 comparando a
-- definicao viva das sete funcoes antes e depois nas duas direcoes).
--
-- BEFORE UPDATE **OF status** de proposito: o trigger nem dispara nos UPDATEs que
-- nao mencionam status, que e o caso de editarOrdem (cabecalho), de
-- fn_recalcular_total_oc (valor_total) e de fn_alterar_mes_competencia
-- (mes_competencia). Menor raio de alcance possivel para uma tela de uso diario.
--
-- Se um dia existir "reabrir OC rejeitada" ou "voltar para rascunho", a transicao
-- entra aqui junto com o botao.
--
-- Rollback: supabase/rollbacks/20260804120001_guarda_transicao_status_oc_rollback.sql
create or replace function public.fn_guarda_status_oc()
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

  -- As duas unicas transicoes que o app faz por UPDATE direto, com a mesma
  -- permissao que a Server Action exige em cada uma.
  if old.status = 'rascunho' and new.status = 'pendente_aprovacao'
     and public.tem_permissao('compras.ordens', 'editar') then
    return new;
  end if;

  if old.status = 'pendente_aprovacao' and new.status = 'rejeitado'
     and public.tem_permissao('compras.ordens', 'aprovar') then
    return new;
  end if;

  if old.status = 'aprovado' and new.status = 'pendente_aprovacao' then
    raise exception 'Para devolver a ordem % para pendente use a acao Desaprovar: ela exige motivo, recusa se houver pagamento aprovado, pago ou conciliado e apaga o lancamento financeiro. Mudar o status direto deixaria o lancamento pendurado na ordem.',
      coalesce(new.numero, '');
  end if;

  raise exception 'Mudanca de status nao permitida na ordem %: de "%" para "%". Use as acoes da ordem de compra (enviar para aprovacao, aprovar, rejeitar, desaprovar, registrar recebimento, cancelar), que sao o unico caminho com motivo, permissao e efeito financeiro.',
    coalesce(new.numero, ''), old.status, new.status;
end;
$function$;

comment on function public.fn_guarda_status_oc() is
  'Guarda da maquina de status da OC: por UPDATE direto so passam rascunho > pendente_aprovacao e pendente_aprovacao > rejeitado. O resto e das RPCs, que apagam ou geram o lancamento financeiro.';

-- Funcao de trigger nao e chamavel pelo cliente: sem EXECUTE para public.
revoke all on function public.fn_guarda_status_oc() from public;

drop trigger if exists trg_ordens_compra_status on public.ordens_compra;
create trigger trg_ordens_compra_status
before update of status on public.ordens_compra
for each row execute function public.fn_guarda_status_oc();

notify pgrst, 'reload schema';
