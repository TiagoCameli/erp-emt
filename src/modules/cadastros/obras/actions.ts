"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import {
  lerEValidarXlsx,
  type ColunaImportacao,
  type ResultadoValidacao,
} from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  obraSchema,
  type ObraInput,
  type StatusObra,
} from "@/modules/cadastros/obras/schemas";

const RECURSO = "cadastros.obras" as const;
const ROTA = "/cadastros/obras";
const TABELA = "obras" as const;

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; aviso: string } | { erro: string };

const uuidSchema = z.uuid();

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/** Monta o payload do banco a partir do input validado. */
function paraRegistro(dados: ObraInput) {
  return {
    nome: dados.nome,
    numero_contrato: dados.numeroContrato ?? null,
    cliente_id: dados.clienteId ?? null,
    rodovia: dados.rodovia ?? null,
    lote: dados.lote ?? null,
    uf: dados.uf ?? null,
    extensao_km: dados.extensaoKm ?? null,
    data_inicio: dados.dataInicio ?? null,
    data_fim_prevista: dados.dataFimPrevista ?? null,
    status: dados.status,
    observacoes: dados.observacoes ?? null,
    ativo: dados.ativo,
  };
}

/**
 * Cria uma obra. O banco gera o centro de custo raiz dela por trigger,
 * então o aviso de sucesso avisa o usuário disso. RLS cobre o insert.
 */
export async function criarObra(dados: ObraInput): Promise<ResultadoCriacao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar obras" };
  }

  const validado = obraSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .insert(paraRegistro(validado.data));

  if (error) {
    return { erro: "Não foi possível salvar a obra. Tente novamente" };
  }

  revalidatePath(ROTA);
  return {
    ok: true,
    aviso: "Obra criada. O centro de custo dela já foi gerado.",
  };
}

/** Edita uma obra existente. RLS cobre o update. */
export async function editarObra(
  id: string,
  dados: ObraInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar obras" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Obra inválida" };

  const validado = obraSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update(paraRegistro(validado.data))
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível salvar a obra. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Ativa ou desativa a obra. Obra não tem exclusão física: só desativa.
 * É um update normal de ativo, coberto por RLS.
 */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar obras" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Obra inválida" };

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível salvar a obra. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Importação por planilha
// ---------------------------------------------------------------------------

/** Forma de uma linha lida da planilha de obras. */
interface LinhaObra {
  nome: string;
  numeroContrato: string | null;
  cliente: string | null;
  rodovia: string | null;
  lote: string | null;
  uf: string | null;
  extensaoKm: number | null;
  status: StatusObra;
}

const ROTULO_STATUS: Record<string, StatusObra> = {
  planejamento: "planejamento",
  "em andamento": "em_andamento",
  em_andamento: "em_andamento",
  paralisada: "paralisada",
  concluida: "concluida",
  "concluída": "concluida",
};

