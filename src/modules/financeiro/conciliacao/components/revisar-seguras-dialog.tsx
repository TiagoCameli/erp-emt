"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, LoaderCircle } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarData } from "@/lib/formatadores";
import { aceitarSugestoes } from "@/modules/financeiro/conciliacao/actions";
import type { SugestaoSegura } from "@/modules/financeiro/conciliacao/casamento";
import type { CandidatoDoPainel } from "@/modules/financeiro/conciliacao/painel";
import { ValorMovimento } from "./valor-movimento";

export interface RevisarSegurasDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  seguras: SugestaoSegura<CandidatoDoPainel>[];
  /** Nome da conta do extrato, para dizer "muda da Caixa para o BB". */
  contaNome: string;
}

/** O que acontece no app ao aceitar, escrito na linha. */
export function efeitoDaSugestao(
  segura: SugestaoSegura<CandidatoDoPainel>,
  contaNome: string,
): string {
  const p = segura.candidato.registro;
  if (!p) return "Casa com a transferência";
  const doc = p.lancamentoNumero ?? "o lançamento";
  if (segura.candidato.grupo === "paga_outra_conta") {
    return `${doc}: muda de ${p.contaNome ?? "outra conta"} para ${contaNome}`;
  }
  return `Dá baixa em ${doc} em ${formatarData(segura.movimento.dataMovimento)} (data do extrato)`;
}

/**
 * Faixa 2 da regra do Tiago: as sugestões sem outra leitura possível vêm
 * marcadas, cada linha diz o que muda no app, a pessoa desmarca o que não
 * quiser e confirma. É decisão humana: o lote vai com `p_automatica = false`.
 */
export function RevisarSegurasDialog({
  aberto,
  onAbertoChange,
  seguras,
  contaNome,
}: RevisarSegurasDialogProps) {
  const router = useRouter();
  const [marcadas, setMarcadas] = React.useState<Set<string>>(
    () => new Set(seguras.map((s) => s.movimento.id)),
  );
  const [enviando, setEnviando] = React.useState(false);

  function alternar(id: string) {
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  async function confirmar() {
    const escolhidas = seguras.filter((s) => marcadas.has(s.movimento.id));
    if (escolhidas.length === 0) return;
    setEnviando(true);
    const resposta = await aceitarSugestoes(
      escolhidas.map((s) => ({
        transacaoId: s.movimento.id,
        especie: s.candidato.especie,
        alvoId: s.candidato.id,
      })),
    );
    setEnviando(false);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    if (resposta.falhas.length > 0) {
      toast.error(
        `${resposta.feitos} casada(s), ${resposta.falhas.length} com erro: ${resposta.falhas[0]?.erro}`,
      );
    } else {
      toast.success(
        resposta.feitos === 1 ? "1 sugestão aceita" : `${resposta.feitos} sugestões aceitas`,
      );
    }
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={(novo) => !enviando && onAbertoChange(novo)}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Revisar sugestões seguras</DialogTitle>
          <DialogDescription>
            Valor exato, nome do favorecido no extrato e nenhum outro candidato. Desmarque o que
            não quiser e confirme.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex max-h-[55vh] flex-col gap-1.5 overflow-y-auto">
          {seguras.map((s) => (
            <li key={s.movimento.id}>
              <label className="flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <Checkbox
                  checked={marcadas.has(s.movimento.id)}
                  onCheckedChange={() => alternar(s.movimento.id)}
                  aria-label={`Aceitar ${s.movimento.memo ?? ""}`}
                  className="mt-0.5"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline gap-x-3">
                    <span className="tabular-nums text-muted-foreground">
                      {formatarData(s.movimento.dataMovimento)}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={s.movimento.memo ?? ""}>
                      {s.movimento.memo ?? "-"}
                    </span>
                    <ValorMovimento valor={s.movimento.valor} />
                  </span>
                  <span className="text-legenda text-status-pendente">
                    {efeitoDaSugestao(s, contaNome)}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void confirmar()} disabled={enviando || marcadas.size === 0}>
            {enviando ? <LoaderCircle className="animate-spin" /> : <CheckCheck />}
            Aceitar {marcadas.size}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
