"use client";

import { ArrowRight, TriangleAlert } from "lucide-react";

import { formatarBRL } from "@/lib/formatadores";
import type { ReclassificacaoPendente } from "@/modules/compras/ordens/form-mapeamento";

/**
 * O aviso de que mudar a categoria dentro da OC muda o CADASTRO do insumo.
 *
 * A categoria de custo não é um campo da ordem: ela mora em
 * `insumos.categoria_financeira_id`, e a ordem só lê. Isso é o que faz a coluna
 * ser editável aqui (quem está comprando é quem sabe o que está comprando) e é
 * também o que faz a edição valer para trás: as ordens antigas leem o mesmo
 * cadastro, e os lançamentos que elas já geraram são reclassificados junto.
 *
 * Sem este aviso a pessoa trocaria "MUNHÃO" de Materiais para Peças achando que
 * está corrigindo uma ordem, e teria mexido no DRE de meses fechados.
 */

/** O que a contagem de impacto pode estar dizendo. */
export type ImpactoReclassificacao =
  | { estado: "carregando" }
  | { estado: "erro"; mensagem: string }
  | {
      estado: "pronto";
      /** Ordens de compra que compraram algum destes insumos. */
      ordens: number;
      /** Dessas, quantas já foram aprovadas (as que têm lançamento). */
      ordensAprovadas: number;
      /** Lançamentos que vão ter o rateio reclassificado. */
      lancamentos: number;
      /** Quanto dinheiro muda de categoria no DRE. */
      valor: number;
    };

/** O aviso inline, dentro do formulário, enquanto há mudança pendente. */
export function AvisoReclassificacao({
  pendentes,
}: {
  pendentes: ReclassificacaoPendente[];
}) {
  if (pendentes.length === 0) return null;

  return (
    <div className="flex items-start gap-2 rounded-md border border-status-pendente/30 bg-status-pendente/5 px-3 py-3">
      <TriangleAlert
        className="mt-0.5 size-4 shrink-0 text-status-pendente"
        aria-hidden="true"
      />
      <div>
        <p className="text-detalhe font-medium">
          {pendentes.length === 1
            ? "1 insumo vai mudar de categoria no cadastro"
            : `${pendentes.length} insumos vão mudar de categoria no cadastro`}
        </p>
        <p className="text-legenda text-muted-foreground">
          A categoria de custo é do insumo, não desta ordem. Ao salvar, ela muda
          para as compras futuras e também para as ordens anteriores que
          compraram o mesmo insumo, incluindo o que elas já lançaram no
          financeiro.
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {pendentes.map((pendente) => (
            <li
              key={pendente.insumoId}
              className="text-legenda flex flex-wrap items-center gap-1"
            >
              <span className="font-medium">{pendente.insumoNome}</span>
              <span className="text-muted-foreground">
                {pendente.categoriaAnteriorNome ?? "sem categoria"}
              </span>
              <ArrowRight
                className="size-3 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="font-medium">{pendente.categoriaNome}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * O conteúdo do diálogo de confirmação: o de/para outra vez, agora com o
 * tamanho do estrago.
 *
 * Os três estados aparecem de forma diferente de propósito. "Carregando" não
 * pode parecer zero, e erro não pode parecer zero: uma contagem que falhou e é
 * desenhada como "0 ordens anteriores" convidaria a confirmar uma mudança que
 * atinge trezentas.
 */
export function ListaReclassificacao({
  pendentes,
  impacto,
}: {
  pendentes: ReclassificacaoPendente[];
  impacto: ImpactoReclassificacao;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {pendentes.map((pendente) => (
          <li
            key={pendente.insumoId}
            className="rounded-md border border-border bg-surface px-3 py-2"
          >
            <p className="text-detalhe font-medium">{pendente.insumoNome}</p>
            <p className="text-legenda flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground">
                {pendente.categoriaAnteriorNome ?? "sem categoria"}
              </span>
              <ArrowRight
                className="size-3 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="font-medium">{pendente.categoriaNome}</span>
            </p>
          </li>
        ))}
      </ul>

      {impacto.estado === "carregando" ? (
        <p className="text-legenda text-muted-foreground">
          Contando as ordens e os lançamentos afetados...
        </p>
      ) : null}

      {impacto.estado === "erro" ? (
        <p className="text-legenda text-destructive" role="alert">
          Não foi possível contar o que muda para trás: {impacto.mensagem}. Sem
          essa contagem, confirme apenas se você tem certeza.
        </p>
      ) : null}

      {impacto.estado === "pronto" ? (
        <div className="rounded-md border border-status-pendente/30 bg-status-pendente/5 px-3 py-2">
          <p className="text-detalhe font-medium">{textoImpacto(impacto)}</p>
          <p className="text-legenda text-muted-foreground">
            Mexe na classificação de lançamentos que somam{" "}
            {formatarBRL(impacto.valor)}, inclusive de meses já fechados. O
            centro de custo, os valores e os pagamentos não mudam: só muda em que
            categoria o custo aparece no DRE.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** "13 ordens anteriores e 9 lançamentos" — a frase do impacto, sem o valor. */
function textoImpacto(
  impacto: Extract<ImpactoReclassificacao, { estado: "pronto" }>,
): string {
  if (impacto.ordens === 0) {
    return "Nenhuma ordem anterior comprou estes insumos: a mudança vale só daqui pra frente.";
  }
  const ordens =
    impacto.ordens === 1
      ? "1 ordem anterior"
      : `${impacto.ordens} ordens anteriores`;
  if (impacto.lancamentos === 0) {
    return `${ordens} passam a mostrar a categoria nova. Nenhuma delas foi aprovada, então nada é reclassificado no financeiro.`;
  }
  const lancamentos =
    impacto.lancamentos === 1
      ? "1 lançamento"
      : `${impacto.lancamentos} lançamentos`;
  return `${ordens} e ${lancamentos} são reclassificados.`;
}

/** O toast depois de aplicar: o que aconteceu, em uma linha. */
export function mensagemDoImpacto(
  pendentes: ReclassificacaoPendente[],
  aplicado: { ordens: number; lancamentos: number },
): string {
  const insumos =
    pendentes.length === 1
      ? `${pendentes[0]!.insumoNome} agora é ${pendentes[0]!.categoriaNome}`
      : `${pendentes.length} insumos reclassificados`;

  if (aplicado.ordens === 0) return `${insumos}. Nenhuma ordem anterior tinha.`;

  const ordens =
    aplicado.ordens === 1 ? "1 ordem" : `${aplicado.ordens} ordens`;
  const lancamentos =
    aplicado.lancamentos === 1
      ? "1 lançamento"
      : `${aplicado.lancamentos} lançamentos`;
  return `${insumos}. ${ordens} e ${lancamentos} atualizados.`;
}
