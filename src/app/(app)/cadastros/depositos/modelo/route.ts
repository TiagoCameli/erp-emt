import { gerarModeloXlsx } from "@/lib/importacao";

const COLUNAS = [
  { rotulo: "Nome", exemplo: "Tanque diesel usina" },
  { rotulo: "Tipo", exemplo: "tanque_combustivel" },
  { rotulo: "Obra", exemplo: "BR-364 Lote 09" },
  { rotulo: "Insumo", exemplo: "Diesel S10" },
];

/** Devolve o modelo .xlsx de importação de depósitos para download. */
export async function GET() {
  const buffer = await gerarModeloXlsx(COLUNAS, "Depósitos");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="modelo-depositos.xlsx"',
    },
  });
}
