"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { StatusBadge } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import {
  STATUS_CHECKLIST,
  type StatusChecklist,
} from "@/modules/manutencao/_shared/formato";
import type { ExecucaoDetalhe } from "@/modules/manutencao/checklists/queries";
import {
  ROTULO_RESPOSTA,
  type RespostaChecklist,
} from "@/modules/manutencao/checklists/schemas";

/** Badge da resposta de um item: OK verde, Não OK vermelho, N/A neutro. */
function badgeResposta(resposta: string) {
  if (resposta === "ok") {
    return <StatusBadge status="aprovado" rotulo={ROTULO_RESPOSTA.ok} />;
  }
  if (resposta === "nok") {
    return <StatusBadge status="rejeitado" rotulo={ROTULO_RESPOSTA.nok} />;
  }
  if (resposta === "na") {
    return <StatusBadge status="rascunho" rotulo={ROTULO_RESPOSTA.na} />;
  }
  return (
    <StatusBadge
      status="rascunho"
      rotulo={ROTULO_RESPOSTA[resposta as RespostaChecklist] ?? resposta}
    />
  );
}

/** Linha rotulada do cabeçalho. */
function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

export interface ExecucaoDetalheViewProps {
  execucao: ExecucaoDetalhe;
}

/** Detalhe de uma execução de checklist: cabeçalho + respostas item a item. */
export function ExecucaoDetalheView({ execucao }: ExecucaoDetalheViewProps) {
  const router = useRouter();
  const info = STATUS_CHECKLIST[execucao.status as StatusChecklist];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Voltar"
            onClick={() => router.push("/manutencao/checklists")}
          >
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-titulo font-semibold">
              {execucao.checklistNome}
            </h1>
            <p className="text-detalhe text-muted-foreground">
              {execucao.equipamentoDescricao}
              {execucao.equipamentoPlaca
                ? ` (${execucao.equipamentoPlaca})`
                : ""}
            </p>
          </div>
        </div>
        {info ? <StatusBadge status={info.badge} rotulo={info.rotulo} /> : null}
      </div>

      <section className="rounded-md border border-border bg-surface p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Dado rotulo="Data">{formatarData(execucao.data)}</Dado>
          <Dado rotulo="Operador">{execucao.operadorNome ?? "-"}</Dado>
          {execucao.horimetro !== null ? (
            <Dado rotulo="Horímetro">
              {formatarQuantidade(execucao.horimetro)}
            </Dado>
          ) : null}
          {execucao.km !== null ? (
            <Dado rotulo="Quilometragem">
              {formatarQuantidade(execucao.km)}
            </Dado>
          ) : null}
        </div>
        {execucao.observacao ? (
          <div className="mt-4">
            <Dado rotulo="Observação geral">{execucao.observacao}</Dado>
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="mb-3 text-secao font-semibold">Respostas</h2>
        <ul className="flex flex-col gap-2">
          {execucao.respostas.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-detalhe">{item.pergunta}</span>
                {badgeResposta(item.resposta)}
              </div>
              {item.observacao ? (
                <p className="text-legenda text-muted-foreground">
                  {item.observacao}
                </p>
              ) : null}
              {item.osId ? (
                <a
                  href={`/manutencao/ordens-servico/${item.osId}`}
                  className="inline-flex w-fit items-center gap-1 text-legenda text-status-rejeitado hover:underline"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  OS aberta para este item
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
