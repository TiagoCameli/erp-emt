import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { COLUNAS_MODELO_ITEM } from "@/modules/medicao/planilha-contratual/schemas";

/** Devolve o modelo .xlsx de importação de itens contratuais para download. */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (
    !usuario ||
    !temPermissao(usuario, "medicao.planilha-contratual", "criar")
  ) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(COLUNAS_MODELO_ITEM, "Itens contratuais");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="modelo-itens-contratuais.xlsx"',
    },
  });
}
