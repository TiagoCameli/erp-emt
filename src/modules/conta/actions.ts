"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { caminhoDaFoto } from "@/lib/foto-limite";
import {
  criarUploadDaFoto,
  fotoExiste,
  removerFotoDoBucket,
} from "@/lib/foto-perfil";
import { getUsuarioLogado } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  perfilSchema,
  type PerfilInput,
} from "@/modules/conta/schemas";

const ROTA = "/conta";

export type ResultadoAcao = { ok: true } | { erro: string };

/**
 * Grava os dados de perfil do próprio usuário.
 *
 * NÃO CHECA PERMISSÃO, e isso é a decisão, não um esquecimento: "Minha conta" é
 * de todo mundo que entra no sistema, e não é uma aba de `config/recursos.ts`.
 * Exigir um recurso aqui deixaria a Andreia e a Dora sem poder preencher o
 * próprio celular.
 *
 * O que substitui a checagem de permissão é o ESCOPO da gravação: quem decide
 * qual linha muda é `auth.uid()`, dentro de `fn_salvar_meu_perfil`, e a função
 * não recebe id de usuário. Não existe, em nenhum caminho, "salvar o perfil de
 * outro" — e as colunas que ela lista deixam de fora `perfil_id`, `ativo`,
 * `nome` e `email`, então este formulário não promove ninguém a Admin.
 *
 * A auditoria é automática: `trg_audit_usuarios` já grava UPDATE em `audit_log`.
 */
export async function salvarMeuPerfil(
  dados: PerfilInput,
): Promise<ResultadoAcao> {
  const validado = perfilSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const p = validado.data;

  const { error } = await supabase.rpc("fn_salvar_meu_perfil", {
    p_celular: p.celular,
    p_data_nascimento: p.dataNascimento,
    p_cargo: p.cargo,
    p_ramal: p.ramal,
    p_cpf: p.cpf,
    p_rg: p.rg,
    p_endereco_cep: p.enderecoCep,
    p_endereco_logradouro: p.enderecoLogradouro,
    p_endereco_numero: p.enderecoNumero,
    p_endereco_complemento: p.enderecoComplemento,
    p_endereco_bairro: p.enderecoBairro,
    p_endereco_cidade: p.enderecoCidade,
    p_endereco_uf: p.enderecoUf,
  });

  if (error) {
    // `mensagemDeNegocio` só deixa passar o texto de um `raise exception` nosso
    // (P0001), que aqui é sempre pt-BR e diz o que corrigir. Violação de RLS,
    // permission denied e erro de conexão caem no fallback: são infraestrutura e
    // não ajudam quem está preenchendo o formulário.
    return erroAcao(
      "conta.salvarMeuPerfil",
      error,
      mensagemDeNegocio(error, "Não foi possível salvar. Tente novamente"),
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

// =====================================================================
// Foto de perfil
// =====================================================================
//
// Três passos, e o do meio NÃO passa pelo servidor da aplicação. É o mesmo
// desenho dos anexos (`_shared/anexos`), e existe pelo mesmo motivo: a function
// da Vercel recusa corpo acima de ~4,5 MB, teto de plataforma que nenhuma
// configuração muda. A action decide SE pode e para ONDE vai; os bytes não
// atravessam ela.
//
// Nenhuma das três recebe id de usuário. O caminho é derivado de quem está
// logado, então não existe "trocar a foto de outro" — nem por engano.

/** Onde a foto do usuário logado mora no bucket, ou o motivo de não dar. */
async function caminhoDaMinhaFoto(): Promise<
  { path: string } | { erro: string }
> {
  const usuario = await getUsuarioLogado();
  if (!usuario) return { erro: "Sessão expirada. Entre de novo" };
  return { path: caminhoDaFoto(usuario.id) };
}

/**
 * Passo 1: autoriza o envio e devolve caminho e token.
 *
 * O token vale para UM caminho, o da própria pessoa. Não há nada aqui que o
 * navegador possa mudar para apontar para outro objeto.
 */
export async function prepararEnvioFoto(): Promise<
  { path: string; token: string } | { erro: string }
> {
  const destino = await caminhoDaMinhaFoto();
  if ("erro" in destino) return destino;
  return criarUploadDaFoto(destino.path);
}

/**
 * Passo 3: confere que o objeto chegou e aponta a linha para ele.
 *
 * A ORDEM é conferir depois gravar, nunca o contrário: a coluna tem um CHECK que
 * a amarra ao próprio id, mas nada no banco sabe se o binário existe. Gravar
 * primeiro deixaria a linha apontando para um objeto ausente, e a tela mostraria
 * avatar quebrado sem explicação.
 *
 * A comparação final entre o caminho daqui (TypeScript) e o que a RPC devolveu
 * (SQL) parece redundante e não é: são duas contas do mesmo caminho, em duas
 * linguagens. Se divergirem, o binário fica num lugar e a linha aponta para
 * outro — o defeito mais silencioso possível. Aqui isso vira erro na tela.
 */
export async function confirmarEnvioFoto(): Promise<ResultadoAcao> {
  const destino = await caminhoDaMinhaFoto();
  if ("erro" in destino) return destino;

  const conferencia = await fotoExiste(destino.path);
  if ("erro" in conferencia) return { erro: conferencia.erro };
  if (!conferencia.existe) {
    return { erro: "A foto não chegou ao servidor. Tente enviar de novo" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_salvar_minha_foto");

  if (error) {
    return erroAcao(
      "conta.confirmarEnvioFoto",
      error,
      mensagemDeNegocio(error, "Não foi possível salvar a foto. Tente de novo"),
    );
  }

  if (data !== destino.path) {
    return erroAcao(
      "conta.confirmarEnvioFoto.caminhoDivergente",
      new Error(`banco gravou ${data}, binário está em ${destino.path}`),
      "A foto subiu mas o registro saiu errado. Avise o suporte",
    );
  }

  // "/" com "layout" porque o avatar vive no AppShell, que é layout: revalidar
  // só /conta trocaria a prévia e deixaria a sidebar com a foto antiga.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Remove a foto: tira a referência e depois apaga o binário.
 *
 * Nesta ordem de propósito, a mesma da faxina de anexos: se o Storage falhar,
 * sobra binário sem referência (alguns KB de desperdício), nunca referência sem
 * binário (avatar quebrado). E como este bucket fica fora da faxina, é esta
 * chamada a ÚNICA coisa que apaga foto — por isso ela usa o caminho que a RPC
 * devolveu, e não um caminho recalculado.
 */
export async function removerMinhaFoto(): Promise<ResultadoAcao> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_remover_minha_foto");

  if (error) {
    return erroAcao(
      "conta.removerMinhaFoto",
      error,
      mensagemDeNegocio(error, "Não foi possível remover a foto. Tente de novo"),
    );
  }

  // Null é resposta legítima: não havia foto. Nada a apagar, e nada a avisar.
  if (data) await removerFotoDoBucket(data);

  revalidatePath("/", "layout");
  return { ok: true };
}
