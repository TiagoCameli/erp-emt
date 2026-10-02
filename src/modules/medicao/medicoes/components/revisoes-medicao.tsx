"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { GitCompareArrows } from "lucide-react";

import { CelulaVazia, Combobox, DataTable, EmptyState, StatusBadge } from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { numeroExibicao } from "@/modules/medicao/planilha/formato";
import { ROTULO_FASE_REVISAO, rotuloRevisao, rotuloStatusRevisao, type FaseRevisao } from "@/modules/medicao/_shared/rotulos";
import { compararRevisoes, type ItemCongelado, type LinhaComparacao, type RotuloItem } from "@/modules/medicao/medicoes/aprovacao";
import type { RevisaoMedicao } from "@/modules/medicao/medicoes/tipos";

/** Cor do selo da revisão: aprovada verde, enviada pendente, em aberto rascunho, substituída apagada. */
const COR_REVISAO: Record<string, string> = {
  em_aberto: "rascunho",
  enviada: "pendente_aprovacao",
  aprovada: "aprovado",
  substituida: "cancelado",
};

const rotuloFase = (fase: string) => (fase in ROTULO_FASE_REVISAO ? ROTULO_FASE_REVISAO[fase as FaseRevisao] : fase);

const colunasRevisoes: ColumnDef<RevisaoMedicao, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Revisão",
    size: 100,
    meta: { fixa: true, atomico: true },
    cell: ({ row }) => <span className="font-mono">{rotuloRevisao(row.original.numero)}</span>,
  },
  {
    accessorKey: "fase",
    header: "Fase",
    size: 160,
    cell: ({ row }) => rotuloFase(row.original.fase),
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 140,
    cell: ({ row }) => (
      <StatusBadge status={COR_REVISAO[row.original.status] ?? row.original.status} rotulo={rotuloStatusRevisao(row.original.status)} />
    ),
  },
  {
    accessorKey: "motivo",
    header: "Motivo",
    size: 320,
    cell: ({ row }) => row.original.motivo ?? <CelulaVazia />,
  },
  {
    accessorKey: "criadoEm",
    header: "Aberta em",
    size: 120,
    meta: { atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{formatarData(row.original.criadoEm)}</span>,
  },
];

function Numero({ valor }: { valor: string }) {
  return <span className="tabular-nums">{numeroExibicao(valor)}</span>;
}

/** Diferença com sinal: "+1" acrescentou, "-2" tirou, "0" igual. */
function Diferenca({ valor }: { valor: string }) {
  const texto = numeroExibicao(valor);
  const positivo = !valor.startsWith("-") && valor !== "0";
  return <span className={valor === "0" ? "tabular-nums" : "font-medium tabular-nums"}>{positivo ? `+${texto}` : texto}</span>;
}

function colunasComparacao(de: string, para: string): ColumnDef<LinhaComparacao, unknown>[] {
  return [
    {
      accessorKey: "codigo",
      header: "Código",
      size: 110,
      meta: { fixa: true, atomico: true },
      cell: ({ row }) => (row.original.codigo ? <span className="font-mono">{row.original.codigo}</span> : <CelulaVazia />),
    },
    {
      accessorKey: "descricao",
      header: "Descrição",
      size: 300,
      cell: ({ row }) => row.original.descricao ?? <CelulaVazia />,
    },
    {
      accessorKey: "unidade",
      header: "Unid.",
      size: 70,
      meta: { atomico: true },
      cell: ({ row }) => row.original.unidade ?? <CelulaVazia />,
    },
    {
      accessorKey: "de",
      header: de,
      size: 120,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <Numero valor={row.original.de} />,
    },
    {
      accessorKey: "para",
      header: para,
      size: 120,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <Numero valor={row.original.para} />,
    },
    {
      accessorKey: "diferenca",
      header: "Diferença",
      size: 120,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <Diferenca valor={row.original.diferenca} />,
    },
  ];
}

export interface RevisoesMedicaoProps {
  revisoes: RevisaoMedicao[];
  /** Quantidades congeladas no envio de cada revisão (`mc_revisao_itens`). */
  congelados: ItemCongelado[];
  /** Código, descrição e unidade dos itens, na ordem da planilha. */
  rotulos: RotuloItem[];
}

/**
 * Revisões da medição (Fase 5, Task 4): a lista REV00..REVnn com fase, status e motivo, e a
 * comparação item a item de duas revisões escolhidas (quantidade congelada de cada uma e a
 * diferença, a segunda menos a primeira). Só entra na comparação revisão com quantidade congelada
 * (a em aberto ainda não tem; a de carga não tem). Começa pelas duas últimas e volta para elas
 * quando a lista muda. A revisão escolhida num lado não é opção do outro. Contas de quantidade, exatas e só
 * de exibição (D7).
 */
