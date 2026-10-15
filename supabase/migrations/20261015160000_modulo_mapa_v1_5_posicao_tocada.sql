-- Módulo Mapa v1.5: a máquina fica onde foi tocada
--
-- fn_mapa_mover_equipamentos gravava a coordenada devolvida por fn_mapa_resolver_destino,
-- que, perto do traçado (até 300 m), é o ponto sobre o eixo. Uma máquina no pátio ao lado da
-- pista (ou a usina, a 30 m dela) ia parar em cima da linha. O Tiago pediu para posicionar fora
-- da rodovia (15/10/2026): a posição passa a ser sempre a tocada (p_destino, obrigatória na
-- própria função); trecho, km, área, local e estado continuam vindo do resolvedor.
--
-- Alterada a partir da definição viva (pg_get_functiondef), trocando só a expressão da
-- posição; CREATE OR REPLACE mantém os grants da v1.4.

do $migracao$
declare
  v_def text := pg_get_functiondef('public.fn_mapa_mover_equipamentos(uuid[], jsonb, date, text)'::regprocedure);
  v_velho_lng text := $t$coalesce((v_dest->>'lng')::double precision, (p_destino->>'lng')::double precision)$t$;
  v_velho_lat text := $t$coalesce((v_dest->>'lat')::double precision, (p_destino->>'lat')::double precision)$t$;
  v_novo_lng text := $t$(p_destino->>'lng')::double precision$t$;
  v_novo_lat text := $t$(p_destino->>'lat')::double precision$t$;
begin
  if (length(v_def) - length(replace(v_def, v_velho_lng, ''))) / length(v_velho_lng) <> 1
     or (length(v_def) - length(replace(v_def, v_velho_lat, ''))) / length(v_velho_lat) <> 1 then
    raise exception 'fn_mapa_mover_equipamentos não tem a expressão esperada uma vez só; nada alterado';
  end if;
  execute replace(replace(v_def, v_velho_lng, v_novo_lng), v_velho_lat, v_novo_lat);
end
$migracao$;
