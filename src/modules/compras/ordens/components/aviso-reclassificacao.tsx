"use client";

import { ArrowRight, TriangleAlert } from "lucide-react";

import { formatarBRL } from "@/lib/formatadores";
import type { ReclassificacaoPendente } from "@/modules/compras/ordens/form-mapeamento";

/**
 * O aviso de que mudar a subcategoria dentro da OC muda o CADASTRO do insumo.
 *
 * A subcategoria não é campo da ordem: mora em `insumos.categoria_id`, e a ordem
 * só lê. Isso é o que faz a coluna ser editável aqui (quem está comprando é quem
 * sabe o que está comprando) e é também o que faz a edição valer para trás: as
 * ordens antigas leem o mesmo cadastro, e os lançamentos que elas já geraram são
 * reclassificados junto.
 *
 * E o efeito não para na subcategoria: desde 28/08/2026 a categoria de custo (a
 * do DRE) é da SUBCATEGORIA, então mover um insumo de subcategoria muda em que
 * linha do DRE a compra dele entra. É esse par que o aviso mostra — de/para da
 * subcategoria E de/para da categoria de custo. Sem ele a pessoa trocaria
 * "MUNHÃO" de Peças para Hidráulica achando que está arrumando um cadastro, e
 * teria mexido no DRE de meses fechados.
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


/**
 * O par "de → para", que aparece duas vezes: no aviso inline e no diálogo.
 *
 * A linha da CATEGORIA DE CUSTO só é desenhada quando ela muda de verdade. Mover
 * um insumo de "Hidráulica" para "Elétrica" não muda nada no DRE (as duas caem em
 * "Materiais de construção"), e desenhar um de/para com os dois lados iguais faria
 * a pessoa achar que mexeu no dinheiro quando não mexeu.
 */
function DePara({
  de,
  para,
  vazio,
}: {
  de: string | null;
  para: string | null;
  vazio: string;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="text-muted-foreground">{de ?? vazio}</span>
      <ArrowRight
        className="size-3 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="font-medium">{para ?? vazio}</span>
    </span>
  );
}

/** A categoria de custo mudou junto? É o que decide mostrar o efeito no DRE. */
function mudouOCusto(pendente: ReclassificacaoPendente): boolean {
  return pendente.categoriaCustoNome !== pendente.categoriaCustoAnteriorNome;
}

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
            ? "1 insumo vai mudar de subcategoria no cadastro"
            : `${pendentes.length} insumos vão mudar de subcategoria no cadastro`}
        </p>
        <p className="text-legenda text-muted-foreground">
          A subcategoria é do insumo, não desta ordem, e é ela que diz em qual
          categoria de custo a compra entra no DRE. Ao salvar, muda para as
          compras futuras e também para as ordens anteriores que compraram o
          mesmo insumo, incluindo o que elas já lançaram no financeiro.
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {pendentes.map((pendente) => (
            <li key={pendente.insumoId} className="text-legenda">
              <span className="flex flex-wrap items-center gap-1">
                <span className="font-medium">{pendente.insumoNome}</span>
                <DePara
                  de={pendente.subcategoriaAnteriorNome}
                  para={pendente.subcategoriaNome}
                  vazio="sem subcategoria"
                />
              </span>
              {mudouOCusto(pendente) ? (
                <span className="ml-1 flex flex-wrap items-center gap-1">
                  <span className="text-muted-foreground">no DRE:</span>
                  <DePara
                    de={pendente.categoriaCustoAnteriorNome}
                    para={pendente.categoriaCustoNome}
                    vazio="sem categoria de custo"
                  />
                </span>
              ) : null}
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
            <div className="text-legenda flex flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-1">
                <span className="text-muted-foreground">Subcategoria:</span>
                <DePara
                  de={pendente.subcategoriaAnteriorNome}
                  para={pendente.subcategoriaNome}
                  vazio="sem subcategoria"
                />
              </span>
              {mudouOCusto(pendente) ? (
                <span className="flex flex-wrap items-center gap-1">
                  <span className="text-muted-foreground">
                    Categoria de custo (DRE):
                  </span>
                  <DePara
                    de={pendente.categoriaCustoAnteriorNome}
                    para={pendente.categoriaCustoNome}
                    vazio="sem categoria de custo"
                  />
                </span>
              ) : (
                <span className="text-muted-foreground">
                  A categoria de custo no DRE não muda:{" "}
                  {pendente.categoriaCustoNome ?? "sem categoria de custo"} nas
                  duas subcategorias.
                </span>
              )}
            </div>
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
      ? `${pendentes[0]!.insumoNome} agora é ${pendentes[0]!.subcategoriaNome}`
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
