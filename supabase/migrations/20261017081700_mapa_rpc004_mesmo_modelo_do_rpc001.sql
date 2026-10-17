-- O rolo RPC-004 (Dynapac CA 25) aparecia no Mapa com o modelo 3D de rolo de pneu;
-- o Tiago pediu o mesmo modelo do RPC-001 (rolo_pe_carneiro). Só dado, já aplicado no
-- banco vivo em 17/10/2026; a guarda no tipo atual deixa a reexecução inócua.
update public.mapa_equipamentos m set tipo_modelo_3d = 'rolo_pe_carneiro'
  from public.equipamentos e
 where e.id = m.equipamento_id and e.codigo = 'RPC-004' and m.tipo_modelo_3d = 'rolo_pneu';
