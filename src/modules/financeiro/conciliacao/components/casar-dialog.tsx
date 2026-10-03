"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Link2, LoaderCircle, Search } from "lucide-react";

import { EmptyState, MoneyText } from "@/components/canonicos";
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
import { Input } from "@/components/ui/input";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { casar } from "@/modules/financeiro/conciliacao/actions";
import {
  sugerirParaMovimento,
  type GrupoCandidato,
  type Sugestao,
} from "@/modules/financeiro/conciliacao/casamento";
import type {
  CandidatoDoPainel,
  TransacaoPainel,
} from "@/modules/financeiro/conciliacao/painel";
import { ValorMovimento } from "./valor-movimento";

/**
 * O que acontece no app quando a pessoa casa com um candidato de cada grupo.
 * Fica escrito na linha: ninguém deveria descobrir depois que casar mudou a
 * conta de um pagamento.
 */
const EFEITO: Record<GrupoCandidato, string> = {
  paga_na_conta: "Paga nesta conta",
  transferencia: "Transferência entre contas",
  paga_outra_conta: "Paga em outra conta: passa para esta",
  aberta: "Em aberto: dá baixa na data do extrato",
};

/** Origens em que o centavo só pode ser financeiro (o banco recusa custo). */
const ORIGENS_SO_FINANCEIRO = new Set([
  "folha",
  "folha_guia",
  "decimo_terceiro",
  "decimo_terceiro_guia",
  "ferias",
  "ferias_guia",
  "rescisao",
  "adiantamento",
  "diaria",
  "aplicacao",
]);

/**
 * As duas leituras da diferença, pelo sinal. Nenhuma vem marcada: quem
 * concilia escolhe, e o Casar fica desabilitado até escolher.
 */
export function opcoesDeAjuste(
  diferenca: number,
  soFinanceiro: boolean,
): { valor: "financeiro" | "custo"; rotulo: string }[] {
  const financeiro =
    diferenca > 0
      ? { valor: "financeiro" as const, rotulo: "Juros ou multa (despesa financeira)" }
      : { valor: "financeiro" as const, rotulo: "Desconto obtido (receita financeira)" };
  if (soFinanceiro) return [financeiro];
  const custo =
    diferenca > 0
      ? { valor: "custo" as const, rotulo: "Custo do fornecedor (aumenta o valor do lançamento)" }
      : { valor: "custo" as const, rotulo: "Custo do fornecedor (reduz o valor do lançamento)" };
  return [financeiro, custo];
}

export interface CasarDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  transacao: TransacaoPainel | null;
  /** Todos os candidatos livres do painel (o diálogo filtra e ordena). */
  candidatos: CandidatoDoPainel[];
}

function tituloCandidato(candidato: CandidatoDoPainel): string {
  if (candidato.transferencia) {
    const t = candidato.transferencia;
    return `${t.numero ? `${t.numero} · ` : ""}${t.origemNome ?? "-"} para ${t.destinoNome ?? "-"}`;
  }
  const p = candidato.registro;
  return [p.lancamentoNumero, p.nome].filter(Boolean).join(" · ") || "Lançamento";
}

function detalheCandidato(candidato: CandidatoDoPainel): string {
  if (candidato.transferencia) return candidato.transferencia.descricao ?? "";
  const p = candidato.registro;
  const partes = [p.descricao];
  if (p.qtdParcelas > 1) partes.push(`parcela ${p.numeroParcela}/${p.qtdParcelas}`);
  if (candidato.grupo === "paga_outra_conta" && p.contaNome) {
    partes.push(`hoje em ${p.contaNome}`);
  }
  return partes.filter(Boolean).join(" · ");
}

/**
 * Casamento manual de um movimento. A lista já vem ordenada como quem concilia
 * escolheria (valor exato, nome que bate, data próxima, o que muda menos no
 * app), e a busca abre para qualquer candidato do mesmo sentido quando a
 * sugestão não acertou.
 *
 * Diferença de valor exige marcar o ajuste: ele vira juros ou desconto na
 * parcela, com evento na trilha.
 */
