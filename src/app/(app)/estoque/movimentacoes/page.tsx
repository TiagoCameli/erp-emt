import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { MovimentacoesTela } from "@/modules/estoque/movimentacoes/components/movimentacoes-tela";
import { listarMovimentacoes } from "@/modules/estoque/movimentacoes/queries";

/**
 * Movimentações (23/10/2026): o extrato de todos os depósitos, tanques e pilhas, com o saldo
 * atual de cada um. Só leitura; cada movimento muda pela aba ou pelo módulo de onde veio.
 */
export default async function PaginaMovimentacoesEstoque() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "estoque.movimentacoes", "ver")) {
    notFound();
  }

  const movimentos = await listarMovimentacoes();

  return (
    <>
      <PageHeader
        modulo="Estoque"
        titulo="Movimentações"
        descricao="Tudo o que entrou e saiu de cada depósito, tanque e pilha, com o saldo de agora. Materiais, combustível e peças"
      />
      <MovimentacoesTela movimentos={movimentos} />
    </>
  );
}
