import "server-only";

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Lote de ids por chamada: a lista viaja no corpo da RPC, mas sem teto vira um POST gigante. */
const LOTE = 100;

/**
 * Nomes dos usuários para as telas do Frete (quem lançou, quem aprovou, a trilha).
 *
 * Pela RPC `nomes_usuarios_frete`, que devolve o nome para quem vê qualquer tela do
 * Frete (`fn_ve_frete()`). As outras leituras não serviam: a tabela `usuarios` só
 * mostra o próprio registro a quem não administra usuários, e as RPCs da auditoria,
 * do Financeiro e da Manutenção devolvem vazio para quem só tem Frete. Mesmo desenho
 * de `nomes_usuarios_manutencao`.
 *
 * Falha de leitura não derruba a tela: volta o que já veio e a tela mostra o traço.
 */
export async function nomesUsuariosFrete(
  supabase: Pick<Supabase, "rpc">,
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const nomes = new Map<string, string>();
  const unicos = [...new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""))];
  for (let i = 0; i < unicos.length; i += LOTE) {
    const { data, error } = await supabase.rpc("nomes_usuarios_frete", { p_ids: unicos.slice(i, i + LOTE) });
    if (error) return nomes;
    for (const usuario of data ?? []) nomes.set(usuario.id, usuario.nome);
  }
  return nomes;
}
