import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

/** Baixa o modelo .xlsx de importação de categorias de insumo. */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.categorias", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(
    [
      { rotulo: "Nome", exemplo: "Materiais de construcao" },
      { rotulo: "Tipo", exemplo: "material" },
    ],
    "Categorias",
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-categorias.xlsx"',
    },
  });
}
