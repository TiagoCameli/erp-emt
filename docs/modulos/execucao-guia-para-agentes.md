# Execução de Obras: guia para agentes (Fase 1a)

Este guia é para quem opera o módulo Execução sem usar as telas: um agente de IA, um script ou uma pessoa no SQL. Tudo aqui vem das migrations `*_ex_fase1a_*` e foi provado em `supabase/provas/ex_fase1a_banco.sql`.

## 1. O que é o módulo

A Execução guarda o planejamento da obra: uma pasta por obra, dentro dela um ou mais cronogramas, cada cronograma com uma EAP (resumos, atividades e marcos), vínculos de precedência, locais, serviços e um calendário de dias úteis. O motor de cronograma (CPM) roda no banco e devolve as datas cedo e tarde, a folga e o caminho crítico. Menu "Execução", rota `/execucao`, prefixo `ex_` nas tabelas e `fn_ex_` nas funções.

Regra de ouro: **leia pelas views `ex_v_*`, escreva só pelas RPCs `fn_ex_*`, nunca calcule data fora do banco.** As tabelas não têm grant de escrita para `authenticated`; qualquer INSERT, UPDATE ou DELETE direto é recusado. Datas, folgas e caminho crítico vêm do CPM: se o seu cálculo difere do banco, o banco está certo.

## 2. Modelo de dados

| Tabela | Coluna que importa | Quem escreve |
|---|---|---|
| `ex_obras` | `obra_id` (1:1 com `obras`), `tipo_obra`, `calendario_id` padrão. Nasce com o primeiro cronograma | `fn_ex_cronograma_salvar` (cria), `fn_ex_obra_configurar` |
| `ex_obra_usuarios` | a linha é o acesso: `(obra_id, usuario_id)` | `fn_ex_acesso_definir` |
| `ex_cronogramas` | `codigo` (único na obra), `status` (rascunho, ativo, concluido, arquivado), `data_inicio`, `data_corte`, `criterio_peso`, `calendario_id` | `fn_ex_cronograma_salvar`, `_status`, `_excluir` |
| `ex_locais` | `codigo`, `pai_id` (árvore), `tipo` (bloco, pavimento, ambiente, peça, segmento), `km_inicial`/`km_final` só rodovia | `fn_ex_local_salvar`, `_excluir` |
| `ex_servicos` | biblioteca global: `codigo`, `unidade_id`, `produtividade_padrao` | `fn_ex_servico_salvar` |
| `ex_atividades` | `tipo` (resumo, atividade, marco), `codigo` (único no cronograma), `pai_id`, `ordem`, `modo_duracao`, `duracao_dias`, `quantidade`, `produtividade`, `restricao_data` e `restricao_data_em`, `inicio_real`, `fim_real`, `updated_at` (a versão) | só `fn_ex_atividades_salvar_lote`, `_excluir`, `fn_ex_eap_renumerar` |
| `ex_atividade_locais` | `(atividade_id, local_id)` | pelo lote (chave `locais`) |
| `ex_dependencias` | `predecessora_id`, `sucessora_id`, `tipo` (TI, II, TT, IT), `atraso_dias` | pelo lote (chave `predecessoras`) |
| `ex_atividade_datas` | cache do CPM: `inicio_cedo`, `fim_cedo`, `inicio_tarde`, `fim_tarde`, `folga_total`, `folga_livre`, `critica`. Não é auditada (derivada, recalculável) | só `fn_ex_cpm_recalcular` |
| `ex_calendarios` | `modelo` (da empresa) ou filho de cronograma; `horas_seg` a `horas_dom`, período chuvoso, `padrao_empresa` | `fn_ex_calendario_salvar` |
| `ex_calendario_excecoes` | `(calendario_id, data)`, `horas`, `tipo`, `descricao`; a do pai vale para o filho | `fn_ex_calendario_excecao_salvar`, `_excluir` |
| `ex_feriados` | `data`, `abrangencia` (nacional, AC, municipal), `municipio` | `fn_ex_feriado_salvar`, `_excluir` (recalcula todos os cronogramas) |

Carga inicial de feriados: 2026 a 2030 (10 nacionais e 6 do Acre por ano). Calendário "Padrão EMT": seg a sex 9 h, sábado 5 h.

## 3. Acesso

