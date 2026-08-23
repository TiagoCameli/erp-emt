-- =============================================================
-- A conta Amazonia sai de uso, e a caixinha ganha o zero declarado
--
-- PEDIDO DO TIAGO (23/08/2026): "Quero desativar a conta da Amazonia e a caixinha
-- esta zerada mesmo."
--
-- ============================================================
-- CAIXINHA DE DINHEIRO: o zero passa a ser afirmado, e nao coincidencia
-- ============================================================
-- Ela JA mostrava R$ 0,00, mas por acidente: o `saldo_inicial` era um plug de
-- R$ 13.683,79 calibrado para ser o negativo exato do movimento (o mesmo defeito
-- das outras contas, ver 20260822190000). O zero na tela nao vinha de ninguem ter
-- contado o dinheiro.
--
-- Agora vem: `saldo_inicial = 0,00` com corte em 23/08/2026, que e o dia em que
-- ele conferiu. O numero na tela nao muda, e a razao dele muda por completo --
-- deixa de ser aritmetica que fechou em zero e passa a ser uma contagem.
--
-- CORTE EM 23/08 E NAO ANTES: o corte significa "tudo ate esta data, inclusive,
-- ja esta representado por este saldo". O ultimo pagamento pela caixinha foi
-- 18/08/2026, entao nao ha nada entre a ultima saida e a contagem.
--
-- CONSEQUENCIA QUE ELE PRECISA SABER: pagamento pela caixinha com data de HOJE
-- lancado depois disto NAO vai mexer no saldo, porque cai dentro do corte. Do dia
-- 24 em diante o saldo volta a andar sozinho. Numa caixa fisica isso raramente
-- incomoda (basta recontar), mas e o comportamento, e nao um defeito.
--
-- ============================================================
-- AMAZONIA: desativada, e o saldo NAO foi tocado de proposito
-- ============================================================
-- Zero parcelas em aberto (conferido), entao desativar nao trava pagamento
-- nenhum. Ela sai dos seletores de conta, do relatorio de Posicao bancaria (que
-- filtra `ativo`) e das telas de pagamento e transferencia. Continua na aba Contas
-- bancarias, porque dinheiro em conta desativada continua existindo -- e por isso
-- mesmo o que vem a seguir importa.
--
-- O `saldo_inicial` dela CONTINUA em -R$ 854.793,45, que e plug. Nao escrevi zero
-- ali, e a razao e simples: ele me disse para desativar, nao me disse o saldo. O
-- saldo na tela hoje ja e R$ 0,00 (o plug cancela o movimento), entao gravar zero
-- nao mudaria numero nenhum -- so trocaria um zero acidental por um zero
-- AFIRMADO, e afirmar saldo de conta bancaria sem alguem ter olhado o extrato e
-- exatamente como os R$ 21,5 milhoes de abertura ficticia entraram nesta base.
--
-- Fica assim, e a diferenca e visivel: a caixinha tem data de corte e a Amazonia
-- nao, o que na tela significa "este zero foi conferido" contra "este zero e o
-- que sobrou da conta". Se a conta esta encerrada e zerada, e uma linha de
-- migration para acertar.
-- =============================================================

update public.contas_bancarias
set saldo_inicial = 0.00,
    saldo_inicial_data = '2026-08-23',
    updated_at = now()
where nome = 'CAIXINHA DE DINHEIRO';

update public.contas_bancarias
set ativo = false,
    updated_at = now()
where nome = 'BANCO DO BRASIL 1197-5 AMAZÔNIA';

do $guardas$
declare
  v_caixinha numeric; v_amazonia_ativa boolean; v_abertas int;
begin
  select public.fn_saldo_conta(id) into v_caixinha
  from public.contas_bancarias where nome = 'CAIXINHA DE DINHEIRO';
  if v_caixinha is null then
    raise exception 'Conta CAIXINHA DE DINHEIRO nao encontrada: o nome mudou?';
  end if;
  if v_caixinha <> 0 then
    raise exception
      'A caixinha devia ficar em R$ 0,00 e ficou em R$ %. Ha movimento depois de 23/08/2026?',
      to_char(v_caixinha, 'FM999999999990.00');
  end if;

  select ativo into v_amazonia_ativa
  from public.contas_bancarias where nome = 'BANCO DO BRASIL 1197-5 AMAZÔNIA';
  if v_amazonia_ativa is null then
    raise exception 'Conta BANCO DO BRASIL 1197-5 AMAZONIA nao encontrada: o nome mudou?';
  end if;
  if v_amazonia_ativa then
    raise exception 'A Amazonia continuou ativa.';
  end if;

  -- Desativar conta com parcela esperando pagamento deixaria a parcela sem
  -- destino, e o seletor nao ofereceria a conta para trocar. Conferido: zero.
  select count(*) into v_abertas
  from public.lancamento_parcelas p
  join public.contas_bancarias c on c.id = p.conta_bancaria_id
  where c.nome = 'BANCO DO BRASIL 1197-5 AMAZÔNIA'
    and p.status not in ('pago', 'cancelado');
  if v_abertas > 0 then
    raise exception
      'A Amazonia tem % parcela(s) esperando pagamento: troque a conta delas antes de desativar.',
      v_abertas;
  end if;

  raise notice 'Caixinha em R$ 0,00 com corte em 23/08/2026, Amazonia inativa e sem parcela em aberto.';
end $guardas$;
