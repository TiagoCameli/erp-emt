"use server";

import { revalidatePath } from "next/cache";

import { RECURSOS, type Acao } from "@/config/recursos";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  perfilSchema,
  permissoesPerfilSchema,
  type PerfilInput,
  type PermissaoPerfilInput,
} from "@/modules/administracao/perfis/schemas";

const ROTA_PERFIS = "/administracao/perfis";

type ResultadoAcao = { erro: string } | undefined;

/** Cria um perfil com nome e descrição. */
export async function criarPerfil(dados: PerfilInput): Promise<ResultadoAcao> {
  const resultado = perfilSchema.safeParse(dados);
  if (!resultado.success) {
    return { erro: resultado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const usuario = await exigirPermissao("administracao.perfis", "criar");
  const supabase = await createClient();

  const { error } = await supabase.from("perfis").insert({
    nome: resultado.data.nome,
    descricao: resultado.data.descricao || null,
    created_by: usuario.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { erro: "Já existe um perfil com esse nome" };
    }
    return { erro: "Não foi possível criar o perfil. Tente novamente" };
  }

  revalidatePath(ROTA_PERFIS);
}

/** Edita nome e descrição de um perfil existente. */
export async function editarPerfil(
  id: string,
  dados: PerfilInput,
): Promise<ResultadoAcao> {
  const resultado = perfilSchema.safeParse(dados);
  if (!resultado.success) {
    return { erro: resultado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  await exigirPermissao("administracao.perfis", "editar");
  const supabase = await createClient();

  const { error } = await supabase
    .from("perfis")
    .update({
      nome: resultado.data.nome,
      descricao: resultado.data.descricao || null,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { erro: "Já existe um perfil com esse nome" };
    }
    return { erro: "Não foi possível salvar o perfil. Tente novamente" };
  }

  revalidatePath(ROTA_PERFIS);
}

/**
 * Exclui um perfil sem usuários vinculados.
 *
 * Decisão da fase 0: perfis não passam pela tabela lixeira. A lixeira não
 * tem policy de INSERT para o client autenticado e não existe RPC para
 * gravar nela, então o snapshot de segurança fica garantido pelo trigger
 * de auditoria: o audit_log registra o DELETE do perfil (e das linhas de
 * perfil_permissoes levadas pelo cascade) com dados_antes completos.
 * O motivo digitado no ConfirmDialog é exigido aqui apenas para manter a
 * UX consistente com as demais exclusões do sistema.
 */
export async function excluirPerfil(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!motivo.trim()) {
    return { erro: "Informe o motivo da exclusão" };
  }

  await exigirPermissao("administracao.perfis", "excluir");
  const supabase = await createClient();

  const { count, error: erroContagem } = await supabase
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .eq("perfil_id", id);

  if (erroContagem) {
    return { erro: "Não foi possível verificar os usuários do perfil" };
  }
  if ((count ?? 0) > 0) {
    return {
      erro: "Este perfil tem usuários vinculados. Troque o perfil deles antes de excluir",
    };
  }

  const { error } = await supabase.from("perfis").delete().eq("id", id);

  if (error) {
    return { erro: "Não foi possível excluir o perfil. Tente novamente" };
  }

  revalidatePath(ROTA_PERFIS);
}

/**
 * Substitui a matriz de permissões do perfil (delete + insert).
 *
 * Salvar a matriz NÃO reaplica o perfil nos usuários que já o usam:
 * a reaplicação é manual, pela ação de aplicar perfil na aba Usuários
 * (RPC aplicar_perfil), para não sobrescrever ajustes individuais.
 */
export async function salvarPermissoesPerfil(
  perfilId: string,
  permissoes: PermissaoPerfilInput[],
): Promise<ResultadoAcao> {
  const resultado = permissoesPerfilSchema.safeParse(permissoes);
  if (!resultado.success) {
    return { erro: "Permissões inválidas" };
  }

  const usuario = await exigirPermissao("administracao.perfis", "editar");
  const supabase = await createClient();

  // Mantém só pares recurso + ação que existem no catálogo RECURSOS.
  const validas = resultado.data.filter((permissao) => {
    const recurso = RECURSOS.find((r) => r.id === permissao.recurso);
    if (!recurso) return false;
    return (recurso.acoes as readonly Acao[]).includes(permissao.acao);
  });

  // Remove duplicatas antes do insert.
  const unicas = [
    ...new Map(
      validas.map((permissao) => [
        `${permissao.recurso}:${permissao.acao}`,
        permissao,
      ]),
    ).values(),
  ];

  const { error: erroDelete } = await supabase
    .from("perfil_permissoes")
    .delete()
    .eq("perfil_id", perfilId);

  if (erroDelete) {
    return { erro: "Não foi possível atualizar as permissões. Tente novamente" };
  }

  if (unicas.length > 0) {
    const { error: erroInsert } = await supabase.from("perfil_permissoes").insert(
      unicas.map((permissao) => ({
        perfil_id: perfilId,
        recurso: permissao.recurso,
        acao: permissao.acao,
        created_by: usuario.id,
      })),
    );

    if (erroInsert) {
      return { erro: "Não foi possível salvar as permissões. Tente novamente" };
    }
  }

  revalidatePath(ROTA_PERFIS);
}
