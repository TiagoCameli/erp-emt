-- Aplicada em produção pelo MCP (apply_migration) em 2026-10-08, versão
-- 20261008135000 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Editar e excluir diária, inclusive a já fechada.
--
-- Antes: a diária fechada (lancamento_id preenchido) ficava travada pelo RLS e
-- pela tela, e o lançamento gerado também não saía pelo Financeiro
-- (fn_excluir_lancamento manda "Exclua pela diaria"). Resultado: diária lançada
-- errada e já fechada não tinha conserto. Em 08/10/2026 as 16 diárias do banco
-- estavam todas fechadas, então o menu de editar/excluir nunca aparecia.
--
-- Agora as duas ações passam por RPC (security definer), que mexem na diária e
-- acertam o lançamento a pagar no mesmo passo:
--   * o lançamento fica com a soma das diárias que sobraram nele (valor, a
--     parcela única e o rateio único acompanham);
--   * se não sobra diária, o lançamento é apagado (parcelas e rateios caem por
--     cascade).
--
-- Travas, as mesmas da fn_excluir_lancamento e da fn_desaprovar_folha: recusa se
-- QUALQUER parcela do lançamento estiver aprovada, paga ou conciliada. Quem
-- quer mexer desaprova ou estorna o pagamento em Financeiro > Pagamentos antes.
-- Também recusa: diária paga pela folha (folha_id), competência do lançamento
-- fechada (fn_exigir_competencia_aberta, com a exceção de quem pode reabrir) e
-- lançamento que o Financeiro já repartiu (mais de uma parcela, mais de um
-- rateio ou formas de pagamento), porque aí não dá para saber de qual parte
-- tirar a diferença.
--
-- Diária fechada não troca de diarista nem de mês: o lançamento é de UM
-- diarista numa competência. Para isso, excluir e lançar de novo.
--
-- O RLS de rh_diarias não muda: update/delete direto continuam só em diária
-- aberta. As actions passam a chamar estas RPCs nos dois casos.

