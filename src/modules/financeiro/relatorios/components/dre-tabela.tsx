import { MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { drillCategoriaCompetencia } from "@/modules/financeiro/relatorios/drill";
import {
  classeDoSinal,
  sinalDoResultado,
} from "@/modules/financeiro/relatorios/relatorios";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import type { BlocoDre, DreGerencial, DreLinha } from "../queries";

interface DreTabelaProps {
  dre: DreGerencial;
  /** Mês de referência do DRE, para o clique abrir a mesma competência. */
  mes: string;
  /** Sem permissão de ver lançamentos, a categoria não vira link (daria 404). */
  podeVerLancamentos: boolean;
}

function SecaoDre({
  titulo,
  linhas,
  total,
  rotuloTotal,
  tipo,
  mes,
  podeVerLancamentos,
}: {
  titulo: string;
  linhas: DreLinha[];
  total: number;
  rotuloTotal: string;
  /** Receita ou despesa: decide o `tipo` do lançamento no destino do clique. */
  tipo: "a_pagar" | "a_receber";
  mes: string;
  podeVerLancamentos: boolean;
}) {
  return (
    <>
      <TableRow className="bg-surface hover:bg-surface">
        <TableCell
          colSpan={2}
          className="py-2 text-center text-detalhe font-semibold text-foreground uppercase tracking-wide"
        >
          {titulo}
        </TableCell>
      </TableRow>
      {linhas.length > 0 ? (
        linhas.map((linha) => (
          <TableRow key={`${titulo}-${linha.categoriaId ?? "sem"}`}>
            <TableCell className="py-2 text-center text-detalhe text-foreground">
              {/* Linha "sem categoria" não vira link: não há categoria para
                  filtrar, e um link que abrisse a lista inteira mentiria sobre o
                  que ele mostra. */}
              {linha.categoriaId && podeVerLancamentos ? (
                <LinkDrill
                  href={drillCategoriaCompetencia({
                    categoriaId: linha.categoriaId,
                    mes,
                    tipo,
                  })}
                  titulo={`Ver os lançamentos de ${linha.categoria} neste mês`}
                >
                  {linha.categoria}
                </LinkDrill>
              ) : (
                linha.categoria
              )}
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText valor={linha.valor} className="text-detalhe" />
            </TableCell>
          </TableRow>
        ))
      ) : (
        <TableRow>
          <TableCell
            colSpan={2}
            className="py-2 text-center text-detalhe text-muted-foreground"
          >
            Sem lançamentos no mês
          </TableCell>
        </TableRow>
      )}
      <TableRow className="border-t hover:bg-transparent">
        <TableCell className="py-2 text-center text-detalhe font-medium text-foreground">
          {rotuloTotal}
        </TableCell>
        <TableCell className="py-2 text-right">
          <MoneyText valor={total} className="text-detalhe font-medium" />
        </TableCell>
      </TableRow>
    </>
  );
}

/** Linha de subtotal de um bloco (resultado operacional, resultado financeiro). */
function SubtotalDre({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <TableRow className="border-t bg-surface/60 hover:bg-surface/60">
      <TableCell className="py-2 text-center text-detalhe font-semibold text-foreground">
        {rotulo}
      </TableCell>
      <TableCell className="py-2 text-right">
        <MoneyText
          valor={valor}
          className={cn(
            "text-detalhe font-semibold",
            classeDoSinal(sinalDoResultado(valor)),
          )}
        />
      </TableCell>
    </TableRow>
  );
}

/** Um bloco vazio não vira três linhas dizendo "sem lançamentos" três vezes. */
function blocoTemLinha(bloco: BlocoDre): boolean {
  return bloco.receitas.length > 0 || bloco.despesas.length > 0;
}

/**
 * DRE gerencial do mês em tabela, em três blocos: operacional (a obra),
 * financeiro (juros e tarifa) e movimentação patrimonial.
 *
 * O bloco de movimentação aparece DEPOIS do resultado do mês e fora da soma dele
 * de propósito. Aplicar R$ 1 milhão do saldo à noite e resgatar na manhã
 * seguinte movimenta R$ 2 milhões na conta e não gera um centavo de resultado —
 * era o que fazia a varredura automática do banco responder por 31,7% da
 * "receita" de 2026. Ele continua na tela porque é dinheiro que passou pela
 * conta, e o extrato vai mostrá-lo de todo jeito.
 *
 * Sem interatividade, renderiza no servidor.
 */
export function DreTabela({ dre, mes, podeVerLancamentos }: DreTabelaProps) {
  const temFinanceiro = blocoTemLinha(dre.financeiro);
  const temMovimentacao = blocoTemLinha(dre.movimentacao);

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {/* Centralizado é o padrão de tabela do app (ver DataTable); só
                dinheiro, quantidade, total, percentual e horas vão à direita. */}
            <TableHead className="h-9 px-3 text-center text-detalhe font-medium text-muted-foreground">
              Categoria
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
              Valor
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          <SecaoDre
            titulo="Receitas"
            linhas={dre.operacional.receitas}
            total={dre.operacional.totalReceitas}
            rotuloTotal="Total de receitas"
            tipo="a_receber"
            mes={mes}
            podeVerLancamentos={podeVerLancamentos}
          />
          <SecaoDre
            titulo="Despesas"
            linhas={dre.operacional.despesas}
            total={dre.operacional.totalDespesas}
            rotuloTotal="Total de despesas"
            tipo="a_pagar"
            mes={mes}
            podeVerLancamentos={podeVerLancamentos}
          />
          {/* O subtotal operacional só faz sentido se houver um segundo bloco
              somando com ele. Sozinho, ele repetiria o resultado do mês. */}
          {temFinanceiro ? (
            <SubtotalDre
              rotulo="Resultado operacional"
              valor={dre.operacional.resultado}
            />
          ) : null}

          {temFinanceiro ? (
            <>
              <SecaoDre
                titulo="Receitas financeiras"
                linhas={dre.financeiro.receitas}
                total={dre.financeiro.totalReceitas}
                rotuloTotal="Total de receitas financeiras"
                tipo="a_receber"
                mes={mes}
                podeVerLancamentos={podeVerLancamentos}
              />
              <SecaoDre
                titulo="Despesas financeiras"
                linhas={dre.financeiro.despesas}
                total={dre.financeiro.totalDespesas}
                rotuloTotal="Total de despesas financeiras"
                tipo="a_pagar"
                mes={mes}
                podeVerLancamentos={podeVerLancamentos}
              />
              <SubtotalDre
                rotulo="Resultado financeiro"
                valor={dre.financeiro.resultado}
              />
            </>
          ) : null}

          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell className="py-2.5 text-center text-corpo font-semibold text-foreground">
              Resultado do mês
            </TableCell>
            <TableCell className="py-2.5 text-right">
              <MoneyText
                valor={dre.resultado}
                className={cn(
                  "text-corpo font-semibold",
                  classeDoSinal(sinalDoResultado(dre.resultado)),
                )}
              />
            </TableCell>
          </TableRow>

          {temMovimentacao ? (
            <>
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={2}
                  className="pt-4 pb-1 text-center text-detalhe text-muted-foreground"
                >
                  Abaixo, dinheiro que passou pela conta e{" "}
                  <strong className="font-medium text-foreground">
                    não é resultado
                  </strong>
                  : principal de aplicação, resgate e empréstimo. Não entra no
                  resultado do mês acima.
                </TableCell>
              </TableRow>
              <SecaoDre
                titulo="Entradas de movimentação"
                linhas={dre.movimentacao.receitas}
                total={dre.movimentacao.totalReceitas}
                rotuloTotal="Total de entradas"
                tipo="a_receber"
                mes={mes}
                podeVerLancamentos={podeVerLancamentos}
              />
              <SecaoDre
                titulo="Saídas de movimentação"
                linhas={dre.movimentacao.despesas}
                total={dre.movimentacao.totalDespesas}
                rotuloTotal="Total de saídas"
                tipo="a_pagar"
                mes={mes}
                podeVerLancamentos={podeVerLancamentos}
              />
            </>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
