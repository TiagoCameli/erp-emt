"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Anchor, LoaderCircle, Plus } from "lucide-react";

import { CampoFormulario, Combobox, EmptyState, MoneyText } from "@/components/canonicos";
import { InputMoeda } from "@/components/canonicos/input-numerico";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatarData } from "@/lib/formatadores";
import { adicionarAncora } from "@/modules/financeiro/conciliacao/actions";
import type {
  AncoraSaldo,
  ContaBancariaOpcao,
} from "@/modules/financeiro/conciliacao/queries";

const ROTULO_FONTE: Record<AncoraSaldo["fonte"], string> = {
  extrato_pdf: "Extrato (PDF)",
  ledgerbal_fim_periodo: "Saldo do OFX",
  informado: "Informado",
};

export interface AncorasProps {
  ancoras: AncoraSaldo[];
  contas: ContaBancariaOpcao[];
  podeEditar: boolean;
}

/**
 * Âncoras de saldo (Bloco K): o saldo do extrato num dia, por conta. O saldo
 * do banco em qualquer outro dia sai daqui mais os movimentos do OFX, desde
 * que o extrato cubra os dias no meio. Para quando a pessoa tem o PDF.
 */
export function Ancoras({ ancoras, contas, podeEditar }: AncorasProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const [contaId, setContaId] = React.useState("");
  const [data, setData] = React.useState("");
  const [saldo, setSaldo] = React.useState("");
  const [observacao, setObservacao] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);

  const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
  const porConta = new Map<string, AncoraSaldo[]>();
  for (const a of ancoras) porConta.set(a.contaId, [...(porConta.get(a.contaId) ?? []), a]);

  async function salvar() {
    setEnviando(true);
    const resposta = await adicionarAncora({
      contaId,
      data,
      saldo: Number(saldo.replace(/\./g, "").replace(",", ".")),
      observacao,
    });
    setEnviando(false);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    toast.success("Âncora gravada");
    setAberto(false);
    router.refresh();
  }

  return (
    <section className="mt-8 flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-medium">Âncoras de saldo</h2>
          <p className="text-detalhe text-muted-foreground">
            O saldo do extrato num dia. O app encadeia os outros dias com os movimentos do OFX.
          </p>
        </div>
        {podeEditar ? (
          <Button type="button" variant="outline" onClick={() => setAberto(true)}>
            <Plus />
            Adicionar âncora
          </Button>
        ) : null}
      </div>

      {ancoras.length === 0 ? (
        <EmptyState
          icone={Anchor}
          titulo="Nenhuma âncora"
          descricao="Sem âncora, o mês só fecha quando o OFX traz o saldo do próprio fim do período."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {[...porConta].map(([id, lista]) => (
            <div key={id} className="rounded-md border border-border p-3">
              <p className="mb-2 text-sm font-medium">{nomeConta.get(id) ?? "Conta"}</p>
              <ul className="flex flex-col gap-1 text-sm">
                {lista.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="tabular-nums">{formatarData(a.data)}</span>
                    <span className="text-legenda text-muted-foreground">
                      {ROTULO_FONTE[a.fonte]}
                      {a.observacao ? ` · ${a.observacao}` : ""}
                    </span>
                    <MoneyText valor={a.saldo} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={(v) => !enviando && setAberto(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar âncora de saldo</DialogTitle>
            <DialogDescription>
              O saldo do extrato do banco no fim do dia. A mesma data de novo substitui o valor.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <CampoFormulario id="ancora-conta" rotulo="Conta" obrigatorio>
              <Combobox
                id="ancora-conta"
                valor={contaId}
                onValorChange={setContaId}
                opcoes={contas.map((c) => ({ valor: c.id, rotulo: c.nome }))}
                placeholder="Escolha a conta"
                disabled={enviando}
              />
            </CampoFormulario>
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoFormulario id="ancora-data" rotulo="Dia" obrigatorio>
                <Input
                  id="ancora-data"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  disabled={enviando}
                />
              </CampoFormulario>
              <CampoFormulario id="ancora-saldo" rotulo="Saldo no fim do dia" obrigatorio>
                <InputMoeda id="ancora-saldo" valor={saldo} onValorChange={setSaldo} disabled={enviando} />
              </CampoFormulario>
            </div>
            <CampoFormulario id="ancora-obs" rotulo="Observação">
              <Input
                id="ancora-obs"
                value={observacao}
                maxLength={500}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: extrato PDF de setembro"
                disabled={enviando}
              />
            </CampoFormulario>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void salvar()} disabled={enviando || !contaId || !data || !saldo.trim()}>
              {enviando ? <LoaderCircle className="animate-spin" /> : <Plus />}
              Gravar âncora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
