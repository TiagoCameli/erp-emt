import { notFound } from "next/navigation";

import { gerarModeloXlsx } from "@/lib/importacao";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

const COLUNAS_MODELO = [
  { rotulo: "Nome", exemplo: "Padrão EMT" },
  { rotulo: "Segunda", exemplo: "8" },
  { rotulo: "Terça", exemplo: "8" },
  { rotulo: "Quarta", exemplo: "8" },
  { rotulo: "Quinta", exemplo: "8" },
  { rotulo: "Sexta", exemplo: "8" },
  { rotulo: "Sábado", exemplo: "5" },
  { rotulo: "Domingo", exemplo: "0" },
  { rotulo: "Ativo", exemplo: "sim" },
];

/** Baixa o modelo .xlsx de importação de jornadas. */
export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.jornadas", "criar")) {
    notFound();
  }

  const buffer = await gerarModeloXlsx(COLUNAS_MODELO, "Jornadas");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-jornadas.xlsx"',
    },
  });
}
