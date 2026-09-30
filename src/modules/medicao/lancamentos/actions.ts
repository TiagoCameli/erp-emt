"use server";

import { revalidatePath } from "next/cache";

import { erroAcao, logErroServidor, semLancar, textoDoErro } from "@/lib/erros";
import { mensagemDeNegocio, type ErroDeBanco } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { normalizarNumeroParaBanco } from "@/modules/medicao/lancamentos/colar";
import { lancamentoFormSchema, type LancamentoFormInput } from "@/modules/medicao/lancamentos/schemas";
import type { LinhaParaColar, ResultadoColagem } from "@/modules/medicao/lancamentos/tipos";

/**
 * Lançamento (`medicao.lancamentos`): criar, editar e excluir chamam as RPCs da Task 1
 * (`fn_mc_lancamento_salvar`/`excluir`), que conferem de novo a permissão, o contrato e todas as
 * regras de negócio (data dentro de medição aberta, quantidade > 0, excesso sobre o previsto —
 * spec 8). Aqui só: valida formato, converte número para o texto com PONTO que o banco espera
 * (D7: nunca por `Number`) e traduz o erro do banco para a tela.
 */

const RECURSO = "medicao.lancamentos" as const;
const ROTA = "/medicao/lancamentos";

/** SQLSTATE do excesso (spec 8): recusa até vir `motivo_excesso`. Não é erro comum nem permissão. */
const CODIGO_EXCESSO = "MCEXC";
/** SQLSTATE de `raise exception` sem `using errcode` (o "erro comum" do app). */
const RAISE_EXCEPTION = "P0001";

