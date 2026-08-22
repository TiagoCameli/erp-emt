-- Excluir OC passa a levar os vínculos de anexo dela.
--
-- ## O defeito
--
-- `fn_excluir_ordem_compra` apaga a OC, os itens e o lançamento previsto, mas
-- deixava as linhas de `anexo_vinculos` apontando para uma OC que não existe
-- mais. `anexo_vinculos` é polimórfica (`entidade_tipo` + `entidade_id`, sem FK),
-- então nenhum cascade do banco cuidava disso.
--
-- Já havia 4 vínculos órfãos de exclusões passadas. O botão de exclusão em LOTE
-- que entra junto multiplica esse vazamento por seleção, e por isso o conserto
-- vem antes dele.
--
-- ## O que NÃO é apagado, de propósito
--
-- O ARQUIVO (`arquivos`) fica. Ele pode estar compartilhado: `fn_propagar_anexos`
-- liga o mesmo arquivo da cotação na OC, e da OC no lançamento e no pagamento.
-- Apagar o arquivo ao excluir a OC arrancaria o anexo de documentos que continuam
-- vivos. Quem some é só o VÍNCULO com esta OC, que é o que deixou de existir.
--
-- E quando o vínculo apagado era o ÚLTIMO daquele arquivo, o gatilho que já
-- existia (`trg_marcar_arquivo_orfao`) marca `arquivos.orfao_em`, que é como a
-- faxina do bucket encontra o binário depois. Medido em transação desfeita:
-- depois de excluir a OC, o arquivo continua na tabela E sai marcado como órfão.
--
-- Detalhe que atrapalha a conferência: a policy de `arquivos` exige um vínculo
-- visível, então, olhando como `authenticated`, um arquivo sem vínculo parece NÃO
-- EXISTIR. "Não visível" e "não existe" se confundem ali — para medir o arquivo é
-- preciso sair do papel do usuário.

create or replace function public.fn_excluir_ordem_compra(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.tem_permissao('compras.ordens', 'excluir') then
    raise exception 'Sem permissao para excluir ordens de compra';
  end if;

  if exists (select 1 from public.recebimentos r where r.ordem_compra_id = p_id) then
    raise exception 'Nao da para excluir: esta ordem de compra ja tem recebimento registrado';
  end if;

  if exists (
    select 1
    from public.lancamentos l
    join public.lancamento_parcelas p on p.lancamento_id = l.id
    where l.origem = 'oc' and l.origem_id = p_id
      and p.status in ('aprovado', 'pago')
  ) then
    raise exception 'Nao da para excluir: o pagamento desta ordem ja foi aprovado ou pago. Desaprove ou estorne o pagamento antes';
  end if;

  if exists (
    select 1
    from public.extrato_transacoes t
    join public.lancamento_parcelas p on p.id = t.parcela_id
    join public.lancamentos l on l.id = p.lancamento_id
    where l.origem = 'oc' and l.origem_id = p_id
  ) then
    raise exception 'Nao da para excluir: esta ordem tem parcela conciliada';
  end if;

  -- Os vinculos de anexo dos TRES niveis que esta exclusao destroi: a OC, o
  -- lancamento dela e as parcelas do lancamento (que saem por cascade da FK).
  -- `anexo_vinculos` e polimorfica (entidade_tipo + entidade_id, sem FK), entao
  -- nenhum cascade do banco faz isso: sem estas linhas, cada exclusao deixa
  -- vinculo apontando para documento que nao existe mais.
  --
  -- Medido em 21/08/2026, antes deste conserto: 4 orfaos de ordem_compra e 7 de
  -- lancamento. Os de 'pagamento' estao em ZERO, e nao por sorte -- a guarda
  -- acima recusa OC com parcela aprovada ou paga, e e o pagamento que cria esse
  -- vinculo. A linha esta aqui porque a parcela SAI no cascade de qualquer jeito:
  -- se um dia existir anexo de pagamento numa parcela excluivel, ele nao vira
  -- orfao calado.
  --
  -- O ARQUIVO fica, de proposito: ele pode estar compartilhado com a cotacao de
  -- origem, com o lancamento e com o pagamento (ver fn_propagar_anexos). Apagar o
  -- arquivo arrancaria o anexo de documentos que continuam vivos. Quando o vinculo
  -- apagado era o ultimo daquele arquivo, `trg_marcar_arquivo_orfao` marca
  -- `arquivos.orfao_em` e a faxina do bucket cuida do binario depois.
  delete from public.anexo_vinculos
  where entidade_tipo = 'pagamento'
    and entidade_id in (
      select p.id
      from public.lancamento_parcelas p
      join public.lancamentos l on l.id = p.lancamento_id
      where l.origem = 'oc' and l.origem_id = p_id
    );

  delete from public.anexo_vinculos
  where entidade_tipo = 'lancamento'
    and entidade_id in (
      select l.id from public.lancamentos l
      where l.origem = 'oc' and l.origem_id = p_id
    );

  delete from public.anexo_vinculos
  where entidade_tipo = 'ordem_compra' and entidade_id = p_id;

  delete from public.lancamentos
  where origem = 'oc' and origem_id = p_id;

  delete from public.ordens_compra where id = p_id;
end;
$function$;

revoke all on function public.fn_excluir_ordem_compra(uuid) from public;
grant execute on function public.fn_excluir_ordem_compra(uuid) to authenticated;

-- =====================================================================
-- Dado: os vínculos que já ficaram órfãos de exclusões passadas
-- =====================================================================

do $reparo$
declare
  v_oc int;
  v_lanc int;
begin
  delete from public.anexo_vinculos v
  where v.entidade_tipo = 'ordem_compra'
    and not exists (select 1 from public.ordens_compra o where o.id = v.entidade_id);
  get diagnostics v_oc = row_count;

  delete from public.anexo_vinculos v
  where v.entidade_tipo = 'lancamento'
    and not exists (select 1 from public.lancamentos l where l.id = v.entidade_id);
  get diagnostics v_lanc = row_count;

  delete from public.anexo_vinculos v
  where v.entidade_tipo = 'pagamento'
    and not exists (select 1 from public.lancamento_parcelas p where p.id = v.entidade_id);

  raise notice 'Reparo: % vinculos orfaos de OC e % de lancamento apagados (o arquivo em si fica)',
    v_oc, v_lanc;
end $reparo$;
