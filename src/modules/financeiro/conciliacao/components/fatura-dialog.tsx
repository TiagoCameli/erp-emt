"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreditCard, LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  Combobox,
  EmptyState,
  MoneyText,
  SeletorCentroCusto,
} from "@/components/canonicos";
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
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import {
  casarFatura,
  comprasDoCartao,
  type CompraDoCartao,
} from "@/modules/financeiro/conciliacao/actions";
import type { TransacaoPainel } from "@/modules/financeiro/conciliacao/painel";
import type { CategoriaOpcao } from "@/modules/financeiro/lancamentos/queries";

import { ValorMovimento } from "./valor-movimento";

export interface FaturaDialogProps {
  /** Null fecha. O pai remonta o diálogo a cada abertura (key). */
  transacao: TransacaoPainel | null;
  onFechar: () => void;
  cartoes: { id: string; nome: string }[];
  categorias: CategoriaOpcao[];
  centros: CentroCustoOpcao[];
}

function centavos(v: number): number {
  return Math.round(v * 100);
}

/**
 * Fatura do cartão (05/10/2026): o banco paga a fatura num débito só, e no
 * app cada compra no cartão é uma parcela. Aqui a pessoa marca as compras da
 * fatura; a soma mais os encargos (juros, IOF, anuidade) tem de fechar o
 * débito. Ao casar, as compras ficam pagas na conta e na data do débito.
 */
