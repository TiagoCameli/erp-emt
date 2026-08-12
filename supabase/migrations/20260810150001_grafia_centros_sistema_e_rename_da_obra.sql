-- =============================================================
-- Grafia correta nos centros de sistema + rename da obra desce
-- para o centro de custo raiz
--
-- 1. Os centros semeados na migration 9 nasceram sem acento
--    ('Escritorio Central', 'Manutencao') e o Tiago pediu grafia
--    correta, com 'Manutencao' virando 'Manutencao de equipamentos'.
--    O update casa por `tipo`, nao pelo nome literal: tipo e o
--    identificador estavel, nome e o dado que estamos corrigindo.
--
-- 2. O trigger de insert (trg_obra_cria_centro_custo) copia o nome
--    da obra para o centro raiz na criacao, mas nada mantinha isso
--    depois: renomear a obra deixava a arvore de centros com o nome
--    velho para sempre. Agora o rename desce.
--
-- Compatibilidade: a importacao de centros de custo casa o centro
-- por nome. Ela passou a normalizar acento (src/lib/chave-nome.ts),
-- entao planilha antiga escrita "Escritorio Central" continua
-- casando com "Escritorio Central" acentuado.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Grafia dos centros de sistema
-- -------------------------------------------------------------
update public.centros_custo
set nome = 'Manutenção de equipamentos'
where sistema and tipo = 'manutencao' and nivel = 1;

update public.centros_custo
set nome = 'Escritório Central'
where sistema and tipo = 'escritorio' and nivel = 1;

-- -------------------------------------------------------------
-- 2. Rename da obra desce para o centro raiz
--
-- Simetrico do trg_obra_cria_centro_custo. `after update of nome`
-- so dispara quando nome esta no SET, e o `is distinct from` evita
-- update redundante (que geraria linha de auditoria a cada save da
-- obra, mesmo sem trocar o nome).
-- -------------------------------------------------------------
create or replace function public.fn_obra_renomeia_centro_custo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.nome is distinct from old.nome then
    update public.centros_custo
    set nome = new.nome
    where obra_id = new.id;
  end if;
  return new;
end $$;

revoke all on function public.fn_obra_renomeia_centro_custo() from public, anon, authenticated;

drop trigger if exists trg_obra_renomeia_centro_custo on public.obras;
create trigger trg_obra_renomeia_centro_custo
  after update of nome on public.obras
  for each row execute function public.fn_obra_renomeia_centro_custo();

comment on function public.fn_obra_renomeia_centro_custo() is
  'Mantem o nome do centro de custo raiz igual ao da obra. Par do trg_obra_cria_centro_custo: um cria, o outro mantem.';
