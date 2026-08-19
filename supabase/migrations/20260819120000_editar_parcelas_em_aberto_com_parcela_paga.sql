-- Deixa editar as parcelas EM ABERTO de um lançamento que já tem parcela paga,
-- e o valor do lançamento passa a ser a soma das parcelas.
--
-- ## O que estava travado
--
-- LAN-2026-1603 (id 5a139c40), ICMS renegociado com a SEFAZ: R$ 69.826,48 em 41
-- parcelas, 3 pagas (R$ 5.247,76), 37 pendentes e 1 em revisão. Nada dava para
-- mexer: a tela escondia o botão e esta função recusava com "ja tem parcela
-- aprovada ou paga".
--
-- A trava protegia o certo do jeito errado. Ela existia porque a função apagava
-- TODAS as parcelas e reinseria, o que destruiria o pagamento das três já pagas.
-- Mas trancava junto as 38 que ninguém pagou — e renegociação de imposto muda o
-- saldo devedor. A família dessas ordens de parcelamento na base tem 21, 24, 41 e
-- 57 parcelas, várias na casa do milhão.
--
-- ## A regra de dinheiro, que inverte a de antes
--
-- Em lançamento `manual`, o valor do lançamento passa a ser a SOMA DAS PARCELAS:
-- mudar uma parcela muda o total, porque o total é derivado. Antes era o
-- contrário — a soma tinha que fechar com um valor digitado à parte.
--
-- Em lançamento de ORIGEM (OC, cotação) o cabeçalho pertence à origem, então lá a
-- regra antiga continua valendo: a soma tem que fechar com o valor. Senão o
-- lançamento gerado por uma OC poderia passar a valer diferente da ordem.
--
-- ## Por que ATUALIZA no lugar em vez de apagar e reinserir
--
-- Duas coisas se perderiam no apaga-e-reinsere, as duas medidas no banco:
--
-- 1. `parcela_eventos` tem ON DELETE CASCADE. A parcela 4 do lançamento dele é
--    justamente a que tem 3 eventos (o histórico da revisão) — e é a que ele quer
--    editar. Apagar levaria o motivo da revisão embora.
-- 2. **907 parcelas em aberto na base têm `conta_bancaria_id` preenchida.**
--    Reinserir zeraria a conta de todas elas.
--
-- Então a lista nova é casada POR POSIÇÃO com as parcelas em aberto que já
-- existem, na ordem em que a tela as mostra: as que casam são atualizadas
-- (mantendo id, conta, eventos), o excedente da lista é inserido, e as que
-- sobraram são apagadas.
--
-- O `status` de uma parcela atualizada NÃO muda. Quem está em revisão continua em
-- revisão depois de corrigida, e volta para a fila pelo botão "Reenviar para
-- aprovação" que já existe — corrigir o valor não é o mesmo que pedir aprovação.
--
-- ## O que NÃO é tocado
--
-- - `pago` e `aprovado`: intocáveis. Paga é fato; aprovada carrega data
--   programada, conta e quem aprovou.
-- - `cancelado`: fica como histórico e FORA do total, senão parcela cancelada
--   inflaria o valor do lançamento.
-- - As guardas de origem do RH (`folha`, `folha_guia`, `adiantamento`) seguem
--   iguais, com a mesma mensagem: guia de imposto tem prazo legal.
-- - `fn_aplicar_regra_pagamento` continua sendo chamada no fim, e é segura aqui:
--   ela mesma já retorna sem fazer nada quando existe parcela paga ou aprovada.
--
-- ## Duas recusas novas, as duas para não estragar dinheiro em silêncio
--
-- - Parcela em aberto CONCILIADA com o extrato não pode ser mexida: mudar o valor
--   quebraria a conciliação que já bateu. (Hoje são 0 na base; a recusa é para não
--   virar um erro de chave estrangeira sem explicação depois.)
-- - Parcela com desconto maior que o valor novo é recusada com mensagem própria,
--   em vez de estourar o CHECK `desconto <= valor`.
--
-- ## Auditoria
--
-- `trg_audit_lancamentos` e `trg_audit_lancamento_parcelas` já existem, então a
-- mudança do valor e de cada parcela entra em `audit_log` sozinha. É o registro
-- que sustenta uma alteração de valor em documento já aprovado e com pagamento
-- feito.
--
-- Recriada a partir da `pg_get_functiondef` viva (md5 0aa578ae20f6ac29a5f43f8d236a3254).

