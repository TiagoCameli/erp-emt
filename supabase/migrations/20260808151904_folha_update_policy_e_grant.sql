-- Task 2 do Bloco 8a: o fluxo de aprovacao da folha faz UPDATE direto pela RLS
-- (enviar para aprovacao e rejeitar), guardado pelo trigger
-- trg_guarda_status_folha. Ate aqui `folhas` so tinha folhas_select (SELECT):
-- tudo passava pelas RPCs fn_fechar_folha/fn_reabrir_folha, que a Task 1
-- removeu. Espelha ordens_compra_update: a condicao usa 'editar' OR 'aprovar'
-- nos dois lados (using e with check) porque o UPDATE direto cobre dois
-- caminhos do trigger -- enviar (editar) e rejeitar (aprovar) -- e quem so
-- aprova tambem precisa conseguir rejeitar.
--
-- NOTA (fix round 1, ver 20260808153000_folha_update_coluna_e_motivo.sql):
-- o `grant update on public.folhas` abaixo, sem lista de colunas, abriu a
-- tabela inteira para authenticated. trg_guarda_status_folha e BEFORE UPDATE
-- OF status, entao so dispara quando status esta no SET: ficava cego para
-- valor_liquido, custo_total, competencia etc. A migration corretiva revoga
-- isso e concede so (status, motivo_rejeicao). Mantido aqui tal como rodou,
-- porque o arquivo e rastro do que foi aplicado, nao fonte de reaplicacao.

create policy folhas_update
  on public.folhas
  for update
  to authenticated
  using (
    public.tem_permissao('rh.folha', 'editar')
    or public.tem_permissao('rh.folha', 'aprovar')
  )
  with check (
    public.tem_permissao('rh.folha', 'editar')
    or public.tem_permissao('rh.folha', 'aprovar')
  );

grant update on public.folhas to authenticated;

-- Trava fail-closed: sem INSERT/DELETE para authenticated (a folha nasce pela
-- fn_gerar_folha, security definer, e nao tem exclusao) e nada para anon.
do $$
begin
  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'folhas'
      and grantee = 'anon'
  ) then
    raise exception 'anon nao pode ter privilegio algum em public.folhas';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'folhas'
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'DELETE')
  ) then
    raise exception 'authenticated nao pode ter INSERT nem DELETE em public.folhas';
  end if;
end $$;
