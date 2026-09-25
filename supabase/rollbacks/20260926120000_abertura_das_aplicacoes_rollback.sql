-- Rollback da abertura das aplicacoes (20260926120000).
-- Apaga os dois lancamentos de ajuste e as duas posicoes de abertura. Recusa se
-- ja houver posicao depois da abertura: o rendimento dela depende da abertura,
-- e apagar por baixo deixaria o lancamento dela errado.
do $rb$
begin
  if exists (select 1 from public.aplicacao_posicoes where not e_abertura) then
    raise exception 'Ha posicao depois da abertura: exclua-as pela aba antes de desfazer a abertura';
  end if;
  delete from public.lancamentos l
  using public.aplicacao_posicoes p
  where l.origem = 'aplicacao' and l.origem_id = p.id and p.e_abertura;
  delete from public.aplicacao_posicoes where e_abertura;
  if public.fn_saldo_conta('37ca9c33-859d-42d7-8c14-78a6119d0258') <> 5913186.79 then
    raise exception 'Subconta nao voltou a 5913186.79';
  end if;
end $rb$;
