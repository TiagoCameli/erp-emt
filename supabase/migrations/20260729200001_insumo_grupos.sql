-- Categorias de insumo em 2 niveis: 4 grupos fixos + subcategorias.
--
-- Antes: 6 categorias planas para 3.351 insumos, sendo que duas concentravam
-- 91% da base ("Materiais de construcao" com 1.951 e "Pecas e componentes" com
-- 1.104). A coluna `tipo` de categorias_insumo era um agrupamento redundante,
-- 1:1 com a propria categoria, e sai nesta migration: com grupo + subcategoria,
-- ela seria um terceiro nivel dizendo a mesma coisa.
--
-- Mapeamento aprovado pelo Tiago em 29/07/2026 (levantamento com contagem real
-- por subcategoria). Decisoes que ele confirmou:
--   - peca de maquina e custo de EQUIPAMENTO, nao de material (991 insumos)
--   - rancho e alojamento vao para OUTROS (113 insumos que nao sao insumo de obra)
--   - limpeza e escritorio ficam em MATERIAL
--   - 10 subcategorias em Material (drill-down do relatorio por grupo)
--
-- 16% da base (529 insumos) cai em "A classificar" DE PROPOSITO: o que sobra sao
-- abreviacoes de catalogo ("TORN MILENI BEBED" e torneira, "DISJ SOPRANO" e
-- disjuntor). Classificacao errada e invisivel; "A classificar" e fila de
-- trabalho visivel, e a tela tem reclassificacao em lote para zerar essa fila.
--
-- Momento: hoje so 1 insumo foi usado em OC e 2 em cotacao, entao reclassificar
-- agora nao distorce historico nenhum.

-- 1. Grupos: 4 registros semeados, nao criaveis e nao delataveis ------------

create table if not exists public.insumo_grupos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  ordem smallint not null,
  /** Token de cor do design system (o app traduz para classe), nao hex. */
  cor text not null default 'neutro',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insumo_grupos_slug_check
    check (slug in ('material', 'mao_de_obra', 'equipamentos', 'outros')),
  constraint insumo_grupos_cor_check
    check (cor in ('ambar', 'verde', 'grafite', 'neutro'))
);

comment on table public.insumo_grupos is
  'Os 4 grupos fixos de insumo. Semeados: nao se cria nem se apaga grupo, so se edita rotulo, ordem e cor.';

insert into public.insumo_grupos (slug, nome, ordem, cor) values
  ('material',     'Material',     1, 'ambar'),
  ('mao_de_obra',  'Mão de obra',  2, 'verde'),
  ('equipamentos', 'Equipamentos', 3, 'grafite'),
  ('outros',       'Outros',       4, 'neutro')
on conflict (slug) do nothing;

-- A trava e no banco, nao na tela: o app escreve direto na tabela (padrao dos
-- cadastros), entao grant sozinho nao seguraria uma escrita futura por funcao.
create or replace function public.fn_grupos_sao_fixos()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    raise exception 'Os grupos de insumo sao fixos: nao da para criar grupo novo';
  end if;
  raise exception 'Os grupos de insumo sao fixos: nao da para apagar grupo. Edite o rotulo se precisar.';
end;
$$;

drop trigger if exists trg_insumo_grupos_fixos on public.insumo_grupos;
create trigger trg_insumo_grupos_fixos
  before insert or delete on public.insumo_grupos
  for each row execute function public.fn_grupos_sao_fixos();

alter table public.insumo_grupos enable row level security;

drop policy if exists insumo_grupos_select on public.insumo_grupos;
create policy insumo_grupos_select
  on public.insumo_grupos for select
  to authenticated
  using (true);

-- Editar rotulo/ordem/cor exige a permissao do cadastro de categorias.
drop policy if exists insumo_grupos_update on public.insumo_grupos;
create policy insumo_grupos_update
  on public.insumo_grupos for update
  to authenticated
  using (public.tem_permissao('cadastros.categorias', 'editar'))
  with check (public.tem_permissao('cadastros.categorias', 'editar'));

revoke all on table public.insumo_grupos from anon, authenticated;
grant select, update on table public.insumo_grupos to authenticated;

drop trigger if exists trg_audit_insumo_grupos on public.insumo_grupos;
create trigger trg_audit_insumo_grupos
  after insert or update or delete on public.insumo_grupos
  for each row execute function public.fn_audit();

drop trigger if exists trg_insumo_grupos_updated_at on public.insumo_grupos;
create trigger trg_insumo_grupos_updated_at
  before update on public.insumo_grupos
  for each row execute function public.fn_set_updated_at();

-- 2. Categoria ganha grupo ---------------------------------------------------

alter table public.categorias_insumo
  add column if not exists grupo_id uuid references public.insumo_grupos(id);

create index if not exists idx_categorias_insumo_grupo
  on public.categorias_insumo (grupo_id);

-- A unicidade passa a ser (nome, grupo_id): "A classificar" existe em cada um
-- dos 4 grupos, o que a UNIQUE (nome, tipo) antiga proibiria.
alter table public.categorias_insumo
  drop constraint if exists categorias_insumo_nome_tipo_key;

