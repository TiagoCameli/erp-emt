import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

const COLUNAS_MODELO = [
  { rotulo: "Codigo", exemplo: "MAT-001" },
  { rotulo: "Nome", exemplo: "Brita 1" },
  { rotulo: "Categoria", exemplo: "Materiais de construcao" },
  { rotulo: "Unidade", exemplo: "m3" },
];

/** Devolve o modelo .xlsx de importação de insumos para download. */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.insumos", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(COLUNAS_MODELO, "Insumos");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-insumos.xlsx"',
    },
  });
}
