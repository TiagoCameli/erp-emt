-- Tira as quatro ordens de compra da condicao de pagamento INATIVA.
--
-- Aplicado no banco em 18/08/2026.
--
-- ## O que estava errado
--
-- A carga das ordens do Mais Controle (17/08) precisava de uma condicao de
-- pagamento para as quatro ordens em que o Mais Controle escreve so "BOLETO", sem
-- prazo. Ela escolheu `Boleto 30 dias`, a unica com "boleto" no nome -- e nao
-- conferiu que essa condicao esta INATIVA.
--
-- O seletor da tela lista apenas cadastro ativo. Sem a opcao correspondente, o
-- Combobox nao tinha nome para mostrar e caia no id: quem abria a ordem via
-- `eb121acd-11e8-4b41-9f69-8aede125ba3d` no lugar da condicao.
--
-- ## Por que "30 dias" e a condicao certa
--
-- As outras doze condicoes ativas sao so PRAZO ("15 dias", "30/60 dias",
-- "A vista"), porque a informacao de que o titulo e boleto mora em FORMA de
-- pagamento, nao em condicao. `Boleto 30 dias` duplicava a forma dentro da
-- condicao, e por isso foi inativada.
--
-- As quatro ordens ja tem forma = Boleto. Entao condicao "30 dias" + forma Boleto
-- diz a mesma coisa que se queria dizer, com cadastro ativo. A suposicao do prazo
-- continua marcada na observacao de cada uma.
--
-- ## Travas
--
-- Antes de trocar, o bloco confere que as quatro tem forma Boleto: se alguma nao
-- tivesse, trocar a condicao apagaria a informacao de que o titulo e boleto. Uma
-- primeira versao desta trava olhava TODAS as ordens com "30 dias" e reprovou
-- sozinha, porque a 2606 e a 2605 (diesel da VIBRA) legitimamente tem "30 dias" e
-- nenhuma forma -- por isso ela agora olha so as quatro que estao sendo movidas.
--
-- A linha de controle no fim exige ZERO ordens apontando para condicao inativa.

do $$
declare
  v_n int;
  v_falta text;
  v_total_antes numeric;
  v_inativa uuid := 'eb121acd-11e8-4b41-9f69-8aede125ba3d';  -- 'Boleto 30 dias'
  v_ativa   uuid;
  v_alvo    uuid[];
begin
  select id into v_ativa from public.condicoes_pagamento
   where descricao = '30 dias' and ativo;
  if v_ativa is null then raise exception 'nao achei a condicao ativa "30 dias"'; end if;

  select array_agg(id) into v_alvo
    from public.ordens_compra where condicao_pagamento_id = v_inativa;
  if coalesce(array_length(v_alvo, 1), 0) <> 4 then
    raise exception 'esperava 4 ordens na condicao inativa, achei %',
      coalesce(array_length(v_alvo, 1), 0);
  end if;

  select sum(valor_total) into v_total_antes
    from public.ordens_compra where observacoes like 'Ordem de compra Mais Controle%';

  select string_agg(numero || ' (' || status || ')', ', ') into v_falta
    from public.ordens_compra where id = any(v_alvo) and status <> 'rascunho';
  if v_falta is not null then raise exception 'ordem fora de rascunho: %', v_falta; end if;

  select string_agg(o.numero, ', ') into v_falta
    from public.ordens_compra o
    left join public.formas_pagamento fp on fp.id = o.forma_pagamento_id
   where o.id = any(v_alvo) and coalesce(fp.nome, '') <> 'Boleto';
  if v_falta is not null then
    raise exception 'estas nao tem forma Boleto, trocar a condicao perderia o "boleto": %', v_falta;
  end if;

  update public.ordens_compra
     set condicao_pagamento_id = v_ativa,
         observacoes = replace(observacoes,
           'Condição preenchida como "Boleto 30 dias" por suposição',
           'Condição preenchida como "30 dias", com forma de pagamento Boleto, por suposição')
   where id = any(v_alvo);
  get diagnostics v_n = row_count;
  if v_n <> 4 then raise exception 'esperava 4, atualizou %', v_n; end if;

  select count(*) into v_n
    from public.ordens_compra o
    join public.condicoes_pagamento c on c.id = o.condicao_pagamento_id
   where not c.ativo;
  if v_n <> 0 then raise exception 'ainda ha % ordem(ns) com condicao inativa', v_n; end if;

  select string_agg(numero, ', ') into v_falta
    from public.ordens_compra where id = any(v_alvo) and observacoes like '%Boleto 30 dias%';
  if v_falta is not null then
    raise exception 'a observacao ainda cita "Boleto 30 dias" em: %', v_falta;
  end if;

  if (select sum(valor_total) from public.ordens_compra
       where observacoes like 'Ordem de compra Mais Controle%') <> v_total_antes then
    raise exception 'o total mudou ao trocar a condicao';
  end if;

  raise notice 'ok: 4 ordens na condicao ativa "30 dias", forma Boleto mantida';
end $$;