export function FaturaDialog({ transacao, onFechar, cartoes, categorias, centros }: FaturaDialogProps) {
  const router = useRouter();
  const [cartaoId, setCartaoId] = React.useState(cartoes[0]?.id ?? "");
  const [compras, setCompras] = React.useState<CompraDoCartao[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [marcadas, setMarcadas] = React.useState<Set<string>>(new Set());
  const [categoriaId, setCategoriaId] = React.useState("");
  const [centroCustoId, setCentroCustoId] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);

  React.useEffect(() => {
    if (!transacao || !cartaoId) return;
    let ativo = true;
    void comprasDoCartao(transacao.id, cartaoId).then((resposta) => {
      if (!ativo) return;
      if ("erro" in resposta) {
        setErro(resposta.erro);
        return;
      }
      setErro(null);
      setCompras(resposta.compras);
      // Já vêm marcadas as que vencem até 5 dias do débito.
      setMarcadas(
        new Set(
          resposta.compras
            .filter(
              (c) =>
                Math.abs(Date.parse(c.vencimento) - Date.parse(transacao.dataMovimento)) <= 5 * 86400000,
            )
            .map((c) => c.parcelaId),
        ),
      );
    });
    return () => {
      ativo = false;
    };
  }, [transacao, cartaoId]);

  const banco = transacao ? Math.abs(transacao.valor) : 0;
  const soma = (compras ?? [])
    .filter((c) => marcadas.has(c.parcelaId))
    .reduce((s, c) => s + c.valor, 0);
  const diferenca = (centavos(banco) - centavos(soma)) / 100;
  const temEncargos = diferenca > 0;
  const podeCasar =
    !!transacao &&
    !!cartaoId &&
    diferenca >= 0 &&
    (marcadas.size > 0 || temEncargos) &&
    (!temEncargos || (!!categoriaId && !!centroCustoId));

  function alternar(id: string) {
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  async function confirmar() {
    if (!transacao) return;
    setEnviando(true);
    const resposta = await casarFatura({
      transacaoId: transacao.id,
      cartaoId,
      parcelaIds: [...marcadas],
      encargos: temEncargos ? { valor: diferenca, categoriaId, centroCustoId } : null,
    });
    setEnviando(false);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    toast.success("Fatura casada: as compras ficaram pagas no débito do banco");
    onFechar();
    router.refresh();
  }

  return (
    <Dialog open={transacao !== null} onOpenChange={(aberto) => !aberto && !enviando && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fatura do cartão</DialogTitle>
          <DialogDescription>
            Marque as compras desta fatura. A soma mais os encargos tem de fechar o débito do banco.
          </DialogDescription>
        </DialogHeader>

        {transacao ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
            <span className="tabular-nums text-muted-foreground">{formatarData(transacao.dataMovimento)}</span>
            <span className="min-w-0 flex-1 truncate">{transacao.memo ?? "-"}</span>
            <ValorMovimento valor={transacao.valor} />
          </div>
        ) : null}

        <CampoFormulario id="fatura-cartao" rotulo="Cartão" obrigatorio>
          <Combobox
            id="fatura-cartao"
            valor={cartaoId}
            onValorChange={(v) => {
              setCartaoId(v);
              setCompras(null);
            }}
            opcoes={cartoes.map((c) => ({ valor: c.id, rotulo: c.nome }))}
            placeholder="Escolha o cartão"
            disabled={enviando}
          />
        </CampoFormulario>

        {erro ? (
          <p className="text-sm text-status-rejeitado">{erro}</p>
        ) : compras === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Procurando as compras do cartão
          </div>
        ) : compras.length === 0 ? (
          <EmptyState
            icone={CreditCard}
            titulo="Nenhuma compra deste cartão perto desta data"
            descricao="As compras precisam ter este cartão na forma de pagamento e vencer até 20 dias do débito."
            className="py-6"
          />
        ) : (
          <ul className="flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto">
            {compras.map((c) => (
              <li key={c.parcelaId}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm",
                    marcadas.has(c.parcelaId) ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <Checkbox
                    checked={marcadas.has(c.parcelaId)}
                    onCheckedChange={() => alternar(c.parcelaId)}
                    disabled={enviando}
                    aria-label={`Incluir ${c.lancamentoNumero ?? "compra"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {[c.lancamentoNumero, c.fornecedor].filter(Boolean).join(" · ") || "Compra"}
                      </span>
                      <MoneyText valor={c.valor} />
                    </span>
                    <span className="block truncate text-legenda text-muted-foreground">
                      {c.descricao ?? "-"}
                      {c.qtdParcelas > 1 ? ` · parcela ${c.numeroParcela}/${c.qtdParcelas}` : ""} · vence{" "}
                      {formatarData(c.vencimento)}
                      {c.status === "pago" && c.contaNome ? ` · paga em ${c.contaNome}` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-3 gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <span>
            <span className="block text-legenda text-muted-foreground">Compras marcadas</span>
            <MoneyText valor={soma} />
          </span>
          <span>
            <span className="block text-legenda text-muted-foreground">Débito do banco</span>
            <MoneyText valor={banco} />
          </span>
          <span>
            <span className="block text-legenda text-muted-foreground">Diferença</span>
            <span className={cn("tabular-nums", diferenca < 0 && "text-status-rejeitado")}>
              {formatarBRL(diferenca)}
            </span>
          </span>
        </div>

        {diferenca < 0 ? (
          <p className="text-detalhe text-status-rejeitado">
            As compras marcadas passam do débito do banco: desmarque o que não é desta fatura.
          </p>
        ) : temEncargos ? (
          <div className="flex flex-col gap-3">
            <p className="text-detalhe text-muted-foreground">
              A diferença de {formatarBRL(diferenca)} vira o lançamento &quot;Encargos do cartão&quot; (juros,
              IOF, anuidade). Se for compra que faltou marcar no cartão, lance a compra antes.
            </p>
            <CampoFormulario id="fatura-categoria" rotulo="Categoria dos encargos" obrigatorio>
              <Combobox
                id="fatura-categoria"
                valor={categoriaId}
                onValorChange={setCategoriaId}
                opcoes={categorias.filter((c) => c.tipo === "despesa").map((c) => ({ valor: c.id, rotulo: c.nome }))}
                placeholder="Ex.: Despesas financeiras"
                disabled={enviando}
              />
            </CampoFormulario>
            <SeletorCentroCusto
              centros={centros}
              valor={centroCustoId}
              onValorChange={setCentroCustoId}
              idBase="fatura-centro"
              obrigatorio
              disabled={enviando}
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void confirmar()} disabled={enviando || !podeCasar}>
            {enviando ? <LoaderCircle className="animate-spin" /> : <CreditCard />}
            Casar fatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
