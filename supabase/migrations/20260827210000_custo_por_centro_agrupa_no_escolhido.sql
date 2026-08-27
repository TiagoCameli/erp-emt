-- =============================================================
-- Custo por centro de custo: a linha leva o nome do que foi ESCOLHIDO
-- =============================================================
-- PEDIDO DO TIAGO (27/08/2026), sobre o print do filtro de centro de custo:
-- "esta aparecendo um manutencao de equipamentos para cada etapa desse centro de
-- custo e eu preciso que um outro filtro de etapas apareca quando um filtro que
-- tem varias etapas for selecionado."
--
-- O pedido é de TELA — a escada centro → etapa em dois campos, que está no mesmo
-- commit desta migration. Mas ele destapa um buraco de BANCO que estava aberto
-- desde a manhã de hoje, e é esse buraco que esta migration fecha.
--
-- ============================================================
-- O QUE ESTAVA ERRADO
-- ============================================================
-- A migration de hoje de manhã (20260827180000) devolveu a etapa ao seletor dos
-- relatórios e consertou a `fn_rel_custo_receita` para agrupar pelo centro
-- ESCOLHIDO. Não tocou na `fn_rel_custo_centro_custo`, que continuou agrupando na
-- RAIZ — e ela lê do mesmo seletor.
--
-- Medido agora, antes de mexer:
--
--   escolher "Vibro Acabadora AF4500 - 01" no relatório de Custo por centro de
--   custo devolvia UMA linha, com o valor certo (R$ 31.747,04) e o nome errado:
--   "Manutenção/Documentação de Equipamentos".
--
-- O valor certo com o nome errado é pior que um erro de conta: a raiz da
-- manutenção custou R$ 2.385.962,36, então a tela dizia que o centro inteiro
-- custou trinta e um mil. Quem lê não tem como desconfiar — o número é redondo,
-- o nome é um centro que existe, e nada na tela avisa que houve um recorte.
--
-- ============================================================
-- A REGRA, IGUAL À DA fn_rel_custo_receita
-- ============================================================
-- O rateio é atribuído ao centro escolhido MAIS FUNDO que o contém, e a linha
-- leva o nome dele. `distinct on (centro_id) ... order by nivel desc` é quem faz
-- isso: escolher raiz e etapa ao mesmo tempo dá duas linhas (a etapa com o valor
-- dela, a raiz com o resto), em vez de contar a etapa duas vezes.
--
-- Sem nada escolhido, `alvos` fica vazio e o `coalesce` cai na raiz: é EXATAMENTE
-- o comportamento de hoje. A prova (a) abaixo é a linha de controle disso.
--
-- A tela nunca manda raiz e etapa da mesma família juntas (ver `centrosEfetivos`
-- em centros-e-etapas.ts), mas a RPC tem de se comportar mesmo assim: link colado
-- à mão não passa pela tela.
--
-- ============================================================
-- COMO A FUNÇÃO É ALTERADA
-- ============================================================
-- Editada por ÂNCORA a partir da definição VIVA, e não colada inteira: várias
-- frentes mexem nestas funções de relatório ao mesmo tempo, e CREATE OR REPLACE
-- sobrescreve o trabalho da outra sem dar conflito nenhum. Se o texto tiver
-- mudado desde que eu li, cada âncora aborta e nada é aplicado.

