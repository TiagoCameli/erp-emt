"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
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
