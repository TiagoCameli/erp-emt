import { gerarModeloXlsx } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";

const COLUNAS_MODELO = [
  { rotulo: "Tipo", exemplo: "pj" },
  { rotulo: "Nome", exemplo: "DNIT" },
  { rotulo: "CPF/CNPJ", exemplo: "00.000.000/0001-00" },
  { rotulo: "Cidade", exemplo: "Rio Branco" },
  { rotulo: "UF", exemplo: "AC" },
];

/** GET: baixa o modelo .xlsx de importação de clientes. */
export async function GET(): Promise<Response> {
  await exigirPermissao("cadastros.clientes", "criar");

  const buffer = await gerarModeloXlsx(COLUNAS_MODELO, "Clientes");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-clientes.xlsx"',
    },
  });
}
