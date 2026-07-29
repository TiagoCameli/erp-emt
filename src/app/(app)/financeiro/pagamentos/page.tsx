import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import { PagamentosCliente } from "@/modules/financeiro/pagamentos/components/pagamentos-cliente";
import {
  listarContasBancarias,
  listarParcelasAprovadas,
  listarParcelasPagas,
} from "@/modules/financeiro/pagamentos/queries";

const TAMANHO_PAGINA = 25;

export default async function PaginaPagamentos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.pagamentos", "ver")) {
    notFound();
  }

  const podePagar = temPermissao(usuario, "financeiro.pagamentos", "criar");
  const podeEstornar = temPermissao(usuario, "financeiro.pagamentos", "excluir");

  const [aprovadas, pagas, contas] = await Promise.all([
    listarParcelasAprovadas(),
    listarParcelasPagas({ pagina: 0, tamanho: TAMANHO_PAGINA }),
    listarContasBancarias(),
  ]);

  // Anexos das parcelas a pagar numa consulta só (o pagamento é a parcela).
  const anexosPorParcela = await listarAnexosPorDocumento(
    "pagamento",
    aprovadas.map((parcela) => parcela.id),
  );

  return (
    <>
      <PageHeader
        titulo="Pagamentos"
        descricao="Pague as parcelas já aprovadas e acompanhe o histórico de pagamentos"
      />
      <PagamentosCliente
        aprovadas={aprovadas}
        pagas={pagas.itens}
        totalPagas={pagas.total}
        contas={contas}
        podePagar={podePagar}
        podeEstornar={podeEstornar}
        anexosPorParcela={anexosPorParcela}
      />
    </>
  );
}
