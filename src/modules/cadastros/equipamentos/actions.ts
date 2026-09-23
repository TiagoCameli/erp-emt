"use server";

import { revalidatePath } from "next/cache";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import {
  lerEValidarXlsx,
  type ColunaImportacao,
  type ResultadoValidacao,
} from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  fichaTecnicaSchema,
  registroDaFicha,
  type FichaTecnica,
  type FichaTecnicaFormInput,
} from "@/modules/cadastros/equipamentos/ficha-tecnica";
import { obterFichaTecnica } from "@/modules/cadastros/equipamentos/queries";
import {
  CONTROLE_POR,
  documentoSchema,
  equipamentoSchema,
  type ControlePor,
  type DocumentoInput,
  type EquipamentoInput,
  type Propriedade,
} from "@/modules/cadastros/equipamentos/schemas";

const RECURSO = "cadastros.equipamentos" as const;
const ROTA = "/cadastros/equipamentos";
const TABELA = "equipamentos" as const;
const TABELA_DOCUMENTOS = "equipamento_documentos" as const;
const TABELA_FICHA = "equipamento_especificacoes" as const;

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; aviso: string } | { erro: string };

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/** Monta o payload do banco a partir do input validado do equipamento. */
function paraRegistro(dados: EquipamentoInput) {
  return {
    codigo: dados.codigo ?? null,
    descricao: dados.descricao,
    tipo: dados.tipo ?? null,
    marca: dados.marca ?? null,
    modelo: dados.modelo ?? null,
    ano: dados.ano ?? null,
    placa: dados.placa ?? null,
    controle_por: dados.controlePor,
    propriedade: dados.propriedade,
    status: dados.status,
    medicao_inicial: dados.medicaoInicial ?? null,
    numero_serie: dados.numeroSerie ?? null,
    data_aquisicao: dados.dataAquisicao ?? null,
    data_venda: dados.dataVenda ?? null,
    ativo: dados.ativo,
  };
}

/** O que o gatilho do banco fez com o centro de custo, dito ao usuário. */
const AVISO_CRIACAO: Record<Propriedade, string> = {
  propria:
    "Equipamento criado. A etapa dele em Manutenção/Documentação de Equipamentos já foi gerada.",
  colorado:
    "Equipamento criado. A etapa dele na obra 002 - Equipamentos Colorado 2026 já foi gerada.",
  alugada:
    "Equipamento criado. Alugado não tem etapa: o custo vai para a obra onde ele trabalhar.",
};

/**
 * Cria um equipamento. O banco gera a etapa dele no centro de custo de
 * Manutenção por trigger, então o aviso de sucesso avisa o usuário disso.
 * RLS cobre o insert.
 */
export async function criarEquipamento(
  dados: EquipamentoInput,
): Promise<ResultadoCriacao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar equipamentos" };
  }

  const validado = equipamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .insert(paraRegistro(validado.data));

  if (error) {
    return erroAcao(
      "cadastros.equipamentos.criarEquipamento",
      error,
      "Não foi possível salvar o equipamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return {
    ok: true,
    aviso: AVISO_CRIACAO[validado.data.propriedade],
  };
}