do $custo_centro$
declare
  v_def text; v_novo text; v_de text; v_para text; v_n int;
  -- Cada âncora é conferida antes de trocar: zero significa que alguém reescreveu
  -- o trecho, e mais de uma que a âncora ficou ambígua e a troca pegaria o lugar
  -- errado. Nos dois casos isto aborta sem aplicar nada.
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_rel_custo_centro_custo';
  if v_def is null then
    raise exception 'fn_rel_custo_centro_custo nao existe.';
  end if;

  -- 1. O CTE `alvos` passa a carregar QUEM foi escolhido, e não só o que entra.
  v_de :=
    '  alvos as (' || chr(10) ||
    '    select distinct s.id' || chr(10) ||
    '    from unnest(coalesce(p_centros, ''{}''::uuid[])) as escolhido(id)' || chr(10) ||
    '    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s' || chr(10) ||
    '  )' || chr(10) ||
    '  select raiz.id, raiz.nome, raiz.codigo, sum(r.valor) as total';
  v_para :=
    '  pares as (' || chr(10) ||
    '    select escolhido.id as grupo_id, s.id as centro_id, c.nivel as nivel_grupo' || chr(10) ||
    '    from unnest(coalesce(p_centros, ''{}''::uuid[])) as escolhido(id)' || chr(10) ||
    '    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s' || chr(10) ||
    '    join public.centros_custo c on c.id = escolhido.id' || chr(10) ||
    '  ),' || chr(10) ||
    '  -- A etapa ganha da raiz: `nivel desc` pega o escolhido MAIS FUNDO, que e o' || chr(10) ||
    '  -- recorte mais fino pedido. Sem isto, escolher raiz + etapa junto somaria a' || chr(10) ||
    '  -- etapa dentro da raiz e a etapa escolhida nao apareceria em linha propria.' || chr(10) ||
    '  alvos as (' || chr(10) ||
    '    select distinct on (centro_id) centro_id as id, grupo_id' || chr(10) ||
    '    from pares' || chr(10) ||
    '    order by centro_id, nivel_grupo desc' || chr(10) ||
    '  )' || chr(10) ||
    '  select grupo.id, grupo.nome, grupo.codigo, sum(r.valor) as total';
  v_n := (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de);
  if v_n <> 1 then
    raise exception 'A ancora do CTE alvos aparece % vez(es) e eu esperava 1.', v_n;
  end if;
  v_def := replace(v_def, v_de, v_para);

  -- 2. O grupo da linha: o escolhido mais fundo, ou a raiz quando nada foi
  --    escolhido. `raiz` continua no FROM porque o tipo (obra/manutencao/
  --    financeiro) mora nela, e é por ele que passam a exclusão do centro
  --    financeiro e o filtro `p_tipos_centro`.
  v_de := '  left join public.centros_custo raiz on raiz.id = a.raiz_id';
  v_para :=
    '  left join public.centros_custo raiz on raiz.id = a.raiz_id' || chr(10) ||
    '  left join alvos on alvos.id = r.centro_custo_id' || chr(10) ||
    '  left join public.centros_custo grupo' || chr(10) ||
    '    on grupo.id = coalesce(alvos.grupo_id, a.raiz_id)';
  v_n := (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de);
  if v_n <> 1 then
    raise exception 'A ancora do join da raiz aparece % vez(es) e eu esperava 1.', v_n;
  end if;
  v_def := replace(v_def, v_de, v_para);

  -- 3. O filtro passa a perguntar ao mesmo join que agrupa. Duas cláusulas
  --    separadas para a mesma pergunta podem discordar, e a discordância
  --    apareceria como valor no grupo errado.
  v_de := '      or r.centro_custo_id in (select alvos.id from alvos)';
  v_para := '      or alvos.id is not null';
  v_n := (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de);
  if v_n <> 1 then
    raise exception 'A ancora do filtro de centro aparece % vez(es) e eu esperava 1.', v_n;
  end if;
  v_def := replace(v_def, v_de, v_para);

  -- 4. E o agrupamento acompanha o que a linha passou a nomear.
  v_de := '  group by raiz.id, raiz.nome, raiz.codigo';
  v_para := '  group by grupo.id, grupo.nome, grupo.codigo';
  v_n := (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de);
  if v_n <> 1 then
    raise exception 'A ancora do group by aparece % vez(es) e eu esperava 1.', v_n;
  end if;
  v_novo := replace(v_def, v_de, v_para);

  execute v_novo;
end $custo_centro$;

-- A assinatura não muda, então o CREATE OR REPLACE preserva os privilégios. Os
-- dois comandos ficam mesmo assim: função de relatório sem `revoke` explícito
-- nasce executável por PUBLIC, e uma migration futura que a recrie por engano
-- encontraria a porta aberta.
revoke all on function public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) from public;
grant execute on function public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) to authenticated;