create or replace function public.fn_definir_parcelas_lancamento(
  p_lanc_id uuid,
  p_parcelas jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_valor numeric(14, 2);
  v_status text;
  v_origem text;
  v_soma_nova numeric(14, 2);
  v_soma_preservada numeric(14, 2);
  v_total numeric(14, 2);
  v_qtd int;
  v_preservadas int;
  v_abertas int;
  v_base smallint;
  v_falta text;
begin
  if not public.tem_permissao('financeiro.lancamentos', 'editar') then
    raise exception 'Sem permissao para editar lancamentos';
  end if;

  select valor, status, origem into v_valor, v_status, v_origem
  from public.lancamentos
  where id = p_lanc_id;

  if v_valor is null then
    raise exception 'Lancamento nao encontrado';
  end if;
  if v_status = 'cancelado' then
    raise exception 'Lancamento cancelado nao aceita parcelas';
  end if;

  -- Guarda de origem: mesmo criterio e mesma forma de mensagem da
  -- fn_excluir_lancamento. Lancamento que veio do RH nao se reparcela pelo
  -- Financeiro: guia de imposto tem prazo legal, e o vencimento sai do dia
  -- configurado em Parametros da Folha.
  if v_origem in ('folha', 'folha_guia') then
    raise exception 'Nao da para trocar as parcelas aqui: este lancamento veio da folha. Mude o dia de vencimento em Parametros da Folha, depois desaprove e reaprove a folha';
  end if;

  if v_origem = 'adiantamento' then
    raise exception 'Nao da para trocar as parcelas aqui: este lancamento veio de um adiantamento. Exclua e recrie o adiantamento pelo RH';
  end if;

  -- As pagas e aprovadas ficam. Sao o piso do lancamento.
  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_preservadas, v_soma_preservada
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status in ('aprovado', 'pago');

  select count(*) into v_abertas
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao');

  v_qtd := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));

  -- Lista vazia so passa quando ha parcela preservada: o lancamento fica valendo
  -- o que ja foi pago. Sem nenhuma das duas, o lancamento ficaria sem parcela.
  if v_qtd = 0 and v_preservadas = 0 then
    raise exception 'Informe ao menos uma parcela';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_parcelas) x
    where coalesce((x->>'valor')::numeric, 0) <= 0
  ) then
    raise exception 'Toda parcela precisa de um valor maior que zero';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_parcelas) x
    where nullif(x->>'data_vencimento', '') is null
  ) then
    raise exception 'Toda parcela precisa de uma data de vencimento';
  end if;

  -- Conciliada com o extrato: mexer no valor quebraria a conciliacao que bateu.
  select string_agg(distinct p.numero_parcela::text, ', ' order by p.numero_parcela::text)
  into v_falta
  from public.lancamento_parcelas p
  join public.extrato_transacoes t on t.parcela_id = p.id
  where p.lancamento_id = p_lanc_id and p.status in ('pendente', 'em_revisao');

  if v_falta is not null then
    raise exception 'A parcela % esta conciliada com o extrato: desfaca a conciliacao antes de mexer nas parcelas', v_falta;
  end if;

  select round(coalesce(sum((x->>'valor')::numeric), 0), 2)
  into v_soma_nova
  from jsonb_array_elements(p_parcelas) x;

  v_total := round(v_soma_preservada + v_soma_nova, 2);
  if v_total <= 0 then
    raise exception 'O total das parcelas precisa ser maior que zero';
  end if;

  -- Em lancamento de origem o cabecalho manda: a soma tem que fechar com ele.
  if v_origem <> 'manual' and v_total <> round(v_valor, 2) then
    raise exception 'A soma das parcelas (R$ %) precisa fechar com o valor do lancamento (R$ %)', v_total, round(v_valor, 2);
  end if;

  -- Desconto maior que o valor novo estouraria o CHECK sem explicar nada.
  with abertas as (
    select id, numero_parcela, desconto,
           row_number() over (order by numero_parcela, id) as pos
    from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao')
  ),
  nova as (
    select ord::int as pos, round((x->>'valor')::numeric, 2) as valor
    from jsonb_array_elements(p_parcelas) with ordinality as t(x, ord)
  )
  select string_agg(a.numero_parcela::text, ', ' order by a.numero_parcela)
  into v_falta
  from abertas a
  join nova n on n.pos = a.pos
  where coalesce(a.desconto, 0) > n.valor;

  if v_falta is not null then
    raise exception 'A parcela % tem desconto maior que o valor novo: tire o desconto antes', v_falta;
  end if;

  -- 1. As que casam por posicao sao ATUALIZADAS: id, conta bancaria e eventos
  --    continuam. O status nao muda (em revisao segue em revisao).
  --
  --    A ordem e por (numero_parcela, id) e NAO inclui data_vencimento de
  --    proposito: este passo altera o vencimento, e ordenar por uma coluna que o
  --    proprio passo muda embaralharia as posicoes entre um passo e o seguinte.
  with abertas as (
    select id, row_number() over (order by numero_parcela, id) as pos
    from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao')
  ),
  nova as (
    select ord::int as pos,
           round((x->>'valor')::numeric, 2) as valor,
           (x->>'data_vencimento')::date as venc
    from jsonb_array_elements(p_parcelas) with ordinality as t(x, ord)
  )
  update public.lancamento_parcelas p
  set valor = n.valor,
      data_vencimento = n.venc
  from abertas a
  join nova n on n.pos = a.pos
  where p.id = a.id;

  -- 2. As abertas que sobraram saem.
  with abertas as (
    select id, row_number() over (order by numero_parcela, id) as pos
    from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao')
  )
  delete from public.lancamento_parcelas p
  using abertas a
  where p.id = a.id and a.pos > v_qtd;

  -- 3. O excedente da lista entra como parcela nova.
  select coalesce(max(numero_parcela), 0) into v_base
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id;

  insert into public.lancamento_parcelas (
    lancamento_id, numero_parcela, valor, data_vencimento, status, created_by
  )
  select
    p_lanc_id,
    (v_base + row_number() over (order by t.ord))::smallint,
    round((t.x->>'valor')::numeric, 2),
    (t.x->>'data_vencimento')::date,
    'pendente',
    (select auth.uid())
  from jsonb_array_elements(p_parcelas) with ordinality as t(x, ord)
  where t.ord > v_abertas;

  -- 4. Renumera SO as em aberto, depois das preservadas, em ordem de vencimento.
  --    As preservadas e as canceladas mantem o numero que sempre tiveram.
  with fixas as (
    select coalesce(max(numero_parcela), 0) as ate
    from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status not in ('pendente', 'em_revisao')
  ),
  ordem as (
    select id, row_number() over (order by data_vencimento, id) as pos
    from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao')
  )
  update public.lancamento_parcelas p
  set numero_parcela = (f.ate + o.pos)::smallint
  from ordem o, fixas f
  where p.id = o.id and p.numero_parcela <> (f.ate + o.pos)::smallint;

  -- 5. O total. Em manual e a soma das parcelas (canceladas de fora).
  select round(coalesce(sum(valor), 0), 2)
  into v_total
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status <> 'cancelado';

  if v_origem = 'manual' then
    update public.lancamentos
    set valor = v_total
    where id = p_lanc_id and round(valor, 2) <> v_total;
  end if;

  update public.lancamentos
  set data_vencimento = (
    select min(lp.data_vencimento)
    from public.lancamento_parcelas lp
    where lp.lancamento_id = p_lanc_id
  )
  where id = p_lanc_id;

  perform public.fn_aplicar_regra_pagamento(p_lanc_id);
end;
$function$;
