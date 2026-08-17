-- Desfaz as duas cargas do Mais Controle de 17/08/2026:
--   supabase/carga/oc_mais_controle_2026_08_17.sql         (17 ordens, 31 itens)
--   supabase/carga/oc_mais_controle_anexos_2026_08_17.sql  (45 anexos)
--
-- LEIA ANTES DE RODAR.
--
-- 1. Isto apaga as 17 ordens de compra e tudo que estiver pendurado nelas. Se
--    alguém já aprovou uma, gerou lançamento, ou anexou arquivo novo pela tela,
--    esse trabalho vai junto. O bloco recusa a rodar se alguma ordem saiu de
--    `rascunho` — desfazer carga é uma coisa, apagar decisão de gente é outra.
--
-- 2. Os binários no bucket NÃO saem daqui: SQL não fala com o Storage. Ao perder
--    a linha de `arquivos`, o objeto vira órfão e a faxina do app recolhe depois
--    da carência. Se quiser apagar na hora, os caminhos são os que este bloco
--    imprime antes de deletar.
--
-- Confira antes o que existe hoje:
--   select numero, status, valor_total from ordens_compra
--    where observacoes like 'Ordem de compra Mais Controle%' order by numero;

do $$
declare
  v_ordens uuid[];
  v_arquivos uuid[];
  v_falta text;
  v_n int;
  v_caminhos text;
begin
  select array_agg(id) into v_ordens
    from public.ordens_compra
   where observacoes like 'Ordem de compra Mais Controle%';

  if v_ordens is null then
    raise notice 'nada a desfazer: nenhuma ordem do Mais Controle no banco';
    return;
  end if;

  select string_agg(numero || ' (' || status || ')', ', ') into v_falta
    from public.ordens_compra
   where id = any(v_ordens) and status <> 'rascunho';
  if v_falta is not null then
    raise exception 'estas ordens sairam de rascunho, alguem mexeu nelas: %', v_falta;
  end if;

  if exists (
    select 1 from public.oc_itens i
     where i.ordem_compra_id = any(v_ordens)
       and i.created_at > (select max(created_at) + interval '1 hour'
                             from public.ordens_compra where id = any(v_ordens))
  ) then
    raise exception 'ha item adicionado depois da carga; confira antes de apagar';
  end if;

  -- Os arquivos que são SÓ destas ordens. Escolhidos ANTES de apagar qualquer
  -- coisa: `anexo_vinculos.arquivo_id` tem ON DELETE CASCADE, então apagar
  -- `arquivos` primeiro levaria os vínculos junto e a conta de vínculos sairia
  -- zero — foi o que o ensaio pegou. Arquivo compartilhado com outro documento
  -- fica: quem manda na vida do binário é ter ou não ter dono.
  select array_agg(a.id), string_agg(a.path_storage, E'\n')
    into v_arquivos, v_caminhos
    from public.arquivos a
   where exists (
     select 1 from public.anexo_vinculos v
      where v.arquivo_id = a.id
        and v.entidade_tipo = 'ordem_compra'
        and v.entidade_id = any(v_ordens))
     and not exists (
     select 1 from public.anexo_vinculos v
      where v.arquivo_id = a.id
        and not (v.entidade_tipo = 'ordem_compra' and v.entidade_id = any(v_ordens)));

  if v_caminhos is not null then
    raise notice 'binarios que ficarao orfaos no bucket:%', E'\n' || v_caminhos;
  end if;

  delete from public.anexo_vinculos
   where entidade_tipo = 'ordem_compra' and entidade_id = any(v_ordens);
  get diagnostics v_n = row_count;
  raise notice 'apagou % vinculo(s)', v_n;

  if v_arquivos is not null then
    delete from public.arquivos where id = any(v_arquivos);
    get diagnostics v_n = row_count;
    raise notice 'apagou % linha(s) de arquivos', v_n;
  end if;

  delete from public.oc_itens where ordem_compra_id = any(v_ordens);
  get diagnostics v_n = row_count;
  raise notice 'apagou % item(ns)', v_n;

  delete from public.ordens_compra where id = any(v_ordens);
  get diagnostics v_n = row_count;
  raise notice 'apagou % ordem(ns) de compra', v_n;
end $$;

-- Os insumos e o fornecedor criados junto com a carga NÃO saem aqui de
-- propósito: eles são cadastro, servem para a próxima compra, e apagar cadastro
-- que já pode ter sido usado em outro lugar é pior que deixar. Se quiser mesmo
-- tirar, confira o uso antes:
--   select i.codigo, i.nome, count(oi.id) as usos
--     from insumos i left join oc_itens oi on oi.insumo_id = i.id
--    where i.codigo in ('10093','10259','184','1335M544PE275','1335M544PE327',
--                       '1335M544PE325','1335M544PE326')
--    group by 1, 2;
--   select razao_social from fornecedores where razao_social = 'ORLEIR COSTA OLIVEIRA - CARÁ';
