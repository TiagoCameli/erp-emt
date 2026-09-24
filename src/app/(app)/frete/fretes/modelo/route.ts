import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { COLUNAS_PLANILHA_FRETE } from "@/modules/frete/fretes/importacao";

/** GET: baixa o modelo .xlsx da importação de fretes (o `template_fretes.xlsx` da origem, aba "Fretes"). */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "frete.fretes", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(
    COLUNAS_PLANILHA_FRETE.map((c) => ({ rotulo: c.rotulo, exemplo: c.exemplo })),
    "Fretes",
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template_fretes.xlsx"',
    },
  });
}
