import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TituloAba } from "@/modules/combustivel/_shared/components/titulo-aba";
import { LixeiraCombustivel } from "@/modules/combustivel/lixeira/components/lixeira-combustivel";
import { permissoesDaLixeira, TIPOS_LIXEIRA, veAlgumaSecao } from "@/modules/combustivel/lixeira/permissoes";
import { carregarLixeiraCombustivel } from "@/modules/combustivel/lixeira/queries";

/**
 * Lixeira do Combustível: a LixeiraTab da origem. Saídas, entradas, transferências e
 * esvaziamentos excluídos, com quem excluiu, quando e o motivo, e o Restaurar de cada
 * módulo. A aba aparece para quem vê Saídas (navegação); cada seção pede a sua permissão.
 */
export default async function PaginaLixeiraCombustivel() {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "combustivel.saidas", "ver")) notFound();

  const permissoes = permissoesDaLixeira((recurso, acao) => temPermissao(usuario, recurso, acao));

  if (!veAlgumaSecao(permissoes)) {
    return (
      <>
        <TituloAba titulo="Lixeira" />
        <p className="py-12 text-center text-detalhe text-muted-foreground">
          Você não tem permissão para ver a lixeira do combustível.
        </p>
      </>
    );
  }

  const itens = await carregarLixeiraCombustivel(permissoes);
  const total = TIPOS_LIXEIRA.reduce((soma, tipo) => soma + itens[tipo].length, 0);

  return (
    <>
      <TituloAba
        titulo="Lixeira"
        contagem={total > 0 ? total : undefined}
        descricao="Registros excluídos, guardados para auditoria. Restaurar devolve o registro ao saldo dos tanques."
      />
      <LixeiraCombustivel itens={itens} permissoes={permissoes} />
    </>
  );
}