-- ---------------------------------------------------------------
-- PROVAS, que abortam o apply se falharem
-- ---------------------------------------------------------------
-- Todas comparam DOIS CAMINHOS DE CÁLCULO, e nenhuma ancora num valor que eu
-- medi. A primeira versão deste arquivo ancorava: "o custo total tem de dar
-- R$ 51.620.484,11", medido meia hora antes. Ela abortou o apply por R$ 186,00 —
-- alguém lançou no meio. A guarda funcionou, mas guardou a coisa errada: número
-- congelado de banco vivo envelhece entre escrever e aplicar, e o autor acaba
-- afrouxando a prova para conseguir aplicar.
--
-- O que estas provas travam é a RELAÇÃO, que não envelhece: a função tem de
-- concordar com a soma crua dos rateios, o recorte tem de recortar, e a etapa
-- mais o resto têm de dar a raiz.
do $provas$
declare
  v_raiz_manut uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff'; -- Manutenção/Documentação de Equipamentos
  v_etapa      uuid := 'a4caefbd-3337-4ad2-9ff7-1aa79c00f8f3'; -- Vibro Acabadora AF4500 - 01
  v_obra       uuid := 'fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0'; -- 009 - BR-364 Lote 09 & 10
  v_linhas int; v_total numeric; v_nome text;
  v_linhas_c int; v_total_c numeric;
  v_geral numeric; v_cru numeric; v_raiz numeric; v_da_etapa numeric; v_resto numeric;