- Cada obra tem uma lista de usuários (`ex_obra_usuarios`). Quem não está na lista não enxerga a obra, as views vêm vazias para ele.
- O agente opera com a sessão de um usuário e só enxerga as obras desse usuário. Para achar a obra: `select * from public.fn_ex_obras_disponiveis();` devolve `obra_id, nome, tem_pasta, tenho_acesso` das obras ativas do cadastro. `fn_ex_minhas_obras()` devolve só os ids com acesso.
- Quando a pasta nasce (primeiro cronograma da obra), entram na lista quem criou e todos os Admins ativos. Depois, `fn_ex_acesso_definir(obra, usuario, true|false)`; a lista nunca fica vazia.
- Permissões por recurso: `execucao.obras/ver`, `execucao.cronogramas/ver|criar|editar|excluir`, `execucao.modelos/ver|criar|editar|excluir`. Estar na lista não basta: precisa também da permissão.
- Criar cronograma numa obra que já tem pasta exige estar na lista dela.

## 4. Regras do cronograma

Todas as contas são em **dias úteis** do calendário do cronograma. Dia útil é todo dia com horas maiores que zero: sábado de 5 h conta 1 dia útil inteiro (suposição Q7 do spec, decisão (a)). Feriado vale 0 hora quando a abrangência dele está no calendário. Exceção do calendário muda as horas de um dia (trabalhar num feriado em um cronograma só, paralisação, dia extra).

- **Tempo.** Índice 0 é o primeiro dia útil da origem. `ES` é o início (inclusivo). `EF = ES + duração` é o fim **exclusivo**. Data de início = dia útil `ES`; data de fim = dia útil `EF - 1`.
- **Vínculos, com atraso L (pode ser negativo, de -999 a 999):** `TI` ES(s) >= EF(p) + L; `II` ES(s) >= ES(p) + L; `TT` EF(s) >= EF(p) + L; `IT` EF(s) >= ES(p) + L.
- **Duração.** `modo_duracao = digitada` usa `duracao_dias` (pode ser 0 só no marco). `por_produtividade` calcula `max(1, ceil(quantidade / produtividade))`; exige quantidade e produtividade maior que zero. Resumo e marco não têm serviço, quantidade nem produtividade.
- **Marco** (duração 0). Aparece no **fim do dia útil anterior** ao seu `ES`, isto é, no dia em que a predecessora termina. Consequência: um marco ligado por `II+0` cai no dia útil **antes** de a predecessora começar. No começo do cronograma cai no primeiro dia útil. Marco com âncora de data (`inicio_nao_antes` em data D): o `ES` é a quantidade de dias úteis estritamente antes de D, mais 1, então o marco ancorado em D aparece em D.
- **Resumo.** Envelope das descendentes: menor início, maior fim, folga total é a menor, crítico se alguma filha for. Resumo não tem predecessora nem sucessora. Quem tem filhas precisa ser do tipo resumo.
- **Restrições de data.** Ninguém começa antes de `data_inicio` do cronograma, nem antes da `data_corte` se ainda não começou, nem antes de `restricao_data_em` quando `inicio_nao_antes`. `fim_nao_depois` limita o fim mais tarde e pode gerar folga negativa.
- **Real.** `inicio_real` fixa o início; `fim_real` fixa o fim. Concluída (com `fim_real`): folga 0, não crítica. Em andamento na F1a: fim = início real + duração.
- **Data de corte.** O que não começou não é programado antes dela.
- **Folga e crítica.** Folga total = quanto atrasa sem atrasar o fim do cronograma. Folga livre = quanto atrasa sem empurrar nenhuma sucessora (sem sucessora, até o fim do cronograma). Crítica = folga total <= 0 e não concluída.
- **Ciclo** é recusado: "Dependência em ciclo: as linhas X, Y, Z não têm ordem possível" (até 10 códigos). Limite de 3.000 linhas por lote e de 100 anos por cronograma.
- **Calendário e feriados.** Mudar feriado, calendário ou exceção recalcula os cronogramas afetados. `fn_ex_somar_dias_uteis(cal, data, n)`: n > 0 anda n dias úteis; n = 0 vai para o próximo dia útil (a própria data se for útil); n < 0 anda para trás de forma simétrica.

## 5. RPCs

Todas são `security definer`, checam permissão e acesso à obra e recusam com `P0001` e mensagem em português. Quem escreve recalcula o CPM do cronograma na mesma transação.

