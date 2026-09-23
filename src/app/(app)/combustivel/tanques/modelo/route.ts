import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { COLUNAS_MODELO } from "@/modules/combustivel/tanques/schemas";

/** GET: baixa o modelo .xlsx para importação de tanques. */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "combustivel.tanques", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(
    COLUNAS_MODELO.map((coluna) => ({ rotulo: coluna.rotulo, exemplo: coluna.exemplo })),
    "Tanques",
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-tanques.xlsx"',
    },
  });
}
