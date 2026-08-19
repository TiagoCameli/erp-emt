/**
 * A moldura de marca de todo documento que o sistema imprime: cabeçalho com a
 * logo, a Pista como divisória e o rodapé que identifica a empresa.
 *
 * Um lugar só, e não um cabeçalho por relatório, porque a exigência aqui é de
 * IGUALDADE, não de estilo: espelho de OC, espelho de pagamento e holerite
 * precisam sair com a mesma logo, o mesmo CNPJ e o mesmo endereço. No dia em
 * que cada tela desenhar o seu próprio cabeçalho, os documentos começam a
 * divergir entre si — e um maço com dois CNPJs diferentes é problema na
 * contabilidade, não detalhe visual.
 *
 * Nada aqui carrega dado: a marca é decoração por cima de um documento que já
 * se explica em texto. Se quem imprime desligar "gráficos de fundo" no diálogo
 * do sistema, some a cor e o documento continua completo.
 */
import * as React from "react";

import { LogoEmt } from "@/components/canonicos/logo-emt";
import { EMPRESA } from "@/config/marca";
import { formatarDataHora } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

/**
 * A Pista: o desenho do logo virado régua. Asfalto com o eixo amarelo no meio.
 *
 * Dois elementos com cor de fundo, e não um `linear-gradient`: gradiente é a
 * primeira coisa que o navegador descarta quando a impressão está sem gráficos
 * de fundo, e aí a divisória sumiria inteira em vez de sair sem cor.
 */
export function PistaEmt({ className }: { className?: string }) {
  return (
    <div className={cn("h-[8px] w-full bg-[#45464B]", className)}>
      <div className="mt-[3px] h-[2px] w-full bg-[#CF943A]" />
    </div>
  );
}

/**
 * Cabeçalho de documento impresso: logo à esquerda, título no centro da folha,
 * identificação do papel à direita.
 *
 * As duas colunas laterais têm largura FIXA e igual de propósito. Com colunas
 * elásticas o título deixa de ficar centrado assim que o número do documento
 * cresce, e um maço de espelhos sai com o título dançando de folha em folha.
 *
 * A largura da logo (26mm) é a mesma do documento que o Tiago usa hoje como
 * padrão: maior que isso a marca briga com o título, que é o que a pessoa
 * procura primeiro quando pega o papel na mão.
 *
 * As laterais são 28mm, e não mais, porque este cabeçalho também serve o
 * holerite, que mora num diálogo de 448px: com laterais largas sobrava tão pouco
 * no centro que "Competência 08/2026" quebrava em duas linhas e parecia campo
 * cortado. O `whitespace-nowrap` no subtítulo é a segunda metade da mesma
 * garantia: número de documento não se parte no meio.
 */
