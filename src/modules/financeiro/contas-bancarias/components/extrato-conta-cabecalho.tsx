"use client";

import * as React from "react";
import { Pencil, TriangleAlert } from "lucide-react";

import { MoneyText, PageHeader, StatusBadge } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { ROTULO_BANCO } from "@/modules/financeiro/_shared/formato";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";
import { ROTULO_TIPO_CONTA } from "@/modules/financeiro/contas-bancarias/schemas";
import { ContasFormDrawer } from "./contas-form-drawer";

export interface ExtratoContaCabecalhoProps {
  conta: ContaLista;
  /**
   * Onde o saldo acumulado do extrato fechou. Null sem permissão de ver o saldo
   * desta conta — o extrato abre, só sem os números de saldo.
   */
  saldoFinal: number | null;
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
  const [aberto, setAberto] = React.useState(false);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        className="mb-0"
        modulo="Financeiro · Extrato da conta"
        titulo={conta.nome}
        descricao={identificacao(conta)}
        voltarPara={{
          rota: "/financeiro/contas-bancarias",
          rotulo: "Voltar para as contas bancárias",
        }}
        selos={
          conta.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativa" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Inativa" />
          )
        }
        acoes={
          podeEditar ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAberto(true)}
            >
              <Pencil />
              Editar conta
            </Button>
          ) : null
        }
      />

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

        Sem permissão de ver o saldo desta conta, `fechaNoSaldo` vem true (não há
        o que conferir) e o bloco também não aparece — um alerta vermelho com dois
        travessões não ajudaria ninguém.
      */}
      {fechaNoSaldo || saldoFinal === null || conta.saldoAtual === null ? null : (
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
          {conta.saldoAtual === null ? (
            <>
              As movimentações abaixo são só as posteriores a{" "}
              <span className="font-medium text-foreground">
                {formatarData(conta.saldoInicialData)}
              </span>
              , a data do extrato de onde o saldo inicial desta conta foi lido.
              Você não tem permissão de ver o saldo dela, então a coluna de saldo
              não aparece.
            </>
          ) : (
            <>
              O saldo parte do extrato de{" "}
              <span className="font-medium text-foreground">
                {formatarData(conta.saldoInicialData)}
              </span>{" "}
              ({formatarBRL(conta.saldoInicial)}) e soma só o movimento
              posterior.
              {conta.movimentoAnteriorAoCorte
                ? ` Antes dessa data há ${conta.movimentoAnteriorAoCorte.parcelas} pagamento(s) registrados (${formatarBRL(conta.movimentoAnteriorAoCorte.recebido)} recebidos e ${formatarBRL(conta.movimentoAnteriorAoCorte.pago)} pagos), já representados pelo saldo de abertura; troque o filtro "Movimento" para vê-los.`
                : " Nenhum pagamento anterior a essa data está registrado."}
            </>
          )}
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