```sql
-- Descobrir a obra
select * from public.fn_ex_obras_disponiveis();

-- Criar cronograma (a pasta da obra nasce junto se for o primeiro). Devolve o id do cronograma.
select public.fn_ex_cronograma_salvar('{"obra_id":"<obra>","tipo_obra":"edificacao","codigo":"FUND","nome":"Fundação","data_inicio":"2026-11-03"}');

-- Montar a EAP e as atividades de uma vez (tudo ou nada). Devolve `{"ids": {"<codigo>": "<id>"}}` das linhas gravadas; releia `ex_v_atividades` para as versões novas.
select public.fn_ex_atividades_salvar_lote('<cronograma>', '[
  {"codigo":"1","nome":"Fundação","tipo":"resumo"},
  {"codigo":"1.1","nome":"Estacas","pai_codigo":"1","modo_duracao":"por_produtividade","quantidade":120,"produtividade":30},
  {"codigo":"1.2","nome":"Blocos","pai_codigo":"1","duracao_dias":6,"predecessoras":[{"codigo":"1.1","tipo":"TI","atraso":2}]}
]');

-- Mudar só a duração de uma linha (campos ausentes ficam como estão)
select public.fn_ex_atividades_salvar_lote('<cronograma>', '[{"id":"<atividade>","duracao_dias":8,"versao":"<updated_at como veio>"}]');

-- Excluir linhas (soft delete, com motivo)
select public.fn_ex_atividades_excluir('<cronograma>', array['<atividade>']::uuid[], 'Fora do escopo');

-- Simular sem gravar ("e se"): na F1a só durações, por fn_ex_cpm_calcular (interna). A RPC de simulação entra na F2.
```

Regras do lote (`fn_ex_atividades_salvar_lote`):
- Linha **nova** não tem `id` e exige `codigo` e `nome`; linha **existente** é identificada por `id` (um `codigo` que já existe em outra linha é recusado).
- Numa linha existente, **campo ausente permanece como está**. Só o que vem no JSON muda. `predecessoras` e `locais`, quando vêm, **substituem** a lista inteira; ausentes, ficam.
- **`versao` deve ser enviada como foi lida**: é o `updated_at` da view `ex_v_atividades` (coluna `versao`) como string crua, sem reformatar nem converter fuso. Sem `versao` a checagem não acontece, por isso o agente deve sempre mandá-la. Se a linha mudou desde a leitura, a RPC recusa com "esta linha foi alterada por outra pessoa. Recarregue a grade". Sempre leia de novo e reenvie.
- Campos aceitos: `id, codigo, nome, tipo, pai_codigo, ordem, servico_id, unidade_id, quantidade, produtividade, modo_duracao, duracao_dias, peso_manual, valor_orcado, restricao_data, restricao_data_em, responsavel_id, observacao, predecessoras [{codigo, tipo, atraso}], locais, versao`.
- `pai_codigo` e `predecessoras[].codigo` podem apontar para linhas do mesmo lote.

Demais RPCs: `fn_ex_cronograma_salvar(dados, id)`, `fn_ex_cronograma_status(id, status)`, `fn_ex_cronograma_excluir(id, motivo)`, `fn_ex_cronograma_recalcular(id)`, `fn_ex_local_salvar(obra, dados, id)`, `fn_ex_local_excluir(id, motivo)`, `fn_ex_servico_salvar(dados, id)`, `fn_ex_calendario_salvar(dados, id)`, `fn_ex_calendario_excecao_salvar(cal, data, horas, tipo, descricao)`, `fn_ex_calendario_excecao_excluir(cal, data)`, `fn_ex_feriado_salvar(dados, id)`, `fn_ex_feriado_excluir(id)`, `fn_ex_obra_configurar(obra, dados)`, `fn_ex_acesso_definir(obra, usuario, tem)`, `fn_ex_eap_renumerar(cronograma)`, `fn_ex_dias_uteis(cal, de, ate)`, `fn_ex_somar_dias_uteis(cal, data, n)`. Internas, não chame: `fn_ex_cpm_calcular`, `fn_ex_cpm_recalcular`, `fn_ex_recalcular_*`, `fn_ex_exigir*`.

## 6. Consultas prontas

