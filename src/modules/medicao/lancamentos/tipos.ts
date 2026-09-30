/**
 * Formato da tela de Lançamentos (Fase 4, Task 5): lista, formulário (com excesso), exclusão e
 * colar do Excel. D7: quantidade, km inicial e km final são sempre TEXTO do numeric do banco,
 * nunca convertidos para Number aqui (a tela só formata para exibir, com `numeroExibicao`).
 */

/** Uma linha de `mc_v_lancamentos`, não excluída. */
export interface LancamentoLista {
  id: string;
  contratoId: string;
  medicaoId: string;
  medicaoNumero: number;
  medicaoStatus: string;
  itemId: string;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  /** yyyy-mm-dd. */
  data: string;
  /** Texto do numeric, ponto decimal. */
  quantidade: string;
  kmInicial: string | null;
  kmFinal: string | null;
  estaca: string | null;
  localTexto: string | null;
  observacao: string | null;
  motivoExcesso: string | null;
  createdAt: string;
  createdBy: string | null;
  /** Fotos e arquivos anexados (`SeloAnexos`, mesmo padrão de Combustível). */
  anexos: number;
}

/**
 * Um serviço lançável: a linha `tipo = 'servico'` de `mc_v_planilha_linhas` da versão vigente de
 * UMA medição ABERTA do contrato, com o período dela já embutido (denormalizado). O formulário e
 * o colar do Excel usam o período para achar a medição da data escolhida/colada, e o `medicaoId`
 * para resolver o código do item só entre os serviços DAQUELA medição (spec 7.3: duas medições
 * podem estar abertas ao mesmo tempo, com períodos que não se sobrepõem).
 */
export interface ServicoParaLancar {
  medicaoId: string;
  medicaoNumero: number;
  /** yyyy-mm-dd. */
  periodoInicio: string;
  /** yyyy-mm-dd. */
  periodoFim: string;
  itemId: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  /** Texto do numeric, ponto decimal. Null quando a planilha não informou (raro). */
  quantidadePrevista: string | null;
}

/** Filtros de `listarLancamentos`, todos opcionais além do contrato. */
export interface FiltrosLancamentos {
  contratoId: string;
  /** Número da medição (não o id): é o que a URL recebe da tela de Medições. */
  medicao?: number;
  /** yyyy-mm-dd. */
  de?: string;
  /** yyyy-mm-dd. */
  ate?: string;
  itemId?: string;
  /** Busca livre: código, descrição, estaca, local ou observação. */
  busca?: string;
}

/** Um erro de linha devolvido pela RPC `fn_mc_lancamentos_colar` (conferir ou gravar). */
export interface ErroColagemBanco {
  linha: number;
  erro: string;
  excesso: boolean;
}

/** jsonb de `fn_mc_lancamentos_colar`, como veio do banco. */
export interface ResultadoColagem {
  gravadas: number;
  validas: number;
  erros: ErroColagemBanco[];
}

/**
 * Uma linha pronta para `conferirColagem`/`gravarColagem`: o que `lerColagem` resolveu
 * (`LinhaColada`, em colar.ts) mais o `motivoExcesso` que a prévia pediu, linha a linha, quando o
 * banco devolveu `excesso: true` para ela.
 */
export interface LinhaParaColar {
  linha: number;
  data: string;
  itemId: string;
  quantidade: string;
  kmInicial: string | null;
  kmFinal: string | null;
  estaca: string | null;
  observacao: string | null;
  motivoExcesso: string | null;
}