export function RevisoesMedicao({ revisoes, congelados, rotulos }: RevisoesMedicaoProps) {
  // Comparável é a revisão com quantidade congelada: a em aberto ainda não tem, e a medição de carga
  // (L09, L10) tem revisão aprovada sem nenhuma linha em `mc_revisao_itens`.
  const comCongelado = React.useMemo(() => new Set(congelados.map((c) => c.revisaoId)), [congelados]);
  const comparaveis = React.useMemo(() => revisoes.filter((r) => comCongelado.has(r.id)), [revisoes, comCongelado]);
  const semCongeladoEnviada = revisoes.some((r) => r.status !== "em_aberto" && !comCongelado.has(r.id));

  const chave = comparaveis.map((r) => r.id).join(",");
  const padrao = (): [string, string] => [comparaveis[comparaveis.length - 2]?.id ?? "", comparaveis[comparaveis.length - 1]?.id ?? ""];
  const [selecao, setSelecao] = React.useState<{ chave: string; de: string; para: string }>(() => {
    const [de, para] = padrao();
    return { chave, de, para };
  });
  // A lista mudou (ex.: router.refresh() depois de enviar uma revisão): volta para as duas últimas.
  // Ajuste no render, sem efeito, como no drawer de aprovação.
  if (selecao.chave !== chave) {
    const [de, para] = padrao();
    setSelecao({ chave, de, para });
  }
  const deId = selecao.chave === chave ? selecao.de : padrao()[0];
  const paraId = selecao.chave === chave ? selecao.para : padrao()[1];

  const opcao = (r: RevisaoMedicao) => ({ valor: r.id, rotulo: `${rotuloRevisao(r.numero)} · ${rotuloStatusRevisao(r.status)}` });
  // A revisão escolhida num lado sai das opções do outro: comparar uma revisão com ela mesma não diz nada.
  const opcoesDe = comparaveis.filter((r) => r.id !== paraId).map(opcao);
  const opcoesPara = comparaveis.filter((r) => r.id !== deId).map(opcao);
  const de = comparaveis.find((r) => r.id === deId) ?? null;
  const para = comparaveis.find((r) => r.id === paraId) ?? null;

  const linhas = React.useMemo(
    () => (de && para ? compararRevisoes(congelados, de.id, para.id, rotulos) : []),
    [congelados, de, para, rotulos],
  );
  const colunas = React.useMemo(
    () => colunasComparacao(de ? rotuloRevisao(de.numero) : "", para ? rotuloRevisao(para.numero) : ""),
    [de, para],
  );

  return (
    <div className="flex flex-col gap-6">
      <div data-testid="revisoes-lista">
        <DataTable idTabela="medicao.medicoes.revisoes" columns={colunasRevisoes} data={revisoes} idDaLinha={(r) => r.id} />
      </div>

      <div data-testid="revisoes-comparacao" className="flex flex-col gap-3">
        <h3 className="text-detalhe font-medium">Comparar revisões</h3>
        {comparaveis.length < 2 ? (
          semCongeladoEnviada ? (
            <EmptyState
              icone={GitCompareArrows}
              titulo="Medição carregada da planilha: sem quantidades congeladas para comparar"
              descricao="A comparação usa a quantidade congelada no envio de cada revisão, e esta medição veio da carga sem esse registro."
            />
          ) : (
            <EmptyState
              icone={GitCompareArrows}
              titulo="A comparação precisa de duas revisões enviadas"
              descricao="Cada envio congela a quantidade medida de cada item; com duas revisões enviadas, aparece aqui o que mudou de uma para a outra."
            />
          )
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="w-full sm:w-56">
                <Combobox id="comparar-de" ariaLabel="Comparar" valor={deId} onValorChange={(v) => setSelecao({ chave, de: v, para: paraId })} opcoes={opcoesDe} placeholder="Revisão" />
              </div>
              <span className="text-detalhe text-muted-foreground">com</span>
              <div className="w-full sm:w-56">
                <Combobox id="comparar-para" ariaLabel="Com" valor={paraId} onValorChange={(v) => setSelecao({ chave, de: deId, para: v })} opcoes={opcoesPara} placeholder="Revisão" />
              </div>
            </div>
            <DataTable columns={colunas} data={linhas} idDaLinha={(l) => l.itemId} />
          </>
        )}
      </div>
    </div>
  );
}
