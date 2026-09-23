import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import type { Tables, TablesInsert } from "@/lib/database.types";
import { normalizarNumeroDigitado } from "@/lib/numero-digitado";

/**
 * Ficha técnica do equipamento (`equipamento_especificacoes`, 1:1).
 *
 * Módulo puro, sem "use client" e sem server-only: o schema é lido pelo
 * formulário do drawer e pela action, e o tipo e o mapper pela query e pelo
 * resumo que também vai para a tela do celular.
 *
 * Toda coluna numérica da tabela é NUMERIC(14,4) (capacidades em litros,
 * consumo esperado, medição de fim da garantia). Nenhuma é dinheiro: são TAXA
 * no sentido de `@/lib/casas-decimais`, então aceitam 4 casas via `CASAS_TAXA`.
 * `pneu_qtd` e `bateria_qtd` são integer com check `>= 0`.
 */

/** Maior valor que cabe em NUMERIC(14,4). */
const NUMERO_MAXIMO = 9999999999.9999;
/** Teto das quantidades de pneu e bateria. Acima disso é digitação errada. */
const QUANTIDADE_MAXIMA = 999;
/** Teto de linhas de filtro por equipamento. */
export const FILTROS_MAXIMO = 30;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const INTEIRO = /^\d+$/;

// ---------------------------------------------------------------------------
// Filtros (jsonb)
// ---------------------------------------------------------------------------

/** Um filtro do equipamento: o tipo (óleo, ar, combustível) e o código da peça. */
export interface FiltroEquipamento {
  tipo: string;
  codigo: string;
}

/** Texto de um campo do jsonb, tolerando número (código de peça digitado na origem). */
function textoDoJson(valor: unknown): string {
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return "";
}

/** Primeiro campo de texto não vazio entre as chaves aceitas. */
function primeiroTexto(objeto: Record<string, unknown>, chaves: string[]): string {
  for (const chave of chaves) {
    const texto = textoDoJson(objeto[chave]);
    if (texto !== "") return texto;
  }
  return "";
}

/**
 * Lê o jsonb `filtros` como lista de `{ tipo, codigo }`. Nunca lança.
 *
 * A coluna veio da origem (`especificacoes_equipamento`) sem forma garantida,
 * então aceita as formas plausíveis em vez de descartar o que existe:
 * - lista de objetos `{ tipo, codigo }` (a forma que este módulo grava), com
 *   os apelidos `nome`/`descricao` para o tipo e `referencia`/`numero` para o
 *   código;
 * - lista de textos soltos (cada um vira um código sem tipo);
 * - objeto `{ "óleo do motor": "PSL-123" }` (cada par vira um filtro).
 * Qualquer outra coisa (null, número, texto) vira lista vazia.
 */
export function filtrosDoJson(json: unknown): FiltroEquipamento[] {
  if (Array.isArray(json)) {
    const filtros: FiltroEquipamento[] = [];
    for (const item of json) {
      if (typeof item === "string" || typeof item === "number") {
        const codigo = textoDoJson(item);
        if (codigo !== "") filtros.push({ tipo: "", codigo });
        continue;
      }
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const objeto = item as Record<string, unknown>;
        const tipo = primeiroTexto(objeto, ["tipo", "nome", "descricao"]);
        const codigo = primeiroTexto(objeto, ["codigo", "referencia", "numero"]);
        if (tipo !== "" || codigo !== "") filtros.push({ tipo, codigo });
      }
    }
    return filtros;
  }

  if (json && typeof json === "object") {
    return Object.entries(json as Record<string, unknown>)
      .map(([tipo, valor]) => ({ tipo: tipo.trim(), codigo: textoDoJson(valor) }))
      .filter((filtro) => filtro.codigo !== "");
  }

  return [];
}

// ---------------------------------------------------------------------------
// Tipo de domínio e mapeamento com o banco
// ---------------------------------------------------------------------------

/** O que a ficha guarda, sem o equipamento. É o que a action grava. */
export interface FichaTecnicaDados {
  capacidadeTanqueL: number | null;
  capacidadeOleoMotorL: number | null;
  tipoOleoMotor: string | null;
  capacidadeOleoHidraulicoL: number | null;
  tipoOleoHidraulico: string | null;
  capacidadeOleoTransmissaoL: number | null;
  tipoOleoTransmissao: string | null;
  capacidadeOleoDiferencialL: number | null;
  capacidadeArrefecedorL: number | null;
  pneuMedida: string | null;
  pneuQtd: number | null;
  bateriaEspecificacao: string | null;
  bateriaQtd: number | null;
  filtros: FiltroEquipamento[];
  consumoEsperadoLH: number | null;
  consumoEsperadoKmL: number | null;
  garantiaFimData: string | null;
  garantiaFimMedicao: number | null;
  observacoesTecnicas: string | null;
}

