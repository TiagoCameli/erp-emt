import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { COLUNAS_PAGAMENTOS } from "@/modules/frete/pagamentos/importacao";

/** GET: o modelo da origem (template_pagamentos_frete.xlsx, aba "Pagamentos"). */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "frete.pagamentos", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(
    COLUNAS_PAGAMENTOS.map((coluna) => ({ rotulo: coluna.rotulo, exemplo: coluna.exemplo })),
    "Pagamentos",
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template_pagamentos_frete.xlsx"',
    },
  });
}
