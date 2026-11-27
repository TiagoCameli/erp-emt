"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, LoaderCircle } from "lucide-react";

import { CelulaVazia, DataTable, EmptyState, StatusBadge } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { baixarBase64 } from "@/lib/download";
import { formatarDataHoraRioBranco, formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import type { MediaGrupo, PontoMensal, TrechoLinha } from "@/modules/combustivel/consumo/calculo";
import { carregarHistoricoVeiculo, gerarPlanilhaConsumo } from "@/modules/combustivel/consumo/actions";
import { GraficoMensalConsumo } from "@/modules/combustivel/consumo/components/grafico-mensal";
import type { LinhaConsumo } from "@/modules/combustivel/consumo/servico";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";

function decimal(valor: number | null, casas: number): React.ReactNode {
  if (valor === null) return <CelulaVazia />;
  return (
    <span className="tabular-nums">
      {valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}
    </span>
  );
}

function leitura(valor: number | null, unidade: "km" | "h"): React.ReactNode {
  if (valor === null) return <CelulaVazia />;
  return (
    <span className="tabular-nums">
      {valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {unidade}
    </span>
  );
}

/** R$/km e R$/h são taxa (multiplicam km e h): 4 casas, como o preço do litro. */
function reaisPor(valor: number | null): React.ReactNode {
  return valor === null ? <CelulaVazia /> : <span className="tabular-nums">{formatarValorOperacional(valor)}</span>;
}

const direita = { alinharDireita: true } as const;

function textoDestaque(l: LinhaConsumo): string | null {
  if (!l.destaque) return null;
  const partes = [
    l.destaque.kmPercentual !== null ? `L/km +${l.destaque.kmPercentual.toFixed(0)}%` : null,
    l.destaque.hPercentual !== null ? `L/h +${l.destaque.hPercentual.toFixed(0)}%` : null,
  ].filter(Boolean);
  return partes.join(" · ");
}

const COLUNAS: ColumnDef<LinhaConsumo, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Veículo / máquina",
    size: 260,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span>{row.original.nome}</span>
        {row.original.destaque ? (
          <span className="mt-0.5">
            <StatusBadge status="pendente" rotulo={`Acima da média: ${textoDestaque(row.original)}`} />
          </span>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "placa",
    header: "Placa",
    size: 100,
    cell: ({ row }) => (row.original.placa ? <span className="codigo-doc">{row.original.placa}</span> : <CelulaVazia />),
  },
  { accessorKey: "tipo", header: "Tipo", size: 150 },
  { accessorKey: "obra", header: "Obra", size: 180, cell: ({ row }) => row.original.obra ?? <CelulaVazia /> },
  { accessorKey: "leituraInicialKm", header: "Odômetro inicial", size: 120, meta: direita, cell: ({ row }) => leitura(row.original.leituraInicialKm, "km") },
  { accessorKey: "leituraFinalKm", header: "Odômetro final", size: 120, meta: direita, cell: ({ row }) => leitura(row.original.leituraFinalKm, "km") },
  { accessorKey: "leituraInicialH", header: "Horímetro inicial", size: 120, meta: direita, cell: ({ row }) => leitura(row.original.leituraInicialH, "h") },
  { accessorKey: "leituraFinalH", header: "Horímetro final", size: 120, meta: direita, cell: ({ row }) => leitura(row.original.leituraFinalH, "h") },
  { accessorKey: "km", header: "Km rodados", size: 110, meta: direita, cell: ({ row }) => (row.original.trechosKm > 0 ? leitura(row.original.km, "km") : <CelulaVazia />) },
  { accessorKey: "h", header: "Horas", size: 100, meta: direita, cell: ({ row }) => (row.original.trechosH > 0 ? leitura(row.original.h, "h") : <CelulaVazia />) },
  { accessorKey: "litros", header: "Litros", size: 110, meta: direita, cell: ({ row }) => <span className="tabular-nums">{formatarLitros(row.original.litros)}</span> },
  { accessorKey: "lPorKm", header: "L/km", size: 80, meta: direita, cell: ({ row }) => decimal(row.original.lPorKm, 3) },
  { accessorKey: "kmPorL", header: "km/L", size: 80, meta: direita, cell: ({ row }) => decimal(row.original.kmPorL, 2) },
  { accessorKey: "lPorH", header: "L/h", size: 80, meta: direita, cell: ({ row }) => decimal(row.original.lPorH, 2) },
  { accessorKey: "rPorKm", header: "R$/km", size: 100, meta: direita, cell: ({ row }) => reaisPor(row.original.rPorKm) },
  { accessorKey: "rPorH", header: "R$/h", size: 100, meta: direita, cell: ({ row }) => reaisPor(row.original.rPorH) },
  { accessorKey: "abastecimentos", header: "Abastecimentos", size: 120, meta: direita, cell: ({ row }) => <span className="tabular-nums">{row.original.abastecimentos}</span> },
  { accessorKey: "semLeitura", header: "Sem leitura", size: 100, meta: direita, cell: ({ row }) => <span className="tabular-nums">{row.original.semLeitura}</span> },
];

const COLUNAS_MEDIAS: ColumnDef<MediaGrupo, unknown>[] = [
  { accessorKey: "grupo", header: "Grupo", size: 200, cell: ({ row }) => <span className={row.original.grupo === "Frota" ? "font-semibold" : undefined}>{row.original.grupo}</span> },
  { accessorKey: "veiculos", header: "Veículos", size: 90, meta: direita, cell: ({ row }) => <span className="tabular-nums">{row.original.veiculos}</span> },
  { accessorKey: "km", header: "Km rodados", size: 110, meta: direita, cell: ({ row }) => (row.original.km > 0 ? leitura(row.original.km, "km") : <CelulaVazia />) },
  { accessorKey: "h", header: "Horas", size: 100, meta: direita, cell: ({ row }) => (row.original.h > 0 ? leitura(row.original.h, "h") : <CelulaVazia />) },
  { accessorKey: "lPorKm", header: "L/km", size: 80, meta: direita, cell: ({ row }) => decimal(row.original.lPorKm, 3) },
  { accessorKey: "kmPorL", header: "km/L", size: 80, meta: direita, cell: ({ row }) => decimal(row.original.kmPorL, 2) },
  { accessorKey: "lPorH", header: "L/h", size: 80, meta: direita, cell: ({ row }) => decimal(row.original.lPorH, 2) },
  { accessorKey: "rPorKm", header: "R$/km", size: 100, meta: direita, cell: ({ row }) => reaisPor(row.original.rPorKm) },
  { accessorKey: "rPorH", header: "R$/h", size: 100, meta: direita, cell: ({ row }) => reaisPor(row.original.rPorH) },
];

const COLUNAS_HISTORICO: ColumnDef<TrechoLinha, unknown>[] = [
  { accessorKey: "data", header: "Abastecimento", size: 140, cell: ({ row }) => <span className="tabular-nums">{formatarDataHoraRioBranco(row.original.data)}</span> },
  {
    accessorKey: "odometroKm",
    header: "Odômetro",
    size: 110,
    meta: direita,
    cell: ({ row }) => (
      <span className="flex flex-col items-end">
        {leitura(row.original.odometroKm, "km")}
        {row.original.virada ? <span className="text-legenda text-status-pendente">virada</span> : null}
      </span>
    ),
  },
  { accessorKey: "horimetroH", header: "Horímetro", size: 100, meta: direita, cell: ({ row }) => leitura(row.original.horimetroH, "h") },
  { accessorKey: "kmTrecho", header: "Km no trecho", size: 100, meta: direita, cell: ({ row }) => leitura(row.original.kmTrecho, "km") },
  { accessorKey: "hTrecho", header: "h no trecho", size: 90, meta: direita, cell: ({ row }) => leitura(row.original.hTrecho, "h") },
  { accessorKey: "litros", header: "Litros", size: 90, meta: direita, cell: ({ row }) => <span className="tabular-nums">{formatarLitros(row.original.litros)}</span> },
  {
    id: "consumo",
    header: "Consumo do trecho",
    size: 150,
    meta: direita,
    cell: ({ row }) => {
      const t = row.original;
      const partes = [
        t.kmTrecho && t.litrosKm ? `${(t.kmTrecho / t.litrosKm).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km/L` : null,
        t.hTrecho && t.litrosH ? `${(t.litrosH / t.hTrecho).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L/h` : null,
      ].filter(Boolean);
      if (partes.length === 0) {
        return <span className="text-muted-foreground">{t.odometroKm === null && t.horimetroH === null ? "Sem leitura" : "Início"}</span>;
      }
      return (
        <span className={t.saltoKm || t.saltoH || t.consumoForaKm || t.consumoForaH ? "tabular-nums text-status-pendente" : "tabular-nums"}>
          {partes.join(" · ")}
        </span>
      );
    },
  },
];

export interface ConsumoTabelaProps {
  linhas: LinhaConsumo[];
  medias: MediaGrupo[];
}

/** Relatórios > Consumo: médias por tipo, a tabela por veículo, o histórico e o Excel. */
export function ConsumoTabela({ linhas, medias }: ConsumoTabelaProps) {
  const params = useSearchParams();
  const [exportando, setExportando] = React.useState(false);
  const [aberto, setAberto] = React.useState<LinhaConsumo | null>(null);
  const [historico, setHistorico] = React.useState<{ chave: string; trechos: TrechoLinha[]; mensal: PontoMensal[] } | null>(null);

  async function exportar() {
    setExportando(true);
    try {
      const resultado = await gerarPlanilhaConsumo(params.toString());
      if ("erro" in resultado) toast.error(resultado.erro);
      else baixarBase64(resultado.base64, resultado.nomeArquivo);
    } finally {
      setExportando(false);
    }
  }

  async function abrir(linha: LinhaConsumo) {
    setAberto(linha);
    if (historico?.chave === linha.chave) return;
    setHistorico(null);
    const resultado = await carregarHistoricoVeiculo(linha.chave);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    setHistorico({ chave: linha.chave, trechos: resultado.trechos, mensal: resultado.mensal });
  }

  const doVeiculo = aberto && historico?.chave === aberto.chave ? historico : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-secao font-semibold">Média por tipo e da frota</h2>
        <DataTable idTabela="combustivel.consumo.medias" columns={COLUNAS_MEDIAS} data={medias} pageSize={50} />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-secao font-semibold">Por veículo e máquina</h2>
          <Button type="button" variant="outline" onClick={exportar} disabled={exportando}>
            {exportando ? <LoaderCircle className="animate-spin" /> : <Download />}
            {exportando ? "Gerando planilha..." : "Exportar Excel"}
          </Button>
        </div>
        <DataTable
          idTabela="combustivel.consumo.veiculos"
          columns={COLUNAS}
          data={linhas}
          searchKey="nome"
          searchPlaceholder="Buscar veículo, código ou placa"
          onRowClick={abrir}
          emptyState={
            <EmptyState
              titulo="Nenhum veículo com abastecimento no recorte"
              descricao="Ajuste o período ou os filtros"
            />
          }
        />
      </section>

      <Sheet open={aberto !== null} onOpenChange={(v) => !v && setAberto(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-4xl">
          <SheetHeader className="border-b border-border">
            <SheetTitle>{aberto?.nome ?? "Veículo"}</SheetTitle>
            <SheetDescription>
              {aberto ? `${aberto.tipo}${aberto.placa ? ` · ${aberto.placa}` : ""} · histórico completo de abastecimentos` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 p-4">
            {doVeiculo ? (
              <>
                <GraficoMensalConsumo pontos={doVeiculo.mensal} />
                <DataTable idTabela="combustivel.consumo.historico" columns={COLUNAS_HISTORICO} data={doVeiculo.trechos} pageSize={25} />
              </>
            ) : (
              <p className="flex items-center gap-2 text-detalhe text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> Carregando o histórico...
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
