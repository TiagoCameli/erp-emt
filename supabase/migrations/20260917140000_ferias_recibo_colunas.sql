-- O recibo de ferias: dinheiro em cima do registro que ja existe.
--
-- Uma linha de rh_ferias = umas ferias = um recibo. Dois status independentes:
-- `status` e o GOZO (programada/gozada) e `status_recibo` e o PAGAMENTO.
-- Alguem pode estar de ferias sem o recibo ter saido, e receber antecipado sem
-- ter saido ainda.
--
-- O app NAO calcula ferias. Bruto, INSS e IRRF sao digitados; o unico numero
-- derivado e a subtracao.

alter table public.rh_ferias
  add column if not exists status_recibo text not null default 'sem_recibo',
  add column if not exists valor_bruto numeric(14,2) not null default 0,
  add column if not exists valor_inss numeric(14,2) not null default 0,
  add column if not exists valor_irrf numeric(14,2) not null default 0,
  add column if not exists valor_liquido numeric(14,2) not null default 0,
  add column if not exists data_vencimento date,
  add column if not exists centro_custo_id uuid references public.centros_custo(id),
  add column if not exists lancamento_id uuid references public.lancamentos(id),
  add column if not exists aprovado_por uuid,
  add column if not exists aprovado_em timestamptz,
  add column if not exists motivo_rejeicao text;

alter table public.rh_ferias
  drop constraint if exists rh_ferias_status_recibo_check;
alter table public.rh_ferias
  add constraint rh_ferias_status_recibo_check check (status_recibo in
    ('sem_recibo','rascunho','pendente_aprovacao','aprovado'));

-- `created_by` existe como coluna desde sempre e NUNCA teve FK. Ganha agora,
-- junto com `aprovado_por`: sao referencias de verdade e devem ser declaradas.
--
-- Consequencia que o PostgREST impoe: com DUAS FKs para `usuarios`, todo embed
-- de usuario nesta tabela passa a exigir hint (`usuarios!nome_da_fk(...)`).
-- Sem hint, HTTP 300 / PGRST201 e a tela quebra, sem aparecer em tsc, lint ou
-- build.
alter table public.rh_ferias
  drop constraint if exists rh_ferias_created_by_fkey,
  drop constraint if exists rh_ferias_aprovado_por_fkey;

alter table public.rh_ferias
  add constraint rh_ferias_created_by_fkey
    foreign key (created_by) references public.usuarios(id),
  add constraint rh_ferias_aprovado_por_fkey
    foreign key (aprovado_por) references public.usuarios(id);

comment on column public.rh_ferias.status_recibo is
  'Status do PAGAMENTO. Independente de `status`, que e o do GOZO.';

-- Liquido = bruto - INSS - IRRF. Coluna comum com trigger, e NAO coluna
-- gerada: coluna gerada faz o PostgREST devolver 428C9 para o frontend
-- publicado antes do deploy novo.
create or replace function public.fn_ferias_recibo_liquido()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.valor_liquido := new.valor_bruto - new.valor_inss - new.valor_irrf;
  return new;
end $$;

drop trigger if exists rh_ferias_liquido on public.rh_ferias;
create trigger rh_ferias_liquido
  before insert or update of valor_bruto, valor_inss, valor_irrf
  on public.rh_ferias
  for each row execute function public.fn_ferias_recibo_liquido();

-- A guia do recibo de ferias ganha origem PROPRIA, e nao 'folha_guia'.
-- Mesma razao do 13o: folha_guias.folha_id e NOT NULL apontando para `folhas`,
-- e rh/folha/queries.ts casa folha_guias por lancamento_id para classificar a
-- linha como guia. Um 'folha_guia' sem linha la vira orfao silencioso.
alter table public.lancamentos drop constraint lancamentos_origem_check;

alter table public.lancamentos add constraint lancamentos_origem_check
  check (origem in ('oc','manual','diaria','folha','folha_guia',
                    'adiantamento','rescisao','decimo_terceiro','ferias',
                    'decimo_terceiro_guia','ferias_guia'));
