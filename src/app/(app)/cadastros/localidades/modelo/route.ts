import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

/** GET: baixa o modelo .xlsx para importação de localidades. */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.localidades", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(
    [
      { rotulo: "Nome", exemplo: "Pedreira Vale do Abunã" },
      { rotulo: "Endereço", exemplo: "BR-364, km 120" },
      { rotulo: "Pedreira (fornecedor)", exemplo: "" },
    ],
    "Localidades",
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-localidades.xlsx"',
    },
  });
}
