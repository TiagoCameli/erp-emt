import { CelulaVazia, MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarPercentual } from "@/lib/formatadores";
import {
  drillCentroCusto,
  type FiltrosDoRelatorioDeCusto,
  type PeriodoCompetencia,
} from "@/modules/financeiro/relatorios/drill";
import {
  classeDoSinal,
  sinalDaVariacaoDeCusto,
} from "@/modules/financeiro/relatorios/relatorios";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import { ID_NAO_RATEADO } from "@/modules/financeiro/relatorios/indireto-nos-relatorios";
import type { CustoPorCentroCusto } from "../queries";

/**
 * Linha com o indireto rateado ("Com indireto rateado" ligado): `valor` é o
 * total (direto + indireto) e as duas partes vêm ao lado.
 */
type CentroDaTabela = CustoPorCentroCusto["centros"][number] & {
  direto?: number;
  indireto?: number;
};

interface CustoCcTabelaProps {
  custo: { centros: CentroDaTabela[]; total: number };
  /** O período que o relatório está mostrando, para o clique abrir o mesmo. */
  periodo: PeriodoCompetencia;
  /** Os filtros do relatório, que viajam junto no clique. */
  filtros: FiltrosDoRelatorioDeCusto;
  /** Sem permissão de ver lançamentos, o nome não vira link (daria 404). */
  podeVerLancamentos: boolean;
  /**
   * Variação contra o período anterior, por centro. Ausente quando a comparação
   * está desligada ou não se aplica ao modo.
   */
  variacao?: Map<string, VariacaoCentro>;
}

/** Quanto o centro variou contra o período anterior. */
export interface VariacaoCentro {
  valorAnterior: number;
  diferenca: number;
  /**
   * Variação percentual, ou `null` quando o anterior era zero: "+100% sobre
   * zero" se lê como a obra tendo dobrado de custo, quando na verdade ela acabou
   * de começar.
   */
  percentual: number | null;
}

/**
 * Custo por centro de custo em tabela: código, nome, valor e participação
 * percentual no total. Maiores primeiro (a query já ordena).
 */
/**
 * As duas células da comparação: quanto foi no período anterior e a variação.
 *
 * Centro que não existia no período anterior mostra "—" na variação, e não
 * "+100%": o percentual sobre zero se lê como a obra tendo dobrado de custo,
 * quando na verdade ela começou agora. O valor anterior aparece como zero, que é
 * verdade e explica o traço ao lado.
 */
function CelulasVariacao({ dados }: { dados?: VariacaoCentro }) {
  return (
    <>
      <TableCell className="py-2 text-right">
        <MoneyText
          valor={dados?.valorAnterior ?? 0}
          className="text-detalhe text-muted-foreground"
        />
      </TableCell>
      <TableCell className="py-2 text-right text-detalhe tabular-nums">
        {dados === undefined || dados.percentual === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={classeDoSinal(sinalDaVariacaoDeCusto(dados.diferenca))}
          >
            {dados.diferenca > 0 ? "+" : ""}
            {formatarPercentual(dados.percentual)}
          </span>
        )}
      </TableCell>
    </>
  );
}

/**
 * A variação da linha de TOTAL, somada dos centros em vez de recebida pronta.
 *
 * Soma em centavos, como todo dinheiro deste código: somar reais em ponto
 * flutuante sobre dezenas de centros acumula resto e o total da coluna passa a
 * não bater com a soma visível das linhas.
 */
function CelulasVariacaoTotal({
  variacao,
  total,
}: {
  variacao?: Map<string, VariacaoCentro>;
  total: number;
}) {
  const anteriorCentavos = [...(variacao?.values() ?? [])].reduce(
    (soma, item) => soma + Math.round(item.valorAnterior * 100),
    0,
  );
  const anterior = anteriorCentavos / 100;
  const diferenca = Math.round(total * 100 - anteriorCentavos) / 100;
  const percentual = anterior > 0 ? (diferenca / anterior) * 100 : null;

  return (
    <CelulasVariacao
      dados={{ valorAnterior: anterior, diferenca, percentual }}
    />
  );
}

