import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Linha da listagem de usuários, com o nome do perfil resolvido. */
/**
 * O que a pessoa preencheu de si em "Minha conta".
 *
 * Vem num objeto separado, e não solto em `UsuarioLista`, porque tem dono
 * diferente: `nome`, `ativo` e `perfilId` são da Administração; isto aqui é do
 * próprio usuário, e o Admin só LÊ. Ver `fn_salvar_meu_perfil`.
 */
export interface ContatoUsuario {
  celular: string | null;
  dataNascimento: string | null;
  cargo: string | null;
  ramal: string | null;
  cpf: string | null;
  rg: string | null;
  enderecoCep: string | null;
  enderecoLogradouro: string | null;
  enderecoNumero: string | null;
  enderecoComplemento: string | null;
  enderecoBairro: string | null;
  enderecoCidade: string | null;
  enderecoUf: string | null;
}

export interface UsuarioLista {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  perfilId: string | null;
  perfilNome: string | null;
  criadoEm: string;
  acessoPendente: boolean;
  /** Dados que o próprio usuário preenche. Ver `ContatoUsuario`. */
  contato: ContatoUsuario;
}

/** Par recurso + ação presente na matriz individual do usuário. */
export interface PermissaoLinha {
  recurso: string;
  acao: string;
}

/** Perfil disponível para aplicar como template de permissões. */
export interface PerfilOpcao {
  id: string;
  nome: string;
}

/** Lista todos os usuários com o nome do perfil (join em perfis). */
export async function listarUsuarios(): Promise<UsuarioLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("usuarios")
    .select(
      `id, nome, email, ativo, perfil_id, created_at,
       celular, data_nascimento, cargo, ramal, cpf, rg,
       endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento,
       endereco_bairro, endereco_cidade, endereco_uf,
       perfis(nome), usuario_senha_provisoria(usuario_id)`,
    )
    .is("excluido_em", null)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os usuários");
  }

  return (data ?? []).map((usuario) => {
    const provisoria = usuario.usuario_senha_provisoria;
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email ?? "",
      ativo: usuario.ativo,
      perfilId: usuario.perfil_id,
      perfilNome: usuario.perfis?.nome ?? null,
      criadoEm: usuario.created_at,
      acessoPendente: Array.isArray(provisoria)
        ? provisoria.length > 0
        : provisoria != null,
      contato: {
        celular: usuario.celular,
        dataNascimento: usuario.data_nascimento,
        cargo: usuario.cargo,
        ramal: usuario.ramal,
        cpf: usuario.cpf,
        rg: usuario.rg,
        enderecoCep: usuario.endereco_cep,
        enderecoLogradouro: usuario.endereco_logradouro,
        enderecoNumero: usuario.endereco_numero,
        enderecoComplemento: usuario.endereco_complemento,
        enderecoBairro: usuario.endereco_bairro,
        enderecoCidade: usuario.endereco_cidade,
        enderecoUf: usuario.endereco_uf,
      },
    };
  });
}

/** Matriz individual do usuário: linhas de usuario_permissoes. */
export async function buscarMatrizUsuario(
  usuarioId: string,
): Promise<PermissaoLinha[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("usuario_permissoes")
    .select("recurso, acao")
    .eq("usuario_id", usuarioId);

  if (error) {
    throw new Error("Não foi possível carregar as permissões do usuário");
  }

  return data ?? [];
}

/** Perfis cadastrados, para aplicar como template. */
export async function listarPerfis(): Promise<PerfilOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("perfis")
    .select("id, nome")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os perfis");
  }

  return data ?? [];
}