export function CasarDialog({
  aberto,
  onAbertoChange,
  transacao,
  candidatos,
}: CasarDialogProps) {
  const router = useRouter();
  const [selecionado, setSelecionado] = React.useState<string | null>(null);
  const [ajuste, setAjuste] = React.useState<"financeiro" | "custo" | null>(null);
  const [busca, setBusca] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);

  const sugestoes = React.useMemo<Sugestao<CandidatoDoPainel>[]>(() => {
    if (!transacao) return [];
    const movimento = {
      id: transacao.id,
      dataMovimento: transacao.dataMovimento,
      valor: transacao.valor,
      memo: transacao.memo,
    };
    if (busca.trim() === "") {
      return sugerirParaMovimento(movimento, candidatos);
    }
    // Buscando, vale qualquer valor e data: a pessoa sabe o que procura.
    const texto = busca.trim().toLowerCase();
    return sugerirParaMovimento(
      movimento,
      candidatos.filter((c) => {
        const alvo = `${tituloCandidato(c)} ${detalheCandidato(c)} ${formatarBRL(c.valor)}`.toLowerCase();
        return alvo.includes(texto);
      }),
      // A diferença continua limitada a R$ 1,00: o banco recusa mais que isso.
      { janelaDias: 400, janelaAbertaDias: 400 },
    ).slice(0, 50);
  }, [transacao, candidatos, busca]);

  const escolhida = sugestoes.find(
    (s) => `${s.candidato.especie}:${s.candidato.id}` === selecionado,
  );
  const precisaAjuste = !!escolhida && escolhida.diferenca !== 0;
  const ajusteImpossivel =
    precisaAjuste && escolhida.candidato.especie === "transferencia";
  // Salário e guia não mudam de valor por centavo de banco (Bloco D).
  const soFinanceiro =
    !!escolhida?.candidato.registro &&
    ORIGENS_SO_FINANCEIRO.has(escolhida.candidato.registro.origem);

  function trocarAberto(novo: boolean) {
    if (enviando) return;
    onAbertoChange(novo);
  }

  async function confirmar() {
    if (!transacao || !escolhida) return;
    setEnviando(true);
    const resposta = await casar({
      transacaoId: transacao.id,
      especie: escolhida.candidato.especie,
      alvoId: escolhida.candidato.id,
      ajuste: precisaAjuste ? ajuste : null,
    });
    setEnviando(false);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    toast.success("Movimento casado");
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={trocarAberto}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Casar movimento do extrato</DialogTitle>
          <DialogDescription>
            Escolha o lançamento ou a transferência do app que é este movimento.
          </DialogDescription>
        </DialogHeader>

        {transacao ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
            <span className="tabular-nums text-muted-foreground">
              {formatarData(transacao.dataMovimento)}
            </span>
            <span className="min-w-0 flex-1 truncate" title={transacao.memo ?? ""}>
              {transacao.memo ?? "-"}
            </span>
            <ValorMovimento valor={transacao.valor} />
          </div>
        ) : null}

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por favorecido, número, descrição ou valor"
            className="pl-8"
            aria-label="Buscar candidato"
          />
        </div>

        <div
          role="radiogroup"
          aria-label="Candidatos"
          className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto"
        >
          {sugestoes.length === 0 ? (
            <EmptyState
              icone={Link2}
              titulo="Nada compatível no app"
              descricao={
                busca
                  ? "Nenhum candidato com esse texto. Se o pagamento não foi lançado, feche e use Lançar."
                  : "Nenhum lançamento ou transferência com esse valor e data. Busque pelo nome, ou feche e use Lançar."
              }
              className="py-8"
            />
          ) : (
            sugestoes.map((sugestao) => {
              const chave = `${sugestao.candidato.especie}:${sugestao.candidato.id}`;
              const ativo = chave === selecionado;
              return (
                <button
                  key={chave}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => {
                    setSelecionado(chave);
                    setAjuste(null);
                  }}
                  className={cn(
                    "foco-anel flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm",
                    ativo ? "border-primary bg-primary/5" : "border-border hover:bg-surface",
                  )}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{tituloCandidato(sugestao.candidato)}</span>
                    <MoneyText valor={sugestao.candidato.valor} />
                  </span>
                  <span className="truncate text-legenda text-muted-foreground">
                    {detalheCandidato(sugestao.candidato) || "-"}
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-legenda">
                    <span
                      className={cn(
                        sugestao.candidato.grupo === "paga_na_conta" ||
                          sugestao.candidato.grupo === "transferencia"
                          ? "text-muted-foreground"
                          : "text-status-pendente",
                      )}
                    >
                      {EFEITO[sugestao.candidato.grupo]}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatarData(sugestao.candidato.data)}
                      {sugestao.dias > 0
                        ? ` (${sugestao.dias} ${sugestao.dias === 1 ? "dia" : "dias"} de diferença)`
                        : ""}
                    </span>
                    {sugestao.nomeBate ? (
                      <span className="text-status-aprovado">Nome confere com o extrato</span>
                    ) : (
                      <span className="text-muted-foreground">Nome não aparece no extrato</span>
                    )}
                    {sugestao.diferenca !== 0 ? (
                      <span className="text-status-rejeitado">
                        Valor difere em {formatarBRL(Math.abs(sugestao.diferenca))}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {precisaAjuste && escolhida ? (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertDescription>
              {ajusteImpossivel ? (
                "Transferência só casa com o valor exato. Corrija a transferência ou lance o movimento."
              ) : (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1">
                    O banco {escolhida.diferenca > 0 ? "pagou a mais" : "pagou a menos"}{" "}
                    {formatarBRL(Math.abs(escolhida.diferenca))}. O que é essa diferença?
                  </legend>
                  {opcoesDeAjuste(escolhida.diferenca, soFinanceiro).map((opcao) => (
                    <label key={opcao.valor} className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="ajuste"
                        value={opcao.valor}
                        checked={ajuste === opcao.valor}
                        onChange={() => setAjuste(opcao.valor)}
                        className="foco-anel mt-1"
                      />
                      <span>{opcao.rotulo}</span>
                    </label>
                  ))}
                  <span className="text-legenda text-muted-foreground">
                    {soFinanceiro
                      ? "Lançamento de folha, guia ou diária só aceita o ajuste financeiro: salário não muda de valor por centavo de banco."
                      : "Juros e desconto entram no resultado financeiro; custo entra no centro de custo do lançamento."}
                  </span>
                </fieldset>
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => trocarAberto(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void confirmar()}
            disabled={
              !escolhida || enviando || ajusteImpossivel || (precisaAjuste && !ajuste)
            }
          >
            {enviando ? <LoaderCircle className="animate-spin" /> : <Link2 />}
            Casar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