async function pode(acao: "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

function revalidar() {
  try {
    revalidatePath(ROTA);
  } catch {
    // O sucesso já aconteceu.
  }
}

function ehExcesso(erro: ErroDeBanco | null | undefined): boolean {
  return erro?.code === CODIGO_EXCESSO;
}

/**
 * Mensagem de negócio de um lançamento: além do P0001 comum, o MCEXC do excesso também traz o
 * texto pronto do banco ("O acumulado do 02.02 passa a..."), e é ele que o alerta forte mostra.
 */
function mensagemLancamento(erro: ErroDeBanco | null | undefined, fallback: string): string {
  if ((erro?.code === RAISE_EXCEPTION || ehExcesso(erro)) && erro?.message) return erro.message;
  return fallback;
}

/** Texto com ponto decimal, ou `null` quando a célula/campo veio vazio. */
function numeroOuNulo(texto: string): { valor: string | null; invalido: boolean } {
  const t = texto.trim();
  if (t === "") return { valor: null, invalido: false };
  const normalizado = normalizarNumeroParaBanco(t);
  return { valor: normalizado, invalido: normalizado === null };
}

export type ResultadoSalvarLancamento = { ok: true; id: string } | { ok: false; erro: string; excesso: boolean };

/**
 * Cria ou edita um lançamento. Quantidade e km chegam ao banco como texto com PONTO decimal
 * (nunca por `Number`); a data já é "yyyy-mm-dd" (o `type="date"` do navegador). Quando o banco
 * recusa por excesso (`MCEXC`), `excesso: true` diz ao drawer para mostrar o campo do motivo e
 * reenviar — o resto do que a pessoa digitou continua no formulário, sem perder nada.
 */
export async function salvarLancamento(input: LancamentoFormInput, id?: string): Promise<ResultadoSalvarLancamento> {
  // Não usa `semLancar` aqui de propósito: o fallback dele (`{ erro }`, sem `excesso`) não bate
  // com o contrato exato desta action (`{ ok: false; erro; excesso }`), e o excesso PRECISA do
  // campo para o drawer decidir se mostra o alerta forte. O catch abaixo faz o mesmo papel (loga
  // e devolve o texto real do erro, no padrão de `semLancar` para botão de dinheiro).
  try {
    const acao = id ? "editar" : "criar";
    if (!(await pode(acao))) {
      return { ok: false, erro: id ? "Sem permissão para editar lançamento" : "Sem permissão para lançar", excesso: false };
    }

    const supabase = await createClient();

    // O km obrigatório em rodovia usa o tipo REAL do contrato, lido aqui (a RLS já limita ao que a
    // pessoa acessa); o drawer já manda o formulário certo, mas essa checagem não pode depender só
    // de quem chama — sem isto, um contrato de rodovia sem km só seria pego pela RPC.
    let tipoLocalizacao: "rodovia" | "texto" = "texto";
    if (idSchema.safeParse(input.contratoId).success) {
      const { data: contrato } = await supabase
        .from("mc_contratos")
        .select("tipo_localizacao")
        .eq("id", input.contratoId)
        .maybeSingle();
      if (contrato?.tipo_localizacao === "rodovia") tipoLocalizacao = "rodovia";
    }

    const validado = lancamentoFormSchema(tipoLocalizacao).safeParse(input);
    if (!validado.success) {
      return { ok: false, erro: validado.error.issues[0]?.message ?? "Dados inválidos", excesso: false };
    }
    const dados = validado.data;

    const quantidade = normalizarNumeroParaBanco(dados.quantidade.trim());
    if (quantidade === null) {
      return { ok: false, erro: "Quantidade inválida", excesso: false };
    }
    const kmInicial = numeroOuNulo(dados.kmInicial);
    const kmFinal = numeroOuNulo(dados.kmFinal);
    if (kmInicial.invalido) return { ok: false, erro: "Km inicial inválido", excesso: false };
    if (kmFinal.invalido) return { ok: false, erro: "Km final inválido", excesso: false };

    const { data, error } = await supabase.rpc("fn_mc_lancamento_salvar", {
      p_contrato: dados.contratoId,
      p_dados: {
        item_id: dados.itemId,
        data: dados.data,
        quantidade,
        km_inicial: kmInicial.valor,
        km_final: kmFinal.valor,
        estaca: dados.estaca.trim() === "" ? null : dados.estaca.trim(),
        local_texto: dados.localTexto.trim() === "" ? null : dados.localTexto.trim(),
        observacao: dados.observacao.trim() === "" ? null : dados.observacao.trim(),
        motivo_excesso: dados.motivoExcesso.trim() === "" ? null : dados.motivoExcesso.trim(),
      },
      p_id: id,
    });
    if (error) {
      const contexto = id ? "medicao.lancamentos.editar" : "medicao.lancamentos.criar";
      const fallback = id ? "Não foi possível salvar o lançamento. Tente novamente" : "Não foi possível lançar. Tente novamente";
      if (!ehExcesso(error)) {
        return { ok: false, erro: erroAcao(contexto, error, mensagemLancamento(error, fallback)).erro, excesso: false };
      }
      // Excesso: não é falha inesperada nem erro de negócio comum, é o fluxo esperado que pede o
      // motivo — não vira log de erro.
      return { ok: false, erro: mensagemLancamento(error, fallback), excesso: true };
    }
    revalidar();
    return { ok: true, id: typeof data === "string" ? data : (id ?? "") };
  } catch (erro) {
    logErroServidor("medicao.lancamentos.salvar", erro);
    return { ok: false, erro: `Falha inesperada ao salvar o lançamento: ${textoDoErro(erro)}`, excesso: false };
  }
}

export type ResultadoExcluirLancamento = { ok: true } | { erro: string };

/** Exclui um lançamento (motivo obrigatório, o banco confere o mínimo de 3 letras). */
export async function excluirLancamento(id: string, motivo: string): Promise<ResultadoExcluirLancamento> {
  return semLancar("medicao.lancamentos.excluir", async () => {
    if (!(await pode("excluir"))) return { erro: "Sem permissão para excluir lançamento" };
    if (!idSchema.safeParse(id).success) return { erro: "Lançamento inválido" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mc_lancamento_excluir", { p_id: id, p_motivo: motivo });
    if (error) {
      return erroAcao(
        "medicao.lancamentos.excluir",
        error,
        mensagemDeNegocio(error, "Não foi possível excluir o lançamento. Tente novamente"),
      );
    }
    revalidar();
    return { ok: true };
  });
}

function paraJsonbColagem(linhas: LinhaParaColar[]) {
  return linhas.map((l) => ({
    linha: l.linha,
    data: l.data,
    item_id: l.itemId,
    quantidade: l.quantidade,
    km_inicial: l.kmInicial,
    km_final: l.kmFinal,
    estaca: l.estaca,
    observacao: l.observacao,
    motivo_excesso: l.motivoExcesso,
  }));
}

function ehResultadoColagem(valor: unknown): valor is ResultadoColagem {
  if (typeof valor !== "object" || valor === null) return false;
  const v = valor as Record<string, unknown>;
  return typeof v.gravadas === "number" && typeof v.validas === "number" && Array.isArray(v.erros);
}

/**
 * Quando `p_gravar = true` e alguma linha tem erro, a RPC não devolve o jsonb: ela recusa com
 * P0001 "Nada foi gravado: N linha(s) com erro" e o `detail` é a lista de erros em JSON (o
 * PostgREST bota isso em `error.details`). Aqui a recusa vira o MESMO formato de resultado que o
 * `p_gravar = false` devolve, para a prévia da tela tratar os dois com o mesmo código.
 */
function resultadoDoErroDeGravar(erro: ErroDeBanco & { details?: string | null }, totalLinhas: number): ResultadoColagem | null {
  if (erro.code !== RAISE_EXCEPTION || !erro.details) return null;
  try {
    const erros = JSON.parse(erro.details) as ResultadoColagem["erros"];
    if (!Array.isArray(erros)) return null;
    return { gravadas: 0, validas: totalLinhas - erros.length, erros };
  } catch {
    return null;
  }
}

export type ResultadoColagemAcao = { ok: true; resultado: ResultadoColagem } | { erro: string };

async function colar(contratoId: string, linhas: LinhaParaColar[], gravar: boolean): Promise<ResultadoColagemAcao> {
  const contexto = `medicao.lancamentos.colar.${gravar ? "gravar" : "conferir"}`;
  return semLancar(contexto, async () => {
    if (!(await pode("criar"))) return { erro: "Sem permissão para lançar" };
    if (!idSchema.safeParse(contratoId).success) return { erro: "Contrato inválido" };
    if (linhas.length === 0) return { erro: "Cole pelo menos uma linha" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_mc_lancamentos_colar", {
      p_contrato: contratoId,
      p_linhas: paraJsonbColagem(linhas),
      p_gravar: gravar,
    });
    if (error) {
      const estruturado = resultadoDoErroDeGravar(error, linhas.length);
      if (estruturado) return { ok: true, resultado: estruturado };
      const fallback = gravar ? "Não foi possível gravar a colagem. Tente novamente" : "Não foi possível conferir a colagem. Tente novamente";
      return erroAcao(contexto, error, mensagemDeNegocio(error, fallback));
    }
    if (!ehResultadoColagem(data)) {
      return erroAcao(contexto, data, "O banco devolveu a colagem num formato inesperado");
    }
    if (gravar && data.gravadas > 0) revalidar();
    return { ok: true, resultado: data };
  });
}

/**
 * `p_gravar = false`: só confere, nada é gravado (a RPC desfaz tudo internamente).
 *
 * `async` aqui não é estilo: um arquivo `"use server"` exige que TODO export seja função async —
 * sem isso o Next descarta a exportação na compilação para o cliente, e o import quebra com
 * "a export doesn't exist" (sintoma visto só no `next build`, nunca no vitest nem no tsc).
 */
export async function conferirColagem(contratoId: string, linhas: LinhaParaColar[]): Promise<ResultadoColagemAcao> {
  return colar(contratoId, linhas, false);
}

/** `p_gravar = true`: tudo ou nada — qualquer linha com erro e nenhuma é gravada. */
export async function gravarColagem(contratoId: string, linhas: LinhaParaColar[]): Promise<ResultadoColagemAcao> {
  return colar(contratoId, linhas, true);
}
