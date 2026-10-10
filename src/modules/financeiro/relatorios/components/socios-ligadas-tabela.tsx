import { MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  rotuloTipoSocioLigada,
  type SocioLigadaLinha,
} from "@/modules/financeiro/relatorios/socios-ligadas";

interface SociosLigadasTabelaProps {
  ano: number;
  doAno: SocioLigadaLinha[];
  acumulado: SocioLigadaLinha[];
}

const CABECALHO = "h-9 px-3 text-detalhe font-medium text-muted-foreground";

/** Soma em centavos: a linha de total não pode errar o centavo. */
function somar(linhas: SocioLigadaLinha[], campo: "enviado" | "devolvido" | "saldo"): number {
  return linhas.reduce((s, l) => s + Math.round(l[campo] * 100), 0) / 100;
}

/**
 * Um centro por linha, com o ano corrente e o acumulado lado a lado. O
 * acumulado do mútuo é o que a empresa ligada deve hoje; o da distribuição é
 * quanto cada sócio já tirou.
 */
export function SociosLigadasTabela({ ano, doAno, acumulado }: SociosLigadasTabelaProps) {
  const doAnoPorCentro = new Map(doAno.map((l) => [l.centroId, l]));
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={CABECALHO}>Centro</TableHead>
            <TableHead className={CABECALHO}>Tipo</TableHead>
            <TableHead className={`${CABECALHO} text-right`}>Enviado em {ano}</TableHead>
            <TableHead className={`${CABECALHO} text-right`}>Devolvido em {ano}</TableHead>
            <TableHead className={`${CABECALHO} text-right`}>Enviado (acumulado)</TableHead>
            <TableHead className={`${CABECALHO} text-right`}>Devolvido (acumulado)</TableHead>
            <TableHead className={`${CABECALHO} text-right`}>Saldo (acumulado)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {acumulado.map((l) => {
            const a = doAnoPorCentro.get(l.centroId);
            return (
              <TableRow key={l.centroId}>
                <TableCell className="px-3 py-2 text-corpo">
                  {l.centro}
                  {l.ativo ? null : <span className="text-muted-foreground"> (inativo)</span>}
                </TableCell>
                <TableCell className="px-3 py-2 text-detalhe text-muted-foreground">
                  {rotuloTipoSocioLigada(l.tipo)}
                </TableCell>
                <TableCell className="px-3 py-2 text-right"><MoneyText valor={a?.enviado ?? 0} /></TableCell>
                <TableCell className="px-3 py-2 text-right"><MoneyText valor={a?.devolvido ?? 0} /></TableCell>
                <TableCell className="px-3 py-2 text-right"><MoneyText valor={l.enviado} /></TableCell>
                <TableCell className="px-3 py-2 text-right"><MoneyText valor={l.devolvido} /></TableCell>
                <TableCell className="px-3 py-2 text-right font-medium"><MoneyText valor={l.saldo} /></TableCell>
              </TableRow>
            );
          })}
          <TableRow>
            <TableCell className="px-3 py-2 text-corpo font-semibold" colSpan={2}>Total</TableCell>
            <TableCell className="px-3 py-2 text-right font-semibold"><MoneyText valor={somar(doAno, "enviado")} /></TableCell>
            <TableCell className="px-3 py-2 text-right font-semibold"><MoneyText valor={somar(doAno, "devolvido")} /></TableCell>
            <TableCell className="px-3 py-2 text-right font-semibold"><MoneyText valor={somar(acumulado, "enviado")} /></TableCell>
            <TableCell className="px-3 py-2 text-right font-semibold"><MoneyText valor={somar(acumulado, "devolvido")} /></TableCell>
            <TableCell className="px-3 py-2 text-right font-semibold"><MoneyText valor={somar(acumulado, "saldo")} /></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
