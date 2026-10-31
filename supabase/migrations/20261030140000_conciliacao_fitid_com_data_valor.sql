-- =============================================================
-- Conciliacao: FITID nao identifica o movimento sozinho
--
-- Defeito (Tiago, 30/10/2026): o OFX de outubro da Caixa 578367973-5 descartou
-- como "ja importado" o debito do cartao (CARTAO CX) e o do seguro
-- (SEGURADORA) de 28/10. A Caixa repete o FITID do debito automatico todo mes
-- (cartao 089429, seguro 329493, os mesmos de 28/09), e a chave de duplicidade
-- era o FITID puro: bateu no unique (conta, chave_dedup) com setembro. O
-- resgate automatico que cobriu os dois debitos entrou, e o mes ficou com
-- R$ 36.065,77 lancados no app sem par no extrato.
--
-- 1. A chave com FITID passa a ser 'fi:<fitid>:<data>:<valor>'. Reimportar o
--    mesmo arquivo continua deduplicando (mesmo FITID, data e valor); o debito
--    do mes seguinte com o FITID repetido vira movimento novo.
-- 2. As chaves gravadas so com o FITID sao reescritas no formato novo, para
--    que reimportar um arquivo antigo nao duplique o que ja esta no extrato.
--    Unicidade preservada: FITID unico por conta implica FITID+data+valor unico.
-- =============================================================

CREATE OR REPLACE FUNCTION public.fn_conciliacao_importar(p_conta_id uuid, p_nome text, p_periodo_inicio date, p_periodo_fim date, p_saldo_final numeric, p_saldo_final_data date, p_transacoes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_extrato uuid; v_t jsonb; v_inseridas int := 0; v_ignoradas int := 0; v_tipo text;
  v_conta_ativa boolean; v_fitid text; v_data date; v_valor numeric(14,2); v_memo text; v_chave text;
  v_n int;
  v_ignorados jsonb := '[]'::jsonb;
  v_meses date[] := '{}';
  v_reabertos int := 0;
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
    -- FITID entra com data e valor: a Caixa repete o FITID do debito
    -- automatico todo mes, e o FITID sozinho descartava o mes seguinte.
    v_chave := case
      when v_fitid is not null then
        'fi:' || v_fitid || ':' || to_char(v_data, 'YYYY-MM-DD') || ':' || to_char(v_valor, 'FM9999999999999990.00')
      else
        'sd:' || to_char(v_data, 'YYYY-MM-DD') || ':' || to_char(v_valor, 'FM9999999999999990.00')
        || ':' || coalesce(v_memo, '') || ':' || v_n
    end;
    begin
      insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, fitid, chave_dedup)
      values (v_extrato, p_conta_id, v_data, v_valor, v_tipo, v_memo, v_fitid, v_chave);
      v_inseridas := v_inseridas + 1;
      v_meses := array_append(v_meses, date_trunc('month', v_data)::date);
    exception when unique_violation then
      v_ignoradas := v_ignoradas + 1;
      v_ignorados := v_ignorados || jsonb_build_object(
        'data', v_data, 'valor', v_valor, 'memo', v_memo, 'fitid', v_fitid);
    end;
  end loop;

  -- Nada novo: o arquivo ja estava importado. Nao fica extrato vazio no
  -- historico; a tela diz "esse arquivo ja estava importado".
  if v_inseridas = 0 then
    delete from public.extratos_ofx where id = v_extrato;
    v_extrato := null;
  else
    update public.extratos_ofx
       set qtd_inseridas = v_inseridas, qtd_ignoradas = v_ignoradas
     where id = v_extrato;
  end if;

  -- Ancora do saldo (Bloco K): o LEDGERBAL so vale como saldo do fim do
  -- periodo quando o banco diz que e dessa data (DTASOF = fim). O BB poe a
  -- data do download, entao no BB nunca vira ancora.
  if p_saldo_final is not null and p_saldo_final_data is not null
     and p_periodo_fim is not null and p_saldo_final_data = p_periodo_fim then
    insert into public.conciliacao_saldos_ancora (conta_bancaria_id, data, saldo, fonte, observacao)
    values (p_conta_id, p_periodo_fim, round(p_saldo_final, 2), 'ledgerbal_fim_periodo', p_nome)
    on conflict (conta_bancaria_id, data) do nothing;
  end if;

  -- Mes fechado aceita importacao, mas movimento novo reabre o mes: o que
  -- estava conciliado deixou de ser o extrato inteiro.
  update public.conciliacao_fechamentos f
     set reaberto_em = now(), reaberto_por = (select auth.uid()),
         motivo_reabertura = 'novo movimento importado'
   where f.conta_bancaria_id = p_conta_id
     and f.reaberto_em is null
     and f.mes = any (v_meses);
  get diagnostics v_reabertos = row_count;

  return jsonb_build_object(
    'meses_reabertos', v_reabertos,
    'extrato_id', v_extrato,
    'inseridas', v_inseridas,
    'ignoradas', v_ignoradas,
    'ignorados', v_ignorados
  );
end
$function$;

update public.extrato_transacoes
   set chave_dedup = 'fi:' || fitid || ':' || to_char(data_movimento, 'YYYY-MM-DD')
                     || ':' || to_char(valor, 'FM9999999999999990.00')
 where fitid is not null
   and chave_dedup = fitid;
