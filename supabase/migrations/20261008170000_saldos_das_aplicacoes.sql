-- =============================================================
-- Saldo atual de cada aplicacao, para expandir a subconta em Contas bancarias
--
-- PEDIDO DO TIAGO (08/10/2026): "aqui onde tem as contas bancarias de
-- investimentos quero poder expandir e mostrar quais sao os investimentos e
-- quanto tem em cada um".
--
-- A REGRA: o saldo da aplicacao e a parte DELA no saldo da subconta, pelas
-- mesmas pecas que fn_rel_posicao_bancaria usa, entao a soma das aplicacoes
-- fecha com o saldo da subconta por construcao:
--
--   saldo inicial da aplicacao (se a subconta tem corte)
--   + transferencias da etapa dela depois do corte (saida desconta a tarifa)
--   + parcelas no saldo dos lancamentos das posicoes dela (rendimento, ajuste)
--
-- O que a subconta tiver fora disso (lancamento sem aplicacao) a tela mostra
-- como diferenca, nunca esconde. Conferido em 08/10/2026: zero nas tres.
--
-- E saldo: filtrada por fn_pode_ver_saldo, como fn_saldos_das_contas. Conta
-- ausente da resposta = sem permissao, nunca zero.
-- =============================================================

create function public.fn_saldos_das_aplicacoes()
returns table(
  aplicacao_id uuid, conta_bancaria_id uuid, nome text, produto text,
  ativa boolean, saldo numeric, ultima_posicao date
)
language sql
stable
security definer
set search_path to ''
as $function$
  with apl as (
    select a.id, a.conta_bancaria_id as conta, a.centro_custo_id as etapa,
      a.produto, a.ativa, a.saldo_inicial, s.saldo_inicial_data as corte, e.nome
    from public.aplicacoes a
    join public.contas_bancarias s on s.id = a.conta_bancaria_id
    join public.centros_custo e on e.id = a.centro_custo_id
    where public.fn_pode_ver_saldo(a.conta_bancaria_id)
      and (public.tem_permissao('financeiro.contas-bancarias', 'ver')
           or public.tem_permissao('financeiro.aplicacoes', 'ver'))
  )
  select apl.id, apl.conta, apl.nome, apl.produto, apl.ativa,
    round(
      case when apl.corte is null then 0 else apl.saldo_inicial end
      + coalesce((
          select sum(case when t.conta_destino_id = apl.conta then t.valor else -(t.valor + t.tarifa) end)
          from public.transferencias_contas t
          where t.centro_custo_id = apl.etapa
            and apl.conta in (t.conta_origem_id, t.conta_destino_id)
            and (apl.corte is null or t.data_transferencia > apl.corte)
        ), 0)
      + coalesce((
          select sum(case when v.tipo = 'a_receber' then v.valor_liquido else -v.valor_liquido end)
          from public.vw_parcelas_caixa v
          join public.lancamentos l on l.id = v.lancamento_id
          join public.aplicacao_posicoes p on p.id = l.origem_id
          where l.origem = 'aplicacao'
            and p.aplicacao_id = apl.id
            and v.conta_bancaria_id = apl.conta
            and v.no_saldo
        ), 0),
      2),
    (select max(p.data) from public.aplicacao_posicoes p
      where p.aplicacao_id = apl.id and p.excluido_em is null)
  from apl
  order by apl.nome;
$function$;

revoke all on function public.fn_saldos_das_aplicacoes() from public, anon;
grant execute on function public.fn_saldos_das_aplicacoes() to authenticated;

-- A soma tem que fechar com o saldo de cada subconta (nao ha lancamento sem
-- aplicacao nas subcontas hoje). Refeita aqui sem a funcao, porque sem sessao
-- (auth.uid() nulo) as guardas de permissao dela nao deixam nada passar.
do $confere$
declare r record;
begin
  for r in
    select s.id, s.nome, public.fn_saldo_conta(s.id) as saldo,
      (select coalesce(sum(x.saldo), 0) from (
         select round(
           case when s.saldo_inicial_data is null then 0 else a.saldo_inicial end
           + coalesce((select sum(case when t.conta_destino_id = s.id then t.valor else -(t.valor + t.tarifa) end)
               from public.transferencias_contas t
               where t.centro_custo_id = a.centro_custo_id and s.id in (t.conta_origem_id, t.conta_destino_id)
                 and (s.saldo_inicial_data is null or t.data_transferencia > s.saldo_inicial_data)), 0)
           + coalesce((select sum(case when v.tipo = 'a_receber' then v.valor_liquido else -v.valor_liquido end)
               from public.vw_parcelas_caixa v
               join public.lancamentos l on l.id = v.lancamento_id
               join public.aplicacao_posicoes p on p.id = l.origem_id
               where l.origem = 'aplicacao' and p.aplicacao_id = a.id
                 and v.conta_bancaria_id = s.id and v.no_saldo), 0), 2) as saldo
         from public.aplicacoes a where a.conta_bancaria_id = s.id) x) as soma
    from public.contas_bancarias s
    where exists (select 1 from public.aplicacoes a where a.conta_bancaria_id = s.id)
  loop
    if r.saldo <> r.soma then
      raise exception 'As aplicacoes de % somam R$ % e o saldo e R$ %', r.nome, r.soma, r.saldo;
    end if;
  end loop;
end $confere$;
