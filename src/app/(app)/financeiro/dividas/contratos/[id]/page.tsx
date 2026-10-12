import { notFound } from "next/navigation";

import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import { etapasDeDivida } from "@/modules/financeiro/dividas/calculo";
import { ContratoDetalhe } from "@/modules/financeiro/dividas/components/contrato-detalhe";
import { carregarContrato, relatorioContratos } from "@/modules/financeiro/dividas/queries";

const RECURSO = "financeiro.dividas" as const;

export default async function PaginaContratoDivida({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();

  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  // O resumo (saldo, juros, CET) vem da mesma RPC da aba Créditos: um número só nas duas telas.
  const [detalhe, relatorio, anexos, centros] = await Promise.all([
    carregarContrato(id),
    relatorioContratos(),
    listarAnexosDoDocumento("contrato_divida", id),
    podeEditar ? listarCentrosCusto() : Promise.resolve([]),
  ]);
  if (!detalhe) notFound();

  return (
    <ContratoDetalhe
      detalhe={detalhe}
      resumo={relatorio.find((r) => r.contratoId === id) ?? null}
      etapas={etapasDeDivida(centros)}
      anexos={anexos}
      podeEditar={podeEditar}
      podeVerLancamentos={temPermissao(usuario, "financeiro.lancamentos", "ver")}
    />
  );
}
