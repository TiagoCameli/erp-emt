import Link from "next/link";
import { Truck } from "lucide-react";

import { EmptyState, MoneyText } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  corDoSaldo,
  rotuloMovimentos,
  saldoDevedorCombustivelTotal,
  saldosVisiveis,
  type SaldoTransportadora,
} from "@/modules/frete/conta-corrente/extrato";

export const CLASSE_COR_SALDO = {
  positivo: "text-status-aprovado",
  negativo: "text-status-rejeitado",
  zero: "text-muted-foreground",
} as const;

/**
 * A aba "Conta Corrente" da origem (Frete.tsx:624-705): um card por
 * transportadora, com o saldo (verde: a EMT deve; vermelho: a transportadora
 * deve; cinza: zerado), créditos de frete, pagos e combustível, e o card final
 * com o saldo devedor de combustível somado. A ETAM Construtora não aparece,
 * como na origem (ver `ehEtamConstrutora`).
 */
export function ContaCorrenteCards({ saldos }: { saldos: SaldoTransportadora[] }) {
  const visiveis = saldosVisiveis(saldos);

  if (visiveis.length === 0) {
    return (
      <EmptyState
        icone={Truck}
        titulo="Nenhuma transportadora na conta corrente"
        descricao="Marque o fornecedor como transportadora ou dono de tanque no cadastro de fornecedores"
        acao={
          <Button asChild size="sm" variant="outline">
            <Link href="/cadastros/fornecedores">Abrir fornecedores</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visiveis.map((s) => (
          <div key={s.transportadoraId} className="flex flex-col rounded-lg border border-border bg-card p-4">
            <div className="font-medium">{s.nome}</div>
            <div className="text-legenda text-muted-foreground">{rotuloMovimentos(s.qtdMovimentos)}</div>
            <MoneyText
              valor={s.saldo}
              className={cn("mt-3 text-titulo font-semibold", CLASSE_COR_SALDO[corDoSaldo(s.saldo)])}
            />
            <dl className="mt-3 grid grid-cols-3 gap-1 text-legenda">
              <div>
                <dt className="uppercase tracking-wide text-muted-foreground">Créditos</dt>
                <dd>
                  <MoneyText valor={s.creditoFreteTotal} className="text-status-aprovado" />
                </dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide text-muted-foreground">Pagos</dt>
                <dd>
                  <MoneyText valor={s.pagoFreteTotal} className="text-status-rejeitado" />
                </dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide text-muted-foreground">Comb.</dt>
                <dd>
                  <MoneyText valor={s.debitoCombustivelTotal} className="text-status-rejeitado" />
                </dd>
              </div>
            </dl>
            <Button asChild variant="outline" size="sm" className="mt-4 w-full">
              <Link href={`/frete/conta-corrente/${s.transportadoraId}`}>Ver extrato</Link>
            </Button>
          </div>
        ))}
      </div>

      <div className="faixa-esquerda rounded-lg border border-border bg-card p-4">
        <p className="text-legenda uppercase tracking-wide text-muted-foreground">Saldo devedor de combustível total</p>
        <MoneyText
          valor={saldoDevedorCombustivelTotal(visiveis)}
          className="mt-1 block text-titulo font-semibold text-status-rejeitado"
        />
        <p className="mt-1 text-detalhe text-muted-foreground">
          Soma dos débitos de combustível em aberto (todas as transportadoras).
        </p>
      </div>
    </div>
  );
}
