import * as React from "react";

import { formatarBRL, formatarDataHora } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

/**
 * Espelho impresso de um documento.
 *
 * Diferente do holerite: lá a impressão acontece dentro do app e o CSS precisa
 * esconder o resto da tela (`.holerite-print`). Aqui a PÁGINA INTEIRA é o
 * documento, porque a rota vive no grupo `(espelho)`, sem AppShell. Nada a
 * esconder, nada de `visibility: hidden`.
 *
 * A quebra de página entre documentos e a cor de fundo vivem no `globals.css`
 * (`.espelho-documento`, `.espelho-raiz`), porque `break-after` e
 * `print-color-adjust` não têm utilitário do Tailwind neste projeto.
 */
export function EspelhoImpresso({
  tipo,
  numero,
  emitidoPor,
  emitidoEm,
  children,
}: {
  /** "Ordem de compra", "Lançamento", "Pagamento". */
  tipo: string;
  /** Número do documento. Nulo em registro anterior à numeração. */
  numero: string | null;
  emitidoPor: string;
  /** ISO. Quem imprime vê quando o papel foi gerado. */
  emitidoEm: string;
  children: React.ReactNode;
}) {
  return (
    <article className="espelho-documento mx-auto flex max-w-[190mm] flex-col gap-4 px-6 py-8">
      {/* A Faixa âmbar, assinatura do design em todo o app. */}
      <div className="h-[3px] w-full bg-[#F59E0B]" />

      <header className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-[18px] font-semibold">{tipo}</span>
          <span className="font-mono text-[13px] text-[#6B6B6B]">
            {numero ?? "sem número"}
          </span>
        </div>
        <span className="text-[12px] font-semibold tracking-wide text-[#6B6B6B]">
          EMT CONSTRUTORA
        </span>
      </header>

      {children}

      <footer className="mt-2 border-t border-[#E8E6E1] pt-2 text-[12px] text-[#6B6B6B]">
        Emitido em {formatarDataHora(emitidoEm)} por {emitidoPor}
      </footer>
    </article>
  );
}

/** Bloco titulado do espelho. */
export function EspelhoSecao({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold text-[#1F1F1F]">{rotulo}</h2>
      {children}
    </section>
  );
}

/**
 * Grade rótulo/valor. Campo sem valor sai como travessão: no papel, espaço
 * vazio não distingue "não tem" de "esqueceram de imprimir".
 */
export function EspelhoCampos({
  campos,
}: {
  campos: { rotulo: string; valor: React.ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-3">
      {campos.map((campo) => (
        <div key={campo.rotulo} className="flex flex-col">
          <dt className="text-[12px] text-[#6B6B6B]">{campo.rotulo}</dt>
          <dd className="text-[#1F1F1F]">
            {campo.valor === null ||
            campo.valor === undefined ||
            campo.valor === ""
              ? "—"
              : campo.valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Tabela compacta para as linhas filhas do documento. */
export function EspelhoTabela({
  colunas,
  linhas,
  totais,
}: {
  colunas: { chave: string; rotulo: string; alinharDireita?: boolean }[];
  linhas: Record<string, React.ReactNode>[];
  totais?: Record<string, React.ReactNode>;
}) {
  if (linhas.length === 0) {
    return <p className="text-[13px] text-[#6B6B6B]">Nada a listar</p>;
  }
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b border-[#E8E6E1]">
          {colunas.map((coluna) => (
            <th
              key={coluna.chave}
              className={cn(
                "py-1 text-left font-medium text-[#6B6B6B]",
                coluna.alinharDireita && "text-right",
              )}
            >
              {coluna.rotulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, indice) => (
          <tr
            key={indice}
            className="border-b border-[#E8E6E1] last:border-b-0"
          >
            {colunas.map((coluna) => (
              <td
                key={coluna.chave}
                className={cn(
                  "py-1 align-top",
                  coluna.alinharDireita && "text-right tabular-nums",
                )}
              >
                {linha[coluna.chave] ?? "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {totais ? (
        <tfoot>
          <tr className="border-t border-[#1F1F1F] font-medium">
            {colunas.map((coluna) => (
              <td
                key={coluna.chave}
                className={cn(
                  "py-1",
                  coluna.alinharDireita && "text-right tabular-nums",
                )}
              >
                {/* Travessão aqui, não. Na linha de corpo, célula vazia é um
                campo que existe e está em branco (daí o "—" ali). Na linha de
                totais, coluna sem total é uma coluna que NÃO TEM total nenhum
                (não existe "total de Status" ou "total de Vencimento"):
                travessão em sete colunas encheria a linha de ruído. */}
                {totais[coluna.chave] ?? ""}
              </td>
            ))}
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

/**
 * Dinheiro no papel. Não usa `MoneyText` porque aquele é um `span` pensado para
 * a tela; aqui o alinhamento vem da célula da tabela. O formato é o mesmo,
 * porque vem do mesmo `formatarBRL`.
 *
 * Ausência sai como travessão, e NÃO como `formatarBRL(null)` (que devolve
 * "R$ 0,00"): no papel isso apagaria a diferença entre "não tem valor
 * lançado" e "o valor lançado é zero". Zero continua saindo "R$ 0,00" de
 * propósito — desconto e juros zerados são informação real do documento, não
 * ausência de dado, e não podem virar travessão.
 */
export function EspelhoDinheiro({
  valor,
}: {
  valor: number | string | null | undefined;
}) {
  if (valor === null || valor === undefined || valor === "") {
    return <span className="tabular-nums">—</span>;
  }
  return <span className="tabular-nums">{formatarBRL(valor)}</span>;
}

/** Página de espelho sem nada para imprimir. */
export function EspelhoVazio({
  titulo,
  explicacao,
}: {
  titulo: string;
  explicacao: string;
}) {
  return (
    <div className="mx-auto flex max-w-[190mm] flex-col gap-2 px-6 py-12">
      <h1 className="text-[18px] font-semibold">{titulo}</h1>
      <p className="text-[13px] text-[#6B6B6B]">{explicacao}</p>
    </div>
  );
}