export function CabecalhoDocumento({
  titulo,
  subtitulo,
  meta,
}: {
  /**
   * O que o papel é: "Holerite". Opcional — quando não vem, a coluna do centro
   * não existe e a da direita ocupa o resto da largura. É assim que o espelho
   * usa: lá o tipo do documento é uma tarja logo abaixo (`EspelhoTarja`, que diz
   * o tipo E a situação numa cor só), e o lado direito é o bloco de endereço da
   * empresa, que não caberia em 28mm.
   */
  titulo?: string;
  /** Número do documento, competência: a segunda linha do centro. */
  subtitulo?: React.ReactNode;
  /** Canto direito. Emissão em letra pequena, ou o `BlocoEmpresa`. */
  meta?: React.ReactNode;
}) {
  const temTitulo = titulo !== undefined;
  return (
    <header className="flex items-start justify-between gap-4">
      <div className={cn("shrink-0", temTitulo && "w-[28mm]")}>
        <LogoEmt titulo={EMPRESA.nome} className="w-[26mm]" />
      </div>

      {temTitulo ? (
        <div className="flex min-w-0 flex-1 flex-col items-center pt-1 text-center">
          <h1 className="text-[19px] leading-tight font-semibold tracking-tight">
            {titulo}
          </h1>
          {subtitulo ? (
            <span className="font-mono text-[13px] whitespace-nowrap text-[#6B6B6B]">
              {subtitulo}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "flex shrink-0 flex-col items-end pt-1 text-right text-[10px] leading-[14px] text-[#6B6B6B]",
          temTitulo ? "w-[28mm]" : "min-w-0 flex-1",
        )}
      >
        {meta}
      </div>
    </header>
  );
}

/**
 * Bloco de identificação da empresa para o CANTO do cabeçalho: razão social,
 * CNPJ, endereço em duas linhas e telefone.
 *
 * Sobe pro topo do documento, e não fica só no rodapé, porque é assim que se lê
 * um papel que sai da empresa: quem emitiu está no alto, junto da marca. O
 * rodapé continua existindo, mas em uma linha só (`RodapeDocumento`), dizendo o
 * que o papel é.
 */
export function BlocoEmpresa() {
  return (
    <>
      <span className="text-[11px] leading-[15px] font-bold tracking-wide text-[#1F1F1F] uppercase">
        {EMPRESA.razaoSocial}
      </span>
      <span>CNPJ: {EMPRESA.cnpj}</span>
      <span>{EMPRESA.logradouro}</span>
      <span>{EMPRESA.cidade}</span>
      <span>{EMPRESA.telefones}</span>
    </>
  );
}

/**
 * Identificação da empresa. Sai de `EMPRESA` (src/config/marca.ts), nunca
 * escrita à mão na tela que imprime.
 */
export function RodapeEmpresa({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-[1px] text-center text-[10px] leading-[14px] text-[#6B6B6B]",
        className,
      )}
    >
      <span>
        <span className="font-semibold text-[#2E5B34]">
          {EMPRESA.razaoSocial}
        </span>{" "}
        · CNPJ: {EMPRESA.cnpj}
      </span>
      <span>{EMPRESA.endereco}</span>
      <span>
        Telefone: {EMPRESA.telefones} · E-mail: {EMPRESA.email}
      </span>
    </div>
  );
}

/**
 * Rodapé de uma linha: quem emitiu e o que o papel é.
 *
 * Diferente do `RodapeEmpresa` (bloco de três linhas, usado pelo holerite): no
 * espelho o endereço já está no cabeçalho, e repetir aqui gastaria três linhas
 * de uma folha que precisa fechar em A4. O que falta dizer é o que este papel é,
 * e é o que esta linha diz.
 */
export function RodapeDocumento({ tipo }: { tipo: string }) {
  return (
    <div className="border-t border-dashed border-[#D4D2CC] pt-[5px] text-center text-[9px] tracking-[0.08em] text-[#8A8A8A] uppercase">
      {EMPRESA.razaoSocial} · CNPJ {EMPRESA.cnpj} · Documento interno — {tipo}
    </div>
  );
}

/**
 * Carimbo de emissão: quando o papel foi gerado e por quem. Fica no canto
 * direito do cabeçalho, que é onde se procura a data de um documento — e não no
 * rodapé, onde ele competiria com a identificação da empresa.
 *
 * Rótulo em cima e valor embaixo, em vez de "Emitido em 19/08/2026 07:11" numa
 * frase só: na coluna estreita do cabeçalho a frase quebrava sozinha e deixava
 * a hora pendurada numa linha própria, o que num documento de dinheiro parece
 * campo cortado.
 */
export function EmissaoDocumento({
  emitidoPor,
  emitidoEm,
}: {
  emitidoPor: string;
  /** ISO. */
  emitidoEm: string;
}) {
  return (
    <>
      <span>Emitido em</span>
      <span className="font-medium text-[#1F1F1F] tabular-nums">
        {formatarDataHora(emitidoEm)}
      </span>
      <span>por {emitidoPor}</span>
    </>
  );
}
