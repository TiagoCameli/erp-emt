"use server";

import { revalidatePath } from "next/cache";

import { erroAcao, logErroServidor } from "@/lib/erros";
import { formatarBRL, formatarMesAno } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import { lerEValidarXlsx } from "@/lib/importacao";
import { exigirPermissao, getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  colunasImportacao,
  type LinhaImportacao,
} from "@/modules/cadastros/colaboradores/importacao";
import {
  colaboradorSchema,
  type ColaboradorInput,
} from "@/modules/cadastros/colaboradores/schemas";

const RECURSO = "cadastros.colaboradores" as const;
const ROTA = "/cadastros/colaboradores";

export type ResultadoAcao = { ok: true; aviso?: string } | { erro: string };

/** Formato do jsonb devolvido por `fn_antecipar_adiantamentos_colaborador`. */
interface AntecipacaoAdiantamentos {
  parcelas: number;
  adiantamentos: number;
  valor: number;
  competencia: string | null;
}

/**
 * Lê o jsonb da RPC de antecipação sem confiar no formato: a RPC devolve `Json`
 * nos tipos gerados, então um campo faltando não pode virar `NaN` no toast.
 */
function lerAntecipacao(dados: unknown): AntecipacaoAdiantamentos | null {
  if (typeof dados !== "object" || dados === null || Array.isArray(dados)) {
    return null;
  }
  const bruto = dados as Record<string, unknown>;
  const parcelas = Number(bruto.parcelas);
  if (!Number.isFinite(parcelas)) return null;
  const valor = Number(bruto.valor);
  const adiantamentos = Number(bruto.adiantamentos);
  return {
    parcelas,
    adiantamentos: Number.isFinite(adiantamentos) ? adiantamentos : 0,
    valor: Number.isFinite(valor) ? valor : 0,
    competencia:
      typeof bruto.competencia === "string" ? bruto.competencia : null,
  };
}

/** Lê o `ativo` gravado hoje. `null` quando o colaborador não existe. */
async function ativoGravado(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("colaboradores")
    .select("ativo")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data.ativo;
}

/**
 * Antecipa o saldo de adiantamento em aberto do colaborador que acabou de ser
 * inativado, e devolve o aviso para o toast de quem inativou.
 *
 * É chamada EXPLICITAMENTE, depois do update bem-sucedido, e **não** é trigger.
 * A escolha é deliberada: efeito financeiro dentro de um UPDATE de cadastro é o
 * que ninguém encontra depois, e esta base já pagou por esse padrão (o trigger
 * de guarda da folha é `BEFORE UPDATE OF status` e ficava cego a qualquer outra
 * coluna). Dinheiro que se move tem que aparecer para quem o moveu, na hora.
 *
 * Nunca faz a inativação falhar: sem saldo a RPC devolve `parcelas: 0` e aqui
 * sai `undefined` (nenhum aviso); se a RPC falhar, o erro vai para o log e o
 * aviso pede conferência manual, porque o cadastro já foi gravado.
 */
async function anteciparAdiantamentos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  origem: string,
): Promise<string | undefined> {
  const { data, error } = await supabase.rpc(
    "fn_antecipar_adiantamentos_colaborador",
    { p_colaborador: id },
  );

  if (error) {
    logErroServidor(origem, error);
    return "Colaborador inativado, mas não foi possível antecipar o saldo de adiantamento dele. Confira em RH, Adiantamentos";
  }

  const antecipacao = lerAntecipacao(data);
  if (!antecipacao || antecipacao.parcelas === 0) return undefined;

  const parcelas =
    antecipacao.parcelas === 1
      ? "1 parcela"
      : `${antecipacao.parcelas} parcelas`;
  const mes = formatarMesAno(antecipacao.competencia);
  const folha = mes === "" ? "a próxima folha" : `a folha de ${mes}`;
  return `Saldo de adiantamento antecipado: ${parcelas} de ${formatarBRL(antecipacao.valor)} para ${folha}`;
}

/**
 * Converte o ColaboradorInput validado nas colunas da tabela colaboradores.
 * Os 19 campos novos de dados pessoais/eSocial (Bloco 2) são opcionais no
 * schema (chave pode faltar): quando ausentes, o valor sai `undefined` e o
 * Supabase simplesmente não toca a coluna (insert usa o default `null` da
 * tabela; update preserva o valor já gravado) — sem risco de apagar dado já
 * cadastrado por telas que ainda não enviam esses campos (Task 3 adiciona).
 */
