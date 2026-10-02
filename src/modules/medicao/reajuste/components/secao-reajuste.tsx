"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronRight, FilePlus2, FileUp, Percent } from "lucide-react";

import { CelulaVazia, DataTable, EmptyState, MoneyText, SecaoDetalhe } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { Button } from "@/components/ui/button";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { dinheiroTexto } from "@/modules/medicao/alertas/formato";
import { decimalPtBr } from "@/modules/medicao/planilha/formato";
import { HistoricoReajuste } from "@/modules/medicao/reajuste/components/historico-reajuste";
import { ImportarSiacDrawer } from "@/modules/medicao/reajuste/components/importar-siac-drawer";
import { ReajusteManualDrawer } from "@/modules/medicao/reajuste/components/reajuste-manual-drawer";
import { SeloSituacaoReajuste } from "@/modules/medicao/reajuste/components/selo-situacao-reajuste";
import { diferencaReajuste, rotuloOrigemReajuste } from "@/modules/medicao/reajuste/formato";
import type { IndiceSiac, LinhaReajuste, PdfPendente, ReajusteMedicao } from "@/modules/medicao/reajuste/tipos";

const TAMANHO_PAGINA = 100;

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

const colunasLinhas: ColumnDef<LinhaReajuste, unknown>[] = [
  {
    accessorKey: "grupo",
    header: "Grupo",
    size: 70,
    meta: { fixa: true, atomico: true, celular: "titulo" },
    cell: ({ row }) => (
      <span className="font-mono" title={row.original.grupoDescricao ?? undefined}>
        {row.original.grupo}
      </span>
    ),
  },
  { accessorKey: "codigo", header: "Código SICRO", size: 100, meta: { atomico: true }, cell: ({ row }) => <span className="font-mono">{row.original.codigo}</span> },
  { accessorKey: "descricao", header: "Descrição", size: 280 },
  { accessorKey: "unidade", header: "Unid.", size: 60, meta: { atomico: true, celular: "oculta" } },
  {
    accessorKey: "valorPi",
    header: "Valor a PI (DNIT)",
    size: 140,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorPi} />,
  },
  {
    accessorKey: "fator",
    header: "Fator",
    size: 90,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{decimalPtBr(row.original.fator)}</span>,
  },
  {
    accessorKey: "reajuste",
    header: "Reajuste",
    size: 130,
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => <MoneyText valor={row.original.reajuste} />,
  },
  {
    id: "rateio",
    header: "Itens rateados",
    size: 240,
    meta: { naoTruncar: true, celular: "destaque" },
    cell: ({ row }) => {
      const rateio = row.original.rateio;
      if (rateio.length === 0) return <CelulaVazia />;
      const rotulo = (r: (typeof rateio)[number]) => `${r.codigo ?? "item"} · ${dinheiroTexto(r.valor)}`;
      if (rateio.length === 1) return <span className="tabular-nums">{rotulo(rateio[0])}</span>;
      return (
        <ul className="flex flex-col gap-0.5 tabular-nums">
          {rateio.map((r) => (
            <li key={r.itemId}>{rotulo(r)}</li>
          ))}
        </ul>
      );
    },
  },
];

const colunasIndices: ColumnDef<IndiceSiac, unknown>[] = [
  { accessorKey: "sigla", header: "Sigla", size: 100, meta: { fixa: true, atomico: true } },
  { accessorKey: "i0", header: "I0", size: 120, meta: { alinharDireita: true, atomico: true }, cell: ({ row }) => <span className="tabular-nums">{decimalPtBr(row.original.i0)}</span> },
  { accessorKey: "i1", header: "I1", size: 120, meta: { alinharDireita: true, atomico: true }, cell: ({ row }) => <span className="tabular-nums">{decimalPtBr(row.original.i1)}</span> },
  { accessorKey: "k", header: "K", size: 120, meta: { alinharDireita: true, atomico: true }, cell: ({ row }) => <span className="tabular-nums">{decimalPtBr(row.original.k)}</span> },
];

export interface SecaoReajusteProps {
  medicaoId: string;
  numero: number;
  /** Valor da medição do banco (texto); nulo sem regra de arredondamento. */
  valorMedicao: string | null;
  reajuste: ReajusteMedicao;
  /** PDFs anexados à medição que ainda não viraram relatório. */
  pendentes: PdfPendente[];
  /** Anexos `mc_reajuste` da medição (o PDF de cada relatório e os pendentes). */
  anexos: AnexoDoDocumento[];
  /** `medicao.reajuste/editar`, lido no servidor: libera o Excluir. */
  podeEditar: boolean;
  /** Editar E medição enviada ou aprovada, calculado no servidor: libera importar e lançar. */
  podeLancar: boolean;
}

/**
 * Seção Reajuste do detalhe da medição (Fase 6): o relatório que vale (total, situação, origem, a
 * diferença para o anterior feita no banco e, no SIAC, o valor a PI do DNIT ao lado do valor da
 * medição), as linhas com os itens rateados, os índices (recolhíveis) e o histórico de todos os
 * relatórios. Todo número vem do banco como texto e só é formatado (D7).
 */
