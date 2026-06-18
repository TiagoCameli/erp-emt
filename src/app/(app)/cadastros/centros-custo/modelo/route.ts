import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

/**
 * Baixa o modelo .xlsx de importação de centros de custo.
 *
 * REGRA DA PLANILHA: colunas Centro, Etapa, Item (opcional) e Orcamento
 * (opcional). O Centro deve ser o NOME de um centro de nível 1 que JÁ EXISTE
 * (obra, escritório ou manutenção). A importação cria a Etapa sob esse centro
 * e o Item sob a etapa; o orçamento vai no nó mais profundo da linha. Centros
 * NÃO são criados pela planilha: nascem de Obras ou são de sistema.
 */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.centros-custo", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(
    [
      { rotulo: "Centro", exemplo: "Escritorio Central" },
      { rotulo: "Etapa", exemplo: "Administrativo" },
      { rotulo: "Item", exemplo: "Material de escritorio" },
      { rotulo: "Orcamento", exemplo: "15000,00" },
    ],
    "Centros de custo",
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="modelo-centros-custo.xlsx"',
    },
  });
}