create or replace function public.fn_diaria_ressincronizar_lancamento(p_lanc uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_total numeric(14, 2);
  v_qtd int;
  v_parcelas int;
  v_rateios int;
begin
  select count(*), coalesce(round(sum(valor), 2), 0) into v_qtd, v_total
  from public.rh_diarias where lancamento_id = p_lanc;

  if v_qtd = 0 or v_total <= 0 then
    -- Solta o vínculo antes: rh_diarias_lancamento_id_fkey é FK simples.
    update public.rh_diarias set lancamento_id = null where lancamento_id = p_lanc;
    delete from public.lancamentos where id = p_lanc;
    return;
  end if;

  select count(*) into v_parcelas from public.lancamento_parcelas where lancamento_id = p_lanc;
  select count(*) into v_rateios from public.lancamento_rateios where lancamento_id = p_lanc;

  if v_parcelas <> 1 or v_rateios > 1
     or exists (select 1 from public.lancamento_formas where lancamento_id = p_lanc) then
    raise exception 'Nao da para alterar: o lancamento desta diaria foi repartido no Financeiro (parcelas, rateio ou formas). Ajuste o lancamento por la';
  end if;

  update public.lancamentos set valor = v_total where id = p_lanc;
  update public.lancamento_parcelas set valor = v_total where lancamento_id = p_lanc;
  update public.lancamento_rateios set valor = v_total where lancamento_id = p_lanc;
end;
$function$;

revoke all on function public.fn_diaria_ressincronizar_lancamento(uuid) from public, anon, authenticated;

comment on function public.fn_diaria_ressincronizar_lancamento(uuid) is
'Interna. Acerta o lancamento de diarias com a soma das diarias ligadas a ele (valor, parcela unica, rateio unico) ou apaga o lancamento quando nao sobra diaria. Recusa lancamento repartido no Financeiro. Chamada por fn_editar_diaria e fn_excluir_diaria, que fazem as travas antes.';

-- Travas comuns da diária fechada. Devolve o lançamento (travado com for update)
-- ou null quando a diária está aberta.
create or replace function public.fn_diaria_exigir_alteravel(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lanc uuid; v_folha uuid; v_numero text; v_mes date;
begin
  if not public.tem_permissao('rh.diaristas', 'editar') then
    raise exception 'Sem permissao para alterar diarias';
  end if;

  select lancamento_id, folha_id into v_lanc, v_folha
  from public.rh_diarias where id = p_id for update;
  if not found then raise exception 'Diaria nao encontrada'; end if;

  if v_folha is not null then
    raise exception 'Nao da para alterar: esta diaria foi paga pela folha. Desaprove a folha antes';
  end if;

  if v_lanc is null then return null; end if;

  select numero, mes_competencia into v_numero, v_mes
  from public.lancamentos where id = v_lanc for update;

  if exists (
    select 1 from public.lancamento_parcelas p
    left join public.extrato_transacoes t on t.parcela_id = p.id
    where p.lancamento_id = v_lanc
      and (p.status in ('aprovado', 'pago') or t.id is not null)
  ) then
    raise exception 'Nao da para alterar: o pagamento do lancamento % ja foi aprovado, pago ou conciliado. Desaprove ou estorne o pagamento em Financeiro > Pagamentos antes', v_numero;
  end if;

  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_lanc);
  return v_lanc;
end;
$function$;

revoke all on function public.fn_diaria_exigir_alteravel(uuid) from public, anon, authenticated;

create or replace function public.fn_editar_diaria(
  p_id uuid,
  p_colaborador uuid,
  p_obra uuid,
  p_data date,
  p_valor numeric,
  p_observacao text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lanc uuid; v_colab uuid; v_comp date; v_nova_comp date;
begin
  if p_colaborador is null then raise exception 'Selecione o diarista'; end if;
  if p_data is null then raise exception 'Informe a data'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe um valor maior que zero'; end if;

  v_lanc := public.fn_diaria_exigir_alteravel(p_id);
  v_nova_comp := date_trunc('month', p_data)::date;

  if v_lanc is not null then
    select colaborador_id, competencia into v_colab, v_comp
    from public.rh_diarias where id = p_id;
    if v_colab <> p_colaborador then
      raise exception 'Diaria ja fechada nao troca de diarista: exclua e lance de novo';
    end if;
    if v_comp <> v_nova_comp then
      raise exception 'Diaria ja fechada nao troca de mes: exclua e lance de novo';
    end if;
  end if;

  update public.rh_diarias
  set colaborador_id = p_colaborador,
      obra_id = p_obra,
      data = p_data,
      competencia = v_nova_comp,
      valor = round(p_valor, 2),
      observacao = nullif(btrim(p_observacao), '')
  where id = p_id;

  if v_lanc is not null then
    perform public.fn_diaria_ressincronizar_lancamento(v_lanc);
  end if;
end;
$function$;

revoke all on function public.fn_editar_diaria(uuid, uuid, uuid, date, numeric, text) from public, anon;
grant execute on function public.fn_editar_diaria(uuid, uuid, uuid, date, numeric, text) to authenticated;

comment on function public.fn_editar_diaria(uuid, uuid, uuid, date, numeric, text) is
'Edita uma diaria, aberta ou fechada. Na fechada, acerta o lancamento a pagar com a nova soma; recusa trocar diarista ou mes, pagamento aprovado/pago/conciliado, diaria paga pela folha, competencia fechada e lancamento repartido no Financeiro.';

create or replace function public.fn_excluir_diaria(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lanc uuid;
begin
  v_lanc := public.fn_diaria_exigir_alteravel(p_id);

  delete from public.rh_diarias where id = p_id;

  if v_lanc is not null then
    perform public.fn_diaria_ressincronizar_lancamento(v_lanc);
  end if;
end;
$function$;

revoke all on function public.fn_excluir_diaria(uuid) from public, anon;
grant execute on function public.fn_excluir_diaria(uuid) to authenticated;

comment on function public.fn_excluir_diaria(uuid) is
'Exclui uma diaria, aberta ou fechada. Na fechada, tira o valor dela do lancamento a pagar ou apaga o lancamento se era a unica. Mesmas travas da fn_editar_diaria.';

-- Situação da diária na tela. O RLS de lancamentos/lancamento_parcelas só abre
-- lançamento de diária para quem tem permissão do Financeiro, então quem é só
-- do RH via a diária paga como "a pagar". Em vez de abrir o lançamento inteiro,
-- esta função devolve SÓ o status das parcelas de cada lançamento de diária,
-- para quem pode ver diárias.
create or replace function public.fn_diarias_status_parcelas()
returns table (lancamento_id uuid, status text[])
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.tem_permissao('rh.diaristas', 'ver') then
    raise exception 'Sem permissao para ver diarias';
  end if;

  return query
  select p.lancamento_id, array_agg(p.status order by p.numero_parcela)
  from public.lancamento_parcelas p
  where p.lancamento_id in (
    select d.lancamento_id from public.rh_diarias d where d.lancamento_id is not null
  )
  group by p.lancamento_id;
end;
$function$;

revoke all on function public.fn_diarias_status_parcelas() from public, anon;
grant execute on function public.fn_diarias_status_parcelas() to authenticated;

comment on function public.fn_diarias_status_parcelas() is
'Status das parcelas de cada lancamento gerado por diarias, para a tela RH > Diarias mostrar Em aberto / Fechada, a pagar / Paga sem precisar de permissao do Financeiro. So status, nada de valor ou conta.';
