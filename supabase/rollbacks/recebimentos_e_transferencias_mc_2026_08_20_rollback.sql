-- Rollback de supabase/carga/recebimentos_e_transferencias_mc_2026_08_20.sql.
--
-- Desfaz a carga do historico do Mais Controle: apaga os 497 recebimentos, as
-- 319 transferencias e DEVOLVE ao `saldo_inicial` de cada conta o que a carga
-- tinha descontado dela. As tres coisas na mesma transacao, porque desfazer so
-- uma parte deixa o saldo das contas errado.
--
-- A ancora e `observacoes = 'Importado do Mais Controle em 20/08/2026'`, gravada
-- em todo lancamento e em toda transferencia da carga. Recebimento lancado pela
-- tela depois disso NAO tem essa observacao e sobrevive.
--
-- ## Trava
--
-- Se alguem ja tiver conciliado uma parcela desta carga com o extrato, o
-- rollback para: apagar a parcela deixaria a transacao do extrato apontando
-- para o vazio. Nesse caso e preciso desfazer a conciliacao antes.
--
-- ## O que NAO e desfeito
--
-- As 4 categorias de receita e os 4 clientes criados ficam. Sao cadastro, nao
-- movimento: apagar quebraria qualquer lancamento que ja os use, e um cadastro
-- a mais nao desequilibra saldo nenhum. Se quiser sumir com eles, inative pela
-- tela depois de conferir que ninguem aponta para eles.

begin;

do $$
declare
  v_conciliadas int;
  v_lanc int;
  v_transf int;
begin
  select count(*) into v_conciliadas
  from public.extrato_transacoes t
  join public.lancamento_parcelas p on p.id = t.parcela_id
  join public.lancamentos l on l.id = p.lancamento_id
  where l.observacoes = 'Importado do Mais Controle em 20/08/2026';

  if v_conciliadas > 0 then
    raise exception
      'Nao da para desfazer: % parcela(s) desta carga ja foram conciliadas com o extrato. Desfaca a conciliacao antes',
      v_conciliadas;
  end if;

  -- 1. devolve ao saldo inicial o que a carga tinha descontado, ANTES de apagar
  --    (depois de apagar nao ha mais de onde tirar os totais)
  update public.contas_bancarias cb
  set saldo_inicial = cb.saldo_inicial
      + coalesce((
          select sum(p.valor)
          from public.lancamento_parcelas p
          join public.lancamentos l on l.id = p.lancamento_id
          where l.observacoes = 'Importado do Mais Controle em 20/08/2026'
            and p.conta_bancaria_id = cb.id
        ), 0)
      + coalesce((
          select sum(t.valor) from public.transferencias_contas t
          where t.observacoes = 'Importado do Mais Controle em 20/08/2026'
            and t.conta_destino_id = cb.id
        ), 0)
      - coalesce((
          select sum(t.valor) from public.transferencias_contas t
          where t.observacoes = 'Importado do Mais Controle em 20/08/2026'
            and t.conta_origem_id = cb.id
        ), 0);

  -- 2. apaga os movimentos. Parcelas e rateios saem por cascade do lancamento.
  delete from public.transferencias_contas
  where observacoes = 'Importado do Mais Controle em 20/08/2026';
  get diagnostics v_transf = row_count;

  delete from public.lancamentos
  where tipo = 'a_receber'
    and observacoes = 'Importado do Mais Controle em 20/08/2026';
  get diagnostics v_lanc = row_count;

  raise notice 'desfeitos: % recebimentos, % transferencias', v_lanc, v_transf;
end $$;

commit;
