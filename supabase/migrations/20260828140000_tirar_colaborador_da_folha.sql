-- Tirar um colaborador DESTA folha, sem desligá-lo da empresa.
--
-- O pedido: todo mundo entra na folha por padrão, mas na folha em que se está
-- trabalhando agora dá para tirar alguém; no mês seguinte ele volta sozinho.
--
-- =====================================================================
-- POR QUE UMA TABELA, E NÃO UMA COLUNA EM `folha_itens`
-- =====================================================================
--
-- Porque o botão "Regerar" apaga os itens. `fn_gerar_folha`, quando a folha já
-- existe, faz `delete from folha_itens where folha_id = v_folha` e reconstrói o
-- loop a partir de `colaboradores where ativo`. Uma coluna `excluido` no item
-- morreria no primeiro Regerar e a pessoa voltaria para a folha em silêncio —
-- justamente na tela em que o Tiago clica em Regerar toda vez que muda um
-- parâmetro.
--
-- A própria função já tem o precedente de "o que precisa sobreviver ao Regerar":
-- ela guarda um snapshot jsonb das edições manuais (`v_manuais`) antes do delete
-- e reaplica no loop. Aquele snapshot dura UMA chamada; a exclusão precisa durar
-- para sempre, então vira tabela.
--
-- Escopo da exclusão: (folha_id, colaborador_id). Por folha, não por pessoa —
-- é isso que faz o colaborador voltar por padrão na competência seguinte, que é
-- uma folha diferente. Não existe "excluído do RH", só "fora desta folha".
--
-- =====================================================================
-- POR QUE TIRAR E TRAZER DE VOLTA REGENERAM A FOLHA
-- =====================================================================
--
-- Montar o item de UM colaborador são ~150 linhas dentro de `fn_gerar_folha`:
-- base por vínculo, horas, INSS, IRRF, desconto por pessoa, cascata de
-- adiantamento com sobra empurrada para a competência seguinte, centro de custo
-- por maior tempo apontado, encargos e provisões discriminados. Reescrever isso
-- numa função de "voltar para a folha" seria uma SEGUNDA CÓPIA da regra de
-- dinheiro, que divergiria na primeira alteração feita de um lado só.
--
-- Então as duas RPCs só mexem na tabela de exclusão e chamam `fn_gerar_folha`.
-- Um caminho só constrói item. Consequências, todas conhecidas e desejadas:
--   - as edições manuais são preservadas (é o que o snapshot faz);
--   - o adiantamento do excluído volta a ficar ABERTO em vez de descontado,
--     porque a regeneração solta as parcelas desta folha antes de recalcular;
--   - se uma folha POSTERIOR já consumiu uma sobra que esta empurrou, a
--     regeneração RECUSA, com a mesma mensagem do botão Regerar. É honesto: o
--     dinheiro daquela sobra já foi lançado.

-- =====================================================================
-- 1. A tabela
-- =====================================================================

create table if not exists public.folha_exclusoes (
  folha_id uuid not null references public.folhas(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  -- NULLABLE no banco, EXIGIDO pela tela. A divisão é de propósito: a coluna
  -- permissiva deixa uma carga ou um caminho futuro gravar sem motivo, e a tela
  -- exige porque quem tira alguém da folha vai precisar explicar em setembro por
  -- que fulano não recebeu em agosto. A auditoria guarda quem e quando; o motivo
  -- é a única parte que ninguém consegue reconstruir depois.
  motivo text,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  -- A PRESENÇA da linha é a exclusão. Sem coluna "excluido": linha que existe e
  -- diz `false` é um terceiro estado que ninguém lê igual.
  primary key (folha_id, colaborador_id)
);

comment on table public.folha_exclusoes is
  'Colaborador fora de UMA folha específica. Não desliga ninguém da empresa: na competência seguinte ele entra por padrão.';

-- A PK cobre a busca por folha; a FK de colaborador precisa do índice próprio,
-- senão o advisor reclama e desativar um colaborador faz varredura.
create index if not exists idx_folha_exclusoes_colaborador
  on public.folha_exclusoes (colaborador_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'folha_exclusoes_motivo_check') then
    -- `btrim` com a lista de brancos EXPLÍCITA: `btrim(x)` sem argumento corta só
    -- espaço, então um motivo feito de \n passaria por "tem pelo menos 1
    -- caractere" e a tela mostraria um motivo vazio com cara de preenchido.
    alter table public.folha_exclusoes add constraint folha_exclusoes_motivo_check
      check (motivo is null or (length(btrim(motivo, E' \t\r\n')) between 1 and 200));
  end if;
end $$;

alter table public.folha_exclusoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='folha_exclusoes' and policyname='folha_exclusoes_select') then
    -- Quem vê a folha vê quem ficou fora dela. Sem isso a tela não teria como
    -- listar os excluídos, e não haveria caminho de volta: a linha do item não
    -- existe mais.
    create policy folha_exclusoes_select on public.folha_exclusoes
      for select to authenticated using (
        (select public.tem_permissao('rh.folha', 'ver'))
      );
  end if;

  -- Sem policy de INSERT nem de DELETE para `authenticated`, e isso é
  -- deliberado: as duas RPCs são SECURITY DEFINER e precisam regenerar a folha
  -- junto, na mesma transação. Um insert solto na tabela deixaria a exclusão
  -- gravada e a folha ainda com o item — o pior estado possível, porque a tela
  -- mostraria a pessoa nas duas listas.
