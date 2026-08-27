import "server-only";

import { createClient } from "@/lib/supabase/server";

/** O perfil do próprio usuário, do jeito que a tela de "Minha conta" precisa. */
export interface MeuPerfil {
  id: string;
  /** Definido pelo Admin na aba Usuários. Aparece em leitura. */
  nome: string;
  /** Do login. Trocar exige mexer na autenticação, não é campo de perfil. */
  email: string;
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

/**
 * Lê o perfil do usuário logado.
 *
 * NÃO recebe id de propósito: o id sai de `auth.getUser()`, do mesmo jeito que a
 * gravação tira de `auth.uid()`. Uma versão com parâmetro seria a primeira peça
 * de "ver o perfil de outro", e a policy de SELECT de `usuarios` até permitiria
 * ao Admin — mas então a tela de "Minha conta" passaria a depender de quem
 * chama, e não é isso que ela é.
 *
 * A policy de SELECT já libera a PRÓPRIA linha para qualquer usuário
 * (`id = auth.uid() or tem_permissao(...)`), então isto funciona sem permissão
 * nenhuma de Administração — que é o ponto: todo mundo tem "Minha conta".
 *
 * Não há colunas de dinheiro aqui, então não há conversão de NUMERIC.
 */
export async function buscarMeuPerfil(): Promise<MeuPerfil | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("usuarios")
    .select(
      `id, nome, email, celular, data_nascimento, cargo, ramal, cpf, rg,
       endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento,
       endereco_bairro, endereco_cidade, endereco_uf`,
    )
    .eq("id", user.id)
    .maybeSingle();

  // Distingue "não achei" de "deu erro": com `single()` a ausência vira erro e
  // as duas situações ficariam iguais na tela. Sessão válida sem linha em
  // `usuarios` é conta removida, e o layout já manda essa pessoa para
  // /conta-desativada antes de chegar aqui.
  if (error) {
    throw new Error("Não foi possível carregar os seus dados");
  }
  if (!data) return null;

  return {
    id: data.id,
    nome: data.nome,
    email: data.email ?? "",
    celular: data.celular,
    dataNascimento: data.data_nascimento,
    cargo: data.cargo,
    ramal: data.ramal,
    cpf: data.cpf,
    rg: data.rg,
    enderecoCep: data.endereco_cep,
    enderecoLogradouro: data.endereco_logradouro,
    enderecoNumero: data.endereco_numero,
    enderecoComplemento: data.endereco_complemento,
    enderecoBairro: data.endereco_bairro,
    enderecoCidade: data.endereco_cidade,
    enderecoUf: data.endereco_uf,
  };
}
