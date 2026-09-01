-- Rateio por centro de custo editável em lançamento já aprovado ou pago.
--
-- ## O problema
--
-- `fn_salvar_lancamento` é hoje o único caminho para reescrever o rateio, e ela
-- recusa lançamento com parcela `paga` ou `aprovado`. Consequência: no dia em
-- que a primeira parcela é paga, a divisão do custo entre as obras congela para
-- sempre. As parcelas já tinham escapado disso em 19/08/2026, quando ganharam
-- `fn_definir_parcelas_lancamento`; o rateio não.
--
-- O caso que expôs: o seguro dos caminhões (R$ 132.081,60, 11 parcelas, 5 pagas)
-- rateado entre quatro carretas. Com uma carreta a menos na apólice não havia
-- como corrigir a divisão sem estornar cinco pagamentos.
--
-- ## O desenho
--
-- `fn_definir_rateio_lancamento` faz UMA coisa: reparte o mesmo dinheiro de
-- outro jeito. Ela não encosta em parcela, não muda `lancamentos.valor` e não
-- afrouxa `trg_valida_soma_do_rateio` — a soma continua tendo que fechar com o
-- valor do lançamento. Quem precisa mudar o total mexe nas parcelas.
--
-- `rateio_eventos` guarda UMA linha por edição, com o antes e o depois inteiros
-- em jsonb, e não uma linha por centro: o rateio muda como conjunto (uma obra
-- sai, outra entra, o resto se reparte) e eventos por linha viram fragmentos que
-- ninguém consegue ler juntos seis meses depois.

create table if not exists public.rateio_eventos (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.lancamentos(id) on delete cascade,
  -- Sem teto de tamanho, igual a `parcela_eventos.motivo`: quem corta é a tela.
  motivo text not null,
  -- [{"centro_custo_id": uuid, "valor": numeric}], os dois lados da mudança.
  -- Só o id do centro, nunca o nome: nome de obra muda, e a trilha ficaria
  -- contando uma história com o nome errado. A leitura resolve o nome atual.
  antes jsonb not null,
  depois jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);

comment on table public.rateio_eventos is
  'Trilha das alterações de rateio por centro de custo, uma linha por edição.';

create index if not exists idx_rateio_eventos_lancamento
  on public.rateio_eventos (lancamento_id, created_at desc);

alter table public.rateio_eventos enable row level security;

-- Mesma dupla de permissões de `parcela_eventos`: quem vê o lançamento e quem
-- aprova pagamento veem a trilha. Sem isto a coluna nova mostraria vazio calado
-- para o aprovador, que é exatamente quem precisa saber que o custo mudou de obra.
drop policy if exists rateio_eventos_select on public.rateio_eventos;
create policy rateio_eventos_select on public.rateio_eventos
  for select using (
    public.tem_permissao('financeiro.lancamentos', 'ver')
    or public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver')
  );

-- Leitura pelo cliente, escrita só pela função SECURITY DEFINER abaixo. O revoke
-- vem junto com o grant porque `grant` sem `revoke` não fecha nada: a tabela
-- nasce com privilégio para os roles padrão.
revoke all on public.rateio_eventos from anon, authenticated, service_role;
grant select on public.rateio_eventos to authenticated;

