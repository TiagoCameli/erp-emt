import { BarChart3 } from "lucide-react";

import { EmptyState, MoneyText } from "@/components/canonicos";
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
  ROTULOS_MESES,
  custosPorCategoria,
  custosPorCentro,
  mesesVisiveis,
  type CustoIndiretoLinha,
} from "@/modules/financeiro/relatorios/custos-indiretos";

interface CustosIndiretosTabelaProps {
  ano: number;
  linhas: CustoIndiretoLinha[];
  /** yyyy-MM: no ano corrente, as colunas param no mês corrente. */
  mesCorrente: string;
}

const CABECALHO = "h-9 px-3 text-detalhe font-medium text-muted-foreground";
const CELULA = "px-3 py-2 text-corpo";
const NUMERO = "px-3 py-2 text-right whitespace-nowrap";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-corpo font-semibold text-foreground">{titulo}</h3>
      <div className="overflow-x-auto rounded-md border border-border">{children}</div>
    </div>
  );
}

/** Zero vira "—": a grade de doze meses fica legível. */
function Valor({ valor }: { valor: number }) {
  return valor === 0 ? <span className="text-muted-foreground">—</span> : <MoneyText valor={valor} />;
}

function CelulasMeses({
  porMes,
  total,
  meses,
  className = "",
}: {
  porMes: number[];
  total: number;
  meses: number;
  className?: string;
}) {
  return (
    <>
      {porMes.slice(0, meses).map((v, i) => (
        <TableCell key={ROTULOS_MESES[i]} className={`${NUMERO} ${className}`}>
          <Valor valor={v} />
        </TableCell>
      ))}
      <TableCell className={`${NUMERO} font-medium ${className}`}>
        <Valor valor={total} />
      </TableCell>
    </>
  );
}

function TabelaPorCentro({ ano, linhas, mesCorrente }: CustosIndiretosTabelaProps) {
  const dados = custosPorCentro(linhas);
  const meses = mesesVisiveis(ano, mesCorrente, dados.porMes);
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={CABECALHO}>Centro</TableHead>
          {ROTULOS_MESES.slice(0, meses).map((m) => (
            <TableHead key={m} className={`${CABECALHO} text-right`}>{m}</TableHead>
          ))}
          <TableHead className={`${CABECALHO} text-right`}>Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dados.raizes.map((r) => (
          <GrupoRaiz key={r.raizId} raiz={r} meses={meses} />
        ))}
        <TableRow className="border-t-2 bg-surface hover:bg-surface">
          <TableCell className={`${CELULA} font-semibold`}>Total</TableCell>
          <CelulasMeses porMes={dados.porMes} total={dados.total} meses={meses} className="font-semibold" />
        </TableRow>
      </TableBody>
    </Table>
  );
}

function GrupoRaiz({
  raiz,
  meses,
}: {
  raiz: ReturnType<typeof custosPorCentro>["raizes"][number];
  meses: number;
}) {
  return (
    <>
      <TableRow className="bg-surface/40 hover:bg-surface/40">
        <TableCell className={`${CELULA} font-medium`}>{raiz.raiz}</TableCell>
        <CelulasMeses porMes={raiz.porMes} total={raiz.total} meses={meses} className="font-medium" />
      </TableRow>
      {raiz.centros.map((c) => (
        <TableRow key={c.centroId}>
          <TableCell className={`${CELULA} pl-6`}>{c.centro}</TableCell>
          <CelulasMeses porMes={c.porMes} total={c.total} meses={meses} />
        </TableRow>
      ))}
    </>
  );
}

function TabelaPorCategoria({ linhas }: { linhas: CustoIndiretoLinha[] }) {
  const categorias = custosPorCategoria(linhas);
  const total = categorias.reduce((s, c) => s + Math.round(c.total * 100), 0) / 100;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={CABECALHO}>Categoria</TableHead>
          <TableHead className={`${CABECALHO} text-right`}>Total no ano</TableHead>
          <TableHead className={`${CABECALHO} text-right`}>% do total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {categorias.map((c) => (
          <TableRow key={c.categoriaId ?? `sem-${c.categoria}`}>
            <TableCell className={CELULA}>{c.categoria}</TableCell>
            <TableCell className={NUMERO}><Valor valor={c.total} /></TableCell>
            <TableCell className={`${NUMERO} tabular-nums`}>{formatarPercentual(c.pct, 1)}</TableCell>
          </TableRow>
        ))}
        <TableRow className="border-t-2 bg-surface hover:bg-surface">
          <TableCell className={`${CELULA} font-semibold`}>Total</TableCell>
          <TableCell className={`${NUMERO} font-semibold`}><MoneyText valor={total} /></TableCell>
          <TableCell className={`${NUMERO} font-semibold tabular-nums`}>{formatarPercentual(100, 1)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

/**
 * Duas tabelas: o custo indireto por centro (raiz com subtotal e cada etapa)
 * mês a mês, e por categoria no ano.
 */
export function CustosIndiretosTabela({ ano, linhas, mesCorrente }: CustosIndiretosTabelaProps) {
  if (linhas.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo={`Sem custo indireto em ${ano}`}
        descricao="Escritório Central, Manutenção/Documentação de Equipamentos e 002 - Equipamentos Colorado não tiveram lançamento a pagar no ano."
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <Secao titulo="Por centro">
        <TabelaPorCentro ano={ano} linhas={linhas} mesCorrente={mesCorrente} />
      </Secao>
      <Secao titulo="Por categoria">
        <TabelaPorCategoria linhas={linhas} />
      </Secao>
    </div>
  );
}
