import * as React from "react";

import { LogoEmt } from "@/components/canonicos/logo-emt";
import {
  CabecalhoDocumento,
  EmissaoDocumento,
  PistaEmt,
  RodapeEmpresa,
} from "@/components/canonicos/marca-documento";
import { formatarBRL } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

/**
 * Espelho impresso de um documento.
 *
 * A PÁGINA INTEIRA é o documento, porque a rota vive no grupo `(espelho)`, sem
 * AppShell — mas esse grupo ainda renderiza dentro do MESMO `<body>` do layout
 * raiz, e a regra do holerite em `globals.css` (`body * { visibility: hidden
 * }`) é documento inteiro, não escopada a ele. Por isso o espelho PRECISA do
 * mesmo truque, revertido: `.espelho-raiz, .espelho-raiz *` (especificidade
 * 0,1,1) vence `body *` (0,0,1) e reacende a visibilidade da árvore inteira do
 * espelho. Ver o `@media print` de `.espelho-raiz` em `globals.css`.
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
      <CabecalhoDocumento
        titulo={tipo}
        subtitulo={numero ?? "sem número"}
        meta={
          <EmissaoDocumento emitidoPor={emitidoPor} emitidoEm={emitidoEm} />
        }
      />

      {/* A Pista: divisória do cabeçalho, o mesmo desenho do logo. */}
      <PistaEmt />

      {children}

      <footer className="mt-2 border-t border-[#E8E6E1] pt-2">
        <RodapeEmpresa />
      </footer>
    </article>
  );
}

/**
 * Bloco titulado do espelho. O rótulo sai no verde da marca com um traço do
 * asfalto embaixo: é o que dá ao papel a mesma hierarquia da tela sem gastar
 * uma tarja colorida por seção.
 */
export function EspelhoSecao({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="border-b border-[#D8DFD8] pb-[3px] text-[11px] font-semibold tracking-[0.06em] text-[#2E5B34] uppercase">
        {rotulo}
      </h2>
      {children}
    </section>
  );
}

/**
 * Regra única de ausência do espelho, usada por `EspelhoCampos`,
 * `EspelhoTabela` e `EspelhoDinheiro` — as três precisam responder igual, e
 * três cópias da mesma condição divergem com o tempo (foi exatamente o que
 * aconteceu: a tabela ficou só no `??`).
 *
 * `??` sozinho NÃO basta: ele pega `null` e `undefined`, mas não a string
 * vazia, e `formatarData`/`formatarDataHora` devolvem `""` quando a data é
 * nula. Parcela em aberto não tem `dataPagamento`, então a coluna "Pago em"
 * saía EM BRANCO no papel — e em branco não distingue "não tem valor" de
 * "esqueceram de imprimir". O documento existe para servir de prova.
 *
 * Só `null`, `undefined` e `""` são ausência. `0` e `false` são valor de
 * verdade (quantidade zero, número de parcela, desconto zerado), por isso a
 * checagem é explícita nos três casos e nunca uma checagem de "falsy".
 */
function semValor(valor: React.ReactNode): boolean {
  return valor === null || valor === undefined || valor === "";
}

/**
 * Grade rótulo/valor, dentro de um painel de superfície neutra. Campo sem valor
 * sai como travessão: no papel, espaço vazio não distingue "não tem" de
 * "esqueceram de imprimir".
 *
 * O painel é decoração e nada mais: se quem imprime desligar "gráficos de
 * fundo", ele sai branco com a borda e a grade continua exatamente a mesma.
 */
export function EspelhoCampos({
  campos,
}: {
  campos: { rotulo: string; valor: React.ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-[3px] border border-[#E8E6E1] bg-[#F7F7F5] px-3 py-2 text-[13px] sm:grid-cols-3">
      {campos.map((campo) => (
        <div key={campo.rotulo} className="flex flex-col">
          <dt className="text-[11px] text-[#6B6B6B]">{campo.rotulo}</dt>
          <dd className="text-[#1F1F1F]">
            {semValor(campo.valor) ? "—" : campo.valor}
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
        <tr className="border-b border-[#B9CDBD] bg-[#F0F5F1]">
          {colunas.map((coluna) => (
            <th
              key={coluna.chave}
              className={cn(
                "px-2 py-1 text-left text-[11px] font-semibold text-[#2E5B34]",
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
            {colunas.map((coluna) => {
              const conteudo = linha[coluna.chave];
              return (
                <td
                  key={coluna.chave}
                  className={cn(
                    "px-2 py-1 align-top",
                    coluna.alinharDireita && "text-right tabular-nums",
                  )}
                >
                  {/* Célula sem valor vira travessão — inclusive a string
                  vazia que `formatarData(null)` devolve. Ver `semValor`. */}
                  {semValor(conteudo) ? "—" : conteudo}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
      {totais ? (
        <tfoot>
          <tr className="border-t border-[#1F1F1F] font-semibold">
            {colunas.map((coluna) => (
              <td
                key={coluna.chave}
                className={cn(
                  "px-2 py-1",
                  coluna.alinharDireita && "text-right tabular-nums",
                )}
              >
                {/* Travessão aqui, não — e por isso esta linha NÃO usa
                `semValor` de propósito. Na linha de corpo, célula vazia é um
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
  if (semValor(valor)) {
    return <span className="tabular-nums">—</span>;
  }
  return <span className="tabular-nums">{formatarBRL(valor)}</span>;
}

/**
 * Página de espelho sem nada para imprimir. Leva a marca igual ao documento de
 * verdade: se alguém imprimir esta folha por engano, ela precisa se identificar
 * como papel da EMT e não como uma página de erro solta.
 */
export function EspelhoVazio({
  titulo,
  explicacao,
}: {
  titulo: string;
  explicacao: string;
}) {
  return (
    <div className="mx-auto flex max-w-[190mm] flex-col gap-4 px-6 py-12">
      <LogoEmt titulo="EMT Construtora" className="w-[34mm]" />
      <PistaEmt />
      <div className="flex flex-col gap-2">
        <h1 className="text-[18px] font-semibold">{titulo}</h1>
        <p className="text-[13px] text-[#6B6B6B]">{explicacao}</p>
      </div>
    </div>
  );
}