-- 3. As subcategorias do mapeamento aprovado --------------------------------
-- `tipo` ainda e NOT NULL aqui e some no fim da migration; usar 'material' como
-- valor de passagem nao tem efeito nenhum no modelo novo.

insert into public.categorias_insumo (nome, tipo, grupo_id, ativo)
select x.nome, 'material', g.id, true
from (values
  ('material',     'Cimento, agregados e concreto'),
  ('material',     'Asfalto e ligantes'),
  ('material',     'Aço, ferragens e fixação'),
  ('material',     'Madeira e formas'),
  ('material',     'Elétrica'),
  ('material',     'Hidráulica'),
  ('material',     'Pintura e acabamento'),
  ('material',     'Ferramentas e consumíveis'),
  ('material',     'EPI e sinalização'),
  ('material',     'Limpeza e escritório'),
  ('material',     'A classificar'),
  ('mao_de_obra',  'Equipe própria'),
  ('mao_de_obra',  'Diaristas'),
  ('mao_de_obra',  'Terceiros e empreitas'),
  ('mao_de_obra',  'A classificar'),
  ('equipamentos', 'Peças e componentes'),
  ('equipamentos', 'Pneus e câmaras'),
  ('equipamentos', 'Filtros'),
  ('equipamentos', 'Combustível'),
  ('equipamentos', 'Lubrificantes e graxas'),
  ('equipamentos', 'Manutenção e serviços'),
  ('equipamentos', 'Locação de equipamento'),
  ('equipamentos', 'A classificar'),
  ('outros',       'Fretes e transporte'),
  ('outros',       'Rancho e alojamento'),
  ('outros',       'Taxas e administrativo'),
  ('outros',       'A classificar')
) as x(grupo, nome)
join public.insumo_grupos g on g.slug = x.grupo
where not exists (
  select 1 from public.categorias_insumo c
  where c.nome = x.nome and c.grupo_id = g.id
);

-- 4. Reclassificacao dos 3.351 insumos --------------------------------------
-- Regras por palavra-chave no nome, sem acento, primeira que casa ganha. A
-- ordem importa: o que NAO e material de obra (rancho, alojamento, frete, taxa)
-- sai antes, senao "OLEO DE SOJA" cairia em lubrificante e "CAIXA DE CEBOLA" em
-- hidraulica. Depois mao de obra, depois equipamento, e material no fim.

