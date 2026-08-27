-- Rollback do saldo por conta (as DUAS partes).
--
-- Serve para 20260827184118 (parte 1, aditiva) e para
-- 20260827210000 (parte 2, que fecha as portas). Rodar inteiro desfaz a obra;
-- para desfazer só o fechamento, rode os passos 1, 2 e 3 e pare.
--
-- ORDEM IMPORTA: primeiro devolver o acesso (grants), depois derrubar as
-- funções, por último a tabela. Ao contrário, o app fica sem saldo nenhum entre
-- um comando e outro.
--
-- O que este rollback NÃO desfaz sozinho: a troca da mensagem dentro de
-- `fn_pagar_parcela`. Ela foi feita por `replace` sobre a definição da hora, e
-- reverter às cegas apagaria o que outras frentes tenham mudado desde então. O
-- bloco no fim faz a volta pela MESMA técnica, com âncora conferida.

-- 1. Devolve o SELECT de tabela (cobre todas as colunas, inclusive saldo_inicial)
--    e limpa os grants por coluna, que passam a ser redundantes.
--    É EXATAMENTE isto que outra frente teve que rodar às pressas em
--    27/08/2026, quando a parte 2 foi aplicada antes do deploy e derrubou quatro
--    telas. Se a produção estiver quebrada com "permission denied for table
--    contas_bancarias", estas duas linhas são o socorro.
grant select on table public.contas_bancarias to authenticated;
revoke select (
  id, nome, banco, agencia, conta, tipo, ativo,
  saldo_inicial_data, created_at, updated_at, created_by
) on table public.contas_bancarias from authenticated;

-- 2. Devolve o EXECUTE das agregadas ao client.
grant execute on function public.fn_rel_posicao_bancaria() to authenticated;
grant execute on function public.fn_rel_movimento_antes_do_corte() to authenticated;
grant execute on function public.fn_rel_posicao_aplicacao() to authenticated;

-- 3. Trava do saldo inicial (o trigger é da parte 2; a função, da parte 1).
drop trigger if exists trg_trava_saldo_inicial on public.contas_bancarias;
drop function if exists public.fn_trava_saldo_inicial();
drop function if exists public.salvar_saldos_usuario(uuid, uuid[]);
drop function if exists public.fn_saldos_das_contas();

-- 4. A tabela. `fn_pode_ver_saldo` depende dela, então sai antes.
--    ATENÇÃO: isto APAGA as marcações. Para guardar antes:
--      select u.nome, c.nome from public.usuario_conta_saldo x
--      join public.usuarios u on u.id = x.usuario_id
--      join public.contas_bancarias c on c.id = x.conta_bancaria_id
--      order by u.nome, c.nome;
drop function if exists public.fn_pode_ver_saldo(uuid);
drop table if exists public.usuario_conta_saldo;

-- 5. A mensagem do guard volta a contar o saldo para todos.
do $$
declare
  v_oid oid;
  v_def text;
  v_atual text := '    if coalesce(v_saldo, 0) - v_liquido < 0 then
      if public.fn_pode_ver_saldo(p_conta_id) then
        raise exception ''Saldo insuficiente na conta: saldo atual R$ %, pagamento de R$ %.'',
          round(coalesce(v_saldo, 0), 2), round(v_liquido, 2);
      else
        raise exception ''Saldo insuficiente nesta conta para o pagamento de R$ %.'',
          round(v_liquido, 2);
      end if;
    end if;';
  v_antigo text := '    if coalesce(v_saldo, 0) - v_liquido < 0 then
      raise exception ''Saldo insuficiente na conta: saldo atual R$ %, pagamento de R$ %.'',
        round(coalesce(v_saldo, 0), 2), round(v_liquido, 2);
    end if;';
begin
  select p.oid into strict v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_pagar_parcela';

  v_def := pg_get_functiondef(v_oid);

  -- Sem a âncora, a função seria recriada idêntica e o rollback terminaria com
  -- `success` deixando uma chamada a `fn_pode_ver_saldo` que o passo 4 acabou de
  -- derrubar — ou seja, pagamento nenhum funcionaria.
  if position(v_atual in v_def) = 0 then
    raise exception 'Guard com a mensagem condicional nao encontrado em fn_pagar_parcela: reverter na mao';
  end if;

  execute replace(v_def, v_atual, v_antigo);
end $$;
