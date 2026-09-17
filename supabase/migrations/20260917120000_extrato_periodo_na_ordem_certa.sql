-- Conserta o período dos extratos que foram gravados de trás para frente.
--
-- A Caixa exportou 01/2025 e 02/2025 com DTSTART DEPOIS de DTEND, e o parser
-- gravava o par como veio. Resultado no banco: extratos com `periodo_inicio`
-- 31/01/2025 e `periodo_fim` 01/01/2025, um período que anda para trás. A tela
-- de extratos importados mostra esse par, e a conferência de mês fechado (nova,
-- em `conferirMesFechado`) leria como se o arquivo não cobrisse nada.
--
-- Período é INTERVALO, e intervalo não tem ordem: o que existe aqui é um par
-- trocado. O parser passou a normalizar na leitura; esta migration normaliza o
-- que já está gravado.
--
-- É correção de dado, não muda estrutura e não fecha nada: pode ser aplicada no
-- banco vivo antes do deploy. O par trocado é o ÚNICO caso tocado, então rodar
-- duas vezes não muda mais nada.

update public.extratos_ofx
   set periodo_inicio = periodo_fim,
       periodo_fim = periodo_inicio
 where periodo_inicio is not null
   and periodo_fim is not null
   and periodo_inicio > periodo_fim;