export function SecaoReajuste({ medicaoId, numero, valorMedicao, reajuste, pendentes, anexos, podeEditar, podeLancar }: SecaoReajusteProps) {
  const router = useRouter();
  const [importarAberto, setImportarAberto] = React.useState(false);
  // Cada abertura do importar nasce limpa (nova chave), sem leitura nem prévia da vez anterior.
  const [aberturas, setAberturas] = React.useState(0);
  const [manualAberto, setManualAberto] = React.useState(false);
  const [indicesAbertos, setIndicesAbertos] = React.useState(false);
  const atualizar = () => semDerrubarSucesso("medicao.reajuste.secao", () => router.refresh());

  const { vigente, relatorios, linhas, indices } = reajuste;
  const relatorioVigente = vigente ? relatorios.find((r) => r.id === vigente.relatorioId) ?? null : null;
  // Só relatório que vale (não excluído) prende o PDF: o anexo faz dedup por conteúdo, então o mesmo
  // PDF reenviado volta com o arquivo do relatório excluído, e tem de dar para ler de novo.
  const arquivosEmRelatorio = React.useMemo(
    () => relatorios.filter((r) => r.excluidoEm === null).map((r) => r.arquivoId).filter((a): a is string => a !== null),
    [relatorios],
  );

  const acoes = podeLancar ? (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setAberturas((n) => n + 1);
          setImportarAberto(true);
        }}
      >
        <FileUp />
        Importar relatório SIAC
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setManualAberto(true)}>
        <FilePlus2 />
        Lançar sem relatório
      </Button>
    </div>
  ) : undefined;

  return (
    <SecaoDetalhe titulo="Reajuste" card acao={acoes}>
      {!vigente ? (
        <EmptyState
          icone={Percent}
          titulo="Nenhum reajuste registrado nesta medição"
          descricao={podeLancar ? "Importe o PDF do Resumo da Medição do SIAC ou lance o total sem relatório" : undefined}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div data-secao="reajuste-vigente" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Dado rotulo="Reajuste">
              <MoneyText valor={vigente.total} className="font-semibold" />
            </Dado>
            <Dado rotulo="Situação">
              <SeloSituacaoReajuste situacao={vigente.situacao} />
            </Dado>
            <Dado rotulo="Origem">{vigente.origem === "siac" ? `SIAC nº ${vigente.sequencia}` : rotuloOrigemReajuste(vigente.origem)}</Dado>
            <Dado rotulo="Diferença para o anterior">
              {vigente.diferenca === null ? "Primeiro relatório" : diferencaReajuste(vigente.diferenca).texto}
            </Dado>
            {vigente.origem === "siac" ? (
              <>
                <Dado rotulo="Valor a PI (DNIT)">
                  {relatorioVigente?.valorPi ? <MoneyText valor={relatorioVigente.valorPi} /> : <CelulaVazia />}
                </Dado>
                <Dado rotulo="Valor da medição">
                  {valorMedicao === null ? "Sem regra de arredondamento" : <MoneyText valor={valorMedicao} />}
                </Dado>
              </>
            ) : null}
          </div>

          {vigente.origem === "siac" ? (
            <>
              <div data-secao="reajuste-linhas">
                <DataTable
                  idTabela="medicao.reajuste.linhas"
                  columns={colunasLinhas}
                  data={linhas}
                  idDaLinha={(l) => l.id}
                  pageSize={TAMANHO_PAGINA}
                  rodape={{ reajuste: <MoneyText valor={vigente.total} /> }}
                />
              </div>
              {indices.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    aria-expanded={indicesAbertos}
                    onClick={() => setIndicesAbertos((v) => !v)}
                  >
                    {indicesAbertos ? <ChevronDown /> : <ChevronRight />}
                    {indicesAbertos ? `Esconder índices (${indices.length})` : `Mostrar índices (${indices.length})`}
                  </Button>
                  {indicesAbertos ? (
                    <DataTable idTabela="medicao.reajuste.indices" columns={colunasIndices} data={indices} idDaLinha={(i) => i.sigla} pageSize={TAMANHO_PAGINA} />
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-detalhe text-muted-foreground">
              Lançamento manual, sem rateio por item: conta só no total da medição e no Boletim.
              {relatorioVigente?.observacao ? ` ${relatorioVigente.observacao}` : ""}
            </p>
          )}
        </div>
      )}

      {relatorios.length > 0 ? (
        <div className="mt-6 flex flex-col gap-3">
          <h3 className="text-corpo font-semibold">Relatórios</h3>
          <HistoricoReajuste
            medicaoId={medicaoId}
            relatorios={relatorios}
            vigente={vigente}
            anexos={anexos}
            podeEditar={podeEditar}
            onExcluido={atualizar}
          />
        </div>
      ) : null}

      {podeLancar ? (
        <>
          <ImportarSiacDrawer
            key={aberturas}
            aberto={importarAberto}
            onAbertoChange={setImportarAberto}
            medicaoId={medicaoId}
            numero={numero}
            anexos={anexos}
            pendentes={pendentes}
            arquivosEmRelatorio={arquivosEmRelatorio}
            onGravado={atualizar}
          />
          <ReajusteManualDrawer
            aberto={manualAberto}
            onAbertoChange={setManualAberto}
            medicaoId={medicaoId}
            numero={numero}
            pendentes={pendentes}
            onLancado={atualizar}
          />
        </>
      ) : null}
    </SecaoDetalhe>
  );
}
