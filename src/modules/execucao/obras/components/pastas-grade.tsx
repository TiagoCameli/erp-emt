"use client";

import Link from "next/link";
import { FolderOpen } from "lucide-react";

import { EmptyState, StatusBadge } from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { ROTULO_TIPO_OBRA } from "@/modules/execucao/_shared/rotulos";
import type { Pasta } from "@/modules/execucao/obras/queries";
import { NovoCronogramaDrawer, type CalendarioOpcao, type ObraOpcao } from "@/modules/execucao/obras/components/novo-cronograma-drawer";

function textoCronogramas(p: Pasta): string {
  const n = p.nCronogramas;
  return `${n} ${n === 1 ? "cronograma" : "cronogramas"} (${p.nAtivos} ${p.nAtivos === 1 ? "ativo" : "ativos"}, ${p.nRascunhos} em rascunho)`;
}

export interface PastasGradeProps {
  pastas: Pasta[];
  podeCriar: boolean;
  obras?: ObraOpcao[];
  calendarios?: CalendarioOpcao[];
}

/** Uma pasta por obra com cronograma. Saúde, PPC e material faltando chegam nas fases 3 e 5. */
export function PastasGrade({ pastas, podeCriar, obras = [], calendarios = [] }: PastasGradeProps) {
  if (pastas.length === 0) {
    return (
      <EmptyState
        icone={FolderOpen}
        titulo="Nenhuma obra no módulo ainda"
        descricao="A pasta da obra aparece quando ela ganha o primeiro cronograma"
        acao={podeCriar ? <NovoCronogramaDrawer obras={obras} calendarios={calendarios} /> : undefined}
      />
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {pastas.map((p) => (
        <Link
          key={p.obraId}
          href={`/execucao/obras/${p.obraId}`}
          className="faixa-esquerda flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 font-semibold">{p.obraNome}</span>
            <StatusBadge status={p.tipoObra} rotulo={ROTULO_TIPO_OBRA[p.tipoObra] ?? p.tipoObra} discreto />
          </div>
          <p className="text-detalhe text-muted-foreground">{textoCronogramas(p)}</p>
          <p className="text-detalhe text-muted-foreground">Início previsto {formatarData(p.inicioPrevisto) || "-"}</p>
          <p className="text-detalhe text-muted-foreground">Término previsto {formatarData(p.terminoPrevisto) || "-"}</p>
        </Link>
      ))}
    </div>
  );
}
