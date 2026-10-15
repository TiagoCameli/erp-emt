-- Módulo Mapa v1.4: EXECUTE das RPCs da tela e fechamento das funções de trigger
--
-- A v1 revogou EXECUTE de public e anon ("só usuários autenticados"), mas nunca
-- concedeu a authenticated. Neste banco função nova não herda EXECUTE por default
-- privilege, então as RPCs de escrita do bloco 1 ficaram só com o dono e toda
-- mutação da tela /mapa voltaria 42501. Cada uma delas chama fn_mapa_exigir
-- (tem_permissao em mapa.mapa) antes de mexer em qualquer coisa.
--
-- As funções de trigger são chamadas pelo próprio trigger e não precisam de
-- EXECUTE para ninguém; as duas SECURITY DEFINER apareciam no advisor como
-- executáveis por anon/authenticated via /rest/v1/rpc.
--
-- As demais fn_mapa_* (relatórios, áreas, trechos, frentes, diárias) continuam
-- fechadas até o bloco que as usar.

grant execute on function public.fn_mapa_mover_equipamentos(uuid[], jsonb, date, text) to authenticated;
grant execute on function public.fn_mapa_mover_colaboradores(uuid[], jsonb, date, text) to authenticated;
grant execute on function public.fn_mapa_marcar_estado(uuid, text, text, text, jsonb, date) to authenticated;
grant execute on function public.fn_mapa_assinalar_operador(uuid, uuid, text) to authenticated;
grant execute on function public.fn_mapa_locacao_iniciar(uuid, uuid, text, numeric, date, jsonb, date, numeric, text, jsonb) to authenticated;
grant execute on function public.fn_mapa_locacao_encerrar(uuid, date, numeric, text) to authenticated;

revoke all on function public.fn_mapa_trg_equipamento_escopo() from public, anon, authenticated;
revoke all on function public.fn_mapa_trg_equipamento_no_mapa() from public, anon, authenticated;
revoke all on function public.fn_mapa_trg_imutavel() from public, anon, authenticated;