end $$;

-- Grant só do que a policy permite. Sem policy de INSERT/DELETE, sem grant.
grant select on table public.folha_exclusoes to authenticated;

-- Auditoria e autoria, como nas outras tabelas transacionais: tirar alguém da
-- folha é exatamente o tipo de alteração que alguém vai querer rastrear depois.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_folha_exclusoes') then
    create trigger trg_audit_folha_exclusoes
      after insert or delete or update on public.folha_exclusoes
      for each row execute function public.fn_audit();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_folha_exclusoes_created_by') then
    create trigger trg_folha_exclusoes_created_by
      before insert on public.folha_exclusoes
      for each row execute function public.fn_set_created_by();
  end if;
end $$;

-- =====================================================================
-- 2. Tirar da folha
-- =====================================================================

create or replace function public.fn_tirar_da_folha(
  p_folha_id uuid,
  p_colaborador_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_comp date;
  v_nome text;
begin
  if not public.tem_permissao('rh.folha', 'editar') then
    raise exception 'Sem permissao para editar a folha';
  end if;
  -- A operação REGENERA a folha (ver o cabeçalho), e regenerar exige `criar`.
  -- Checado aqui, com mensagem que explica, em vez de deixar `fn_gerar_folha`
  -- recusar mais adiante com "Sem permissao para gerar folha" — que na tela
  -- pareceria não ter relação com o botão que foi clicado.
  if not public.tem_permissao('rh.folha', 'criar') then
    raise exception 'Tirar colaborador da folha regenera a folha, e isso exige permissao de criar folha';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha_id;
  if v_status is null then
    raise exception 'Folha nao encontrada';
  end if;
  if v_status <> 'rascunho' then
    raise exception 'A folha de %/% esta em "%": so da para tirar colaborador em rascunho. Rejeite ou desaprove antes.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;

  select nome into v_nome from public.colaboradores where id = p_colaborador_id;
  if v_nome is null then
    raise exception 'Colaborador nao encontrado';
  end if;

  -- `do nothing` no conflito: clicar duas vezes (ou dois usuários ao mesmo
  -- tempo) não pode virar erro de chave duplicada na tela.
  insert into public.folha_exclusoes (folha_id, colaborador_id, motivo, created_by)
  values (
    p_folha_id,
    p_colaborador_id,
    nullif(btrim(coalesce(p_motivo, ''), E' \t\r\n'), ''),
    (select auth.uid())
  )
  on conflict (folha_id, colaborador_id) do nothing;

  -- Regenerar é o que apaga o item, solta o adiantamento e refaz os totais.
  perform public.fn_gerar_folha(v_comp);
end $function$;

comment on function public.fn_tirar_da_folha(uuid, uuid, text) is
  'Tira um colaborador DESTA folha (não desliga da empresa) e regenera. Exige rh.folha editar+criar e folha em rascunho.';

-- =====================================================================
-- 3. Trazer de volta
-- =====================================================================

create or replace function public.fn_voltar_para_folha(
  p_folha_id uuid,
  p_colaborador_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_comp date;
  v_apagadas integer;
begin
  if not public.tem_permissao('rh.folha', 'editar') then
    raise exception 'Sem permissao para editar a folha';
  end if;
  if not public.tem_permissao('rh.folha', 'criar') then
    raise exception 'Colocar colaborador de volta regenera a folha, e isso exige permissao de criar folha';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha_id;
  if v_status is null then
    raise exception 'Folha nao encontrada';
  end if;
  if v_status <> 'rascunho' then
    raise exception 'A folha de %/% esta em "%": so da para mexer nos colaboradores em rascunho. Rejeite ou desaprove antes.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;

  delete from public.folha_exclusoes
  where folha_id = p_folha_id and colaborador_id = p_colaborador_id;

  get diagnostics v_apagadas = row_count;
  -- Zero linhas significa que a pessoa não estava fora. Recusar é melhor que
  -- regenerar a folha inteira por um clique que não mudava nada — e melhor que
  -- devolver sucesso para uma operação que não aconteceu.
  if v_apagadas = 0 then
    raise exception 'Este colaborador nao esta fora desta folha';
  end if;

  -- Regenerar é o que RECONSTRÓI o item, com a mesma regra que monta todos os
  -- outros. Ver o cabeçalho: não há uma segunda função que saiba montar item.
  perform public.fn_gerar_folha(v_comp);
end $function$;

comment on function public.fn_voltar_para_folha(uuid, uuid) is
  'Traz um colaborador de volta para a folha e regenera. Exige rh.folha editar+criar e folha em rascunho.';

-- Função nova nasce com EXECUTE para PUBLIC, e PUBLIC inclui `anon`.
revoke all on function public.fn_tirar_da_folha(uuid, uuid, text) from public;
revoke all on function public.fn_voltar_para_folha(uuid, uuid) from public;
grant execute on function public.fn_tirar_da_folha(uuid, uuid, text) to authenticated;
grant execute on function public.fn_voltar_para_folha(uuid, uuid) to authenticated;

-- =====================================================================
-- 4. `fn_gerar_folha` passa a respeitar a exclusão
-- =====================================================================
--
-- A migration EDITA a função a partir dela mesma, com âncora conferida, em vez
-- de reescrevê-la: ela tem ~16 mil caracteres, várias frentes mexem nela (a
-- última em 28/08, #224), e um `create or replace` com a versão que eu li hoje
-- apagaria o trabalho de quem alterou entre a leitura e o apply, sem conflito
-- nenhum.
--
-- O filtro entra no WHERE do loop, e não como `continue` no corpo: o excluído
-- nunca ENTRA na iteração, então não há chance de um efeito colateral acontecer
-- antes do desvio.

do $$
declare
  v_oid oid;
  v_def text;
  v_ancora text := '    from public.colaboradores c
    where c.ativo and c.vinculo in (''clt'', ''terceiro'', ''diarista'')
  loop';
  v_novo text := '    from public.colaboradores c
    where c.ativo and c.vinculo in (''clt'', ''terceiro'', ''diarista'')
      -- Fora DESTA folha por decisao de quem esta montando ela. Por folha, nao
      -- por pessoa: na competencia seguinte (outra folha) ele entra por padrao.
      -- Ver public.folha_exclusoes e fn_tirar_da_folha.
      and not exists (
        select 1 from public.folha_exclusoes x
        where x.folha_id = v_folha and x.colaborador_id = c.id
      )
  loop';
begin
  -- Resolve por NOME com asserção de unicidade: assinatura fixa já mudou nesta
  -- base antes, e o erro seria um "function does not exist" que não diz a causa.
  select p.oid into strict v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  v_def := pg_get_functiondef(v_oid);

  -- Conferir a âncora ANTES de trocar. Sem isto, uma mudança de indentação feita
  -- por outra frente faria o replace não casar, a função seria recriada IDÊNTICA
  -- e a migration terminaria com `success` sem ter feito nada — a exclusão
  -- gravaria na tabela e o Regerar continuaria trazendo a pessoa de volta.
  if position(v_ancora in v_def) = 0 then
    raise exception 'Ancora do loop de colaboradores nao encontrada em fn_gerar_folha: revisar a migration contra a definicao atual';
  end if;

  execute replace(v_def, v_ancora, v_novo);

  -- E conferir DEPOIS que a troca entrou: `execute` de um create or replace não
  -- reclama se o texto trocado for igual ao original.
  if position('public.folha_exclusoes' in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'A troca do filtro de exclusao nao entrou em fn_gerar_folha';
  end if;
end $$;
