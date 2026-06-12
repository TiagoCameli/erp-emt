import { NextResponse } from "next/server";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

const COLUNAS_MODELO = [
  { rotulo: "Nome", exemplo: "Jose da Silva" },
  { rotulo: "CPF", exemplo: "000.000.000-00" },
  { rotulo: "Funcao", exemplo: "Operador" },
  { rotulo: "Vinculo", exemplo: "clt" },
  { rotulo: "Obra", exemplo: "BR-364 Lote 09" },
];

/** Baixa o modelo .xlsx de importação de colaboradores. */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.colaboradores", "ver")) {
    return new NextResponse("Sem permissão", { status: 403 });
  }

  const buffer = await gerarModeloXlsx(COLUNAS_MODELO, "Colaboradores");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="modelo-colaboradores.xlsx"',
    },
  });
}
