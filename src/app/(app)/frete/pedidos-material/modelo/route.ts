import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { COLUNAS_PEDIDOS } from "@/modules/frete/pedidos-material/importacao";

/** GET: o modelo da origem (template_pedidos_material.xlsx, aba "Pedidos"). */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "frete.pedidos-material", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(
    COLUNAS_PEDIDOS.map((coluna) => ({ rotulo: coluna.rotulo, exemplo: coluna.exemplo })),
    "Pedidos",
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template_pedidos_material.xlsx"',
    },
  });
}
