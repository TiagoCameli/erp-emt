-- Folha gerencial customizável (29/10/2026, pedido do Tiago).
--
-- Três mudanças, todas na folha em RASCUNHO:
--
-- 1. INATIVO NÃO ENTRA MAIS POR PADRÃO. Até aqui a fn_gerar_folha puxava também
--    quem tinha `data_demissao` dentro da competência, para pagar os dias do
--    último mês. Na prática a rescisão está sendo lançada com o saldo de salário
--    como verba livre ("Saldo de 28 dias - Salário"), e a folha de 10/2026 pagava
--    os mesmos 28 dias de novo para os dois desligados em 28/10 (R$ 1.512,93 e
--    R$ 1.866,67 na folha, R$ 1.464,13 e R$ 1.806,45 nas rescisões aprovadas).
--    Agora só `ativo` entra sozinho. Quem precisar pagar um desligado pela folha
--    inclui à mão (item 2), e os avos pela data de desligamento continuam valendo.
--
-- 2. INCLUIR QUALQUER COLABORADOR NA FOLHA, a qualquer momento do rascunho.
--    `folha_inclusoes` é o espelho de `folha_exclusoes`: o par (folha,
--    colaborador) que entra mesmo inativo. Tabela própria, e não coluna de
--    `folha_itens`, porque Regerar apaga os itens (ver o cabeçalho de
--    20260828140000). Incluir regenera a folha pelo mesmo motivo de tirar:
--    montar item é responsabilidade da fn_gerar_folha, a única que sabe a regra
--    de dinheiro.
--
-- 3. EDITAR O CADASTRO PELA FOLHA. `fn_folha_atualizar_colaborador` grava nome,
--    vínculo e função direto em `colaboradores` (o cadastro muda de verdade, não
--    só esta folha). Mudar o vínculo muda a conta do item (diarista entra pelas
--    diárias, INSS/IRRF só CLT), então nesse caso a folha é regenerada; as
--    edições manuais da linha sobrevivem pelo snapshot de sempre.
--
-- A fn_gerar_folha (~20 mil caracteres, várias frentes mexem nela) é alterada a
-- partir da definição VIVA, por âncora conferida, e o bloco recusa se o corpo
-- não for o que foi lido em 29/10 (md5 842833bc76d2f1d106457623278b0df6).

-- =====================================================================
-- 1. A tabela de inclusões
-- =====================================================================

create table if not exists public.folha_inclusoes (
  folha_id uuid not null references public.folhas(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  motivo text,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  -- A PRESENÇA da linha é a inclusão, como em folha_exclusoes.
  primary key (folha_id, colaborador_id)
);

comment on table public.folha_inclusoes is
  'Colaborador incluído à mão em UMA folha, mesmo inativo. Não reativa ninguém: na competência seguinte (outra folha) ele só entra se estiver ativo.';

create index if not exists idx_folha_inclusoes_colaborador
  on public.folha_inclusoes (colaborador_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'folha_inclusoes_motivo_check') then
    alter table public.folha_inclusoes add constraint folha_inclusoes_motivo_check
      check (motivo is null or (length(btrim(motivo, E' \t\r\n')) between 1 and 200));
  end if;
end $$;

alter table public.folha_inclusoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='folha_inclusoes' and policyname='folha_inclusoes_select') then
    create policy folha_inclusoes_select on public.folha_inclusoes
      for select to authenticated using (
        (select public.tem_permissao('rh.folha', 'ver'))
      );
  end if;
  -- Sem INSERT/DELETE para `authenticated`: a escrita é só pela RPC, que
  -- regenera a folha na mesma transação (mesmo raciocínio de folha_exclusoes).
end $$;

grant select on table public.folha_inclusoes to authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_folha_inclusoes') then
    create trigger trg_audit_folha_inclusoes
      after insert or delete or update on public.folha_inclusoes
      for each row execute function public.fn_audit();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_folha_inclusoes_created_by') then
    create trigger trg_folha_inclusoes_created_by
      before insert on public.folha_inclusoes
      for each row execute function public.fn_set_created_by();
  end if;
end $$;

-- =====================================================================
-- 2. fn_gerar_folha: inativo só entra incluído à mão
-- =====================================================================

