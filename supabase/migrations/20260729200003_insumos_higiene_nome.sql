-- Higiene do nome do insumo: o estado "desativado" e o flag `ativo`, nao prefixo
-- no nome. Os insumos vieram do Mais Controle com "!EM PROCESSO DE DESATIVACAO!"
-- no comeco do nome (e ja estavam inativos, ou seja, a marca era redundante e so
-- poluia a busca) e com entidade HTML escapada (&quot;) no lugar da polegada.
--
-- Os seletores de OC e cotacao ja filtram `ativo = true`, entao insumo inativo
-- nao aparece para escolher: a marca no nome nunca foi o que segurava nada.

update public.insumos
set nome = btrim(
      replace(
        regexp_replace(nome, '^\s*!+[^!]*!+\s*', '', 'g'),
        '&quot;', '"'
      )
    )
where nome ~ '^\s*!' or nome like '%&quot;%';
