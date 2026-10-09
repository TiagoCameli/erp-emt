-- =============================================================
-- Cartao com conta (parte 3): a fatura de um cartao so se casa com debito da
-- conta dele. fn_conciliacao_casar_fatura e alterada a partir dela mesma (e uma
-- funcao grande e so um bloco muda); aborta se o bloco nao for encontrado.
--
-- chr(10) em vez de E'\n': o conector do MCP recusou a migration com escapes.
-- =============================================================
do $fatura$
declare
  nl text := chr(10);
  v_def text := pg_get_functiondef('public.fn_conciliacao_casar_fatura(uuid, uuid, uuid[], jsonb)'::regprocedure);
  v_antes text;
  v_depois text;
begin
  v_antes := '  if not exists (select 1 from public.cartoes_credito where id = p_cartao_id) then' || nl
          || '    raise exception ''Cartao nao encontrado'';' || nl
          || '  end if;' || nl;
  v_depois := v_antes
          || '  if not exists (' || nl
          || '    select 1 from public.cartoes_credito' || nl
          || '    where id = p_cartao_id and conta_bancaria_id = v_t.conta_bancaria_id' || nl
          || '  ) then' || nl
          || '    raise exception ''Este cartao e de outra conta bancaria: a fatura dele so se paga pela conta dele'';' || nl
          || '  end if;' || nl;
  if position(v_antes in v_def) = 0 then
    raise exception 'fn_conciliacao_casar_fatura mudou: o bloco do cartao nao foi encontrado';
  end if;
  execute replace(v_def, v_antes, v_depois);
end $fatura$;
