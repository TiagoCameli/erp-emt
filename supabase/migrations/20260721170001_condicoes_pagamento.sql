-- Lista de condições de pagamento (lookup) que alimenta o combobox de Compras
-- na Ordem de Compra e na condição do fornecedor da Cotação. A ordem/cotação
-- continua guardando o TEXTO da condição escolhida; esta tabela só serve as
-- opções do dropdown e guarda o que o usuário criar pelo próprio campo.
-- RLS por permissão de compras. Sem UPDATE/DELETE (rule 1: sem policy = sem grant).

create table public.condicoes_pagamento (
  id uuid primary key default gen_random_uuid(),
  descricao text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid()
);

alter table public.condicoes_pagamento enable row level security;

-- Ver as opções: quem pode ver Ordens OU Cotações.
create policy condicoes_pagamento_select on public.condicoes_pagamento
  for select to authenticated
  using (
    public.tem_permissao('compras.ordens', 'ver')
    or public.tem_permissao('compras.cotacoes', 'ver')
  );

-- Criar opção nova (inline pelo campo): quem cria/edita Ordens OU Cotações.
create policy condicoes_pagamento_insert on public.condicoes_pagamento
  for insert to authenticated
  with check (
    public.tem_permissao('compras.ordens', 'criar')
    or public.tem_permissao('compras.ordens', 'editar')
    or public.tem_permissao('compras.cotacoes', 'criar')
    or public.tem_permissao('compras.cotacoes', 'editar')
  );

-- Grants explícitos: só o que as policies liberam. Nada de UPDATE/DELETE, nada pro anon.
grant select, insert on public.condicoes_pagamento to authenticated;

-- Seed das condições mais comuns.
insert into public.condicoes_pagamento (descricao) values
  ('À vista'),
  ('7 dias'),
  ('15 dias'),
  ('21 dias'),
  ('28 dias'),
  ('30 dias'),
  ('45 dias'),
  ('60 dias'),
  ('30/60 dias'),
  ('30/60/90 dias'),
  ('Boleto 30 dias')
on conflict (descricao) do nothing;
