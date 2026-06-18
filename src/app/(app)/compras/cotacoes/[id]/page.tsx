import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { CotacaoDetalhe } from "@/modules/compras/cotacoes/components/cotacao-detalhe";
import {
  buscarCotacao,
  listarFornecedores,
  listarInsumos,
  trilhaCotacao,
} from "@/modules/compras/cotacoes/queries";

export default async function PaginaCotacaoDetalhe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.cotacoes", "ver")) {
    notFound();
  }

  const { id } = await params;

  const cotacao = await buscarCotacao(id);
  if (!cotacao) notFound();

  const [fornecedores, insumos, trilha] = await Promise.all([
    listarFornecedores(),
    listarInsumos(),
    trilhaCotacao(id),
  ]);

  const podeEditar = temPermissao(usuario, "compras.cotacoes", "editar");

  return (
    <>
      <PageHeader
        titulo={cotacao.numero ?? "Cotação"}
        descricao="Mapa comparativo de preços por fornecedor"
        acoes={
          <Button asChild variant="outline" size="sm">
            <Link href="/compras/cotacoes">
              <ArrowLeft />
              Voltar
            </Link>
          </Button>
        }
      />
      <CotacaoDetalhe
        cotacao={cotacao}
        fornecedores={fornecedores}
        insumos={insumos}
        trilha={trilha}
        podeEditar={podeEditar}
      />
    </>
  );
}