function paraLinhaBanco(dados: ColaboradorInput) {
  return {
    nome: dados.nome,
    cpf: dados.cpf,
    funcao_id: dados.funcaoId,
    jornada_id: dados.jornadaId,
    vinculo: dados.vinculo,
    obra_id: dados.obraId,
    centro_custo_id: dados.centroCustoId,
    data_admissao: dados.dataAdmissao,
    telefone: dados.telefone,
    ativo: dados.ativo,
    salario: dados.salario,
    valor_diaria: dados.valorDiaria,
    banco: dados.banco,
    agencia: dados.agencia,
    conta: dados.conta,
    tipo_conta: dados.tipoConta,
    chave_pix: dados.chavePix,
    rg: dados.rg,
    rg_orgao: dados.rgOrgao,
    rg_uf: dados.rgUf,
    ctps_numero: dados.ctpsNumero,
    ctps_serie: dados.ctpsSerie,
    ctps_uf: dados.ctpsUf,
    pis: dados.pis,
    cnh_numero: dados.cnhNumero,
    cnh_categoria: dados.cnhCategoria,
    cnh_validade: dados.cnhValidade,
    escolaridade: dados.escolaridade,
    data_nascimento: dados.dataNascimento,
    nome_mae: dados.nomeMae,
    nacionalidade: dados.nacionalidade,
    estado_civil: dados.estadoCivil,
    raca_cor: dados.racaCor,
    titulo_eleitor: dados.tituloEleitor,
    reservista: dados.reservista,
  };
}

/** Cria um colaborador. Marca o created_by com o usuário logado. */
export async function criar(dados: ColaboradorInput): Promise<ResultadoAcao> {
  const usuario = await exigirPermissao(RECURSO, "criar");

  const validado = colaboradorSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("colaboradores")
    .insert({ ...paraLinhaBanco(validado.data), created_by: usuario.id });

  if (error) {
    return erroAcao(
      "cadastros.colaboradores.criar",
      error,
      "Não foi possível salvar o colaborador. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Edita um colaborador existente. Quando este save é o que INATIVA o
 * colaborador, o saldo de adiantamento em aberto dele é antecipado depois do
 * update, e o aviso volta para o toast (ver `anteciparAdiantamentos`).
 */
export async function editar(
  id: string,
  dados: ColaboradorInput,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Colaborador inválido" };

  const validado = colaboradorSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  // O `ativo` de ANTES é o que diz se este save é uma inativação: o payload
  // sozinho não distingue "está inativando agora" de "já estava inativo e
  // mudou o telefone". Só vai ao banco quando o payload inativa.
  const estavaAtivo =
    validado.data.ativo === false
      ? await ativoGravado(supabase, idValido.data)
      : null;

  const { error } = await supabase
    .from("colaboradores")
    .update(paraLinhaBanco(validado.data))
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.colaboradores.editar",
      error,
      "Não foi possível salvar o colaborador. Tente novamente",
    );
  }

  const aviso =
    estavaAtivo === true
      ? await anteciparAdiantamentos(
          supabase,
          idValido.data,
          "cadastros.colaboradores.editar",
        )
      : undefined;

  revalidatePath(ROTA);
  const resultado: ResultadoAcao = { ok: true };
  if (aviso) resultado.aviso = aviso;
  return resultado;
}

/**
 * Ativa ou desativa o colaborador (soft delete por status). Inativar antecipa o
 * saldo de adiantamento em aberto, depois do update, avisando quem inativou.
 */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Colaborador inválido" };

  const supabase = await createClient();

  // `ativo` vem do estado da tela, que pode estar velho: quem diz se este
  // clique é uma inativação é o valor GRAVADO.
  const estavaAtivo =
    ativo === false ? await ativoGravado(supabase, idValido.data) : null;

  const { error } = await supabase
    .from("colaboradores")
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.colaboradores.alternarAtivo",
      error,
      "Não foi possível atualizar o status. Tente novamente",
    );
  }

  const aviso =
    estavaAtivo === true
      ? await anteciparAdiantamentos(
          supabase,
          idValido.data,
          "cadastros.colaboradores.alternarAtivo",
        )
      : undefined;

  revalidatePath(ROTA);
  const resultado: ResultadoAcao = { ok: true };
  if (aviso) resultado.aviso = aviso;
  return resultado;
}

