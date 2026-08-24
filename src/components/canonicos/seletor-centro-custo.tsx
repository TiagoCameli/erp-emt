"use client";

import * as React from "react";

import { CampoFormulario } from "@/components/canonicos/campo-formulario";
import { Combobox } from "@/components/canonicos/combobox";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import {
  etapasDaRaiz,
  raizes,
  resolverSelecao,
  rotuloCentro,
  rotuloDaEtapa,
  valorAoEscolherEtapa,
  valorAoEscolherRaiz,
} from "@/modules/_shared/centro-custo/selecao";

/**
 * Escolha de centro de custo em DOIS campos: a raiz, e a etapa quando ela existe.
 *
 * Um campo só com os 73 centros mistura 12 obras com 61 equipamentos, e quem
 * lança manutenção rola a lista procurando a máquina no meio das obras. Aqui o
 * primeiro campo tem 12 opções e o segundo só aparece quando a raiz escolhida tem
 * etapa.
 *
 * **Genérico pela hierarquia, não chumbado em "manutenção".** Hoje só o centro de
 * manutenção tem etapas (61 equipamentos) e obra nenhuma tem, então na prática o
 * segundo campo só aparece na manutenção. No dia em que uma obra ganhar etapas ele
 * aparece lá sozinho, sem tocar nesta tela -- e o rótulo muda para "Etapa", porque
 * quem lança obra não procura "Equipamento".
 *
 * O que sai daqui é UM id, como o banco guarda: o da etapa quando escolhida, o da
 * raiz quando não. Esvaziar a etapa devolve para a raiz (informar o equipamento é
 * opcional, decisão do dono), e a regra vive em `selecao.ts`, testada.
 */
export interface SeletorCentroCustoProps {
  /** Raízes e etapas, como vêm de `listarCentrosCusto`. */
  centros: readonly CentroCustoOpcao[];
  /** O id gravado: raiz ou etapa. */
  valor: string;
  onValorChange: (valor: string) => void;
  disabled?: boolean;
  /** Prefixo dos ids dos dois campos. */
  idBase: string;
  /**
   * `campos` rende dois `CampoFormulario` (fluem na grade do formulário);
   * `celula` rende os dois comboboxes lado a lado, para dentro de tabela.
   */
  variante?: "campos" | "celula";
  /** Mensagem de erro do campo da raiz. */
  erro?: string;
  obrigatorio?: boolean;
  /**
   * Nome de um centro que não está na lista (inativado depois do documento).
   *
   * Quem quiser restringir o que é oferecido -- a OC não repete centro entre
   * grupos -- passa a lista JÁ FILTRADA em `centros`: a raiz e a etapa saem da
   * oferta pelo mesmo caminho, sem uma segunda prop dizendo a mesma coisa.
   */
  rotuloDoValor?: string;
}

export function SeletorCentroCusto({
  centros,
  valor,
  onValorChange,
  disabled,
  idBase,
  variante = "campos",
  erro,
  obrigatorio,
  rotuloDoValor,
}: SeletorCentroCustoProps) {
  const { raizId, etapaId } = resolverSelecao(centros, valor);

  const opcoesRaiz = React.useMemo(
    () =>
      raizes(centros).map((centro) => ({
        valor: centro.id,
        rotulo: rotuloCentro(centro),
      })),
    [centros],
  );

  const etapas = React.useMemo(
    () => etapasDaRaiz(centros, raizId),
    [centros, raizId],
  );
  const opcoesEtapa = React.useMemo(
    () => etapas.map((centro) => ({ valor: centro.id, rotulo: centro.nome })),
    [etapas],
  );

  const nomeEtapa = rotuloDaEtapa(centros, raizId);
  const idRaiz = `${idBase}-raiz`;
  const idEtapa = `${idBase}-etapa`;

  const comboRaiz = (
    <Combobox
      valor={raizId}
      onValorChange={(escolhido) =>
        onValorChange(valorAoEscolherRaiz(escolhido))
      }
      opcoes={opcoesRaiz}
      rotuloDoValor={rotuloDoValor}
      placeholder={variante === "celula" ? "Selecione" : "Selecione o centro de custo"}
      disabled={disabled}
      id={idRaiz}
      ariaLabel={variante === "celula" ? "Centro de custo" : undefined}
    />
  );

  // Etapa vazia é uma OPÇÃO da lista, não a ausência de opção: sem ela, quem
  // escolheu um equipamento por engano não tem como voltar para "a manutenção em
  // geral" a não ser trocando a raiz e perdendo o resto do preenchimento.
  const comboEtapa = (
    <Combobox
      valor={etapaId}
      onValorChange={(escolhido) =>
        onValorChange(valorAoEscolherEtapa(raizId, escolhido))
      }
      opcoes={opcoesEtapa}
      placeholder={variante === "celula" ? nomeEtapa : `Selecione o ${nomeEtapa.toLowerCase()} (opcional)`}
      limpavel
      disabled={disabled}
      id={idEtapa}
      ariaLabel={variante === "celula" ? nomeEtapa : undefined}
    />
  );

  if (variante === "celula") {
    return (
      // `w-full` não é enfeite: a célula da TabelaItens é `flex flex-col
      // items-start`, e `items-start` desliga o esticamento -- sem largura
      // declarada esta fileira encolhe até o conteúdo e o combobox fica do
      // tamanho do texto, com um vão até a coluna de valor. Antes funcionava
      // porque o gatilho do Combobox já é `w-full` e media a célula direto.
      <div className="flex w-full items-start gap-2">
        <div className="min-w-0 flex-1">{comboRaiz}</div>
        {etapas.length > 0 ? (
          <div className="min-w-0 flex-1">{comboEtapa}</div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <CampoFormulario
        id={idRaiz}
        rotulo="Centro de custo"
        obrigatorio={obrigatorio}
        erro={erro}
      >
        {comboRaiz}
      </CampoFormulario>
      {etapas.length > 0 ? (
        <CampoFormulario
          id={idEtapa}
          rotulo={nomeEtapa}
          ajuda={`Deixe vazio para lançar na ${
            nomeEtapa === "Equipamento" ? "manutenção em geral" : "obra em geral"
          }`}
        >
          {comboEtapa}
        </CampoFormulario>
      ) : null}
    </>
  );
}
