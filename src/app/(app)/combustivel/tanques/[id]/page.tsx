import { notFound } from "next/navigation";

import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { linhaDoTempo } from "@/modules/combustivel/tanques/calculo";
import { TanqueDetalhe } from "@/modules/combustivel/tanques/components/tanque-detalhe";
import { buscarTanque, listarMovimentosTanque } from "@/modules/combustivel/tanques/queries";

export default async function PaginaTanqueDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "combustivel.tanques", "ver")) {
    notFound();
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const [tanque, movimentos] = await Promise.all([buscarTanque(id), listarMovimentosTanque(id)]);
  if (!tanque) notFound();

  // O nível corrido se calcula do mais antigo para o mais recente; a tela lê ao contrário.
  const linha = linhaDoTempo(movimentos).reverse();

  return <TanqueDetalhe tanque={tanque} movimentos={linha} />;
}
