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
import type { DreGerencial, DreLinha } from "../queries";

interface DreTabelaProps {
  dre: DreGerencial;
}

function SecaoDre({
  titulo,
  linhas,
  total,
  rotuloTotal,
}: {
  titulo: string;
  linhas: DreLinha[];
  total: number;
  rotuloTotal: string;
}) {
  return (
    <>
      <TableRow className="bg-surface hover:bg-surface">
        <TableCell
          colSpan={2}
          className="py-2 text-detalhe font-semibold text-foreground uppercase tracking-wide"
        >
          {titulo}
        </TableCell>
      </TableRow>
      {linhas.length > 0 ? (
        linhas.map((linha) => (
          <TableRow key={`${titulo}-${linha.categoriaId ?? "sem"}`}>
            <TableCell className="py-2 text-detalhe text-foreground">
              {linha.categoria}
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
            className="py-2 text-detalhe text-muted-foreground"
          >
            Sem lançamentos no mês
          </TableCell>
        </TableRow>
      )}
      <TableRow className="border-t hover:bg-transparent">
        <TableCell className="py-2 text-detalhe font-medium text-foreground">
          {rotuloTotal}
        </TableCell>
        <TableCell className="py-2 text-right">
          <MoneyText valor={total} className="text-detalhe font-medium" />
        </TableCell>
      </TableRow>
    </>
  );
}

/**
 * DRE gerencial do mês em tabela: receitas por categoria, despesas por
 * categoria e o resultado. Sem interatividade, renderiza no servidor.
 */
export function DreTabela({ dre }: DreTabelaProps) {
  const resultadoPositivo = dre.resultado >= 0;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
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
            linhas={dre.receitas}
            total={dre.totalReceitas}
            rotuloTotal="Total de receitas"
          />
          <SecaoDre
            titulo="Despesas"
            linhas={dre.despesas}
            total={dre.totalDespesas}
            rotuloTotal="Total de despesas"
          />
          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell className="py-2.5 text-corpo font-semibold text-foreground">
              Resultado do mês
            </TableCell>
            <TableCell className="py-2.5 text-right">
              <MoneyText
                valor={dre.resultado}
                className={cn(
                  "text-corpo font-semibold",
                  resultadoPositivo
                    ? "text-status-aprovado"
                    : "text-status-rejeitado",
                )}
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
