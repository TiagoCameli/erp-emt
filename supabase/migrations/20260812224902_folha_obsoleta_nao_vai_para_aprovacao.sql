-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-12, versão
-- 20260812224902 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Fix round 2 da Task 3 do adiantamento parcelado, item único: folha obsoleta
-- deixa de poder ir para aprovação.
--
-- O RESÍDUO QUE EU E O BRIEF TRATAMOS COMO COSMÉTICO, E É DINHEIRO. O argumento
-- "folha posterior em rascunho pode ficar obsoleta, mas rascunho não gera
-- lançamento" só vale no instante da regeneração. Sequência medida em transação
-- revertida, com colaborador de salário 2.000,00 (disponível 1.842,77) e
-- adiantamento de 3.200,00:
--
--   1. julho gera: desconta 1.842,77 e empurra a sobra de 1.357,23 para agosto;
--   2. agosto, em RASCUNHO, desconta essa sobra: o item já nasce com
--      adiantamentos = 1.357,23 e líquido = 485,54;
--   3. alguém regera julho (permitido, porque agosto está em rascunho): a sobra
--      é apagada e recriada ABERTA, e deixa de ter folha_id = agosto;
--   4. divergência instalada: as parcelas somam 0,00 descontado em agosto, e os
--      itens de agosto somam 1.357,23;
--   5. NADA impedia enviar esse agosto para aprovação e aprovar. Ao aprovar,
--      nasceu lançamento real a pagar de 485,54 (o líquido obsoleto), enquanto o
--      ledger de parcelas dizia "descontado 1.842,77, aberto 1.357,23" de um
--      adiantamento de 3.200,00.
--
-- Ou seja: os 1.357,23 foram cobrados via líquido reduzido e continuam
-- aparecendo como devidos. Numa competência futura seriam descontados de novo, e
-- é esse ledger que a Task 5 (quitação) vai ler.
--
-- ONDE FECHA. Na passagem `rascunho -> pendente_aprovacao`, que é o momento em
-- que a folha para de ser rascunho, e que só existe como UPDATE direto na tabela
-- (`authenticated` tem grant de UPDATE apenas nas colunas `status` e
-- `motivo_rejeicao`; não há RPC de envio). O trigger `fn_guarda_status_folha` é,
-- portanto, o único gargalo real desse caminho.
--
-- COMO DETECTA, sem coluna nova: a folha está obsoleta quando a soma de
-- `valor_descontado` das parcelas com `folha_id` = esta folha difere da soma de
-- `folha_itens.adiantamentos` desta folha. Zero de um lado e zero do outro são
-- iguais (numeric ignora escala), então folha sem nenhum adiantamento passa sem
-- atrito, e a parcela de desconto zero do fix round 1 (que fecha com
-- valor_descontado = 0) também não gera falso positivo.
--
-- A função foi recriada a partir da definição viva, md5(prosrc) =
-- fc4830853fcfb3422c601de12ccfe65d (2338 chars), que é BYTE-IDÊNTICA ao corpo
-- registrado em 20260808154914_folha_update_coluna_e_motivo.sql: nenhuma deriva
-- desde o Bloco 8a. Dois pontos mudaram e mais nada:
--   1. entrou um bloco `declare` (a função não tinha), com as duas somas;
--   2. o ramo de ENVIO ganhou a checagem, depois da recusa de folha vazia.
-- md5(prosrc) resultante: f8b45e33e57f5eb016e5e88d655f0e1f (4033 chars).
--
-- Os outros ramos estão intactos: o early-return de status igual, o early-return
-- de current_user fora de ('authenticated','anon'), a exigência de motivo na
-- rejeição, a recusa de mexer em folha aprovada e a recusa genérica de transição.
-- Contagem preservada: 4 `return new`. `raise exception` foi de 4 para 5.
-- CUIDADO REGISTRADO: `end if; return new; end if;` aparece DUAS vezes no corpo
-- (envio e rejeição). O `replace()` foi ancorado na mensagem de folha vazia, que
-- é única, justamente para não alterar o ramo da rejeição por acidente.

create or replace function public.fn_guarda_status_folha()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  -- Bloco 8b / Task 3: somas do desconto de adiantamento, para detectar folha
  -- obsoleta no envio para aprovacao.
  v_desc_parcelas numeric; v_desc_itens numeric;
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

    -- Folha OBSOLETA nao vai para aprovacao. O desconto de adiantamento gravado
    -- nos itens (folha_itens.adiantamentos) tem que continuar batendo com o que
    -- as parcelas dizem estar descontado NESTA folha. Regerar uma folha ANTERIOR
    -- apaga e recria a sobra que esta folha havia descontado, e a parcela deixa
    -- de apontar para ela: os itens ficam com o liquido reduzido por um desconto
    -- que o ledger nao registra mais. Aprovar assim gera lancamento pelo liquido
    -- velho E deixa o valor aparecendo como devido de novo, cobrando o mesmo
    -- dinheiro duas vezes numa competencia futura. Medido: adiantamento de
    -- 3200,00 virou lancamento de 485,54 com 1357,23 reabertos no ledger.
    -- Zero de um lado e zero do outro sao IGUAIS (numeric ignora escala), entao
    -- folha sem nenhum adiantamento passa sem atrito.
    select coalesce((select sum(pa.valor_descontado) from public.rh_adiantamento_parcelas pa where pa.folha_id = new.id), 0),
           coalesce((select sum(fi.adiantamentos) from public.folha_itens fi where fi.folha_id = new.id), 0)
      into v_desc_parcelas, v_desc_itens;
    if v_desc_parcelas <> v_desc_itens then
      raise exception 'A folha de %/% ficou desatualizada: o desconto de adiantamento mudou depois que ela foi gerada (as parcelas somam % e os itens da folha somam %). Regere a folha antes de enviar para aprovacao.',
        to_char(new.competencia, 'MM'), to_char(new.competencia, 'YYYY'),
        v_desc_parcelas, v_desc_itens;
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