do $$
declare
  v_def text;
  v_novo text;
  v_md5 text;
  v_ancora constant text := $a$    where (
            c.ativo
            -- Desligado continua entrando na folha da competencia em que saiu (e
            -- nas anteriores, se alguem regerar). Sem esta perna, `ativo = false`
            -- tiraria a pessoa da propria folha que tem de pagar os dias que ela
            -- trabalhou, e o desligamento viraria calote silencioso do ultimo mes.
            or (c.data_demissao is not null and c.data_demissao >= v_ini)
          )$a$;
  v_troca constant text := $a$    where (
            c.ativo
            -- Inativo NAO entra sozinho (29/10/2026, pedido do Tiago). A perna
            -- antiga (`data_demissao >= v_ini`) pagava os dias do ultimo mes, mas
            -- a rescisao vem sendo lancada com o saldo de salario dentro, e a
            -- folha de 10/2026 pagava os mesmos dias duas vezes. Quem tiver de
            -- receber pela folha mesmo desligado entra por folha_inclusoes
            -- (fn_incluir_na_folha), e os avos pela data de desligamento valem.
            or exists (
              select 1 from public.folha_inclusoes y
              where y.folha_id = v_folha and y.colaborador_id = c.id
            )
          )$a$;
begin
  select md5(p.prosrc), pg_get_functiondef(p.oid) into v_md5, v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  if v_def is null then
    raise exception 'fn_gerar_folha nao encontrada';
  end if;
  if position('folha_inclusoes' in v_def) > 0 then
    raise notice 'fn_gerar_folha ja aplicada';
    return;
  end if;
  if v_md5 <> '842833bc76d2f1d106457623278b0df6' then
    raise exception 'fn_gerar_folha mudou desde a leitura (md5 %): reler o corpo vivo antes de aplicar', v_md5;
  end if;
  if position(v_ancora in v_def) = 0 then
    raise exception 'ancora do WHERE nao encontrada na fn_gerar_folha';
  end if;

  v_novo := replace(v_def, v_ancora, v_troca);
  execute v_novo;
end $$;

-- =====================================================================
-- 3. fn_tirar_da_folha: tirar também desfaz a inclusão
-- =====================================================================

do $$
declare
  v_def text;
  v_md5 text;
  v_ancora constant text := $a$  insert into public.folha_exclusoes (folha_id, colaborador_id, motivo, created_by)$a$;
begin
  select md5(p.prosrc), pg_get_functiondef(p.oid) into v_md5, v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_tirar_da_folha';

  if position('folha_inclusoes' in v_def) > 0 then
    raise notice 'fn_tirar_da_folha ja aplicada';
    return;
  end if;
  if v_md5 <> '7be11a5b8cef3d2d4d1e3c2b1ebd65f2' then
    raise exception 'fn_tirar_da_folha mudou desde a leitura (md5 %)', v_md5;
  end if;

  execute replace(v_def, v_ancora,
    $a$  -- Quem foi incluido a mao e agora sai: a inclusao some junto, senao a
  -- pessoa ficaria marcada como "dentro" e "fora" ao mesmo tempo.
  delete from public.folha_inclusoes
  where folha_id = p_folha_id and colaborador_id = p_colaborador_id;

$a$ || v_ancora);
end $$;

-- =====================================================================
-- 4. Incluir na folha
-- =====================================================================

