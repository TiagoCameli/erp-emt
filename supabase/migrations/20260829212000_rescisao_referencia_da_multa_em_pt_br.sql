-- A referência da multa do FGTS estava saindo "40% de 12,000.00".
--
-- Encontrado na saída da prova, não por leitura de código. `to_char` com `G` e
-- `D` usa o `lc_numeric` do servidor, que aqui é inglês: vírgula de milhar e
-- ponto decimal. Num documento que o colaborador assina, "12,000.00" ou é lido
-- como doze mil escrito errado, ou como doze reais.
--
-- A correção troca `G`/`D` por `,` e `.` LITERAIS no formato — esses dois são
-- determinísticos, não olham locale nenhum — e só então inverte os dois com
-- `translate`. Assim o resultado não muda se alguém reconfigurar o servidor,
-- que é justamente a armadilha da versão anterior: ela funcionaria "por
-- acidente" num servidor pt-BR e quebraria de novo num en-US.

do $patch$
declare
  v_oid oid;
  v_def text;
  a_fmt text := '      trim(to_char(v_multa_pct, ''FM999990.####'')) || ''% de '' ||
        trim(to_char(coalesce(p_saldo_fgts, 0), ''FM999G999G990D00'')),';
  n_fmt text := '      -- `,` e `.` LITERAIS no formato, e nao `G`/`D`: os literais nao olham
      -- o lc_numeric do servidor. So depois o translate inverte os dois para
      -- pt-BR. Com G/D isto saia "40% de 12,000.00" num documento assinado.
      translate(trim(to_char(v_multa_pct, ''FM999990.####'')), ''.'', '','') || ''% de R$ '' ||
        translate(trim(to_char(coalesce(p_saldo_fgts, 0), ''FM999,999,990.00'')), '',.'', ''.,''),';
begin
  select p.oid into strict v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_rescisao';

  v_def := pg_get_functiondef(v_oid);
  if position(a_fmt in v_def) = 0 then
    raise exception 'Ancora do formato da multa nao encontrada em fn_gerar_rescisao';
  end if;

  execute replace(v_def, a_fmt, n_fmt);

  if position('FM999,999,990.00' in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'A correcao do formato nao entrou em fn_gerar_rescisao';
  end if;
end $patch$;
