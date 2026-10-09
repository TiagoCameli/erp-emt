-- =============================================================
-- Cartao com conta (parte 2): salvar o cartao com a conta. A guarda da fatura
-- esta em 20261008200200. A coluna, a carga e o trigger estao em
-- 20261008200000_cartao_tem_conta_bancaria.
-- =============================================================

-- ---------- 3. salvar o cartao com a conta ----------
drop function public.fn_salvar_cartao_credito(uuid, text, text, text, text, smallint, smallint, boolean);

create function public.fn_salvar_cartao_credito(
  p_id uuid, p_nome text, p_ultimos_digitos text, p_bandeira text, p_banco text,
  p_dia_fechamento smallint, p_dia_vencimento smallint, p_ativo boolean,
  p_conta_bancaria_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_nome text;
  v_digitos text;
begin
  if p_id is null then
    if not public.tem_permissao('cadastros.cartoes', 'criar') then
      raise exception 'Sem permissao para criar cartoes de credito';
    end if;
  else
    if not public.tem_permissao('cadastros.cartoes', 'editar') then
      raise exception 'Sem permissao para editar cartoes de credito';
    end if;
  end if;

  v_nome := btrim(coalesce(p_nome, ''));
  if v_nome = '' then
    raise exception 'Informe o nome do cartao';
  end if;

  v_digitos := regexp_replace(coalesce(p_ultimos_digitos, ''), '[^0-9]', '', 'g');
  if length(v_digitos) <> 4 then
    raise exception 'Informe os quatro ultimos digitos do cartao';
  end if;

  if p_id is null then
    if p_conta_bancaria_id is null then
      raise exception 'Escolha a conta bancaria do cartao';
    end if;
    insert into public.cartoes_credito
      (nome, ultimos_digitos, bandeira, banco, dia_fechamento, dia_vencimento, ativo,
       conta_bancaria_id, created_by)
    values (
      v_nome, v_digitos,
      nullif(btrim(coalesce(p_bandeira, '')), ''),
      nullif(btrim(coalesce(p_banco, '')), ''),
      p_dia_fechamento, p_dia_vencimento,
      coalesce(p_ativo, true), p_conta_bancaria_id, (select auth.uid())
    )
    returning id into v_id;
  else
    update public.cartoes_credito
    set nome = v_nome,
        ultimos_digitos = v_digitos,
        bandeira = nullif(btrim(coalesce(p_bandeira, '')), ''),
        banco = nullif(btrim(coalesce(p_banco, '')), ''),
        dia_fechamento = p_dia_fechamento,
        dia_vencimento = p_dia_vencimento,
        ativo = coalesce(p_ativo, true),
        conta_bancaria_id = coalesce(p_conta_bancaria_id, conta_bancaria_id)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Cartao de credito nao encontrado';
    end if;
  end if;

  return v_id;
end;
$function$;

revoke all on function public.fn_salvar_cartao_credito(uuid, text, text, text, text, smallint, smallint, boolean, uuid) from public, anon;
grant execute on function public.fn_salvar_cartao_credito(uuid, text, text, text, text, smallint, smallint, boolean, uuid) to authenticated;
