import { gerarModeloXlsx } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";

const COLUNAS_MODELO = [
  { rotulo: "Nome", exemplo: "Conservação BR-364 Lote 09" },
  { rotulo: "Numero do contrato", exemplo: "00615/2025" },
  { rotulo: "Cliente", exemplo: "DNIT" },
  { rotulo: "Rodovia", exemplo: "BR-364" },
  { rotulo: "Lote", exemplo: "09" },
  { rotulo: "UF", exemplo: "AC" },
  { rotulo: "Extensao km", exemplo: "120,5" },
  { rotulo: "Status", exemplo: "Em andamento" },
];

/** GET: baixa o modelo .xlsx de importação de obras. */
export async function GET(): Promise<Response> {
  await exigirPermissao("cadastros.obras", "criar");

  const buffer = await gerarModeloXlsx(COLUNAS_MODELO, "Obras");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-obras.xlsx"',
    },
  });
}
