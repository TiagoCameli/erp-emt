-- Cada lançamento passa a ter o SEU número, e o banco passa a exigir isso.
--
-- Estado antes desta migration, medido: 5.911 lançamentos ocupando 594 números,
-- todos entre LAN-2026-1307 e LAN-2026-1900. Distribuição: 581 números com dez
-- lançamentos cada, cinco com nove, cinco com oito, e mais quatro casos soltos.
-- Nenhum número identificava um documento. A fonte disso é o `lpad` que truncava
-- e foi consertada na migration anterior (20260818150000).
--
-- ## Por que renumerar TODOS, e não só as repetições
--
-- A saída óbvia seria manter o primeiro de cada grupo e renumerar os outros. Ela
-- não serve aqui por duas razões:
--
-- 1. **Não existe "o primeiro".** Todos os 594 números são compartilhados, então
--    manter um de cada grupo é escolher no palpite qual dos dez documentos fica
--    com o número que hoje pertence aos dez.
-- 2. **O resultado seria pior de ler.** Os que sobrassem ficariam na faixa 1307
--    a 1900 e os renumerados começariam em 19.005, porque é onde a sequência
--    está. Cinco mil documentos com número de cinco dígitos ao lado de 594 com
--    quatro, sem nenhum significado na diferença.
--
-- Renumerando tudo, a numeração volta a ser o que ela deveria ser: 0001 em
-- diante, contígua, sem repetição, e com folga de quatro dígitos até 9.999.
--
-- Isto é seguro de fazer porque `numero` não é chave de nada: não há FK apontando
-- para ele, nenhuma outra tabela guarda o texto (varredura em todas as colunas de
-- texto do schema: zero ocorrências de 'LAN-2026-' fora de lancamentos e do
-- audit_log), e o app só o EXIBE, busca por ilike e ordena. Quem abre o
-- lançamento clica no id.
--
-- ## Ordem da numeração: entrada no ERP, não data da compra
--
-- `created_at` (com desempate por id), e não `data_compra`. As compras vão de
-- 2024-10-29 a 2026-08-18 porque são história importada, mas o número do
-- documento é o registro DELE no ERP, e é isso que a sequência continua fazendo
-- daqui para frente: lançamento novo com compra antiga vai receber número alto de
-- qualquer forma. Numerar pela data da compra criaria uma correlação que o
-- próximo lançamento já quebraria.
--
-- O rótulo do ano continua 2026 pelo mesmo motivo: é o ano em que o documento
-- entrou no ERP. A migration se recusa a rodar se houver mais de um ano em uso,
-- porque aí a numeração teria de reiniciar por ano.
--
-- ## O número velho fica guardado
--
-- `lancamentos_numero_reparo` guarda de/para de cada linha, que é o que o
-- rollback usa. Ela pode ser derrubada depois que o Tiago conferir a tela.

-- Nenhum insert pode entrar no meio. Se entrasse, ele levaria um número da
-- sequência ANTIGA (19.005 em diante), que ficaria plantado no caminho futuro da
-- sequência reiniciada: daqui a treze mil documentos o índice único recusaria uma
-- gravação legítima, e ninguém ligaria o erro a esta migration.
lock table public.lancamentos in exclusive mode;

do $$
declare
  v_anos integer;
begin
  select count(distinct split_part(numero, '-', 2)) into v_anos from public.lancamentos;
  if v_anos > 1 then
    raise exception 'Há % anos em uso no número; renumerar exige reiniciar por ano', v_anos;
  end if;
end $$;

create table if not exists public.lancamentos_numero_reparo (
  lancamento_id uuid primary key references public.lancamentos(id) on delete cascade,
  numero_antigo text not null,
  numero_novo text not null,
  reparado_em timestamptz not null default now()
);

comment on table public.lancamentos_numero_reparo is
  'De/para da renumeração de 18/08/2026, que deu número próprio a cada lançamento depois do defeito de truncamento do lpad. Serve de rollback. Pode ser derrubada depois de conferido.';

-- Material de reparo: ninguém lê pelo app. RLS ligada sem policy nenhuma, e sem
-- grant, é o par que fecha a tabela (regra de ouro 1: nenhuma tabela sem RLS).
alter table public.lancamentos_numero_reparo enable row level security;
revoke all on public.lancamentos_numero_reparo from anon, authenticated;

insert into public.lancamentos_numero_reparo (lancamento_id, numero_antigo, numero_novo)
select
  l.id,
  l.numero,
  'LAN-' || split_part(l.numero, '-', 2) || '-' ||
    lpad(o.n::text, greatest(4, length(o.n::text)), '0')
from public.lancamentos l
join (
  select id, row_number() over (order by created_at, id) as n
  from public.lancamentos
) o on o.id = l.id
on conflict (lancamento_id) do update
set numero_antigo = excluded.numero_antigo,
    numero_novo = excluded.numero_novo,
    reparado_em = now();

update public.lancamentos l
set numero = r.numero_novo
from public.lancamentos_numero_reparo r
where r.lancamento_id = l.id
  and l.numero <> r.numero_novo;

-- A sequência volta a apontar para o primeiro número livre. `max + 1` e não
-- `count + 1`: se algum insert tivesse escapado do lock, contar linhas devolveria
-- um valor JÁ EM USO e o próximo lançamento seria recusado pelo índice.
update public.documento_sequencias
set proximo = (
  select max(split_part(numero, '-', 3)::integer) + 1 from public.lancamentos
)
where tipo = 'LAN'
  and ano = extract(year from now() at time zone 'America/Rio_Branco')::integer;

do $$
declare
  v_total integer;
  v_distintos integer;
  v_trocados integer;
  v_proximo integer;
  v_maior integer;
begin
  select count(*), count(distinct numero) into v_total, v_distintos
  from public.lancamentos;
  if v_total <> v_distintos then
    raise exception 'Sobrou número repetido: % lançamentos em % números', v_total, v_distintos;
  end if;

  -- Linha de controle: esta contagem TEM que ser diferente de zero. Sem ela, uma
  -- migration que não renumerasse nada passaria por todas as outras conferências,
  -- porque um banco já correto satisfaz "não há repetido".
  select count(*) into v_trocados
  from public.lancamentos_numero_reparo
  where numero_antigo <> numero_novo;
  if v_trocados = 0 then
    raise exception 'Nenhum número mudou: a renumeração não rodou';
  end if;
  raise notice 'Renumerados % de % lançamentos', v_trocados, v_total;

  select proximo into v_proximo
  from public.documento_sequencias
  where tipo = 'LAN'
    and ano = extract(year from now() at time zone 'America/Rio_Branco')::integer;
  select max(split_part(numero, '-', 3)::integer) into v_maior from public.lancamentos;
  if v_proximo is null or v_proximo <= v_maior then
    raise exception 'A sequência (%) não está à frente do maior número em uso (%)', v_proximo, v_maior;
  end if;
end $$;

-- O que impede a volta do problema, seja por qual caminho for: numerador com
-- defeito, carga que passe número na mão, ou insert direto na tabela.
create unique index uq_lancamentos_numero on public.lancamentos (numero);

-- Documento sem número é documento que ninguém acha. O trigger BEFORE INSERT
-- sempre preencheu; agora o banco também exige.
alter table public.lancamentos alter column numero set not null;
