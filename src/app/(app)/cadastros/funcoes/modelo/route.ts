import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

const COLUNAS_MODELO = [
  { rotulo: "Nome", exemplo: "Pedreiro" },
  { rotulo: "Salario base", exemplo: "2.500,00" },
  { rotulo: "CBO", exemplo: "7152-10" },
  { rotulo: "Ativo", exemplo: "sim" },
];

/** Baixa o modelo .xlsx de importação de funções. */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.funcoes", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(COLUNAS_MODELO, "Funcoes");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-funcoes.xlsx"',
    },
  });
}
