"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Info, Link2, LoaderCircle } from "lucide-react";

import { MoneyText, StatusBadge } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarData } from "@/lib/formatadores";
import { casarGrupo } from "@/modules/financeiro/conciliacao/actions";
import type { GrupoEquivalente } from "@/modules/financeiro/conciliacao/casamento";
import type {
  CandidatoDoPainel,
  TransacaoPainel,
} from "@/modules/financeiro/conciliacao/painel";

export interface GrupoDialogProps {
  /** Null fecha. Com vários, "Revisar N grupos" passa de um para o outro. */
  grupos: GrupoEquivalente[] | null;
  onFechar: () => void;
  transacoes: Map<string, TransacaoPainel>;
  candidatos: Map<string, CandidatoDoPainel>;
}

/**
 * Casar um grupo equivalente (Bloco J): N movimentos e N parcelas de mesmo
 * valor e dia, lado a lado. A pessoa revisa e confirma de uma vez.
 */
export function GrupoDialog({ grupos, onFechar, transacoes, candidatos }: GrupoDialogProps) {
  const router = useRouter();
  const [indice, setIndice] = React.useState(0);
  const [feitos, setFeitos] = React.useState<Set<number>>(new Set());
  const [enviando, setEnviando] = React.useState(false);

  const lista = grupos ?? [];
  const grupo = lista[indice];

  async function casar() {
    if (!grupo) return;
    setEnviando(true);
    const resposta = await casarGrupo(grupo.pares);
    setEnviando(false);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    if (resposta.falhas.length > 0) {
      toast.error(`${resposta.feitos} casados, ${resposta.falhas.length} com erro: ${resposta.falhas[0]?.erro}`);
    } else {
      toast.success(`Grupo de ${grupo.pares.length} casado`);
    }
    const novos = new Set(feitos).add(indice);
    setFeitos(novos);
    const proximo = lista.findIndex((_, i) => !novos.has(i));
    if (proximo === -1) {
      onFechar();
      router.refresh();
    } else {
      setIndice(proximo);
    }
  }

  function fechar() {
    if (enviando) return;
    if (feitos.size > 0) router.refresh();
    onFechar();
  }

  return (
    <Dialog open={grupos !== null} onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Casar grupo de {grupo?.pares.length ?? 0}
            {lista.length > 1 ? ` (${indice + 1} de ${lista.length})` : ""}
          </DialogTitle>
          <DialogDescription>
            Movimentos do banco e lançamentos do app com o mesmo valor no mesmo dia.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Info />
          <AlertDescription>
            Os valores e o dia são iguais; a ordem não muda saldo nem resultado. Os pares sem nome
            batendo ficam no filtro &quot;Para conferir&quot; dos Casados.
          </AlertDescription>
        </Alert>

        {grupo ? (
          <ul className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
            {grupo.pares.map((par) => {
              const t = transacoes.get(par.transacaoId);
              const c = candidatos.get(par.alvoId);
              return (
                <li
                  key={par.transacaoId}
                  className="grid gap-2 rounded-md border border-border px-3 py-2 text-sm md:grid-cols-[1fr_1fr_auto]"
                >
                  <span className="min-w-0">
                    <span className="block tabular-nums text-legenda text-muted-foreground">
                      {t ? formatarData(t.dataMovimento) : "-"} · banco
                    </span>
                    <span className="block truncate">{t?.memo ?? "-"}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-legenda text-muted-foreground">
                      {c?.registro?.lancamentoNumero ?? "app"}
                    </span>
                    <span className="block truncate">
                      {[c?.registro?.nome, c?.registro?.descricao].filter(Boolean).join(" · ") || "-"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 md:justify-end">
                    <MoneyText valor={c?.valor ?? Math.abs(t?.valor ?? 0)} />
                    {par.nomeBate ? (
                      <StatusBadge status="aprovado" rotulo="Nome bate" />
                    ) : (
                      <StatusBadge status="pendente_aprovacao" rotulo="Equivalente" />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          {lista.length > 1 ? (
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIndice((i) => Math.max(0, i - 1))}
                disabled={enviando || indice === 0}
                aria-label="Grupo anterior"
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIndice((i) => Math.min(lista.length - 1, i + 1))}
                disabled={enviando || indice === lista.length - 1}
                aria-label="Próximo grupo"
              >
                <ChevronRight />
              </Button>
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={fechar} disabled={enviando}>
              Fechar
            </Button>
            <Button type="button" onClick={() => void casar()} disabled={enviando || !grupo || feitos.has(indice)}>
              {enviando ? <LoaderCircle className="animate-spin" /> : <Link2 />}
              {feitos.has(indice) ? "Grupo casado" : "Casar grupo"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
