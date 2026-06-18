import { gerarModeloXlsx } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";

const COLUNAS_MODELO = [
  { rotulo: "Codigo", exemplo: "EQ-001" },
  { rotulo: "Descricao", exemplo: "Escavadeira CAT 320" },
  { rotulo: "Tipo", exemplo: "escavadeira" },
  { rotulo: "Marca", exemplo: "Caterpillar" },
  { rotulo: "Modelo", exemplo: "320" },
  { rotulo: "Ano", exemplo: "2020" },
  { rotulo: "Placa", exemplo: "ABC1D23" },
  { rotulo: "Controle por", exemplo: "Horímetro" },
];

/** GET: baixa o modelo .xlsx de importação de equipamentos. */
export async function GET(): Promise<Response> {
  await exigirPermissao("cadastros.equipamentos", "criar");

  const buffer = await gerarModeloXlsx(COLUNAS_MODELO, "Equipamentos");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-equipamentos.xlsx"',
    },
  });
}