/** Ficha técnica de um equipamento, como a tela lê. */
export interface FichaTecnica extends FichaTecnicaDados {
  equipamentoId: string;
}

type LinhaFicha = Tables<"equipamento_especificacoes">;

/** Colunas lidas pela query. Tem que casar com `fichaDoRegistro`. */
export const COLUNAS_FICHA_TECNICA =
  "equipamento_id, capacidade_tanque_l, capacidade_oleo_motor_l, tipo_oleo_motor, capacidade_oleo_hidraulico_l, tipo_oleo_hidraulico, capacidade_oleo_transmissao_l, tipo_oleo_transmissao, capacidade_oleo_diferencial_l, capacidade_arrefecedor_l, pneu_medida, pneu_qtd, bateria_especificacao, bateria_qtd, filtros, consumo_esperado_l_h, consumo_esperado_km_l, garantia_fim_data, garantia_fim_medicao, observacoes_tecnicas" as const;

export type RegistroFichaTecnica = Omit<
  LinhaFicha,
  "id" | "created_at" | "updated_at" | "created_by"
>;

/**
 * NUMERIC chega do PostgREST como number, mas tipo gerado não impede string
 * (e `Number("")` seria 0). Normaliza os dois para number ou null.
 */
function numeroDoBanco(valor: number | string | null): number | null {
  if (valor === null || valor === "") return null;
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/** Linha do banco (snake_case) para a ficha (camelCase). */
export function fichaDoRegistro(linha: RegistroFichaTecnica): FichaTecnica {
  return {
    equipamentoId: linha.equipamento_id,
    capacidadeTanqueL: numeroDoBanco(linha.capacidade_tanque_l),
    capacidadeOleoMotorL: numeroDoBanco(linha.capacidade_oleo_motor_l),
    tipoOleoMotor: linha.tipo_oleo_motor,
    capacidadeOleoHidraulicoL: numeroDoBanco(linha.capacidade_oleo_hidraulico_l),
    tipoOleoHidraulico: linha.tipo_oleo_hidraulico,
    capacidadeOleoTransmissaoL: numeroDoBanco(linha.capacidade_oleo_transmissao_l),
    tipoOleoTransmissao: linha.tipo_oleo_transmissao,
    capacidadeOleoDiferencialL: numeroDoBanco(linha.capacidade_oleo_diferencial_l),
    capacidadeArrefecedorL: numeroDoBanco(linha.capacidade_arrefecedor_l),
    pneuMedida: linha.pneu_medida,
    pneuQtd: linha.pneu_qtd,
    bateriaEspecificacao: linha.bateria_especificacao,
    bateriaQtd: linha.bateria_qtd,
    filtros: filtrosDoJson(linha.filtros),
    consumoEsperadoLH: numeroDoBanco(linha.consumo_esperado_l_h),
    consumoEsperadoKmL: numeroDoBanco(linha.consumo_esperado_km_l),
    garantiaFimData: linha.garantia_fim_data,
    garantiaFimMedicao: numeroDoBanco(linha.garantia_fim_medicao),
    observacoesTecnicas: linha.observacoes_tecnicas,
  };
}

/**
 * Ficha para o payload do upsert. Sem `id`, `created_by` e datas: o banco
 * gera e os gatilhos preenchem. Lista de filtros vazia grava null, que é o
 * mesmo "sem filtro" para quem lê (`filtrosDoJson(null)` é `[]`).
 */
export function registroDaFicha(
  equipamentoId: string,
  dados: FichaTecnicaDados,
): TablesInsert<"equipamento_especificacoes"> {
  return {
    equipamento_id: equipamentoId,
    capacidade_tanque_l: dados.capacidadeTanqueL,
    capacidade_oleo_motor_l: dados.capacidadeOleoMotorL,
    tipo_oleo_motor: dados.tipoOleoMotor,
    capacidade_oleo_hidraulico_l: dados.capacidadeOleoHidraulicoL,
    tipo_oleo_hidraulico: dados.tipoOleoHidraulico,
    capacidade_oleo_transmissao_l: dados.capacidadeOleoTransmissaoL,
    tipo_oleo_transmissao: dados.tipoOleoTransmissao,
    capacidade_oleo_diferencial_l: dados.capacidadeOleoDiferencialL,
    capacidade_arrefecedor_l: dados.capacidadeArrefecedorL,
    pneu_medida: dados.pneuMedida,
    pneu_qtd: dados.pneuQtd,
    bateria_especificacao: dados.bateriaEspecificacao,
    bateria_qtd: dados.bateriaQtd,
    filtros:
      dados.filtros.length === 0
        ? null
        : dados.filtros.map((filtro) => ({ tipo: filtro.tipo, codigo: filtro.codigo })),
    consumo_esperado_l_h: dados.consumoEsperadoLH,
    consumo_esperado_km_l: dados.consumoEsperadoKmL,
    garantia_fim_data: dados.garantiaFimData,
    garantia_fim_medicao: dados.garantiaFimMedicao,
    observacoes_tecnicas: dados.observacoesTecnicas,
  };
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------

/**
 * Número digitado (pt-BR, até 4 casas) em number. Vazio é null; texto que não
 * é número é undefined, para o schema recusar.
 */
export function numeroDaFicha(texto: string): number | null | undefined {
  if (texto.trim() === "") return null;
  const normalizado = normalizarNumeroDigitado(texto, CASAS_TAXA);
  if (normalizado === null) return undefined;
  const numero = Number(normalizado.replace(",", "."));
  return numero > NUMERO_MAXIMO ? undefined : numero;
}

/** Quantidade inteira (pneus, baterias). Vazio é null; inválido é undefined. */
export function quantidadeDaFicha(texto: string): number | null | undefined {
  const limpo = texto.trim();
  if (limpo === "") return null;
  if (!INTEIRO.test(limpo)) return undefined;
  const numero = Number(limpo);
  return numero > QUANTIDADE_MAXIMA ? undefined : numero;
}

function campoNumero() {
  return z.string().refine((valor) => numeroDaFicha(valor) !== undefined, {
    error: `Informe um número com até ${CASAS_TAXA} casas decimais`,
  });
}

function campoQuantidade() {
  return z.string().refine((valor) => quantidadeDaFicha(valor) !== undefined, {
    error: `Informe um número inteiro de 0 a ${QUANTIDADE_MAXIMA}`,
  });
}

function campoTexto(maximo: number) {
  return z.string().trim().max(maximo, { error: `Máximo de ${maximo} caracteres` });
}

/**
 * Linha de filtro do formulário. Linha toda em branco é ignorada no envio
 * (sobra de "Adicionar filtro"); o código é o que identifica a peça, então
 * tipo sem código é recusado. Código sem tipo passa, porque é assim que chega
 * parte do que veio da origem.
 */
const filtroFormSchema = z
  .object({
    tipo: campoTexto(60),
    codigo: campoTexto(80),
  })
  .refine((filtro) => filtro.codigo !== "" || filtro.tipo === "", {
    error: "Informe o código do filtro",
    path: ["codigo"],
  });

/**
 * Schema do formulário (client e servidor). Tudo string, para input e output
 * do react-hook-form casarem; a conversão para número e null fica em
 * `fichaTecnicaSchema`.
 */
export const fichaTecnicaFormSchema = z
  .object({
    capacidadeTanqueL: campoNumero(),
    capacidadeOleoMotorL: campoNumero(),
    tipoOleoMotor: campoTexto(80),
    capacidadeOleoHidraulicoL: campoNumero(),
    tipoOleoHidraulico: campoTexto(80),
    capacidadeOleoTransmissaoL: campoNumero(),
    tipoOleoTransmissao: campoTexto(80),
    capacidadeOleoDiferencialL: campoNumero(),
    capacidadeArrefecedorL: campoNumero(),
    pneuMedida: campoTexto(40),
    pneuQtd: campoQuantidade(),
    bateriaEspecificacao: campoTexto(120),
    bateriaQtd: campoQuantidade(),
    filtros: z
      .array(filtroFormSchema)
      .max(FILTROS_MAXIMO, { error: `Máximo de ${FILTROS_MAXIMO} filtros` }),
    consumoEsperadoLH: campoNumero(),
    consumoEsperadoKmL: campoNumero(),
    garantiaFimData: z
      .string()
      .trim()
      .refine((valor) => valor === "" || DATA_ISO.test(valor), { error: "Data inválida" }),
    garantiaFimMedicao: campoNumero(),
    observacoesTecnicas: campoTexto(2000),
  });

export type FichaTecnicaFormInput = z.infer<typeof fichaTecnicaFormSchema>;

/** Vazio vira null, para não gravar string em branco. */
function textoOuNull(texto: string): string | null {
  const limpo = texto.trim();
  return limpo === "" ? null : limpo;
}

/** Só chamada depois da validação: número inválido já foi recusado. */
function numeroValidado(texto: string): number | null {
  return numeroDaFicha(texto) ?? null;
}

function quantidadeValidada(texto: string): number | null {
  return quantidadeDaFicha(texto) ?? null;
}

/** Converte o formulário já validado no que a action grava. */
export function formParaFichaDados(valores: FichaTecnicaFormInput): FichaTecnicaDados {
  return {
    capacidadeTanqueL: numeroValidado(valores.capacidadeTanqueL),
    capacidadeOleoMotorL: numeroValidado(valores.capacidadeOleoMotorL),
    tipoOleoMotor: textoOuNull(valores.tipoOleoMotor),
    capacidadeOleoHidraulicoL: numeroValidado(valores.capacidadeOleoHidraulicoL),
    tipoOleoHidraulico: textoOuNull(valores.tipoOleoHidraulico),
    capacidadeOleoTransmissaoL: numeroValidado(valores.capacidadeOleoTransmissaoL),
    tipoOleoTransmissao: textoOuNull(valores.tipoOleoTransmissao),
    capacidadeOleoDiferencialL: numeroValidado(valores.capacidadeOleoDiferencialL),
    capacidadeArrefecedorL: numeroValidado(valores.capacidadeArrefecedorL),
    pneuMedida: textoOuNull(valores.pneuMedida),
    pneuQtd: quantidadeValidada(valores.pneuQtd),
    bateriaEspecificacao: textoOuNull(valores.bateriaEspecificacao),
    bateriaQtd: quantidadeValidada(valores.bateriaQtd),
    filtros: valores.filtros
      .map((filtro) => ({ tipo: filtro.tipo.trim(), codigo: filtro.codigo.trim() }))
      .filter((filtro) => filtro.tipo !== "" || filtro.codigo !== ""),
    consumoEsperadoLH: numeroValidado(valores.consumoEsperadoLH),
    consumoEsperadoKmL: numeroValidado(valores.consumoEsperadoKmL),
    garantiaFimData: textoOuNull(valores.garantiaFimData),
    garantiaFimMedicao: numeroValidado(valores.garantiaFimMedicao),
    observacoesTecnicas: textoOuNull(valores.observacoesTecnicas),
  };
}

/** Schema do servidor: valida o formulário e devolve os dados prontos para gravar. */
export const fichaTecnicaSchema = fichaTecnicaFormSchema.transform(formParaFichaDados);

/** Número do banco no formato do campo ("1234,5"). */
function numeroParaCampo(numero: number | null): string {
  return numero === null ? "" : String(numero).replace(".", ",");
}

/** Valores iniciais do formulário a partir da ficha, ou em branco quando não há ficha. */
export function fichaParaFormulario(ficha: FichaTecnica | null): FichaTecnicaFormInput {
  return {
    capacidadeTanqueL: numeroParaCampo(ficha?.capacidadeTanqueL ?? null),
    capacidadeOleoMotorL: numeroParaCampo(ficha?.capacidadeOleoMotorL ?? null),
    tipoOleoMotor: ficha?.tipoOleoMotor ?? "",
    capacidadeOleoHidraulicoL: numeroParaCampo(ficha?.capacidadeOleoHidraulicoL ?? null),
    tipoOleoHidraulico: ficha?.tipoOleoHidraulico ?? "",
    capacidadeOleoTransmissaoL: numeroParaCampo(ficha?.capacidadeOleoTransmissaoL ?? null),
    tipoOleoTransmissao: ficha?.tipoOleoTransmissao ?? "",
    capacidadeOleoDiferencialL: numeroParaCampo(ficha?.capacidadeOleoDiferencialL ?? null),
    capacidadeArrefecedorL: numeroParaCampo(ficha?.capacidadeArrefecedorL ?? null),
    pneuMedida: ficha?.pneuMedida ?? "",
    pneuQtd: ficha?.pneuQtd != null ? String(ficha.pneuQtd) : "",
    bateriaEspecificacao: ficha?.bateriaEspecificacao ?? "",
    bateriaQtd: ficha?.bateriaQtd != null ? String(ficha.bateriaQtd) : "",
    filtros: (ficha?.filtros ?? []).map((filtro) => ({ ...filtro })),
    consumoEsperadoLH: numeroParaCampo(ficha?.consumoEsperadoLH ?? null),
    consumoEsperadoKmL: numeroParaCampo(ficha?.consumoEsperadoKmL ?? null),
    garantiaFimData: ficha?.garantiaFimData ?? "",
    garantiaFimMedicao: numeroParaCampo(ficha?.garantiaFimMedicao ?? null),
    observacoesTecnicas: ficha?.observacoesTecnicas ?? "",
  };
}