/** Edita um equipamento existente. RLS cobre o update. */
export async function editarEquipamento(
  id: string,
  dados: EquipamentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar equipamentos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Equipamento inválido" };

  const validado = equipamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update(paraRegistro(validado.data))
    .eq("id", idValido.data);

  if (error) {
    // fn_equipamento_troca_propriedade recusa mover a etapa quando o centro de
    // custo dela já tem lançamento, rateio, OC ou pessoa. A mensagem genérica
    // esconderia o motivo, e a pessoa tentaria de novo.
    if (error.message.includes("mudar a propriedade")) {
      return erroAcao(
        "cadastros.equipamentos.editarEquipamento",
        error,
        "A propriedade não pode mudar: o centro de custo deste equipamento já tem lançamento, rateio, item de OC ou pessoa. Fale com o administrador.",
      );
    }
    return erroAcao(
      "cadastros.equipamentos.editarEquipamento",
      error,
      "Não foi possível salvar o equipamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Ativa ou desativa o equipamento. Equipamento não tem exclusão física: só
 * desativa. É um update normal de ativo, coberto por RLS.
 */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar equipamentos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Equipamento inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.equipamentos.alternarAtivo",
      error,
      "Não foi possível salvar o equipamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Documentos do equipamento (seguem a permissão de editar)
// ---------------------------------------------------------------------------

/**
 * Adiciona um documento ao equipamento. Por ora sem upload de arquivo:
 * anexo_path fica null, só registra tipo, descrição e vencimento.
 * Documentos seguem a permissão de editar do recurso.
 */
export async function adicionarDocumento(
  dados: DocumentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar equipamentos" };
  }

  const validado = documentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA_DOCUMENTOS).insert({
    equipamento_id: validado.data.equipamentoId,
    tipo: validado.data.tipo,
    descricao: validado.data.descricao ?? null,
    vencimento: validado.data.vencimento ?? null,
    anexo_path: null,
  });

  if (error) {
    return erroAcao(
      "cadastros.equipamentos.adicionarDocumento",
      error,
      "Não foi possível salvar o documento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Remove um documento do equipamento. Segue a permissão de editar. */
export async function removerDocumento(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar equipamentos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Documento inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA_DOCUMENTOS)
    .delete()
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.equipamentos.removerDocumento",
      error,
      "Não foi possível remover o documento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ficha técnica do equipamento (1:1, segue a permissão de editar)
// ---------------------------------------------------------------------------

export type ResultadoFichaTecnica =
  | { ok: true; ficha: FichaTecnica | null }
  | { erro: string };

/**
 * Lê a ficha técnica para o drawer, que só a carrega quando abre: a página
 * não traz a ficha de cada equipamento na listagem. Pede `ver`, igual à
 * policy de SELECT (que também abre para quem vê a Manutenção).
 */
export async function carregarFichaTecnica(
  equipamentoId: string,
): Promise<ResultadoFichaTecnica> {
  if (!(await checarPermissao("ver"))) {
    return { erro: "Sem permissão para ver equipamentos" };
  }

  const idValido = idSchema.safeParse(equipamentoId);
  if (!idValido.success) return { erro: "Equipamento inválido" };

  try {
    return { ok: true, ficha: await obterFichaTecnica(idValido.data) };
  } catch (erro) {
    return erroAcao(
      "cadastros.equipamentos.carregarFichaTecnica",
      erro,
      "Não foi possível carregar a ficha técnica. Tente novamente",
    );
  }
}

/**
 * Grava a ficha técnica do equipamento. Upsert por `equipamento_id` (unique):
 * a primeira gravação cria a linha, as seguintes atualizam. RLS cobre o
 * insert e o update; a auditoria sai pelo trigger fn_audit da tabela.
 */
export async function salvarFichaTecnica(
  equipamentoId: string,
  dados: FichaTecnicaFormInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar equipamentos" };
  }

  const idValido = idSchema.safeParse(equipamentoId);
  if (!idValido.success) return { erro: "Equipamento inválido" };

  const validado = fichaTecnicaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA_FICHA)
    .upsert(registroDaFicha(idValido.data, validado.data), {
      onConflict: "equipamento_id",
    });

  if (error) {
    return erroAcao(
      "cadastros.equipamentos.salvarFichaTecnica",
      error,
      "Não foi possível salvar a ficha técnica. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Importação por planilha
// ---------------------------------------------------------------------------

/** Forma de uma linha lida da planilha de equipamentos. */
interface LinhaEquipamento {
  codigo: string | null;
  descricao: string;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  placa: string | null;
  controlePor: ControlePor;
}

const ANO_MINIMO = 1950;
const ANO_MAXIMO = new Date().getFullYear() + 1;

const ROTULO_CONTROLE: Record<string, ControlePor> = {
  horimetro: "horimetro",
  "horímetro": "horimetro",
  km: "km",
  quilometragem: "km",
  nenhum: "nenhum",
  "sem controle": "nenhum",
};

/** Colunas esperadas no modelo e na importação de equipamentos. */
const COLUNAS: ColunaImportacao<LinhaEquipamento>[] = [
  {
    chave: "codigo",
    rotulo: "Codigo",
    exemplo: "EQ-001",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "descricao",
    rotulo: "Descricao",
    obrigatoria: true,
    exemplo: "Escavadeira CAT 320",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "tipo",
    rotulo: "Tipo",
    exemplo: "escavadeira",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "marca",
    rotulo: "Marca",
    exemplo: "Caterpillar",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "modelo",
    rotulo: "Modelo",
    exemplo: "320",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "ano",
    rotulo: "Ano",
    exemplo: "2020",
    transformar: (valor) => {
      const numero = Number(String(valor).trim());
      if (!Number.isInteger(numero)) throw new Error("informe um ano, ex: 2020");
      if (numero < ANO_MINIMO || numero > ANO_MAXIMO) {
        throw new Error(`o ano deve ficar entre ${ANO_MINIMO} e ${ANO_MAXIMO}`);
      }
      return numero;
    },
  },
  {
    chave: "placa",
    rotulo: "Placa",
    exemplo: "ABC1D23",
    transformar: (valor) => String(valor).trim().toUpperCase(),
  },
  {
    chave: "controlePor",
    rotulo: "Controle por",
    exemplo: "Horímetro",
    transformar: (valor) => {
      const chave = String(valor).trim().toLowerCase();
      const controle = ROTULO_CONTROLE[chave];
      if (!controle) {
        throw new Error("use horímetro, km ou nenhum");
      }
      return controle;
    },
    validar: (valor) =>
      valor === null || CONTROLE_POR.includes(valor as ControlePor)
        ? null
        : "use horímetro, km ou nenhum",
  },
];

/** Lê o File do formData. Lança se não veio arquivo. */
function arquivoDoFormData(formData: FormData): File {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    throw new Error("Nenhum arquivo enviado");
  }
  return arquivo;
}

/** Resumo da prévia de importação, conforme o contrato do ImportDialog. */
export interface ResumoImportacao {
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

/** Valida a planilha de equipamentos e devolve o resumo para a prévia. */
export async function validarImport(
  formData: FormData,
): Promise<ResumoImportacao> {
  if (!(await checarPermissao("criar"))) {
    throw new Error("Sem permissão para importar equipamentos");
  }

  const arquivo = arquivoDoFormData(formData);
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const resultado = await lerEValidarXlsx<LinhaEquipamento>(buffer, COLUNAS);

  return {
    validas: resultado.validas.length,
    invalidas: resultado.invalidas.map((linha) => ({
      linha: linha.linha,
      erros: linha.erros,
    })),
    totalLinhas: resultado.totalLinhas,
  };
}

/**
 * Importa as linhas válidas da planilha de equipamentos. Cada equipamento
 * dispara o trigger que cria a etapa dele no centro de custo de Manutenção.
 * Insere em massa; RLS cobre a permissão de criar.
 */
export async function importarEquipamentos(
  formData: FormData,
): Promise<{ importadas: number } | { erro: string }> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para importar equipamentos" };
  }

  let validas: ResultadoValidacao<LinhaEquipamento>["validas"];
  try {
    const arquivo = arquivoDoFormData(formData);
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const resultado = await lerEValidarXlsx<LinhaEquipamento>(buffer, COLUNAS);
    validas = resultado.validas;
  } catch (erro) {
    return erroAcao(
      "cadastros.equipamentos.importarEquipamentos",
      erro,
      erro instanceof Error && erro.message
        ? erro.message
        : "Não foi possível ler o arquivo",
    );
  }

  if (validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const supabase = await createClient();

  const registros = validas.map(({ dados }) => ({
    codigo: dados.codigo ?? null,
    descricao: dados.descricao ?? "",
    tipo: dados.tipo ?? null,
    marca: dados.marca ?? null,
    modelo: dados.modelo ?? null,
    ano: dados.ano ?? null,
    placa: dados.placa ?? null,
    controle_por: dados.controlePor ?? "horimetro",
    ativo: true,
  }));

  const { error } = await supabase.from(TABELA).insert(registros);
  if (error) {
    return erroAcao(
      "cadastros.equipamentos.importarEquipamentos",
      error,
      "Não foi possível importar os equipamentos. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { importadas: registros.length };
}
