import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { COLUNAS_MODELO } from "@/modules/manutencao/tipos-oleo/schemas";

/** GET: baixa o modelo .xlsx para importação de tipos de óleo. */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "manutencao.tipos-oleo", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(
    COLUNAS_MODELO.map((coluna) => ({ rotulo: coluna.rotulo, exemplo: coluna.exemplo })),
    "Tipos de óleo",
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-tipos-oleo.xlsx"',
    },
  });
}