/** Colunas esperadas no modelo e na importação de obras. */
const COLUNAS: ColunaImportacao<LinhaObra>[] = [
  {
    chave: "nome",
    rotulo: "Nome",
    obrigatoria: true,
    exemplo: "Conservação BR-364 Lote 09",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "numeroContrato",
    rotulo: "Numero do contrato",
    exemplo: "00615/2025",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "cliente",
    rotulo: "Cliente",
    exemplo: "DNIT",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "rodovia",
    rotulo: "Rodovia",
    exemplo: "BR-364",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "lote",
    rotulo: "Lote",
    exemplo: "09",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "uf",
    rotulo: "UF",
    exemplo: "AC",
    transformar: (valor) => String(valor).trim().toUpperCase(),
    validar: (valor) =>
      valor === null || /^[A-Z]{2}$/.test(String(valor))
        ? null
        : "UF deve ter 2 letras, ex: AC",
  },
  {
    chave: "extensaoKm",
    rotulo: "Extensao km",
    exemplo: "120,5",
    transformar: (valor) => {
      const numero = Number(String(valor).replace(",", "."));
      if (Number.isNaN(numero)) throw new Error("informe um número, ex: 120,5");
      if (numero < 0) throw new Error("a extensão não pode ser negativa");
      return numero;
    },
  },
  {
    chave: "status",
    rotulo: "Status",
    exemplo: "Em andamento",
    transformar: (valor) => {
      const chave = String(valor).trim().toLowerCase();
      const status = ROTULO_STATUS[chave];
      if (!status) {
        throw new Error(
          "use planejamento, em andamento, paralisada ou concluida",
        );
      }
      return status;
    },
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

/** Valida a planilha de obras e devolve o resumo para a prévia. */
export async function validarImport(
  formData: FormData,
): Promise<ResumoImportacao> {
  if (!(await checarPermissao("criar"))) {
    throw new Error("Sem permissão para importar obras");
  }

  const arquivo = arquivoDoFormData(formData);
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const resultado = await lerEValidarXlsx<LinhaObra>(buffer, COLUNAS);

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
 * Importa as linhas válidas da planilha de obras. Resolve o cliente pelo
 * nome ou nome_fantasia. Cliente preenchido mas inexistente vira erro (não
 * entra sem vínculo); célula vazia entra sem cliente.
 * Insere em massa; RLS cobre a permissão de criar.
 */
export async function importarObras(
  formData: FormData,
): Promise<{ importadas: number } | { erro: string }> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para importar obras" };
  }

  let validas: ResultadoValidacao<LinhaObra>["validas"];
  try {
    const arquivo = arquivoDoFormData(formData);
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const resultado = await lerEValidarXlsx<LinhaObra>(buffer, COLUNAS);
    validas = resultado.validas;
  } catch (erro) {
    return {
      erro:
        erro instanceof Error && erro.message
          ? erro.message
          : "Não foi possível ler o arquivo",
    };
  }

  if (validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const supabase = await createClient();

  // Mapa nome/nome_fantasia (minúsculo) -> id, para resolver o cliente.
  const { data: clientes, error: erroClientes } = await supabase
    .from("clientes")
    .select("id, nome, nome_fantasia");

  if (erroClientes) {
    return { erro: "Não foi possível carregar os clientes para casar" };
  }

  const clientePorNome = new Map<string, string>();
  for (const cliente of clientes ?? []) {
    clientePorNome.set(cliente.nome.trim().toLowerCase(), cliente.id);
    if (cliente.nome_fantasia) {
      clientePorNome.set(cliente.nome_fantasia.trim().toLowerCase(), cliente.id);
    }
  }

  const registros: {
    nome: string;
    numero_contrato: string | null;
    cliente_id: string | null;
    rodovia: string | null;
    lote: string | null;
    uf: string | null;
    extensao_km: number | null;
    status: StatusObra;
    ativo: boolean;
  }[] = [];

  for (const { linha, dados } of validas) {
    // Cliente preenchido mas inexistente vira erro, não vínculo silencioso null.
    let clienteId: string | null = null;
    if (dados.cliente) {
      const encontrado = clientePorNome.get(dados.cliente.trim().toLowerCase());
      if (!encontrado) {
        return {
          erro: `Cliente "${dados.cliente}" não encontrado (linha ${linha}). Cadastre o cliente antes ou corrija o nome`,
        };
      }
      clienteId = encontrado;
    }

    registros.push({
      nome: dados.nome ?? "",
      numero_contrato: dados.numeroContrato ?? null,
      cliente_id: clienteId,
      rodovia: dados.rodovia ?? null,
      lote: dados.lote ?? null,
      uf: dados.uf ?? null,
      extensao_km: dados.extensaoKm ?? null,
      status: dados.status ?? "em_andamento",
      ativo: true,
    });
  }

  const { error } = await supabase.from(TABELA).insert(registros);
  if (error) {
    return { erro: "Não foi possível importar as obras. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { importadas: registros.length };
}
