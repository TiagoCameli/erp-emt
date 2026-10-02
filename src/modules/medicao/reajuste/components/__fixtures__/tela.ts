import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import type { LeituraSiac, PreviaReajuste, ReajusteMedicao, RelatorioResumo } from "@/modules/medicao/reajuste/tipos";

/**
 * Dados de tela do reajuste para os testes de componente, no formato que as queries e as actions da
 * Task 4 devolvem. Três linhas tiradas da 4ª do L09 e do caso K9 do plano: 2,2/51269 (imprimação,
 * reajuste 1,26, casada com o 02.07.05 sem valor: "conferir"), 4,0/60112 (CAP, -95.030,34, casamento
 * salvo) e 1,0/222 (dois itens sem valor: a RPC pede o destino).
 */

export const MEDICAO = "11111111-1111-4111-8111-111111111111";
export const ARQUIVO = "22222222-2222-4222-8222-222222222222";
export const ARQUIVO_USADO = "23232323-2323-4232-8232-232323232323";
export const I_IMPRIMACAO = "b4058504-4c78-49ea-958f-3acde6d28cf2";
export const I_CAP = "1c086b48-50b6-469c-87e2-b4f61cfda9b7";
export const I_A = "33333333-3333-4333-8333-333333333333";
export const I_B = "44444444-4444-4444-8444-444444444444";

export const CHAVE_IMPRIMACAO = "2,2|51269";
export const CHAVE_CAP = "4,0|60112";
export const CHAVE_PENDENTE = "1,0|222";

const LINHA_IMPRIMACAO = {
  ordem: 1,
  grupo: "2,2",
  codigo: "51269",
  descricao: "Imprimação com asfalto diluído",
  unidade: "m2",
  preco_unitario: "0.45",
  valor_pi: "85.46",
  fator: "0.0147",
  reajuste: "1.26",
  itens: [I_IMPRIMACAO],
  destino: null,
  valor_nosso: "0.00",
  rateio: [{ item_id: I_IMPRIMACAO, valor_base: "0", valor: "1.26" }],
  pendencia: null,
};

const LINHA_CAP = {
  ordem: 2,
  grupo: "4,0",
  codigo: "60112",
  descricao: "Cimento asfáltico CAP 50/70",
  unidade: "t",
  preco_unitario: "5641.71",
  valor_pi: "539026.36",
  fator: "-0.1763",
  reajuste: "-95030.34",
  itens: [I_CAP],
  destino: null,
  valor_nosso: "539028.27",
  rateio: [{ item_id: I_CAP, valor_base: "539028.27", valor: "-95030.34" }],
  pendencia: null,
};

const LINHA_PENDENTE = {
  ordem: 3,
  grupo: "1,0",
  codigo: "222",
  descricao: "Transporte de material",
  unidade: "tkm",
  preco_unitario: "5.00",
  valor_pi: "50.00",
  fator: "-0.1000",
  reajuste: "-5.00",
  itens: [I_A, I_B],
  destino: null,
  valor_nosso: "0.00",
  rateio: [],
  pendencia: "Os itens casados não têm valor nesta medição: escolha o item que recebe a linha",
};

export const PREVIA_COM_PENDENCIA: PreviaReajuste = {
  linhas: [LINHA_IMPRIMACAO, LINHA_CAP, LINHA_PENDENTE],
  pendencias: 1,
  total: "-40021.28",
  valor_pi: "2616306.26",
  situacao: "definitivo",
  medicao_valor: "2615053.13",
  anterior: null,
  diferenca: null,
};

export const PREVIA_OK: PreviaReajuste = {
  ...PREVIA_COM_PENDENCIA,
  linhas: [
    LINHA_IMPRIMACAO,
    LINHA_CAP,
    { ...LINHA_PENDENTE, destino: I_B, rateio: [{ item_id: I_B, valor_base: "0", valor: "-5.00" }], pendencia: null },
  ],
  pendencias: 0,
  anterior: { id: "r1", sequencia: 1, origem: "siac", situacao: "provisorio", total: "-40024.27" },
  diferenca: "2.99",
};

