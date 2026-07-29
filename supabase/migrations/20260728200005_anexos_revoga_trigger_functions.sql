-- Achado do advisor: as duas funcoes de TRIGGER de anexos ficaram chamaveis por
-- anon e authenticated via /rest/v1/rpc (o PUBLIC ganha EXECUTE por padrao em
-- funcao nova). Trigger executa pelo dono da tabela, nao pelo grant, entao
-- revogar nao muda o comportamento e fecha a porta.

revoke all on function public.fn_cascata_anexos() from public;
revoke all on function public.fn_cascata_anexos() from anon;
revoke all on function public.fn_cascata_anexos() from authenticated;

revoke all on function public.fn_marcar_arquivo_orfao() from public;
revoke all on function public.fn_marcar_arquivo_orfao() from anon;
revoke all on function public.fn_marcar_arquivo_orfao() from authenticated;