/** Exclusão física: move o colaborador para a lixeira com motivo. */
export async function excluir(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "excluir");

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Colaborador inválido" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length === 0) {
    return { erro: "Informe o motivo da exclusão" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_cadastro", {
    p_tabela: "colaboradores",
    p_id: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    const traduzido = traduzErroExclusao(error);
    return erroAcao(
      "cadastros.colaboradores.excluir",
      error,
      traduzido ?? "Não foi possível excluir o colaborador. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Lê o File do FormData e devolve o Buffer, ou null se não houver arquivo. */
async function bufferDoFormData(formData: FormData): Promise<Buffer | null> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return null;
  const arrayBuffer = await arquivo.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export interface ResumoImportacao {
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

/** Valida a planilha enviada e devolve o resumo da prévia. */
export async function validarImport(
  formData: FormData,
): Promise<ResumoImportacao> {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "criar")) {
    throw new Error("Sem permissão para importar colaboradores");
  }

  const buffer = await bufferDoFormData(formData);
  if (!buffer) {
    throw new Error("Nenhum arquivo enviado. Escolha um arquivo .xlsx");
  }

  const resultado = await lerEValidarXlsx<LinhaImportacao>(
    buffer,
    colunasImportacao,
  );

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
 * Importa as linhas válidas da planilha. Resolve a obra pelo nome (ativa) e
 * a função pelo nome (Bloco 3, Task 3: a planilha ainda traz o nome da
 * função em texto — a coluna some, não a informação). Se a função não
 * existir ainda no cadastro, ela é criada automaticamente (sem CBO/salário
 * base, preenchidos depois em `/cadastros/funcoes`) em vez de bloquear a
 * importação: diferente da obra (que precisa existir de antemão), a função é
 * um cadastro simples e o nome já veio confirmado pelo usuário na planilha.
 * Insere em massa. RLS cobre a permissão de criar.
 */
export async function importar(
  formData: FormData,
): Promise<{ importadas: number } | { erro: string }> {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "criar")) {
    return { erro: "Sem permissão para importar colaboradores" };
  }

  const buffer = await bufferDoFormData(formData);
  if (!buffer) {
    return { erro: "Nenhum arquivo enviado. Escolha um arquivo .xlsx" };
  }

  let resultado;
  try {
    resultado = await lerEValidarXlsx<LinhaImportacao>(
      buffer,
      colunasImportacao,
    );
  } catch (erro) {
    return erroAcao(
      "cadastros.colaboradores.importar",
      erro,
      erro instanceof Error && erro.message
        ? erro.message
        : "Não foi possível ler a planilha",
    );
  }

  if (resultado.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const supabase = await createClient();

  // Mapa nome da obra (minúsculo) para id, resolvendo as FKs por nome.
  const { data: obras, error: erroObras } = await supabase
    .from("obras")
    .select("id, nome")
    .eq("ativo", true);
  if (erroObras) {
    return erroAcao(
      "cadastros.colaboradores.importar",
      erroObras,
      "Não foi possível carregar as obras para a importação",
    );
  }
  // obras.nome não é unique: nomes repetidos são ambíguos e não podem ser
  // casados por adivinhação (o último venceria no Map). Marca os ambíguos.
  const obraPorNome = new Map<string, string>();
  const obraNomeAmbiguo = new Set<string>();
  for (const obra of obras ?? []) {
    const chave = obra.nome.trim().toLowerCase();
    if (obraPorNome.has(chave)) {
      obraNomeAmbiguo.add(chave);
    } else {
      obraPorNome.set(chave, obra.id);
    }
  }

  // Mapa nome da função (minúsculo) para id. `funcoes.nome` é unique (ao
  // contrário de obras.nome), então não há ambiguidade a tratar aqui.
  const { data: funcoesExistentes, error: erroFuncoes } = await supabase
    .from("funcoes")
    .select("id, nome");
  if (erroFuncoes) {
    return erroAcao(
      "cadastros.colaboradores.importar",
      erroFuncoes,
      "Não foi possível carregar as funções para a importação",
    );
  }
  const funcaoPorNome = new Map<string, string>();
  for (const funcao of funcoesExistentes ?? []) {
    funcaoPorNome.set(funcao.nome.trim().toLowerCase(), funcao.id);
  }

  // Funções novas citadas na planilha (nome exato, sem duplicar por chave).
  const funcoesNovasPorChave = new Map<string, string>();
  for (const { dados } of resultado.validas) {
    if (!dados.funcaoNome) continue;
    const nome = dados.funcaoNome.trim();
    const chave = nome.toLowerCase();
    if (!funcaoPorNome.has(chave)) funcoesNovasPorChave.set(chave, nome);
  }

  if (funcoesNovasPorChave.size > 0) {
    const { data: criadas, error: erroCriar } = await supabase
      .from("funcoes")
      .insert([...funcoesNovasPorChave.values()].map((nome) => ({ nome })))
      .select("id, nome");
    if (erroCriar) {
      return erroAcao(
        "cadastros.colaboradores.importar",
        erroCriar,
        "Não foi possível criar as funções novas da planilha",
      );
    }
    for (const funcao of criadas ?? []) {
      funcaoPorNome.set(funcao.nome.trim().toLowerCase(), funcao.id);
    }
  }

  const linhasValidas = [];
  for (const { dados } of resultado.validas) {
    let obraId: string | null = null;
    if (dados.obra) {
      const chave = dados.obra.trim().toLowerCase();
      if (obraNomeAmbiguo.has(chave)) {
        return {
          erro: `Obra "${dados.obra}" está cadastrada mais de uma vez. Use um nome único ou ajuste o cadastro antes de importar`,
        };
      }
      const encontrada = obraPorNome.get(chave);
      if (!encontrada) {
        return {
          erro: `Obra "${dados.obra}" não encontrada. Cadastre a obra antes ou ajuste a planilha`,
        };
      }
      obraId = encontrada;
    }

    const funcaoId = dados.funcaoNome
      ? (funcaoPorNome.get(dados.funcaoNome.trim().toLowerCase()) ?? null)
      : null;

    linhasValidas.push({
      nome: dados.nome ?? "",
      cpf: dados.cpf ?? null,
      funcao_id: funcaoId,
      vinculo: dados.vinculo ?? "clt",
      obra_id: obraId,
      created_by: usuario.id,
    });
  }

  const { error } = await supabase.from("colaboradores").insert(linhasValidas);
  if (error) {
    return erroAcao(
      "cadastros.colaboradores.importar",
      error,
      "Não foi possível importar os colaboradores. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { importadas: linhasValidas.length };
}
