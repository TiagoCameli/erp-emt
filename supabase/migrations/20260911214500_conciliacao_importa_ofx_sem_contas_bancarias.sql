-- Conciliação: importar OFX passa a depender só do recurso Conciliação.
--
-- O DEFEITO (print do usuário em 09/09/2026, erro "Sem permissao para ver
-- contas bancarias"): `fn_importar_extrato` exigia, além de
-- `financeiro.conciliacao`/`criar`, a permissão `financeiro.contas-bancarias`
-- /`ver` — um recurso DIFERENTE, que a tela de Conciliação não pede em lugar
-- nenhum. Quem recebia a Conciliação inteira passava por tudo (abria a tela,
-- escolhia a conta, escolhia o arquivo) e só descobria a trava no último
-- clique, com uma mensagem crua do banco. `extratos_ofx` estava VAZIA: nenhum
-- extrato jamais entrou pelo app.
--
-- Que a exigência era sobra, e não regra, se vê nas irmãs: `fn_conciliar_
-- transacao` e `fn_desconciliar_transacao` cobram só `financeiro.conciliacao`.
--
-- A SEGUNDA METADE do mesmo defeito: a policy de SELECT de `contas_bancarias`
-- lista sete permissões que dão direito de ver a conta, e nenhuma delas é a
-- Conciliação. Quem tivesse SÓ Conciliação abriria a tela com o seletor de
-- conta vazio — sem nada para escolher, sem erro, sem explicação.
--
-- As duas mudanças ALARGAM acesso (nenhuma fecha nada), então podem ser
-- aplicadas no banco vivo antes do deploy, sem derrubar o código que já roda
-- — ver [[feedback_estreitar_privilegio_derruba_producao]].
--
-- O saldo continua protegido por onde sempre esteve: `saldo_inicial` não é
-- legível pelo `authenticated` (revoke de tabela + grant por coluna), e o
-- saldo da tela sai de `fn_saldos_das_contas()`, filtrada por
-- `fn_pode_ver_saldo`. Alargar a policy de linha não mostra valor nenhum.

create or replace function public.fn_importar_extrato(
  p_conta_id uuid,
  p_nome text,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_transacoes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_extrato uuid; v_t jsonb; v_inseridas int := 0; v_ignoradas int := 0; v_tipo text; v_conta_ativa boolean; v_fitid text; v_data date; v_valor numeric(14,2); v_memo text; v_chave text;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'criar') then raise exception 'Sem permissao para importar extratos'; end if;
  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;
  if p_transacoes is null or jsonb_array_length(p_transacoes) = 0 then raise exception 'O arquivo nao tem transacoes'; end if;

  select ativo into v_conta_ativa from public.contas_bancarias where id = p_conta_id;
  if v_conta_ativa is null then raise exception 'Conta bancaria nao encontrada'; end if;
  if not v_conta_ativa then raise exception 'Conta bancaria inativa'; end if;

  insert into public.extratos_ofx (conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim, created_by)
  values (p_conta_id, p_nome, p_periodo_inicio, p_periodo_fim, (select auth.uid())) returning id into v_extrato;

  for v_t in select * from jsonb_array_elements(p_transacoes) loop
    v_fitid := nullif(btrim(v_t->>'fitid'), '');
    v_data := (v_t->>'data')::date;
    v_valor := (v_t->>'valor')::numeric;
    v_memo := v_t->>'memo';
    v_tipo := case when v_valor >= 0 then 'credito' else 'debito' end;
    v_chave := coalesce(v_fitid, 'sd:' || to_char(v_data, 'YYYY-MM-DD') || ':' || to_char(v_valor, 'FM9999999999999990.00') || ':' || coalesce(v_memo, ''));
    begin
      insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, fitid, chave_dedup)
      values (v_extrato, p_conta_id, v_data, v_valor, v_tipo, v_memo, v_fitid, v_chave);
      v_inseridas := v_inseridas + 1;
    exception when unique_violation then
      v_ignoradas := v_ignoradas + 1;
    end;
  end loop;

  return jsonb_build_object('extrato_id', v_extrato, 'inseridas', v_inseridas, 'ignoradas', v_ignoradas);
end $function$;

-- A Conciliação entra na lista de quem enxerga a conta bancária, do lado dos
-- outros sete recursos do Financeiro que já enxergavam. Sem isto, o seletor de
-- conta do diálogo de importação volta vazio para quem só tem Conciliação.
alter policy contas_bancarias_select on public.contas_bancarias
using (
  (select public.tem_permissao('financeiro.contas-bancarias', 'ver'))
  or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
  or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
  or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
  or (select public.tem_permissao('financeiro.recebimentos', 'ver'))
  or (select public.tem_permissao('financeiro.transferencias', 'ver'))
  or (select public.tem_permissao('financeiro.relatorios', 'ver'))
  or (select public.tem_permissao('financeiro.conciliacao', 'ver'))
);