```sql
-- Término previsto de cada cronograma
select obra_nome, codigo, nome, status, inicio_previsto, termino_previsto, n_atividades, n_criticas
from public.ex_v_cronogramas order by termino_previsto;

-- Caminho crítico de um cronograma, na ordem da EAP
select codigo, nome, inicio_cedo, fim_cedo, folga_total
from public.ex_v_atividades where cronograma_id = '<cronograma>' and critica and tipo <> 'resumo' order by ordem;

-- Atividades que começam na próxima semana
select c.codigo as cronograma, a.codigo, a.nome, a.inicio_cedo
from public.ex_v_atividades a join public.ex_v_cronogramas c on c.id = a.cronograma_id
where a.tipo <> 'resumo' and a.inicio_cedo between current_date + (8 - extract(isodow from current_date)::int)
                                               and current_date + (14 - extract(isodow from current_date)::int)
order by a.inicio_cedo;

-- Atividades soltas (sem predecessora) que não são a primeira do cronograma
select codigo, nome, inicio_cedo from public.ex_v_atividades
where cronograma_id = '<cronograma>' and tipo = 'atividade' and predecessoras = '[]'::jsonb;

-- Dias úteis entre duas datas, no calendário de um cronograma
select count(*) from public.fn_ex_dias_uteis((select calendario_id from public.ex_v_cronogramas where id = '<cronograma>'), '2026-11-03', '2026-12-18');

-- Pastas: quais obras estão no módulo
select * from public.ex_v_pastas;
```

Colunas de `ex_v_atividades`: `id, cronograma_id, obra_id, pai_id, pai_codigo, tipo, codigo, nome, ordem, servico_*, quantidade, unidade_sigla, produtividade, modo_duracao, duracao_dias, peso_manual, valor_orcado, restricao_data, restricao_data_em, responsavel_id, observacao, inicio_real, fim_real, inicio_cedo, fim_cedo, inicio_tarde, fim_tarde, folga_total, folga_livre, critica, predecessoras (jsonb), locais (jsonb), versao`.

## 7. Erros comuns (P0001)

| Mensagem | O que significa |
|---|---|
| Sem permissão para criar/editar/excluir ... | O usuário não tem o recurso `execucao.*` na ação, ou está fora da lista da obra |
| Obra não encontrada ou você não está na lista de acesso dela | Obra inexistente, inativa ou fora do acesso do usuário |
| Esta obra já tem cronogramas e você não está na lista de acesso dela | Peça a alguém da lista para incluir você |
| A obra não pode ficar sem ninguém na lista | Não dá para tirar o último usuário |
| Já existe outro cronograma com o código X nesta obra | Código de cronograma repetido |
| Código X repetido nas linhas enviadas / Já existe outra linha com o código X neste cronograma | Códigos de atividade duplicados |
| Dependência em ciclo: as linhas ... não têm ordem possível | Os vínculos formam um laço |
| Linha X: esta linha foi alterada por outra pessoa. Recarregue a grade | `versao` velha; releia e reenvie |
| A linha X tem linhas dentro dela e precisa ser do tipo resumo | Quem tem filhas é resumo |
| Linha X: resumo e marco não têm serviço, quantidade nem produtividade | Campo de duração em tipo errado |
| Linha X: duração por produtividade precisa de quantidade e de produtividade maior que zero | Falta dado no modo por_produtividade |
| Linha X: a predecessora Y não existe / a linha pai Y não existe | Código apontado não existe no cronograma nem no lote |
| Linha X: tipo de vínculo deve ser TI, II, TT ou IT / atraso entre -999 e 999 dias | Vínculo inválido |
| Linha X: informe a data da restrição / restrição de data inválida | `restricao_data` e `restricao_data_em` andam juntas |
| No máximo 3.000 linhas por vez | Divida o lote |
| O calendário não tem dias úteis suficientes / O cronograma passa de 100 anos | Calendário sem horas ou durações absurdas |
| Informe o motivo da exclusão | Exclusão exige motivo |
| Já existe feriado com essa abrangência em DATA | Feriado repetido |
| Escolha outro calendário como padrão da empresa antes de tirar este | Sempre há um calendário padrão |
| Há atividades neste local. Tire o local delas antes de excluir | Local em uso |

## 8. O que vem nas próximas fases

- **F1b:** importação Excel genérica, modelos de sequência por locais, arrastar na grade.
- **F2:** Gantt interativo (desenhado por nós), baseline e reprogramação, pausas, "e se".
- **F3:** apontamento pelo celular, diário de obra, lookahead com restrições, plano semanal e PPC, painel, curva S, linha de balanço, matriz.
- **F4:** planta (edificação) e diagrama linear com mapa (rodovia).
- **F5:** composições, necessidade de material, estoque físico por obra (só quantidade), lista de compras.
- **F6:** pessoas, terceiros, equipes, alocação, anotações, produtividade, equipamentos.
- **F7:** relatórios PDF e Excel, link do encarregado, alertas, portfólio, este guia completo.
