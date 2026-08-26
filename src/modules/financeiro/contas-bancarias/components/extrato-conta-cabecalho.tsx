"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, TriangleAlert } from "lucide-react";

import { MoneyText, StatusBadge } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { ROTULO_BANCO } from "@/modules/financeiro/_shared/formato";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";
import { ROTULO_TIPO_CONTA } from "@/modules/financeiro/contas-bancarias/schemas";
import { ContasFormDrawer } from "./contas-form-drawer";

export interface ExtratoContaCabecalhoProps {
  conta: ContaLista;
  /** Onde o saldo acumulado do extrato fechou. Ver `alertaDivergencia`. */
  saldoFinal: number;
  fechaNoSaldo: boolean;
  podeEditar: boolean;
}

/** "Banco do Brasil · C/C 102.124-9 · Conta corrente" com o que existir. */
function identificacao(conta: ContaLista): string {
  return [
    ROTULO_BANCO[conta.banco],
    conta.agencia ? `Ag. ${conta.agencia}` : null,
    conta.conta ? `C/C ${conta.conta}` : null,
    ROTULO_TIPO_CONTA[conta.tipo],
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Cabeçalho do extrato da conta: volta para a lista, identifica a conta e dá
 * acesso à edição dela.
 *
 * A edição vive AQUI porque a linha da listagem passou a abrir o extrato. Antes
 * clicar na linha abria o formulário; deixar a edição só no menu "..." da lista
 * esconderia a única forma de corrigir agência, saldo inicial ou data de corte
 * atrás de dois cliques e um menu.
 */
export function ExtratoContaCabecalho({
  conta,
  saldoFinal,
  fechaNoSaldo,
  podeEditar,
}: ExtratoContaCabecalhoProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Voltar para as contas bancárias"
            onClick={() => router.push("/financeiro/contas-bancarias")}
          >
            <ArrowLeft />
          </Button>
          <div>
            <p className="text-legenda font-medium uppercase tracking-wide text-muted-foreground">
              Financeiro · Extrato da conta
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-titulo font-semibold">{conta.nome}</h1>
              {conta.ativo ? (
                <StatusBadge status="aprovado" rotulo="Ativa" />
              ) : (
                <StatusBadge status="rascunho" rotulo="Inativa" />
              )}
            </div>
            <p className="text-detalhe text-muted-foreground">
              {identificacao(conta)}
            </p>
          </div>
        </div>

        {podeEditar ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
            <Pencil />
            Editar conta
          </Button>
        ) : null}
      </div>

      {/*
        LINHA DE CONTROLE, na tela.

        O saldo acumulado da última linha do extrato e o "Saldo atual" do cartão
        vêm de funções DIFERENTES do banco (`fn_extrato_conta`, linha a linha, e
        `fn_rel_posicao_bancaria`, já somada) que repetem o mesmo WHERE. Duas
        cópias da mesma regra divergem na primeira alteração feita de um lado só,
        e a divergência não dá erro em lugar nenhum: a tela mostraria dois números
        diferentes e caberia a quem lê descobrir qual dos dois é o da conta.

        Por isso ela aparece, com os dois números e o tamanho da diferença. Em
        operação normal este bloco não existe.
      */}
      {fechaNoSaldo ? null : (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-status-rejeitado/40 bg-status-rejeitado/5 p-3 text-detalhe"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-rejeitado" />
          <div>
            <p className="font-medium text-status-rejeitado">
              O extrato não fecha no saldo desta conta
            </p>
            <p className="text-muted-foreground">
              O extrato abaixo soma até <MoneyText valor={saldoFinal} /> e o saldo
              atual da conta é <MoneyText valor={conta.saldoAtual} />, uma
              diferença de {formatarBRL(Math.abs(saldoFinal - conta.saldoAtual))}.
              Os dois vêm de funções diferentes do banco com a mesma regra, então
              a diferença é defeito, não arredondamento: não use nenhum dos dois
              para conferir com o banco antes de apurar.
            </p>
          </div>
        </div>
      )}

      {/*
        O que a data de corte deixou de fora, dito em voz alta.

        A listagem de contas já diz isso no `title` da data, mas o extrato é a
        tela onde a pergunta nasce: quem abre o extrato e vê 53 linhas numa conta
        com anos de histórico precisa saber que o resto existe e onde está.
      */}
      {conta.saldoInicialData ? (
        <p className="text-detalhe text-muted-foreground">
          O saldo parte do extrato de{" "}
          <span className="font-medium text-foreground">
            {formatarData(conta.saldoInicialData)}
          </span>{" "}
          ({formatarBRL(conta.saldoInicial)}) e soma só o movimento posterior.
          {conta.movimentoAnteriorAoCorte
            ? ` Antes dessa data há ${conta.movimentoAnteriorAoCorte.parcelas} pagamento(s) registrados (${formatarBRL(conta.movimentoAnteriorAoCorte.recebido)} recebidos e ${formatarBRL(conta.movimentoAnteriorAoCorte.pago)} pagos), já representados pelo saldo de abertura; troque o filtro "Movimento" para vê-los.`
            : " Nenhum pagamento anterior a essa data está registrado."}
        </p>
      ) : null}

      <ContasFormDrawer
        key={conta.id}
        aberto={aberto}
        onAbertoChange={setAberto}
        conta={conta}
      />
    </div>
  );
}
