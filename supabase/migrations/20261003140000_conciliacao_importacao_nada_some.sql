-- =============================================================
-- Conciliacao 100% precisa, Bloco C: nenhum movimento some na importacao
--
-- Pedido do Tiago (03/10/2026). Sem FITID a chave de duplicidade era
-- data + valor + historico: duas diarias de R$ 150,00 no mesmo dia para a
-- mesma pessoa viravam uma so, e a segunda era descartada como "ignorada"
-- sem ninguem ver.
--
-- 1. Sem FITID a chave inclui a POSICAO do movimento entre os iguais dentro
--    do arquivo (sd:data:valor:memo:n). O app calcula n (numerarRepetidos);
--    sem n, assume 1. Reimportar o mesmo arquivo continua deduplicando.
--    Chaves antigas (sem :n) nao existem mais: as importacoes foram apagadas
--    em 03/10/2026 a pedido do Tiago.
-- 2. A importacao devolve a lista dos ignorados (data, valor, memo, fitid),
--    para a tela mostrar quais foram, nao so quantos.
-- 3. Arquivo que declara o periodo e nao tem nenhum movimento dentro dele e
--    recusado (o app recusa antes; a RPC recusa tambem).
--
-- So muda o corpo de fn_conciliacao_importar (assinatura igual, retorno com
-- uma chave a mais). fn_importar_extrato, a antiga, nao e tocada.
-- =============================================================

create or replace function public.fn_conciliacao_importar(
  p_conta_id uuid,
  p_nome text,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_saldo_final numeric,
  p_saldo_final_data date,
  p_transacoes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_extrato uuid; v_t jsonb; v_inseridas int := 0; v_ignoradas int := 0; v_tipo text;
  v_conta_ativa boolean; v_fitid text; v_data date; v_valor numeric(14,2); v_memo text; v_chave text;
  v_n int;
  v_ignorados jsonb := '[]'::jsonb;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'criar') then raise exception 'Sem permissao para importar extratos'; end if;
  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;
  if p_transacoes is null or jsonb_array_length(p_transacoes) = 0 then raise exception 'O arquivo nao tem transacoes'; end if;

  if p_periodo_inicio is not null and p_periodo_fim is not null and not exists (
    select 1 from jsonb_array_elements(p_transacoes) x
    where (x->>'data')::date between p_periodo_inicio and p_periodo_fim
  ) then
    raise exception 'O arquivo declara o periodo de % a %, mas nenhum movimento cai nesse periodo',
      to_char(p_periodo_inicio, 'DD/MM/YYYY'), to_char(p_periodo_fim, 'DD/MM/YYYY');
  end if;

  select ativo into v_conta_ativa from public.contas_bancarias where id = p_conta_id;
  if v_conta_ativa is null then raise exception 'Conta bancaria nao encontrada'; end if;
  if not v_conta_ativa then raise exception 'Conta bancaria inativa'; end if;

  insert into public.extratos_ofx (conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim, saldo_final, saldo_final_data, created_by)
  values (p_conta_id, p_nome, p_periodo_inicio, p_periodo_fim, round(p_saldo_final, 2), p_saldo_final_data, (select auth.uid()))
  returning id into v_extrato;

  for v_t in select * from jsonb_array_elements(p_transacoes) loop
    v_fitid := nullif(btrim(v_t->>'fitid'), '');
    v_data := (v_t->>'data')::date;
    v_valor := (v_t->>'valor')::numeric;
    v_memo := v_t->>'memo';
    v_n := coalesce(nullif(v_t->>'n', '')::int, 1);
    v_tipo := case when v_valor >= 0 then 'credito' else 'debito' end;
    v_chave := coalesce(v_fitid,
      'sd:' || to_char(v_data, 'YYYY-MM-DD') || ':' || to_char(v_valor, 'FM9999999999999990.00')
      || ':' || coalesce(v_memo, '') || ':' || v_n);
    begin
      insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, fitid, chave_dedup)
      values (v_extrato, p_conta_id, v_data, v_valor, v_tipo, v_memo, v_fitid, v_chave);
      v_inseridas := v_inseridas + 1;
    exception when unique_violation then
      v_ignoradas := v_ignoradas + 1;
      v_ignorados := v_ignorados || jsonb_build_object(
        'data', v_data, 'valor', v_valor, 'memo', v_memo, 'fitid', v_fitid);
    end;
  end loop;

  return jsonb_build_object(
    'extrato_id', v_extrato,
    'inseridas', v_inseridas,
    'ignoradas', v_ignoradas,
    'ignorados', v_ignorados
  );
end
$function$;
