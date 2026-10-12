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
import { formatarMesAno } from "@/lib/formatadores";
import {
  agruparEquipamentos,
  consorciosDe,
  rotuloParcelas,
  somarAquisicoes,
  type AquisicaoLinha,
  type TotaisAquisicao,
} from "@/modules/financeiro/relatorios/aquisicoes";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import { detalheLancamento, drillAquisicao } from "@/modules/financeiro/relatorios/drill";

interface AquisicoesTabelaProps {
  linhas: AquisicaoLinha[];
  /** Sem permissão de ver lançamentos, os nomes ficam sem link. */
  podeVerLancamentos: boolean;
}

const CABECALHO = "h-9 px-3 text-detalhe font-medium text-muted-foreground";
const CELULA = "px-3 py-2 text-corpo";
const NUMERO = "px-3 py-2 text-right";

function CelulasDinheiro({ totais, className }: { totais: TotaisAquisicao; className?: string }) {
  return (
    <>
      <TableCell className={`${NUMERO} ${className ?? ""}`}><MoneyText valor={totais.valor} /></TableCell>
      <TableCell className={`${NUMERO} ${className ?? ""}`}><MoneyText valor={totais.pago} /></TableCell>
      <TableCell className={`${NUMERO} ${className ?? ""}`}><MoneyText valor={totais.aPagar} /></TableCell>
    </>
  );
}

function Secao({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-corpo font-semibold text-foreground">{titulo}</h3>
        {nota ? <p className="text-detalhe text-muted-foreground">{nota}</p> : null}
      </div>
      <div className="overflow-x-auto rounded-md border border-border">{children}</div>
    </div>
  );
}

function TabelaEquipamentos({ linhas, podeVerLancamentos }: AquisicoesTabelaProps) {
  const grupos = agruparEquipamentos(linhas);
  const total = somarAquisicoes(grupos.flatMap((g) => g.linhas));
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={CABECALHO}>Equipamento</TableHead>
          <TableHead className={CABECALHO}>Fornecedor</TableHead>
          <TableHead className={CABECALHO}>Compra</TableHead>
          <TableHead className={`${CABECALHO} text-right`}>Lançamentos</TableHead>
          <TableHead className={`${CABECALHO} text-right`}>Valor</TableHead>
          <TableHead className={`${CABECALHO} text-right`}>Pago</TableHead>
          <TableHead className={`${CABECALHO} text-right`}>A pagar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {grupos.map((g) => (
          <GrupoEquipamentos key={g.grupo} grupo={g.grupo} linhas={g.linhas} totais={g.totais} podeVerLancamentos={podeVerLancamentos} />
        ))}
        <TableRow className="border-t-2 bg-surface hover:bg-surface">
          <TableCell className={`${CELULA} font-semibold`} colSpan={4}>Total</TableCell>
          <CelulasDinheiro totais={total} className="font-semibold" />
        </TableRow>
      </TableBody>
    </Table>
  );
}

function GrupoEquipamentos({
  grupo,
  linhas,
  totais,
  podeVerLancamentos,
}: {
  grupo: string;
  linhas: AquisicaoLinha[];
  totais: TotaisAquisicao;
  podeVerLancamentos: boolean;
}) {
  return (
    <>
      <TableRow className="bg-surface/40 hover:bg-surface/40">
        <TableCell className={`${CELULA} font-medium`} colSpan={4}>{grupo}</TableCell>
        <CelulasDinheiro totais={totais} className="font-medium" />
      </TableRow>
      {linhas.map((l) => (
        <TableRow key={l.centroId}>
          <TableCell className={`${CELULA} pl-6`}>
            {podeVerLancamentos ? (
              <LinkDrill href={drillAquisicao({ centroId: l.centroId })} titulo={`Lançamentos de ${l.centro}`}>
                {l.centro}
              </LinkDrill>
            ) : (
              l.centro
            )}
          </TableCell>
          <TableCell className="px-3 py-2 text-detalhe text-muted-foreground">{l.fornecedor ?? ""}</TableCell>
          <TableCell className="px-3 py-2 text-detalhe tabular-nums">{formatarMesAno(l.primeiraCompetencia)}</TableCell>
          <TableCell className={`${NUMERO} tabular-nums`}>{l.lancamentos}</TableCell>
          <CelulasDinheiro totais={l} />
        </TableRow>
      ))}
    </>
  );
}

function TabelaConsorcios({ linhas, podeVerLancamentos }: AquisicoesTabelaProps) {
  const cotas = consorciosDe(linhas);
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={CABECALHO}>Lançamento</TableHead>
          <TableHead className={CABECALHO}>Descrição</TableHead>
          <TableHead className={CABECALHO}>Administradora</TableHead>
          <TableHead className={`${CABECALHO} text-right`}>Parcelas</TableHead>
          <TableHead className={`${CABECALHO} text-right`}>Valor</TableHead>
          <TableHead className={`${CABECALHO} text-right`}>Pago</TableHead>
          <TableHead className={`${CABECALHO} text-right`}>A pagar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cotas.map((l, i) => (
          // Uma linha por rateio da cota: o mesmo lançamento pode repetir.
          <TableRow key={`${l.lancamentoId}-${l.centroId}-${i}`}>
            <TableCell className={`${CELULA} tabular-nums`}>
              {podeVerLancamentos && l.lancamentoId ? (
                <LinkDrill href={detalheLancamento(l.lancamentoId)} titulo={`Lançamento ${l.numero ?? ""}`}>
                  {l.numero ?? "—"}
                </LinkDrill>
              ) : (
                (l.numero ?? "—")
              )}
            </TableCell>
            <TableCell className={CELULA}>{l.descricao ?? ""}</TableCell>
            <TableCell className="px-3 py-2 text-detalhe text-muted-foreground">{l.fornecedor ?? ""}</TableCell>
            <TableCell className={`${NUMERO} tabular-nums`}>{rotuloParcelas(l)}</TableCell>
            <CelulasDinheiro totais={l} />
          </TableRow>
        ))}
        <TableRow className="border-t-2 bg-surface hover:bg-surface">
          <TableCell className={`${CELULA} font-semibold`} colSpan={4}>Total</TableCell>
          <CelulasDinheiro totais={somarAquisicoes(cotas)} className="font-semibold" />
        </TableRow>
      </TableBody>
    </Table>
  );
}

/**
 * Duas tabelas: os bens comprados, agrupados pelo centro raiz, e as cotas de
 * consórcio ainda a contemplar, uma por lançamento.
 */
export function AquisicoesTabela({ linhas, podeVerLancamentos }: AquisicoesTabelaProps) {
  const temEquipamento = linhas.some((l) => l.tipo === "equipamento");
  const temConsorcio = linhas.some((l) => l.tipo === "consorcio");
  if (!temEquipamento && !temConsorcio) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Nenhuma aquisição lançada"
        descricao="Entram aqui os lançamentos a pagar em centros de imobilizado ou com a categoria Aquisição de Equipamento ou Consórcio a contemplar."
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {temEquipamento ? (
        <Secao titulo="Equipamentos adquiridos">
          <TabelaEquipamentos linhas={linhas} podeVerLancamentos={podeVerLancamentos} />
        </Secao>
      ) : null}
      {temConsorcio ? (
        <Secao
          titulo="Consórcios"
          nota="Cotas ainda a contemplar ficam em Aquisição de Equipamentos › Consórcios a contemplar; contemplada, a cota vai para a etapa do bem."
        >
          <TabelaConsorcios linhas={linhas} podeVerLancamentos={podeVerLancamentos} />
        </Secao>
      ) : null}
    </div>
  );
}