begin
  -- (a) LINHA DE CONTROLE. Sem filtro nenhum contra filtrar por TODAS as raízes:
  --     os dois caminhos passam por códigos diferentes (um cai no coalesce da
  --     raiz, o outro no grupo escolhido) e TÊM de dar o mesmo. Se o agrupamento
  --     novo perdesse ou duplicasse rateio, é aqui que apareceria.
  select count(*), coalesce(round(sum(total), 2), -1) into v_linhas, v_geral
  from public.fn_rel_custo_centro_custo();
  select count(*), coalesce(round(sum(total), 2), -1) into v_linhas_c, v_total_c
  from public.fn_rel_custo_centro_custo(
    null, null,
    (select array_agg(id) from public.centros_custo where pai_id is null and ativo)
  );
  if v_linhas <> v_linhas_c or v_geral <> v_total_c then
    raise exception
      'Sem filtro deu % linhas / R$ % e por todas as raizes deu % linhas / R$ %.',
      v_linhas, to_char(v_geral,'FM999999999990.00'),
      v_linhas_c, to_char(v_total_c,'FM999999999990.00');
  end if;

  -- (b) SEGUNDA FÓRMULA. A soma crua dos rateios elegíveis, contada sem passar
  --     pela função, tem de dar o mesmo total. É o que pega rateio perdido ou
  --     contado duas vezes pelos joins novos.
  with recursive raizes as (
    select c.id as centro_id, c.id as raiz_id
    from public.centros_custo c where c.pai_id is null
    union all
    select f.id, a.raiz_id
    from public.centros_custo f join raizes a on f.pai_id = a.centro_id
  )
  select coalesce(round(sum(r.valor), 2), -1) into v_cru
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  join raizes a on a.centro_id = r.centro_custo_id
  join public.centros_custo raiz on raiz.id = a.raiz_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and coalesce(raiz.tipo, '') <> 'financeiro';
  if v_geral <> v_cru then
    raise exception
      'A funcao somou R$ % e a soma crua dos rateios deu R$ %.',
      to_char(v_geral,'FM999999999990.00'), to_char(v_cru,'FM999999999990.00');
  end if;

  -- (c) O CONSERTO: a etapa volta com o NOME DELA, e com o valor DELA. Era aqui
  --     que a tela dizia "Manutenção/Documentação de Equipamentos" sobre um
  --     recorte, fazendo um centro de milhões parecer um de trinta mil.
  select coalesce(nome, '(vazio)'), coalesce(round(total, 2), -1)
    into v_nome, v_da_etapa
  from public.fn_rel_custo_centro_custo(null, null, array[v_etapa]);
  select coalesce(round(sum(r.valor), 2), -1) into v_cru
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where r.centro_custo_id = v_etapa
    and l.tipo = 'a_pagar' and l.status <> 'cancelado';
  if v_nome <> 'Vibro Acabadora AF4500 - 01' or v_da_etapa <> v_cru then
    raise exception 'A etapa voltou como "%" com R$ % (cru: R$ %).',
      v_nome, to_char(v_da_etapa,'FM999999999990.00'),
      to_char(v_cru,'FM999999999990.00');
  end if;

  -- (d) A raiz sozinha continua trazendo a subárvore inteira: quem não usar o
  --     campo novo não pode ver número diferente do de ontem.
  select coalesce(nome, '(vazio)'), coalesce(round(total, 2), -1)
    into v_nome, v_raiz
  from public.fn_rel_custo_centro_custo(null, null, array[v_raiz_manut]);
  select coalesce(round(sum(r.valor), 2), -1) into v_cru
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where r.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_raiz_manut))
    and l.tipo = 'a_pagar' and l.status <> 'cancelado';
  if v_nome <> 'Manutenção/Documentação de Equipamentos' or v_raiz <> v_cru then
    raise exception 'A raiz da manutencao voltou como "%" com R$ % (cru: R$ %).',
      v_nome, to_char(v_raiz,'FM999999999990.00'),
      to_char(v_cru,'FM999999999990.00');
  end if;

  -- (e) A PROVA QUE TEM DE DAR DIFERENTE. O recorte precisa recortar: a etapa tem
  --     de ter custo (senão a prova (c) passaria comparando zero com zero) e tem
  --     de ser MENOR que a raiz (senão o filtro não filtrou nada e eu estaria
  --     provando o agrupamento antigo achando que provei o novo).
  if v_da_etapa <= 0 or v_da_etapa >= v_raiz then
    raise exception
      'A etapa deu R$ % e a raiz R$ %: o recorte precisa ser maior que zero e menor que a raiz.',
      to_char(v_da_etapa,'FM999999999990.00'), to_char(v_raiz,'FM999999999990.00');
  end if;

  -- (f) Uma obra sem etapa nenhuma: o caminho mais comum da tela, intocado.
  select coalesce(round(total, 2), -1) into v_total
  from public.fn_rel_custo_centro_custo(null, null, array[v_obra]);
  select coalesce(round(sum(r.valor), 2), -1) into v_cru
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where r.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_obra))
    and l.tipo = 'a_pagar' and l.status <> 'cancelado';
  if v_total <> v_cru then
    raise exception 'A obra voltou com R$ % e a soma crua deu R$ %.',
      to_char(v_total,'FM999999999990.00'), to_char(v_cru,'FM999999999990.00');
  end if;

  -- (g) Raiz E etapa juntas: duas linhas, e a etapa mais o resto dão a raiz
  --     inteira. A tela nunca manda isso (a etapa substitui a raiz), mas link
  --     colado à mão não passa pela tela — e contar a etapa duas vezes seria o
  --     defeito mais caro possível aqui.
  select count(*), coalesce(round(sum(total), 2), -1) into v_linhas, v_total
  from public.fn_rel_custo_centro_custo(null, null, array[v_raiz_manut, v_etapa]);
  if v_linhas <> 2 or v_total <> v_raiz then
    raise exception
      'Raiz + etapa deu % linha(s) somando R$ % e a raiz sozinha da R$ %.',
      v_linhas, to_char(v_total,'FM999999999990.00'),
      to_char(v_raiz,'FM999999999990.00');
  end if;
  select coalesce(round(total, 2), -1) into v_resto
  from public.fn_rel_custo_centro_custo(null, null, array[v_raiz_manut, v_etapa])
  where nome = 'Manutenção/Documentação de Equipamentos';
  if v_resto <> v_raiz - v_da_etapa then
    raise exception
      'Com a etapa fora, a raiz devia sobrar com R$ % e sobrou com R$ %.',
      to_char(v_raiz - v_da_etapa,'FM999999999990.00'),
      to_char(v_resto,'FM999999999990.00');
  end if;

  raise notice
    'Custo por centro de custo agrupa no escolhido. Total R$ % (bate com a soma crua), etapa R$ % dentro de R$ %.',
    to_char(v_geral,'FM999999999990.00'),
    to_char(v_da_etapa,'FM999999999990.00'),
    to_char(v_raiz,'FM999999999990.00');
end $provas$;