create or replace function public.fn_incluir_na_folha(
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
  v_ativo boolean;
  v_demissao date;
begin
  if not public.tem_permissao('rh.folha', 'editar') then
    raise exception 'Sem permissao para editar a folha';
  end if;
  if not public.tem_permissao('rh.folha', 'criar') then
    raise exception 'Incluir colaborador regenera a folha, e isso exige permissao de criar folha';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha_id;
  if v_status is null then
    raise exception 'Folha nao encontrada';
  end if;
  if v_status <> 'rascunho' then
    raise exception 'A folha de %/% esta em "%": so da para incluir colaborador em rascunho. Rejeite ou desaprove antes.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;

  select nome, ativo, data_demissao into v_nome, v_ativo, v_demissao
  from public.colaboradores where id = p_colaborador_id;
  if v_nome is null then
    raise exception 'Colaborador nao encontrado';
  end if;

  if exists (select 1 from public.folha_itens
             where folha_id = p_folha_id and colaborador_id = p_colaborador_id) then
    raise exception '% ja esta nesta folha', v_nome;
  end if;

  -- Se tinha sido tirado, deixa de estar fora.
  delete from public.folha_exclusoes
  where folha_id = p_folha_id and colaborador_id = p_colaborador_id;

  -- Ativo entra sozinho; a inclusao so e necessaria (e so e gravada) para
  -- inativo. Gravar para ativo deixaria uma marca que ninguem le.
  if not v_ativo then
    insert into public.folha_inclusoes (folha_id, colaborador_id, motivo, created_by)
    values (
      p_folha_id,
      p_colaborador_id,
      nullif(btrim(coalesce(p_motivo, ''), E' \t\r\n'), ''),
      (select auth.uid())
    )
    on conflict (folha_id, colaborador_id) do nothing;
  end if;

  perform public.fn_gerar_folha(v_comp);

  -- A geracao descarta linha de R$ 0,00. Incluir e nao aparecer nada seria o
  -- pior retorno possivel; o raise desfaz tudo e diz por que.
  if not exists (select 1 from public.folha_itens
                 where folha_id = p_folha_id and colaborador_id = p_colaborador_id) then
    if v_demissao is not null and v_demissao < v_comp then
      raise exception '% foi desligado em %, antes de %/%: nao tem dia a pagar nesta competencia. Para pagar algo pela folha, corrija a data de desligamento no cadastro.',
        v_nome, to_char(v_demissao, 'DD/MM/YYYY'), to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY');
    end if;
    raise exception '% nao entrou: sem salario no cadastro (ou, se diarista, sem diaria em aberto em %/%), e a folha nao cria linha zerada. Preencha o salario no cadastro e inclua de novo.',
      v_nome, to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY');
  end if;
end $function$;

revoke all on function public.fn_incluir_na_folha(uuid, uuid, text) from public, anon;
grant execute on function public.fn_incluir_na_folha(uuid, uuid, text) to authenticated;

-- =====================================================================
-- 5. Editar o cadastro pela folha
-- =====================================================================

create or replace function public.fn_folha_atualizar_colaborador(
  p_folha_id uuid,
  p_colaborador_id uuid,
  p_nome text,
  p_vinculo text,
  p_funcao_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_comp date;
  v_vinculo_antes text;
  v_nome text;
begin
  if not public.tem_permissao('rh.folha', 'editar') then
    raise exception 'Sem permissao para editar a folha';
  end if;
  if not public.tem_permissao('cadastros.colaboradores', 'editar') then
    raise exception 'Mudar o cadastro do colaborador exige permissao de editar colaboradores';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha_id;
  if v_status is null then
    raise exception 'Folha nao encontrada';
  end if;
  if v_status <> 'rascunho' then
    raise exception 'A folha de %/% esta em "%": so da para editar em rascunho. Rejeite ou desaprove antes.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;

  select vinculo into v_vinculo_antes
  from public.colaboradores where id = p_colaborador_id;
  if v_vinculo_antes is null then
    raise exception 'Colaborador nao encontrado';
  end if;

  v_nome := btrim(coalesce(p_nome, ''), E' \t\r\n');
  if length(v_nome) < 2 then
    raise exception 'O nome precisa ter pelo menos 2 caracteres';
  end if;
  if p_vinculo is null or p_vinculo not in ('clt', 'terceiro', 'diarista') then
    raise exception 'Vinculo invalido';
  end if;
  if p_funcao_id is not null
     and not exists (select 1 from public.funcoes where id = p_funcao_id) then
    raise exception 'Funcao nao encontrada';
  end if;

  -- Mudar vinculo regenera a folha, e regenerar exige `criar` (como Regerar).
  if p_vinculo <> v_vinculo_antes and not public.tem_permissao('rh.folha', 'criar') then
    raise exception 'Mudar o vinculo regenera a folha, e isso exige permissao de criar folha';
  end if;

  update public.colaboradores
     set nome = v_nome,
         vinculo = p_vinculo,
         funcao_id = p_funcao_id
   where id = p_colaborador_id;

  if p_vinculo <> v_vinculo_antes then
    perform public.fn_gerar_folha(v_comp);
  end if;

  -- false = a pessoa saiu da folha com a mudanca (ex.: virou diarista e nao tem
  -- diaria em aberto no mes). A tela avisa em vez de sumir com a linha calada.
  return exists (select 1 from public.folha_itens
                 where folha_id = p_folha_id and colaborador_id = p_colaborador_id);
end $function$;

revoke all on function public.fn_folha_atualizar_colaborador(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.fn_folha_atualizar_colaborador(uuid, uuid, text, text, uuid) to authenticated;
