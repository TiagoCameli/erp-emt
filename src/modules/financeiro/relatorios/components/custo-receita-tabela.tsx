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
import { drillCustoReceita } from "@/modules/financeiro/relatorios/drill";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import type { CentroCustoReceita } from "@/modules/financeiro/relatorios/custo-receita";

interface CustoReceitaTabelaProps {
  linhas: CentroCustoReceita[];
  /** Governa o rótulo, a coluna de retenção e o tipo que o clique leva. */
  lado: "custo" | "receita";
  /** Os meses que estas linhas somam, para o clique abrir os MESMOS meses. */
  meses: readonly string[];
  /** Sem permissão de ver lançamentos, o nome não vira link (daria 404). */
  podeVerLancamentos: boolean;
}

/**
 * Cabeçalho na densidade do módulo: 36px de altura, `text-detalhe` (13px) e
 * cinza.
 *
 * As duas tabelas deste relatório usavam `TableHead`/`TableCell` sem classe
 * nenhuma, herdando o default do shadcn — `text-sm` (14px), que não existe na
 * escala EMT, e `h-10 px-2 text-left`. Ao lado das outras seis tabelas do
 * relatório, a mesma tela tinha dois tamanhos de letra e dois alinhamentos.
 */
const CABECALHO = "h-9 px-3 text-detalhe font-medium text-muted-foreground";

/**
 * Uma das duas tabelas do relatório: centro, valor e participação no total do
 * SEU lado.
 *
 * Participação é sobre o total do próprio lado, não sobre a soma dos dois: 40% de
 * um custo que é maior que a receita não significa nada se o denominador mistura
 * dinheiro que entra com dinheiro que sai.
 *
 * A coluna de retenção só existe na receita, e só aparece quando há retenção em
 * alguma linha. Coluna de zeros ocupa largura e ensina errado (que a EMT retém
 * imposto em toda medição, quando são 9 documentos).
 */
export function CustoReceitaTabela({
  linhas,
  lado,
  meses,
  podeVerLancamentos,
}: CustoReceitaTabelaProps) {
  const total = linhas.reduce((soma, linha) => soma + linha.total, 0);
  const temRetencao =
    lado === "receita" && linhas.some((linha) => linha.retencao > 0);
  const tipo = lado === "custo" ? "a_pagar" : "a_receber";
  const titulo = lado === "custo" ? "Custo por centro" : "Receita por centro";

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-detalhe font-medium text-foreground">{titulo}</h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {/* Centralizado é o padrão de tabela do app (ver DataTable); só
                dinheiro, quantidade, total, percentual e horas vão à direita. */}
            <TableHead className={`${CABECALHO} text-center`}>Código</TableHead>
            <TableHead className={`${CABECALHO} text-center`}>
              Centro de custo
            </TableHead>
            {temRetencao ? (
              <TableHead className={`${CABECALHO} text-right`}>
                Retido
              </TableHead>
            ) : null}
            <TableHead className={`${CABECALHO} text-right`}>
              {lado === "custo" ? "Custo" : "Receita líquida"}
            </TableHead>
            <TableHead className={`${CABECALHO} text-right`}>
              Participação
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {linhas.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={temRetencao ? 5 : 4}
                className="py-2 text-center text-detalhe text-muted-foreground"
              >
                {lado === "custo"
                  ? "Nenhum custo nos centros e meses escolhidos"
                  : "Nenhuma receita nos centros e meses escolhidos"}
              </TableCell>
            </TableRow>
          ) : (
            linhas.map((linha) => (
              <TableRow key={linha.centroCustoId}>
                {/* `text-detalhe` fica na célula, e não no `span`: o `codigo-doc`
                    já traz o tamanho dele, e é a CelulaVazia que precisaria
                    herdar o tamanho certo da tabela. */}
                <TableCell className="py-2 text-center text-detalhe text-muted-foreground">
                  {linha.codigo ? (
                    <span className="codigo-doc">{linha.codigo}</span>
                  ) : (
                    <CelulaVazia />
                  )}
                </TableCell>
                <TableCell className="py-2 text-center text-detalhe text-foreground">
                  {podeVerLancamentos ? (
                    <LinkDrill
                      href={drillCustoReceita({
                        centroCustoId: linha.centroCustoId,
                        meses,
                        tipo,
                      })}
                      titulo={`Ver os lançamentos de ${linha.nome} nestes meses`}
                    >
                      {linha.nome}
                    </LinkDrill>
                  ) : (
                    linha.nome
                  )}
                </TableCell>
                {temRetencao ? (
                  <TableCell className="py-2 text-right text-detalhe">
                    {linha.retencao > 0 ? (
                      <MoneyText
                        valor={linha.retencao}
                        className="text-detalhe"
                      />
                    ) : (
                      <CelulaVazia />
                    )}
                  </TableCell>
                ) : null}
                <TableCell className="py-2 text-right">
                  <MoneyText valor={linha.total} className="text-detalhe" />
                </TableCell>
                <TableCell className="py-2 text-right text-detalhe tabular-nums text-muted-foreground">
                  {total === 0
                    ? "—"
                    : formatarPercentual((linha.total / total) * 100)}
                </TableCell>
              </TableRow>
            ))
          )}
          {linhas.length > 0 ? (
            <TableRow className="border-t-2 bg-surface hover:bg-surface">
              <TableCell />
              <TableCell className="py-2 text-center text-detalhe font-semibold text-foreground">
                Total
              </TableCell>
              {temRetencao ? (
                <TableCell className="py-2 text-right">
                  <MoneyText
                    valor={linhas.reduce((soma, l) => soma + l.retencao, 0)}
                    className="text-detalhe font-semibold"
                  />
                </TableCell>
              ) : null}
              <TableCell className="py-2 text-right">
                <MoneyText
                  valor={total}
                  className="text-detalhe font-semibold"
                />
              </TableCell>
              <TableCell className="py-2 text-right text-detalhe font-semibold tabular-nums text-muted-foreground">
                100%
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