export function CustoCcTabela({
  custo,
  periodo,
  filtros,
  podeVerLancamentos,
  variacao,
}: CustoCcTabelaProps) {
  const mostrarVariacao = variacao !== undefined;
  // As colunas do rateio só aparecem quando as linhas trazem as duas partes:
  // sem o rateio ligado, "Direto" seria só uma cópia do Valor.
  const mostrarIndireto = custo.centros.some((c) => c.direto !== undefined);
  const somaCent = (campo: "direto" | "indireto") =>
    custo.centros.reduce((s, c) => s + Math.round((c[campo] ?? 0) * 100), 0) / 100;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {/* Centralizado é o padrão de tabela do app (ver DataTable); só
                dinheiro, quantidade, total, percentual e horas vão à direita. */}
            <TableHead className="h-9 px-3 text-center text-detalhe font-medium text-muted-foreground">
              Código
            </TableHead>
            <TableHead className="h-9 px-3 text-center text-detalhe font-medium text-muted-foreground">
              Centro de custo
            </TableHead>
            {mostrarIndireto ? (
              <>
                <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
                  Direto
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
                  Indireto
                </TableHead>
              </>
            ) : null}
            <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
              Valor
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
              Participação
            </TableHead>
            {mostrarVariacao ? (
              <>
                <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
                  Período anterior
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
                  Variação
                </TableHead>
              </>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {custo.centros.map((centro) => (
            <TableRow key={centro.centroCustoId}>
              {/* `text-detalhe` fica na célula, e não no `span`: o `codigo-doc`
                  já traz o tamanho dele, e é a CelulaVazia que precisaria
                  herdar o tamanho certo da tabela. */}
              <TableCell className="py-2 text-center text-detalhe text-muted-foreground">
                {centro.codigo ? (
                  <span className="codigo-doc">{centro.codigo}</span>
                ) : (
                  <CelulaVazia />
                )}
              </TableCell>
              <TableCell className="py-2 text-center text-detalhe text-foreground">
                {/* "Sem centro de custo" (id nulo) não vira link: não há centro
                    para filtrar, e um link que abrisse a lista inteira mentiria
                    sobre o que ele mostra. */}
                {centro.centroCustoId &&
                centro.centroCustoId !== ID_NAO_RATEADO &&
                podeVerLancamentos ? (
                  <LinkDrill
                    href={drillCentroCusto({
                      centroCustoIds: [centro.centroCustoId],
                      periodo,
                      filtros,
                    })}
                    titulo={`Ver os lançamentos de ${centro.nome} neste período`}
                  >
                    {centro.nome}
                  </LinkDrill>
                ) : (
                  centro.nome
                )}
              </TableCell>
              {mostrarIndireto ? (
                <>
                  <TableCell className="py-2 text-right">
                    <MoneyText valor={centro.direto ?? 0} className="text-detalhe text-muted-foreground" />
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <MoneyText valor={centro.indireto ?? 0} className="text-detalhe text-muted-foreground" />
                  </TableCell>
                </>
              ) : null}
              <TableCell className="py-2 text-right">
                <MoneyText valor={centro.valor} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right text-detalhe tabular-nums text-muted-foreground">
                {custo.total > 0
                  ? formatarPercentual((centro.valor / custo.total) * 100)
                  : formatarPercentual(0)}
              </TableCell>
              {mostrarVariacao ? <CelulasVariacao dados={variacao?.get(centro.centroCustoId)} /> : null}
            </TableRow>
          ))}
          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell
              colSpan={2}
              className="py-2 text-center text-detalhe font-semibold text-foreground"
            >
              Total
            </TableCell>
            {mostrarIndireto ? (
              <>
                <TableCell className="py-2 text-right">
                  <MoneyText valor={somaCent("direto")} className="text-detalhe font-semibold" />
                </TableCell>
                <TableCell className="py-2 text-right">
                  <MoneyText valor={somaCent("indireto")} className="text-detalhe font-semibold" />
                </TableCell>
              </>
            ) : null}
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={custo.total}
                className="text-detalhe font-semibold"
              />
            </TableCell>
            <TableCell className="py-2 text-right text-detalhe tabular-nums text-muted-foreground">
              {custo.centros.length > 0
                ? formatarPercentual(100)
                : formatarPercentual(0)}
            </TableCell>
            {mostrarVariacao ? <CelulasVariacaoTotal variacao={variacao} total={custo.total} /> : null}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