export const LEITURA: LeituraSiac = {
  ok: true,
  cabecalho: {
    contratoTexto: "24 00615/2025 - CONSÓRCIO EMT-COLORADO I",
    medicaoNumero: 4,
    medicaoTipo: "PROVISÓRIA",
    situacao: "definitivo",
    periodoInicio: "2026-02-01",
    periodoFim: "2026-02-28",
    dataBase: "2025-01-01",
    processadoEm: "2026-03-19",
  },
  avisos: ["O relatório é do período 01/02/2026 a 28/02/2026 e a medição de 01/03/2026 a 31/03/2026"],
  escolhas: {
    [CHAVE_IMPRIMACAO]: { itens: [I_IMPRIMACAO], destino: null },
    [CHAVE_CAP]: { itens: [I_CAP], destino: null },
    [CHAVE_PENDENTE]: { itens: [I_A, I_B], destino: null },
  },
  origem: { [CHAVE_IMPRIMACAO]: "sugerido", [CHAVE_CAP]: "salvo", [CHAVE_PENDENTE]: "sugerido" },
  conferir: [CHAVE_IMPRIMACAO],
  candidatos: [
    { itemId: I_A, codigo: "01.03", descricao: "Transporte local", unidade: "tkm", preco: "5", valor: "0" },
    { itemId: I_B, codigo: "01.04", descricao: "Transporte comercial", unidade: "tkm", preco: "5", valor: "0" },
    { itemId: I_IMPRIMACAO, codigo: "02.07.05", descricao: "Imprimação", unidade: "m²", preco: "0.4516", valor: "0" },
    { itemId: I_CAP, codigo: "04.03.02", descricao: "CAP 50/70", unidade: "t", preco: "5641.7149", valor: "539028.27" },
  ],
  previa: PREVIA_COM_PENDENCIA,
};

export function relatorio(over: Partial<RelatorioResumo> = {}): RelatorioResumo {
  return {
    id: "r1",
    sequencia: 1,
    origem: "siac",
    situacao: "provisorio",
    total: "5.01",
    valorPi: "400.00",
    medicaoTipo: "PROVISÓRIA",
    contratoTexto: "00999/2026",
    periodoInicio: "2026-01-01",
    periodoFim: "2026-01-31",
    dataBase: "2025-01-01",
    processadoEm: "2026-02-10",
    criadoEm: "2026-10-02T13:00:00Z",
    criadoPorNome: "Tiago",
    arquivoId: ARQUIVO_USADO,
    arquivoNome: "siac-1a.pdf",
    observacao: null,
    excluidoEm: null,
    excluidoPorNome: null,
    motivoExclusao: null,
    ...over,
  };
}

/** Provisório 5,01 trocado pelo definitivo 8,00 (diferença 2,99, feita no banco) e um manual excluído. */
export const REAJUSTE_K9: ReajusteMedicao = {
  vigente: { relatorioId: "r2", sequencia: 2, origem: "siac", situacao: "definitivo", total: "8.00", anteriorTotal: "5.01", diferenca: "2.99" },
  relatorios: [
    relatorio(),
    relatorio({ id: "r2", sequencia: 2, situacao: "definitivo", total: "8.00", arquivoId: ARQUIVO_USADO, arquivoNome: "siac-def.pdf" }),
    relatorio({
      id: "r3",
      sequencia: 3,
      origem: "manual",
      situacao: "provisorio",
      total: "-1234.56",
      valorPi: null,
      arquivoId: null,
      arquivoNome: null,
      excluidoEm: "2026-10-02T15:00:00Z",
      excluidoPorNome: "Tiago",
      motivoExclusao: "Lançado na medição errada",
    }),
  ],
  linhas: [
    {
      id: "l1",
      ordem: 1,
      grupo: "4,0",
      grupoDescricao: "PAVIMENTAÇÃO",
      codigo: "60112",
      descricao: "Cimento asfáltico CAP 50/70",
      unidade: "t",
      precoUnitario: "5641.71",
      valorPi: "539026.36",
      fator: "-0.1763",
      reajuste: "-95030.34",
      rateio: [{ itemId: I_CAP, codigo: "04.03.02", valor: "-95030.34", valorBase: "539028.27" }],
    },
    {
      id: "l2",
      ordem: 2,
      grupo: "1,0",
      grupoDescricao: "TRANSPORTE",
      codigo: "111",
      descricao: "Transporte de material",
      unidade: "tkm",
      precoUnitario: "5.00",
      valorPi: "400.00",
      fator: "0.0300",
      reajuste: "10.01",
      rateio: [
        { itemId: I_A, codigo: "01.01", valor: "7.51", valorBase: "300.00" },
        { itemId: I_B, codigo: "01.02", valor: "2.50", valorBase: "100.00" },
      ],
    },
  ],
  indices: [{ sigla: "CAP", i0: "4012.3300", i1: "3305.1200", k: "-0.17626" }],
};

export const SEM_REAJUSTE: ReajusteMedicao = { vigente: null, relatorios: [], linhas: [], indices: [] };

export function anexo(arquivoId: string, nome: string): AnexoDoDocumento {
  return {
    vinculoId: `v-${arquivoId}`,
    arquivoId,
    nome,
    tipoMime: "application/pdf",
    tamanhoBytes: 2048,
    criadoEm: "2026-10-02T12:00:00Z",
    criadoPorNome: "Tiago",
    propagado: false,
    origemNumero: null,
    origemRotulo: null,
  };
}
