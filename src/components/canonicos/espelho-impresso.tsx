import * as React from "react";

import { LogoEmt } from "@/components/canonicos/logo-emt";
import {
  BlocoEmpresa,
  CabecalhoDocumento,
  PistaEmt,
  RodapeDocumento,
} from "@/components/canonicos/marca-documento";
import type { StatusPadrao } from "@/components/canonicos/status-badge";
import { formatarBRL, formatarDataHora } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

/**
 * Espelho impresso de um documento.
 *
 * O desenho responde à pergunta na ordem em que ela é feita quando alguém pega
 * o papel na mão: de quem é (cabeçalho), o que é e em que situação está
 * (tarja), quanto é e para quem (destaque), quando vence e quanto já saiu
 * (cartões), e só então o detalhe. Por isso o valor é a maior coisa da folha e
 * não mais uma linha de tabela.
 *
 * **Cabe em uma A4.** O orçamento vertical é apertado de propósito: cartões em
 * vez de seções, duas colunas de rótulo/valor em vez de uma, anexo como
 * contagem em vez de tabela. O que ainda pode estourar é dado, não layout (um
 * rateio com trinta centros de custo), e nesse caso a folha continua — o
 * documento NUNCA corta linha para caber, porque um papel que parece completo
 * sem estar é pior que um papel de duas folhas.
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
  situacao,
  tom = "neutro",
  emitidoPor,
  emitidoEm,
  children,
}: {
  /** O que o papel é, na tarja: "Conta a pagar", "Ordem de compra". */
  tipo: string;
  /** Número do documento. Nulo em registro anterior à numeração. */
  numero: string | null;
  /** Em que situação está, na mesma tarja: "Em aberto", "Pago". */
  situacao?: string;
  /** A cor da tarja. Ver `TONS`. */
  tom?: TomEspelho;
  emitidoPor: string;
  /** ISO. Quem imprime vê quando o papel foi gerado. */
  emitidoEm: string;
  children: React.ReactNode;
}) {
  return (
    <article className="espelho-documento mx-auto flex max-w-[190mm] flex-col gap-2 px-6 py-4 text-[#1F1F1F]">
      <CabecalhoDocumento meta={<BlocoEmpresa />} />
      <PistaEmt />
      <EspelhoTarja
        tipo={tipo}
        numero={numero}
        situacao={situacao}
        tom={tom}
        emitidoPor={emitidoPor}
        emitidoEm={emitidoEm}
      />
      {children}
      <RodapeDocumento tipo={`Espelho de ${tipo.toLowerCase()}`} />
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Tons                                                               */
/* ------------------------------------------------------------------ */

/**
 * A cor da tarja diz a situação do documento, e é a MESMA semântica dos badges
 * de status da tela: âmbar pendente, verde efetivado, vermelho recusado, cinza
 * rascunho. Nenhuma delas é o verde da marca — o verde da marca é do destaque
 * e dos títulos, e se a tarja usasse ele, "pago" ficaria com a cor de
 * "documento da EMT" e a cor pararia de dizer qualquer coisa.
 *
 * A cor nunca é a única portadora: a tarja escreve a situação em texto ao lado
 * do ponto, porque quem imprime pode desligar "gráficos de fundo".
 */
const TONS = {
  aberto: { fundo: "#FDF3E3", borda: "#EBD5AE", texto: "#8A5A0B" },
  efetivado: { fundo: "#ECF4EE", borda: "#BFDAC6", texto: "#15803D" },
  recusado: { fundo: "#FCECEC", borda: "#EFC5C5", texto: "#B91C1C" },
  neutro: { fundo: "#F1F1EF", borda: "#DEDCD6", texto: "#57534E" },
} as const;

export type TomEspelho = keyof typeof TONS;

/**
 * Tom da tarja a partir do status padrão do ERP.
 *
 * Derivado do MESMO `StatusPadrao` que alimenta o `StatusBadge` da tela, e não
 * de um mapa próprio por status de módulo: assim o papel e a tela nunca
 * discordam sobre a cor de um documento, e status novo entra nos dois de uma
 * vez em vez de sair cinza no papel por esquecimento.
 */
export function tomDoStatus(status: StatusPadrao): TomEspelho {
  switch (status) {
    case "pago":
    case "recebido":
    case "faturado":
    case "executado":
    case "aprovado":
      return "efetivado";
    case "rejeitado":
    case "cancelado":
      return "recusado";
    case "pendente_aprovacao":
      return "aberto";
    case "rascunho":
      return "neutro";
  }
}

/**
 * Tarja de tipo e situação, o número do documento, e o carimbo de emissão do
 * outro lado.
 *
 * O número fica aqui, e não numa linha própria, porque ele é o que se procura
 * ao folhear um maço de espelhos — e nesta fileira ele não custa altura
 * nenhuma numa folha que precisa fechar em A4.
 */
export function EspelhoTarja({
  tipo,
  numero,
  situacao,
  tom,
  emitidoPor,
  emitidoEm,
}: {
  tipo: string;
  numero: string | null;
  situacao?: string;
  tom: TomEspelho;
  emitidoPor: string;
  emitidoEm: string;
}) {
  const cor = TONS[tom];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <span
          className="inline-flex shrink-0 items-center gap-[6px] rounded-full border px-[10px] py-[3px] text-[10px] font-bold tracking-[0.09em] uppercase"
          style={{
            backgroundColor: cor.fundo,
            borderColor: cor.borda,
            color: cor.texto,
          }}
        >
          <span
            className="size-[6px] shrink-0 rounded-full"
            style={{ backgroundColor: cor.texto }}
            aria-hidden="true"
          />
          {tipo}
          {situacao ? <span className="opacity-70">· {situacao}</span> : null}
        </span>
        <span className="truncate font-mono text-[11px] font-semibold text-[#57534E]">
          {numero ?? "sem número"}
        </span>
      </span>
      <span className="text-[9.5px] text-[#8A8A8A]">
        Emitido em {formatarDataHora(emitidoEm)} · Por: {emitidoPor}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Destaque                                                           */
/* ------------------------------------------------------------------ */

/**
 * A faixa verde do topo: de quem é o documento, e quanto.
 *
 * O valor sai grande e à direita porque é o campo que a pessoa procura
 * primeiro, e porque num maço de espelhos empilhados é o único jeito de achar
 * o documento certo sem ler folha por folha.
 */
export function EspelhoDestaque({
  rotulo,
  titulo,
  badge,
  descricao,
  rotuloValor = "Valor",
  valor,
}: {
  /** "Fornecedor", "Colaborador", "Cliente". */
  rotulo: string;
  /** O nome. Sai grande. */
  titulo: string | null;
  /** Selo ao lado do nome: "Parcela 2/12". */
  badge?: string | null;
  descricao?: string | null;
  rotuloValor?: string;
  valor: number | string | null | undefined;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[8px] bg-[#3E7744] px-4 py-[10px] text-white">
      <div className="flex min-w-0 flex-col gap-[1px]">
        {/*
          O selo fica ao lado do RÓTULO, não do nome. Ao lado do nome ele
          quebrava para uma linha própria assim que o fornecedor era comprido
          ("SECRETARIA DE ESTADO DA FAZENDA DO ACRE"), e essa linha extra era a
          diferença entre a folha fechar em A4 ou não.
        */}
        <span className="flex items-center gap-2">
          <span className="text-[9px] font-semibold tracking-[0.12em] text-white/70 uppercase">
            {rotulo}
          </span>
          {badge ? (
            <span className="rounded-full bg-[#CF943A] px-[8px] py-[1px] text-[10px] font-semibold text-[#231A08]">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[19px] leading-tight font-bold">
          {semValor(titulo) ? "—" : titulo}
        </span>
        {descricao ? (
          <span className="text-[11px] leading-[15px] text-white/85">
            {descricao}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="text-[9px] font-semibold tracking-[0.12em] text-white/70 uppercase">
          {rotuloValor}
        </span>
        <span className="text-[24px] leading-tight font-bold tabular-nums">
          {semValor(valor) ? "—" : formatarBRL(valor)}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cartões                                                            */
/* ------------------------------------------------------------------ */

export interface CartaoEspelho {
  rotulo: string;
  valor: React.ReactNode;
  /** Linha pequena embaixo do valor: "3 de 12 parcelas". */
  nota?: React.ReactNode;
  /** `destaque` tinge o cartão de âmbar. Use no que a pessoa procura. */
  tom?: "neutro" | "destaque";
}

/**
 * Fileira de cartões: as respostas curtas (vence quando, quanto já saiu,
 * quanto falta) antes do detalhe.
 *
 * Grade de largura igual, e não `flex-1` solto: com larguras diferentes o olho
 * lê os cartões como se um valesse mais que o outro, e aqui os três valem o
 * mesmo. `items-stretch` do grid deixa todos na altura do mais alto, então uma
 * nota em um cartão não desalinha a fileira.
 */
export function EspelhoCartoes({ cartoes }: { cartoes: CartaoEspelho[] }) {
  if (cartoes.length === 0) return null;
  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${cartoes.length}, minmax(0, 1fr))`,
      }}
    >
      {cartoes.map((cartao) => (
        <div
          key={cartao.rotulo}
          className={cn(
            "flex flex-col justify-center rounded-[6px] border px-3 py-[5px]",
            cartao.tom === "destaque"
              ? "border-[#EBD5AE] bg-[#FDF6EA]"
              : "border-[#E8E6E1] bg-[#F7F7F5]",
          )}
        >
          <span className="text-[9px] font-semibold tracking-[0.1em] text-[#6B6B6B] uppercase">
            {cartao.rotulo}
          </span>
          <span className="text-[15px] leading-tight font-bold tabular-nums">
            {semValor(cartao.valor) ? "—" : cartao.valor}
          </span>
          {cartao.nota ? (
            <span className="text-[9.5px] leading-[13px] text-[#6B6B6B]">
              {cartao.nota}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Faixa de resumo: os mesmos pares rótulo/valor dos cartões, em UMA linha.
 *
 * Existe para o resumo do lançamento dentro do espelho de pagamento, onde uma
 * segunda fileira de cartões custava 110px de uma folha que precisa fechar em
 * A4 — e, pior, deixava sete blocos de número na mesma página, sem dizer qual
 * deles é o dinheiro DESTA parcela. A faixa tem peso visual menor de
 * propósito: ela é contexto do documento, não o assunto dele.
 */
export function EspelhoFaixaResumo({
  itens,
}: {
  itens: { rotulo: string; valor: React.ReactNode }[];
}) {
  if (itens.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-[6px] border border-[#E8E6E1] bg-[#F7F7F5] px-3 py-[6px]">
      {itens.map((item) => (
        <span key={item.rotulo} className="flex items-baseline gap-[6px]">
          <span className="text-[9px] font-semibold tracking-[0.09em] text-[#6B6B6B] uppercase">
            {item.rotulo}
          </span>
          <span className="text-[12px] font-bold tabular-nums">
            {semValor(item.valor) ? "—" : item.valor}
          </span>
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seções e linhas                                                    */
/* ------------------------------------------------------------------ */

/**
 * Seções curtas lado a lado, para caberem na mesma altura.
 *
 * Três colunas existem para a ordem de compra, onde formação do total, rateio e
 * parcelas previstas são três blocos de três a cinco linhas cada: empilhados,
 * eles sozinhos gastavam um terço da folha.
 */
export function EspelhoColunas({
  colunas = 2,
  children,
}: {
  colunas?: 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-5 gap-y-2",
        colunas === 3 ? "grid-cols-3" : "grid-cols-2",
      )}
    >
      {children}
    </div>
  );
}

/**
 * Bloco titulado. O rótulo sai no verde da marca, em versalete, com um traço
 * embaixo: dá hierarquia ao papel sem gastar altura com tarja colorida por
 * seção.
 */
export function EspelhoSecao({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-[4px]">
      <h2 className="border-b border-[#D8DFD8] pb-[3px] text-[9.5px] font-bold tracking-[0.11em] text-[#2E5B34] uppercase">
        {rotulo}
      </h2>
      {children}
    </section>
  );
}

/**
 * Regra única de ausência do espelho, usada por `EspelhoLinhas`,
 * `EspelhoTabela`, `EspelhoCartoes`, `EspelhoDestaque` e `EspelhoDinheiro` —
 * todas precisam responder igual, e cópias da mesma condição divergem com o
 * tempo (foi exatamente o que aconteceu: a tabela ficou só no `??`).
 *
 * `??` sozinho NÃO basta: ele pega `null` e `undefined`, mas não a string
 * vazia, e `formatarData`/`formatarDataHora` devolvem `""` quando a data é
 * nula. Parcela em aberto não tem `dataPagamento`, então a coluna "Pago em"
 * saía EM BRANCO no papel — e em branco não distingue "não tem valor" de
 * "esqueceram de imprimir". O documento existe para servir de prova.
 *
 * Só `null`, `undefined` e `""` são ausência. `0` e `false` são valor de
 * verdade (quantidade zero, número de parcela, desconto zerado), por isso a
 * checagem é explícita nos casos e nunca uma checagem de "falsy".
 */
function semValor(valor: React.ReactNode): boolean {
  return valor === null || valor === undefined || valor === "";
}

/**
 * Linhas rótulo/valor: rótulo à esquerda em cinza, valor à direita em negrito.
 *
 * Alinhado à direita, e não em grade de colunas: numa coluna estreita o valor
 * é o que se compara entre linhas, e valor encostado à direita se lê de cima a
 * baixo. Campo sem valor sai como travessão — no papel, espaço vazio não
 * distingue "não tem" de "esqueceram de imprimir".
 */
export function EspelhoLinhas({
  linhas,
}: {
  linhas: { rotulo: string; valor: React.ReactNode }[];
}) {
  return (
    <dl className="flex flex-col">
      {linhas.map((linha) => (
        <div
          key={linha.rotulo}
          className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-[2px] last:border-b-0"
        >
          <dt className="shrink-0 text-[10.5px] text-[#6B6B6B]">
            {linha.rotulo}
          </dt>
          <dd className="min-w-0 text-right text-[11px] font-semibold tabular-nums">
            {semValor(linha.valor) ? "—" : linha.valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Linha pequena de nota, para contagem de anexo e afins.
 *
 * Sem ícone: emoji de clipe depende da fonte de emoji do sistema que abrir o
 * PDF e sai como retângulo vazio ou borrão preto em impressora monocromática.
 * O traço vertical basta para separar a nota do bloco de cima e imprime em
 * qualquer lugar.
 */
export function EspelhoNota({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l-2 border-[#E8E6E1] pl-2 text-[10px] text-[#6B6B6B]">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Tabela                                                             */
/* ------------------------------------------------------------------ */

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
    return <p className="text-[10.5px] text-[#6B6B6B]">Nada a listar</p>;
  }
  return (
    <table className="w-full border-collapse text-[10.5px]">
      <thead>
        <tr className="border-b border-[#B9CDBD] bg-[#F0F5F1]">
          {colunas.map((coluna) => (
            <th
              key={coluna.chave}
              className={cn(
                "px-2 py-[2px] text-left text-[9.5px] font-bold tracking-wide text-[#2E5B34] uppercase",
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
            className="border-b border-[#EFEEEA] last:border-b-0"
          >
            {colunas.map((coluna) => {
              const conteudo = linha[coluna.chave];
              return (
                <td
                  key={coluna.chave}
                  className={cn(
                    "px-2 py-[2px] align-top",
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
          <tr className="border-t border-[#1F1F1F] font-bold">
            {colunas.map((coluna) => (
              <td
                key={coluna.chave}
                className={cn(
                  "px-2 py-[2px]",
                  coluna.alinharDireita && "text-right tabular-nums",
                )}
              >
                {/* Travessão aqui, não — e por isso esta linha NÃO usa
                `semValor` de propósito. Na linha de corpo, célula vazia é um
                campo que existe e está em branco (daí o "—" ali). Na linha de
                totais, coluna sem total é uma coluna que NÃO TEM total nenhum
                (não existe "total de Status" ou "total de Vencimento"):
                travessão em várias colunas encheria a linha de ruído. */}
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

/* ------------------------------------------------------------------ */
/* Assinatura e página vazia                                          */
/* ------------------------------------------------------------------ */

/**
 * Linha de assinatura. Existe porque este papel circula assinado: a versão que
 * o Tiago usa hoje é assinada à mão em cima da linha antes de arquivar, e sem
 * a linha impressa a assinatura cai por cima do rodapé.
 */
export function EspelhoAssinatura({
  rotulo,
  children,
}: {
  rotulo: string;
  /**
   * O que vai à ESQUERDA da linha de assinatura, normalmente a nota de anexos.
   * Divide a mesma faixa de propósito: a linha de assinatura precisa de altura
   * (é onde a caneta encosta) e sozinha ela desperdiçava essa altura inteira do
   * lado esquerdo, numa folha que precisa fechar em A4.
   */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="w-[70mm] shrink-0 border-t border-[#9A9A9A] pt-1 text-center text-[9px] tracking-[0.1em] text-[#6B6B6B] uppercase">
        {rotulo}
      </div>
    </div>
  );
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
      <LogoEmt titulo="EMT Construtora" className="w-[26mm]" />
      <PistaEmt />
      <div className="flex flex-col gap-2">
        <h1 className="text-[18px] font-semibold">{titulo}</h1>
        <p className="text-[13px] text-[#6B6B6B]">{explicacao}</p>
      </div>
    </div>
  );
}