create or replace function public.fn_definir_rateio_lancamento(
  p_lanc_id uuid,
  p_rateios jsonb,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_valor numeric(14, 2);
  v_status text;
  v_tipo text;
  v_mes date;
  v_categoria uuid;
  v_soma numeric(14, 2);
  v_qtd int;
  v_distintos int;
  v_antes jsonb;
  v_depois jsonb;
  v_categorias jsonb;
begin
  if not public.tem_permissao('financeiro.lancamentos', 'editar') then
    raise exception 'Sem permissao para editar lancamentos';
  end if;

  select valor, status, tipo, mes_competencia, categoria_id
  into v_valor, v_status, v_tipo, v_mes, v_categoria
  from public.lancamentos
  where id = p_lanc_id;

  if v_valor is null then
    raise exception 'Lancamento nao encontrado';
  end if;

  -- Quem pode editar a_pagar nao necessariamente pode editar a_receber: a
  -- permissao e do TIPO, e quem sabe o tipo e o documento (nao o parametro).
  if not public.fn_pode_lancar_tipo(v_tipo, 'editar') then
    raise exception 'Sem permissao para editar lancamentos deste tipo';
  end if;

  if v_status = 'cancelado' then
    raise exception 'Lancamento cancelado nao aceita rateio';
  end if;

  -- Reclassificar custo mexe no fechamento do mes. Competencia fechada recusa,
  -- igual a toda escrita de dinheiro daquele mes.
  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', p_lanc_id);

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da alteracao do rateio';
  end if;

  v_qtd := jsonb_array_length(coalesce(p_rateios, '[]'::jsonb));
  if v_qtd = 0 then
    raise exception 'Escolha o centro de custo: nenhum custo existe sem centro de custo';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rateios) x
    where nullif(x->>'centro_custo_id', '') is null
  ) then
    raise exception 'Toda linha do rateio precisa de um centro de custo';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rateios) x
    where coalesce(round((x->>'valor')::numeric, 2), 0) <= 0
  ) then
    raise exception 'Toda linha do rateio precisa de um valor maior que zero';
  end if;

  select count(distinct x->>'centro_custo_id') into v_distintos
  from jsonb_array_elements(p_rateios) x;

  -- Duas linhas do mesmo centro somam certo e passariam pela trigger de soma,
  -- mas viram duas verdades sobre a mesma obra em todo relatorio por centro.
  if v_distintos <> v_qtd then
    raise exception 'O mesmo centro de custo aparece em duas linhas: some os valores numa linha so';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rateios) x
    where not exists (
      select 1 from public.centros_custo c
      where c.id = (x->>'centro_custo_id')::uuid
    )
  ) then
    raise exception 'Centro de custo inexistente';
  end if;

  -- `ativo` so e exigido de centro NOVO. Um centro que ja esta no rateio e foi
  -- inativado depois continua valendo: recusa-lo trancaria justamente a edicao
  -- que tira o custo de la, que e a razao de alguem abrir esta tela.
  if exists (
    select 1 from jsonb_array_elements(p_rateios) x
    join public.centros_custo c on c.id = (x->>'centro_custo_id')::uuid
    where not c.ativo
      and not exists (
        select 1 from public.lancamento_rateios r
        where r.lancamento_id = p_lanc_id and r.centro_custo_id = c.id
      )
  ) then
    raise exception 'Centro de custo inativo';
  end if;

  select round(coalesce(sum((x->>'valor')::numeric), 0), 2) into v_soma
  from jsonb_array_elements(p_rateios) x;

  -- A mensagem daqui e a que o usuario le. `trg_valida_soma_do_rateio` diria a
  -- mesma coisa no COMMIT, mas em texto de trigger e sem dizer quanto falta.
  if v_soma <> round(v_valor, 2) then
    raise exception
      'A soma do rateio (R$ %) tem que fechar com o valor do lancamento (R$ %). Diferenca de R$ %. Para mudar o valor, edite as parcelas.',
      to_char(v_soma, 'FM999999999990.00'),
      to_char(round(v_valor, 2), 'FM999999999990.00'),
      to_char(abs(round(v_valor, 2) - v_soma), 'FM999999999990.00');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'centro_custo_id', centro_custo_id, 'valor', valor)
           order by valor desc, centro_custo_id), '[]'::jsonb)
  into v_antes
  from public.lancamento_rateios
  where lancamento_id = p_lanc_id;

  -- A categoria de cada centro, lida ANTES do delete. Sem esta foto, a
  -- reinsercao nao teria de onde tirar a categoria de quem continua no rateio.
  select coalesce(jsonb_object_agg(centro_custo_id::text, categoria_id), '{}'::jsonb)
  into v_categorias
  from public.lancamento_rateios
  where lancamento_id = p_lanc_id and categoria_id is not null;

  -- Apaga e reinsere em vez de casar linha a linha: o conjunto de centros pode
  -- mudar inteiro, e um "update onde o centro bate" deixaria as linhas velhas
  -- sobrando. As duas constraint triggers de rateio sao DEFERRABLE INITIALLY
  -- DEFERRED, entao o vazio momentaneo entre o delete e o insert nao reprova —
  -- a checagem acontece no COMMIT, com a tabela ja preenchida.
  delete from public.lancamento_rateios where lancamento_id = p_lanc_id;

  insert into public.lancamento_rateios
    (lancamento_id, centro_custo_id, categoria_id, valor, created_by)
  select
    p_lanc_id,
    (x->>'centro_custo_id')::uuid,
    -- A categoria e do RATEIO, nao so do lancamento: e por ela que o DRE e o
    -- custo por categoria somam. Centro que continua no rateio mantem a
    -- categoria que tinha (a da OC, quando veio de uma); centro novo herda a
    -- predominante do lancamento. Sem isto, editar o rateio de um lancamento de
    -- OC apagaria a categoria de cada linha e o DRE perderia a despesa de vista.
    coalesce(
      nullif(v_categorias->>(x->>'centro_custo_id'), '')::uuid,
      v_categoria
    ),
    round((x->>'valor')::numeric, 2),
    (select auth.uid())
  from jsonb_array_elements(p_rateios) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'centro_custo_id', centro_custo_id, 'valor', valor)
           order by valor desc, centro_custo_id), '[]'::jsonb)
  into v_depois
  from public.lancamento_rateios
  where lancamento_id = p_lanc_id;

  -- Salvar sem mudar nada nao vira linha na trilha: um "Rateio alterado" que nao
  -- alterou nada e ruido que ensina a ignorar a trilha.
  if v_antes is distinct from v_depois then
    insert into public.rateio_eventos
      (lancamento_id, motivo, antes, depois, created_by)
    values (p_lanc_id, btrim(p_motivo), v_antes, v_depois, (select auth.uid()));
  end if;
end;
$function$;

revoke all on function public.fn_definir_rateio_lancamento(uuid, jsonb, text)
  from public, anon, service_role;
grant execute on function public.fn_definir_rateio_lancamento(uuid, jsonb, text)
  to authenticated;
