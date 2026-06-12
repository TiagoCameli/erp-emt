import { gerarModeloXlsx } from "@/lib/importacao";

/** GET: baixa o modelo .xlsx para importação de unidades de medida. */
export async function GET() {
  const buffer = await gerarModeloXlsx(
    [
      { rotulo: "Sigla", exemplo: "t" },
      { rotulo: "Nome", exemplo: "Tonelada" },
      { rotulo: "Tipo", exemplo: "massa" },
    ],
    "Unidades de medida",
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="modelo-unidades-medida.xlsx"',
    },
  });
}
