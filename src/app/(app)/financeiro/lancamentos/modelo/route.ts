import { gerarModeloXlsx } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { COLUNAS_LANCAMENTO } from "@/modules/financeiro/lancamentos/importacao";

/**
 * GET: baixa o modelo .xlsx de importação de lançamentos.
 *
 * As colunas vêm de COLUNAS_LANCAMENTO, a mesma fonte que a validação usa: se
 * alguém acrescentar coluna lá, o modelo acompanha sozinho. Modelo que
 * duplica a lista de colunas fica desatualizado no primeiro campo novo.
 */
export async function GET(): Promise<Response> {
  await exigirPermissao("financeiro.lancamentos", "criar");

  const buffer = await gerarModeloXlsx(
    COLUNAS_LANCAMENTO.map((coluna) => ({
      rotulo: coluna.rotulo,
      exemplo: coluna.exemplo,
    })),
    "Lançamentos",
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-lancamentos.xlsx"',
    },
  });
}
