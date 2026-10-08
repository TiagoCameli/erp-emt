"use client";

import { MoneyText } from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { ROTULO_PRODUTO } from "@/modules/financeiro/aplicacoes/calculo";
import {
  resumoDaSubconta,
  type SaldoDaAplicacao,
} from "@/modules/financeiro/contas-bancarias/aplicacoes-da-subconta";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";

export interface AplicacoesDaSubcontaExpandidaProps {
  subconta: ContaLista;
  aplicacoes: readonly SaldoDaAplicacao[];
}

/**
 * A linha expandida da subconta de investimentos: quais são os investimentos e
 * quanto tem em cada um (pedido do Tiago em 08/10/2026). A soma fecha com o
 * saldo da subconta; o que sobrar é movimento sem aplicação, mostrado à parte.
 */
export function AplicacoesDaSubcontaExpandida({
  subconta,
  aplicacoes,
}: AplicacoesDaSubcontaExpandidaProps) {
  const resumo = resumoDaSubconta(subconta.id, subconta.saldoAtual, aplicacoes);

  if (resumo.aplicacoes.length === 0) {
    return (
      <p className="border-t border-border px-4 py-3 text-detalhe text-muted-foreground">
        Esta subconta não tem investimento cadastrado. Cadastre em Cadastros &gt;
        Centros de custo, no centro Investimentos, escolhendo esta conta.
      </p>
    );
  }

  return (
    <div className="border-t border-border px-4 py-3" data-testid="aplicacoes-da-subconta">
      <table className="w-full max-w-3xl text-detalhe">
        <caption className="sr-only">Investimentos de {subconta.nome}</caption>
        <thead>
          <tr className="text-legenda text-muted-foreground">
            <th scope="col" className="pb-1 text-left font-medium">Investimento</th>
            <th scope="col" className="pb-1 text-left font-medium">Tipo</th>
            <th scope="col" className="pb-1 text-left font-medium">Última posição</th>
            <th scope="col" className="pb-1 text-right font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {resumo.aplicacoes.map((a) => (
            <tr key={a.aplicacaoId} className="border-t border-border/60">
              <td className="py-1.5 pr-4">
                {a.nome}
                {a.ativa ? null : <span className="text-muted-foreground"> (inativa)</span>}
              </td>
              <td className="py-1.5 pr-4 text-muted-foreground">
                {ROTULO_PRODUTO[a.produto] ?? a.produto}
              </td>
              <td className="py-1.5 pr-4 text-muted-foreground">
                {a.ultimaPosicao ? formatarData(a.ultimaPosicao) : "Sem posição gravada"}
              </td>
              <td className="py-1.5 text-right">
                <MoneyText valor={a.saldo} />
              </td>
            </tr>
          ))}
          {resumo.foraDasAplicacoes !== null ? (
            <tr className="border-t border-border/60 text-status-pendente">
              <td
                className="py-1.5 pr-4"
                colSpan={3}
                title="Movimento lançado na subconta sem investimento. Abra o extrato da subconta para achar qual é."
              >
                Fora dos investimentos
              </td>
              <td className="py-1.5 text-right">
                <MoneyText valor={resumo.foraDasAplicacoes} />
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-semibold">
            <td className="pt-1.5" colSpan={3}>
              Total da subconta
            </td>
            <td className="pt-1.5 text-right">
              <MoneyText valor={subconta.saldoAtual ?? resumo.total} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
