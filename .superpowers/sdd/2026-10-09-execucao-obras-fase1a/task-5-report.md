# Task 5 report

## RED
Prova com caso 5 antes da migration: ERROR 42883 function public.fn_ex_atividades_salvar_lote(uuid, jsonb) does not exist.

## Migrations (aplicadas em producao)
- 20261010001008 ex_fase1a_rpcs_atividades_lote (via MCP apply_migration; salvar_lote)
- 20261010001100 ex_fase1a_rpcs_atividades_excluir_renumerar (excluir, renumerar, grants)
O apply_migration deu "Invalid or expired requestState" no arquivo inteiro (2x), e na parte 2 (4x). Parte 1 passou na terceira tentativa
(dividida). Parte 2 foi aplicada com supabase db query --linked -f (mesmo texto do arquivo) e a linha foi registrada a mao em
supabase_migrations.schema_migrations (version, name, statements). Nao usei db push. Arquivos locais identicos ao aplicado.

## GREEN (valores do caso 5, prova completa abortou por design com PROVA {...})
- 1a_tabelas_com_rls: 12
- 1b_grants_de_escrita: 0
- 1c_tabelas_auditadas: 11
- 2a_pascoa: ["2026-04-05", "2027-03-28", "2028-04-16", "2029-04-01", "2030-04-21"]
- 2b_dias_uteis: ["2026-04-01", "2026-04-02", "2026-04-04", "2026-04-06", "2026-04-07"]
- 2c_somar: ["2026-04-04", "2026-04-04", "2026-04-04"]
- 2d_heranca: ["2026-04-01", "2026-04-02", "2026-04-04", "2026-04-05", "2026-04-07"]
- 3a_pasta_e_lista: {"lista": 4, "admins": 4, "calendario_herdado": true}
- 3b_zero_sem_permissao: 0
- 3c_zero_fora_da_lista: 0
- 3d_zero_na_lista: 1
- 3e_desativado_edita: "recusou: Sem permissão para editar cronograma"
- 3e_desativado_ve: 0
- 3f_ultimo_da_lista: "recusou: A obra não pode ficar sem ninguém na lista"
- 3g_codigo_repetido: "recusou: Já existe outro cronograma com o código FUND nesta obra"
- 3h_local_em_ciclo: "recusou: Um local não pode ficar dentro dele mesmo"
- 3i_criar_fora_da_lista: "recusou: Esta obra já tem cronogramas e você não está na lista de acesso dela. Peça para alguém da lista incluir você"
- 3j_depois: true
- 3j_feriado: false
- 3j_feriado_app: {"antes": true}
- 3k_edita_padrao_mantem: true
- 3l_tirar_padrao: "recusou: Escolha outro calendário como padrão da empresa antes de tirar este"
- 3m_status_nulo: "recusou: Situação inválida"
- 4a_cpm: {"1": ["2026-03-02", "2026-03-06", "2026-03-02", "2026-03-09", 0, 0, true], "2": ["2026-03-06", "2026-03-09", "2026-03-06", "2026-03-09", 0, 0, true], "3": ["2026-03-02", "2026-03-02", "2026-03-09", "2026-03-09", 5, 5, false], "4": ["2026-03-04", "2026-03-05", "2026-03-06", "2026-03-09", 2, 2, false], "5": ["2026-03-09", "2026-03-09", "2026-03-09", "2026-03-09", 0, 0, true], "1.1": ["2026-03-02", "2026-03-04", "2026-03-02", "2026-03-04", 0, 0, true], "1.2": ["2026-03-05", "2026-03-06", "2026-03-05", "2026-03-06", 0, 0, true], "1.3": ["2026-03-03", "2026-03-06", "2026-03-04", "2026-03-09", 1, 0, false]}
- 4b_e_se: {"marco_gravado": "2026-03-09", "marco_simulado": "2026-03-11"}
- 4c_restricao_sabado: ["2026-03-09", "2026-03-09"]
- 4d_inicio_domingo: "2026-03-02"
- 4e_real: {"a": ["2026-03-03", "2026-03-05", false], "b": ["2026-03-06", "2026-03-09"]}
- 4f_ciclo: "recusou: Dependência em ciclo: as linhas 1.1, 1.2, 1.3, 2, 3, 4, 5 não têm ordem possível"
- 4g_desempenho_ms: 381
- 4g_linhas: 3000
- 4h_marco_ancorado: {"real": ["2026-03-05", "2026-03-05"], "resumo_folga": 5, "nao_antes_quinta": ["2026-03-05", "2026-03-05"], "nao_antes_sabado": ["2026-03-09", "2026-03-09"]}
- 5a_lote: {"1": ["2026-03-02", "2026-03-13", 0], "1.1": ["2026-03-02", "2026-03-05", 4], "1.2": ["2026-03-09", "2026-03-13", 5]}
- 5b_ciclo: "recusou: Dependência em ciclo: as linhas 1.1, 1.2 não têm ordem possível"
- 5b_vinculos: 1
- 5c_codigo_repetido: "recusou: Código X repetido nas linhas enviadas"
- 5d_filhas_sem_resumo: "recusou: A linha 1 tem linhas dentro dela e precisa ser do tipo resumo"
- 5e_duracao_padrao: 1
- 5f_versao: "recusou: Linha 1.2: esta linha foi alterada por outra pessoa. Recarregue a grade"
- 5g_parcial: {"pai": "1", "nome": "Blocos de coroamento", "duracao": 5, "vinculos": 1}
- 5h_datas: 1
- 5h_excluidas: 3
- 5h_vinculos: 0
- 5h_vivas: ["2"]
- 5i_renumerar: [["1", "Nova"], ["2", "Limpeza"]]
- 5j_sem_permissao: "recusou: Sem permissão para criar atividade"
- 9_outros_modulos_intactos: true

## Desvio na prova (bug do brief)
5h: fn_ex_atividades_excluir e os subselects estavam no mesmo comando (um unico jsonb_build_object); o snapshot do comando nao enxerga o que a
funcao volatil grava, entao 5h_vivas/datas/vinculos mostravam o estado anterior (4 vivas, 1 vinculo). Corrigido: v_n := fn_excluir(...) em comando proprio
e depois o r := ... com v_n. Resultado passou a ser o esperado (3, ["2"], 1, 0). Nao ha bug na funcao.

## 5b
Mensagem exatamente "Dependência em ciclo: as linhas 1.1, 1.2 não têm ordem possível" (so 2 linhas existiam).

## Mutacoes (begin; funcao mutada; prova; sem commit, tudo rollback)
1. sem ceil: 5a_lote 1.1 duracao 3, datas 02/03-04/03 e 1.2 07/03-12/03 (mudou).
2. sem Passo 4 de filhas: 5d_filhas_sem_resumo = "PASSOU (errado)".
3. codigo = v_codigo no update do passo 1: troca de codigos 1.1 <-> 1.2 falha com "duplicate key value violates unique constraint"; com o original a troca passa.

## Advisors
Performance: nenhum FK sem indice novo em ex_. Seguranca: as 3 funcoes aparecem como authenticated_security_definer_function_executable (esperado).

## Producao
Prova faz rollback; sem dados residuais do caso 5.
