import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

const COLUNAS_MODELO = [
  { rotulo: "Nome", exemplo: "INSS patronal" },
  { rotulo: "Percentual", exemplo: "20" },
  { rotulo: "Ativo", exemplo: "sim" },
];

/** Baixa o modelo .xlsx de importação de encargos. */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.encargos", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(COLUNAS_MODELO, "Encargos");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-encargos.xlsx"',
    },
  });
}
