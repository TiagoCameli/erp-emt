import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

const COLUNAS_MODELO = [
  { rotulo: "Tipo", exemplo: "pj" },
  { rotulo: "Razao social", exemplo: "Brita Acre LTDA" },
  { rotulo: "CNPJ/CPF", exemplo: "00.000.000/0001-00" },
  { rotulo: "Cidade", exemplo: "Cruzeiro do Sul" },
  { rotulo: "UF", exemplo: "AC" },
];

/** Baixa o modelo .xlsx de importação de fornecedores. */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.fornecedores", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(COLUNAS_MODELO, "Fornecedores");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="modelo-fornecedores.xlsx"',
    },
  });
}
