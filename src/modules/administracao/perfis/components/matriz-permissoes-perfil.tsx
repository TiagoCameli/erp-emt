"use client";

/**
 * A matriz do perfil é a matriz canônica de recursos x ações.
 * Mantido como reexport para os consumidores do módulo de perfis.
 */
export {
  MatrizRecursosAcoes as MatrizPermissoesPerfil,
  chavePermissao,
  permissaoDaChave,
  type MatrizRecursosAcoesProps as MatrizPermissoesPerfilProps,
} from "@/components/canonicos/matriz-recursos-acoes";
