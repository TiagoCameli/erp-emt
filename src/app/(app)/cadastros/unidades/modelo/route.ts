import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

/** GET: baixa o modelo .xlsx para importação de unidades de medida. */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.unidades", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(
    [
      { rotulo: "Sigla", exemplo: "t" },
      { rotulo: "Nome", exemplo: "Tonelada" },
      { rotulo: "Tipo", exemplo: "massa" },
    ],
    "Unidades de medida",
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="modelo-unidades-medida.xlsx"',
    },
  });
}
