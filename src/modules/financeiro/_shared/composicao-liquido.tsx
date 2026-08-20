import * as React from "react";

import { MoneyText } from "@/components/canonicos";

/** Os três ajustes do ato de pagar, mais o líquido que eles produzem. */
export interface AjustesDaParcela {
  desconto: number;
  juros: number;
  outrasDespesas: number;
  /** valor − desconto + juros + outras despesas. */
  valorLiquido: number;
}

/**
 * A linha "desconto X, juros Y, despesas Z, líquido L" que acompanha o valor da
 * parcela onde ela é exibida — a célula de valor da aba Pagas e a linha de
 * parcela no detalhe do lançamento.
 *
 * Existe como componente compartilhado porque as duas telas mostram o MESMO
 * fato (o que de fato saiu da conta), e duas versões da mesma frase divergem no
 * dia em que um quarto ajuste aparecer: uma tela passaria a somar diferente da
 * outra sobre a mesma parcela.
 *
 * Só imprime os ajustes que existem. Nada existindo, devolve `null`: linha extra
 * embaixo de toda parcela viraria ruído numa coluna de dinheiro, e é por isso
 * que os ajustes vivem aqui dentro em vez de virar coluna própria — coluna
 * própria apareceria vazia na maioria das linhas e mexeria no conjunto de
 * colunas salvo nas preferências do usuário.
 */
export function ComposicaoDoLiquido({
  desconto,
  juros,
  outrasDespesas,
  valorLiquido,
  className = "block text-legenda text-muted-foreground",
}: AjustesDaParcela & { className?: string }) {
  const partes: React.ReactNode[] = [];

  if (desconto > 0) {
    partes.push(
      <>
        desconto <MoneyText valor={desconto} className="inline" />
      </>,
    );
  }
  if (juros > 0) {
    partes.push(
      <>
        juros <MoneyText valor={juros} className="inline" />
      </>,
    );
  }
  if (outrasDespesas > 0) {
    partes.push(
      <>
        despesas <MoneyText valor={outrasDespesas} className="inline" />
      </>,
    );
  }

  // Sem nenhum ajuste, o líquido é o valor: repetir o mesmo número embaixo dele
  // não informa nada.
  if (partes.length === 0) return null;

  // Sempre termina com o líquido, que é a resposta da conta acima.
  partes.push(
    <>
      líquido <MoneyText valor={valorLiquido} className="inline" />
    </>,
  );

  return (
    <span className={className}>
      {partes.map((parte, indice) => (
        <React.Fragment key={indice}>
          {indice > 0 && ", "}
          {parte}
        </React.Fragment>
      ))}
    </span>
  );
}
