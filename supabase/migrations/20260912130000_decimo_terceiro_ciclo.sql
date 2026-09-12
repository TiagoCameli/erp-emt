-- Ciclo de vida do lote de 13o: editar item, enviar, rejeitar, excluir.
-- Molde: as funcoes equivalentes da rescisao (20260829210000).
-- A aprovacao e a desaprovacao ficam na migration seguinte, porque mexem
-- em dinheiro no financeiro.

create or replace function public.fn_editar_item_decimo_terceiro(
  p_item uuid, p_valor numeric
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_lote uuid;
  v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar o 13o';
  end if;

  if p_valor is null or p_valor < 0 then
    raise exception 'O valor nao pode ser negativo';
  end if;

  select i.decimo_terceiro_id, l.status into v_lote, v_status
    from public.rh_decimo_terceiro_itens i
    join public.rh_decimo_terceiro l on l.id = i.decimo_terceiro_id
   where i.id = p_item and l.excluido_em is null
   for update;

  -- `found`, e nao `v_lote is null`: ler campo de record depois de um SELECT
  -- INTO sem linha e caminho para erro de runtime, e o erro nao diria que o
  -- item simplesmente nao existe.
  if not found then raise exception 'Item nao encontrado'; end if;

  if v_status <> 'rascunho' then
    raise exception 'O lote esta em "%": so da para editar em rascunho.', v_status;
  end if;

  -- O que se edita e o LIQUIDO, que e o que a pessoa recebe e o que vira
  -- conta a pagar. O bruto e os descontos ficam como a geracao calculou, e a
  -- linha fica marcada como editada a mao para a tela poder acusar.
  update public.rh_decimo_terceiro_itens
     set valor_liquido = p_valor, editado_manualmente = true
   where id = p_item;

  perform public.fn_dt_recalcular_totais(v_lote);
end $$;

comment on function public.fn_editar_item_decimo_terceiro(uuid, numeric) is
  'Edita o LIQUIDO de um item do lote, so em rascunho. Marca editado_manualmente e recalcula os totais.';

create or replace function public.fn_enviar_decimo_terceiro_aprovacao(p_lote uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text; v_itens integer;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para enviar o 13o para aprovacao';
  end if;

  select status into v_status from public.rh_decimo_terceiro
   where id = p_lote and excluido_em is null for update;
  if not found then raise exception 'Lote nao encontrado'; end if;

  if v_status <> 'rascunho' then
    raise exception 'O lote esta em "%": so da para enviar o que esta em rascunho.', v_status;
  end if;

  select count(*) into v_itens from public.rh_decimo_terceiro_itens
   where decimo_terceiro_id = p_lote;
  if v_itens = 0 then
    raise exception 'O lote esta vazio: nenhum CLT ativo com data de admissao cadastrada.';
  end if;

  update public.rh_decimo_terceiro
     set status = 'pendente_aprovacao', motivo_rejeicao = null, updated_at = now()
   where id = p_lote;
end $$;

create or replace function public.fn_rejeitar_decimo_terceiro(p_lote uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'aprovar') then
    raise exception 'Sem permissao para rejeitar o 13o';
  end if;

  -- btrim com o conjunto explicito: btrim(x) sozinho corta so espaco, e
  -- motivo digitado com tab ou quebra de linha passaria como preenchido.
  if btrim(coalesce(p_motivo, ''), E' \t\r\n') = '' then
    raise exception 'Informe o motivo da rejeicao';
  end if;

  select status into v_status from public.rh_decimo_terceiro
   where id = p_lote and excluido_em is null for update;
  if not found then raise exception 'Lote nao encontrado'; end if;

  if v_status <> 'pendente_aprovacao' then
    raise exception 'O lote esta em "%": so da para rejeitar o que esta pendente de aprovacao.', v_status;
  end if;

  update public.rh_decimo_terceiro
     set status = 'rejeitado', motivo_rejeicao = p_motivo, updated_at = now()
   where id = p_lote;
end $$;

create or replace function public.fn_excluir_decimo_terceiro(p_lote uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'excluir') then
    raise exception 'Sem permissao para excluir o 13o';
  end if;

  if btrim(coalesce(p_motivo, ''), E' \t\r\n') = '' then
    raise exception 'Informe o motivo da exclusao';
  end if;

  select status into v_status from public.rh_decimo_terceiro
   where id = p_lote and excluido_em is null for update;
  if not found then raise exception 'Lote nao encontrado'; end if;

  -- Lote aprovado tem conta a pagar no financeiro. Excluir aqui deixaria
  -- lancamento orfao apontando para um lote invisivel.
  if v_status = 'aprovado' then
    raise exception 'O lote esta aprovado e tem contas a pagar. Desaprove antes de excluir.';
  end if;

  update public.rh_decimo_terceiro
     set excluido_em = now(), excluido_por = (select auth.uid()),
         motivo_exclusao = p_motivo, updated_at = now()
   where id = p_lote;
end $$;
