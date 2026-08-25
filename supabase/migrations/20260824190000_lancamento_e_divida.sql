-- O lancamento ganha a marca "e divida": emprestimo, financiamento ou consorcio.
--
-- ## Por que uma marca, e nao um centro de custo ou uma categoria
--
-- O compromisso com banco ja tem centro de custo e categoria, e os dois estao
-- certos: o financiamento da escavadeira E custo de "Aquisicao de Equipamentos",
-- porque o dinheiro virou maquina. Mover para ver a divida junto tiraria R$ 5,37
-- mi de um centro que e usado no relatorio de custo.
--
-- A marca resolve isso sem mover nada: o lancamento continua onde esta para o
-- DRE e para o custo por centro, e ganha um SIM/NAO que responde outra pergunta
-- -- "quanto a empresa deve" -- que nenhuma das duas dimensoes respondia.
--
-- ## Por enquanto e um sim/nao
--
-- O Tiago falou em tres especies (emprestimo, financiamento, consorcio) e
-- escolheu comecar com a caixinha, deixando a especie para depois. Quando ela
-- vier, esta coluna vira um `natureza_divida text` e o `true` de hoje continua
-- valendo: nenhuma marcacao se perde.

alter table public.lancamentos
  add column if not exists e_divida boolean not null default false;

comment on column public.lancamentos.e_divida is
  'Marca que este lancamento e uma divida com terceiro (emprestimo, financiamento ou consorcio). Nao substitui categoria nem centro de custo: e uma dimensao a parte, que alimenta o relatorio de endividamento.';

-- Os grants de `lancamentos` sao POR COLUNA: coluna nova nasce sem privilegio
-- nenhum e a tela mostraria "permission denied for table lancamentos" na
-- primeira leitura. Só SELECT: a mutacao passa por RPC security definer.
grant select (e_divida) on public.lancamentos to authenticated;

-- O relatorio filtra por esta coluna e quase nenhum lancamento e divida (12 de
-- ~6.000), entao o indice parcial e pequeno e cobre a consulta inteira.
create index if not exists idx_lancamentos_e_divida
  on public.lancamentos (e_divida)
  where e_divida;

-- ---------------------------------------------------------------------------
-- fn_salvar_lancamento passa a gravar a marca
-- ---------------------------------------------------------------------------
-- A funcao e grande e outra frente pode te-la mudado hoje. Em vez de reescrever
-- o corpo de cabeca -- que e como se apaga o trabalho dos outros sem conflito
-- nenhum -- ela e reescrita A PARTIR DELA MESMA: le-se a definicao viva, aplica-
-- se a alteracao no texto e executa-se o resultado. Cada substituicao e
-- conferida; se alguma nao encontrar sua ancora, a migration para.

do $$
declare
  v_def text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_salvar_lancamento';

  if v_def is null then
    raise exception 'fn_salvar_lancamento nao encontrada';
  end if;
  if position('e_divida' in v_def) > 0 then
    raise notice 'fn_salvar_lancamento ja grava e_divida; nada a fazer';
    return;
  end if;

  -- 1. a coluna entra na lista do INSERT
  v_novo := replace(v_def,
    'retencao_outras, created_by)',
    'retencao_outras, e_divida, created_by)');
  if v_novo = v_def then
    raise exception 'Ancora 1 (lista de colunas do insert) nao encontrada';
  end if;
  v_def := v_novo;

  -- 2. o valor entra no VALUES, na mesma posicao
  v_novo := replace(v_def,
    'v_ret_inss, v_ret_outras,' || chr(10) || '      (select auth.uid())',
    'v_ret_inss, v_ret_outras,' || chr(10) ||
    '      coalesce((p_dados->>''e_divida'')::boolean, false),' || chr(10) ||
    '      (select auth.uid())');
  if v_novo = v_def then
    raise exception 'Ancora 2 (values do insert) nao encontrada';
  end if;
  v_def := v_novo;

  -- 3. e a coluna passa a ser atualizada na edicao
  v_novo := replace(v_def,
    'retencao_outras = v_ret_outras' || chr(10) || '    where id = v_id;',
    'retencao_outras = v_ret_outras,' || chr(10) ||
    '      e_divida = coalesce((p_dados->>''e_divida'')::boolean, false)' || chr(10) ||
    '    where id = v_id;');
  if v_novo = v_def then
    raise exception 'Ancora 3 (update) nao encontrada';
  end if;

  execute v_novo;
end $$;

-- ---------------------------------------------------------------------------
-- Os doze compromissos que ja existem
-- ---------------------------------------------------------------------------
-- Marcados por ID, nao por regex na descricao: "REFERENTE CONTRATO Nº 85901000-7"
-- e "COMPRA DE UMA ESCAVADEIRA HIDRAULICA" nao tem nada em comum no texto, e um
-- padrao largo o bastante para pegar os dois pegaria compra a vista tambem.
--
--   2 emprestimos de dinheiro   BB capital de giro, Caixa contrato 28102020
--   10 financiamentos/consorcios PACCAR x3, DAF, Noroeste, Guerra, Randon x3,
--                                Komatsu
--
-- Parcelamento de imposto (Prefeitura, SEFAZ) NAO entra: e divida com o fisco,
-- de outra natureza, e misturar mudaria o numero que o relatorio existe para
-- mostrar.

update public.lancamentos
set e_divida = true
where id in (
  '7fd8b968-3c60-45b6-b725-8b1d50d0b136',  -- PACCAR 85901000-7    3.249.275,31
  'cfc06aa1-70c0-40cb-b3f5-0781dbe9211d',  -- BB capital de giro   2.052.271,00
  '310a0a73-d5df-477b-bc30-204778fec4c9',  -- PACCAR 85907000-0    1.149.729,90
  '59e936c0-ef92-4c66-ad91-157c961e7285',  -- DAF XF FTT             953.848,26
  'ab1cdf4f-fccb-484e-bb02-4cb88584e293',  -- Noroeste escavadeira   794.262,60
  '20999fc1-1a0c-42e1-8618-3f14b49f072f',  -- Caixa 28102020         753.193,90
  '2b8e6851-c2bd-46b4-a73d-3c1bf23ecf05',  -- PACCAR CF FAT 310      741.216,60
  '7f618224-d49f-4167-aa26-414bc340e262',  -- Guerra implemento      410.665,62
  '42a82841-1bbb-4da8-9ad1-131e8b93a78d',  -- Randon cota 130-0      405.463,80
  '48c3a1e3-39fc-40b2-8dd2-abb435992318',  -- Randon cota 160-0      405.463,80
  '249feccc-8d5e-4fb6-82b6-da7b584e7b3f',  -- Komatsu carregadeira   335.178,92
  'a0e6dde9-785b-4b98-924c-732522efb4cc'   -- Randon cota 187-0      176.112,74
);

do $$
declare v_n int;
begin
  select count(*) into v_n from public.lancamentos where e_divida;
  if v_n <> 12 then
    raise exception 'Esperava 12 lancamentos marcados como divida, encontrei %', v_n;
  end if;
end $$;