with alvo as (
  select i.id,
         c.nome as categoria_origem,
         lower(translate(i.nome,
           'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
           'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')) as n
  from public.insumos i
  join public.categorias_insumo c on c.id = i.categoria_id
  where c.grupo_id is null          -- so os insumos das 6 categorias antigas
), decidido as (
  select a.id,
    case
      when n ~ '(arroz|feijao|carne|frango|macarrao|acucar|^cafe|leite|farinha|molho|repolho|cebola|tomate|batata|banana|ovo |ovos|peixe|linguica|^sal |tempero|biscoito|^pao |margarina|manteiga|queijo|presunto|refrigerante|suco|agua mineral|gelo|charque|sardinha|milho|colorau|vinagre|mortadela|corte/desossa|frios|almoco|marmita|sazon)'
        then 'outros|Rancho e alojamento'
      when n ~ '(colchao|cobertor|travesseiro|lencol|^cama |rede |mosquiteiro|toalha de banho|armario|cadeira|mesa de|beliche|smartphone|^tv |televis|condensadora|ventilador|geladeira|fogao|microondas)'
        then 'outros|Rancho e alojamento'
      when n ~ '(frete|transporte|carreto|deslocamento|pedagio)' then 'outros|Fretes e transporte'
      when n ~ '(exame|despesa|taxa|imposto|licenc|seguro|internet|telefone|energia eletrica|conta de agua|contab|cartorio|multa|administrativ|encargos complementares)'
        then 'outros|Taxas e administrativo'
      when n ~ '(diarista)' then 'mao_de_obra|Diaristas'
      when n ~ '(horista|mensalista|ajudante|pedreiro|carpinteiro|armador|eletricista|encanador|azulejista|pintor|soldador|servente|encarregado|engenheiro|topografo|operador|motorista|vigia|cozinheir|auxiliar|meio-oficial|mestre|apontador|almoxarife|tecnico de|coordenador|gerente|aplicador de)'
        then 'mao_de_obra|Equipe própria'
      when n ~ '(empreita|mao de obra|servico de terceiro|terceirizad)' then 'mao_de_obra|Terceiros e empreitas'
      when n ~ '(locacao|aluguel de (maquina|equipamento|caminhao))' then 'equipamentos|Locação de equipamento'
      when n ~ '(conserto|retifica|usinagem|borracharia|manutencao|revisao|alinhamento|balanceamento|embuchamento|rebobinamento|guincho|lavagem de|solda de|recuperacao de)'
        then 'equipamentos|Manutenção e serviços'
      when categoria_origem = 'Combustiveis' or n ~ '(diesel|gasolina|arla|etanol|botijao de gas|gas macarico|glp)'
        then 'equipamentos|Combustível'
      when categoria_origem = 'Oleos e lubrificantes' or n ~ '(graxa|lubrific|oleo hidraulico|oleo motor|oleo 15w|oleo 20w|fluido de freio)'
        then 'equipamentos|Lubrificantes e graxas'
      when n ~ '(pneu|camara de ar|protetor de aro|recap)' then 'equipamentos|Pneus e câmaras'
      when n ~ '(filtro)' then 'equipamentos|Filtros'
      when categoria_origem = 'Pecas e componentes' then 'equipamentos|Peças e componentes'
      when n ~ '(retentor|rolamento|correia|engrenagem|borda cortante|dente de|unha de|esteira|rolete|manga de eixo|cubo de roda)'
        then 'equipamentos|Peças e componentes'
      when categoria_origem = 'Betuminosos' or n ~ '(asfalto|emulsao asf|^cap |cm-30|rr-2c|betume|imprimacao)'
        then 'material|Asfalto e ligantes'
      when n ~ '(cimento|areia|brita|pedra|seixo|argamassa|concreto|^cal |rejunte|graute|aditivo|gesso|cascalh)'
        then 'material|Cimento, agregados e concreto'
      when n ~ '(cabo |disjuntor|tomada|interruptor|lampada|eletroduto|conduite|terminal|reator|luminaria|refletor|contator|^rele|fusivel|plafon|plafpn|soquete|^led|canaleta|minidisj|^plug|pilha|extensao)'
        then 'material|Elétrica'
      when n ~ '(tubo|joelho|luva|^te |curva|registro|torneira|adaptador|sifao|caixa d.agua|caixa sifonada|ralo|conexao|esgoto|niple|flange|valvula|ducha|vaso sanit|^pia |assento sanit|bacia|engate|reducao|misturador|hidro)'
        then 'material|Hidráulica'
      when n ~ '(prego|parafuso|arruela|porca|bucha|chumbador|arame|barra |ferro |^aco |trelica|tela |vergalhao|estribo|par ciser|grampo|^pino|bar rosc)'
        then 'material|Aço, ferragens e fixação'
      when n ~ '(madeira|tabua|compensado|caibro|pontalete|ripa|sarrafo|viga|forma |eucalipto|mdf|escora|lona)'
        then 'material|Madeira e formas'
      when n ~ '(tinta|verniz|solvente|thinner|massa corrida|massa acrilica|selador|primer|impermeab|esmalte|pincel|trincha|^rolo|telha|porta|janela|fechadura|dobradica|piso|ceramica|azulejo|forro|calha|rodape|soleira|vidro|granito|marmore)'
        then 'material|Pintura e acabamento'
      when n ~ '(bota|botina|capacete|oculos|protetor|mascara|colete|uniforme|camisa|calca|cinto de seg|abafador|respirador|^epi|bone|jaqueta|cone|placa|zebrada|tapume|cavalete|defensa|sinalizacao|refletiv)'
        then 'material|EPI e sinalização'
      when n ~ '(disco|lixa|broca|serra|chave|alicate|martelo|trena|eletrodo|esmeril|furadeira|espatula|colher de|desempenadeira|carrinho de mao|enxada|^pa |picareta|marreta|fita|adesivo|silicone|veda|cola|abracadeira|nivel|esquadro|balde|mangueira|estilete|regua|facao|torquesa|concha|jogo de|^kit|pasta de solda|graxei)'
        then 'material|Ferramentas e consumíveis'
      when n ~ '(papel|caneta|detergente|vassoura|sabao|copo|agua sanit|limpeza|escritorio|toalha|saco de lixo|pano|desinfet|alcool|rodo|cesto|limpa |limpador|processador plastico|incenso|prancheta|essencia)'
        then 'material|Limpeza e escritório'
      -- Nao adivinha: cai na fila de trabalho do grupo mais provavel pela origem.
      when categoria_origem = 'Servicos e fretes' then 'outros|A classificar'
      else 'material|A classificar'
    end as destino
  from alvo a
)
update public.insumos i
set categoria_id = c.id
from decidido d
join public.insumo_grupos g on g.slug = split_part(d.destino, '|', 1)
join public.categorias_insumo c on c.grupo_id = g.id and c.nome = split_part(d.destino, '|', 2)
where i.id = d.id;

-- 5. As 6 categorias antigas ficaram vazias e saem --------------------------

delete from public.categorias_insumo
where grupo_id is null
  and not exists (select 1 from public.insumos i where i.categoria_id = categorias_insumo.id);

-- 6. Agora o grupo e obrigatorio e o `tipo` some ----------------------------

alter table public.categorias_insumo alter column grupo_id set not null;

alter table public.categorias_insumo
  drop constraint if exists categorias_insumo_tipo_check;
alter table public.categorias_insumo drop column if exists tipo;

alter table public.categorias_insumo
  add constraint categorias_insumo_nome_grupo_key unique (nome, grupo_id);

comment on column public.categorias_insumo.grupo_id is
  'Grupo fixo da subcategoria. O insumo aponta so para a categoria; o grupo vem por join, sem coluna denormalizada no insumo.';
