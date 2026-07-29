-- fn_registrar_arquivo estourava com 42P10 ("no unique or exclusion constraint
-- matching the ON CONFLICT specification") em TODO upload: o indice de dedup e
-- PARCIAL (where hash_sha256 is not null) e o ON CONFLICT nao infere indice
-- parcial sem repetir o predicado. Resultado: o binario subia para o bucket e o
-- registro falhava, deixando objeto orfao e nenhum anexo.
--
-- A prova (supabase/provas/anexos_cadeia.sql) nao pegou porque inseria em
-- `arquivos` direto e chamava so fn_vincular_arquivo: testava em volta do
-- caminho que a tela usa, nao o caminho. A prova foi corrigida junto.

create or replace function public.fn_registrar_arquivo(
  p_path text, p_nome text, p_mime text, p_tamanho bigint, p_hash text,
  p_entidade_tipo text, p_entidade_id uuid
)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_recurso text; v_arquivo uuid;
begin
  v_recurso := public.fn_recurso_da_entidade(p_entidade_tipo);
  if v_recurso is null then
    raise exception 'Tipo de entidade sem anexos: %', p_entidade_tipo;
  end if;
  if not (public.tem_permissao(v_recurso, 'editar') or public.tem_permissao(v_recurso, 'criar')) then
    raise exception 'Sem permissao para anexar neste documento';
  end if;

  -- O `where` repete o predicado do indice parcial, senao o Postgres nao o
  -- infere e o insert estoura com 42P10.
  insert into public.arquivos (path_storage, nome_original, tipo_mime, tamanho_bytes, hash_sha256)
  values (p_path, p_nome, nullif(p_mime, ''), p_tamanho, nullif(p_hash, ''))
  on conflict (hash_sha256, tamanho_bytes) where hash_sha256 is not null
  do nothing
  returning id into v_arquivo;

  if v_arquivo is null then
    select id into v_arquivo from public.arquivos
    where hash_sha256 = nullif(p_hash, '') and tamanho_bytes = p_tamanho limit 1;
  end if;
  if v_arquivo is null then raise exception 'Nao foi possivel registrar o arquivo'; end if;

  perform public.fn_vincular_arquivo(v_arquivo, p_entidade_tipo, p_entidade_id, p_nome);
  return v_arquivo;
end;
$function$;
