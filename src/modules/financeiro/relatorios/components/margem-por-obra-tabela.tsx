import { MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarPercentual } from "@/lib/formatadores";
import type { MargemDaObra } from "@/modules/financeiro/relatorios/indireto-nos-relatorios";

const CABECALHO = "h-9 px-3 text-detalhe font-medium text-muted-foreground";

/** Margem em pontos, ou traço sem receita: zero se leria como "não sobrou nada". */
function Margem({ valor, forte }: { valor: number | null; forte?: boolean }) {
  return (
    <TableCell className={`py-2 text-right text-detalhe tabular-nums ${forte ? "font-semibold" : ""}`}>
      {valor === null ? <span className="text-muted-foreground">—</span> : formatarPercentual(valor, 1)}
    </TableCell>
  );
}

/**
 * Margem por obra, sem e com o indireto rateado (PR 3, frente C).
 *
 * O resultado mostrado é o COM indireto, que é a pergunta do dono ("quanto a
 * obra deu de verdade"); a margem sem indireto fica ao lado para comparar. O
 * total soma em centavos para fechar com as linhas.
 */
export function MargemPorObraTabela({ linhas }: { linhas: readonly MargemDaObra[] }) {
  const soma = (campo: "receita" | "custoDireto" | "indireto" | "resultadoSem" | "resultadoCom") =>
    linhas.reduce((s, l) => s + Math.round(l[campo] * 100), 0);
  const receitaCent = soma("receita");
  const margem = (cent: number) => (receitaCent === 0 ? null : (cent / receitaCent) * 100);

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={`${CABECALHO} text-center`}>Obra</TableHead>
            <TableHead className={`${CABECALHO} text-right`}>Receita líquida</TableHead>
            <TableHead className={`${CABECALHO} text-right`}>Custo direto</TableHead>
            <TableHead className={`${CABECALHO} text-right`}>Indireto</TableHead>
            <TableHead className={`${CABECALHO} text-right`}>Resultado</TableHead>
            <TableHead className={`${CABECALHO} text-right`}>Margem sem indireto</TableHead>
            <TableHead className={`${CABECALHO} text-right`}>Margem com indireto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {linhas.map((l) => (
            <TableRow key={l.centroId}>
              <TableCell className="py-2 text-center text-detalhe text-foreground">{l.nome}</TableCell>
              <TableCell className="py-2 text-right"><MoneyText valor={l.receita} className="text-detalhe" /></TableCell>
              <TableCell className="py-2 text-right"><MoneyText valor={l.custoDireto} className="text-detalhe" /></TableCell>
              <TableCell className="py-2 text-right"><MoneyText valor={l.indireto} className="text-detalhe" /></TableCell>
              <TableCell className="py-2 text-right"><MoneyText valor={l.resultadoCom} className="text-detalhe" /></TableCell>
              <Margem valor={l.margemSem} />
              <Margem valor={l.margemCom} />
            </TableRow>
          ))}
          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell className="py-2 text-center text-detalhe font-semibold text-foreground">Total</TableCell>
            <TableCell className="py-2 text-right"><MoneyText valor={receitaCent / 100} className="text-detalhe font-semibold" /></TableCell>
            <TableCell className="py-2 text-right"><MoneyText valor={soma("custoDireto") / 100} className="text-detalhe font-semibold" /></TableCell>
            <TableCell className="py-2 text-right"><MoneyText valor={soma("indireto") / 100} className="text-detalhe font-semibold" /></TableCell>
            <TableCell className="py-2 text-right"><MoneyText valor={soma("resultadoCom") / 100} className="text-detalhe font-semibold" /></TableCell>
            <Margem valor={margem(soma("resultadoSem"))} forte />
            <Margem valor={margem(soma("resultadoCom"))} forte />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
