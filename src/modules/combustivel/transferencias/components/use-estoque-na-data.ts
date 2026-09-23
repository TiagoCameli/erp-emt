"use client";

import * as React from "react";

import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";

export type EstadoEstoque =
  | { tipo: "vazio" }
  | { tipo: "carregando" }
  | { tipo: "ok"; litros: number }
  | { tipo: "erro" };

type Consulta = (tanqueId: string, dataIso: string) => Promise<{ ok: true; litros: number } | { erro: string }>;

/**
 * Estoque do tanque na data, para a dica do formulário (transferência e
 * esvaziamento). A resposta fica guardada com a CHAVE da consulta (tanque +
 * data): enquanto a chave atual não tem resposta, o estado é "carregando", e
 * resposta de uma consulta antiga (a pessoa trocou de tanque no meio) é
 * descartada. Nada de setState síncrono no efeito, só no retorno da action.
 */
export function useEstoqueNaData(
  consultar: Consulta,
  tanqueId: string | null | undefined,
  dataIso: string | null,
  ativo: boolean,
): EstadoEstoque {
  const chave = ativo && tanqueId && dataIso ? `${tanqueId}|${dataIso}` : null;
  const [resposta, setResposta] = React.useState<{ chave: string; estado: EstadoEstoque } | null>(null);

  React.useEffect(() => {
    if (!chave || !tanqueId || !dataIso) return;
    let vigente = true;
    void consultar(tanqueId, dataIso)
      .then((resultado) => {
        if (!vigente) return;
        setResposta({
          chave,
          estado: "erro" in resultado ? { tipo: "erro" } : { tipo: "ok", litros: resultado.litros },
        });
      })
      .catch(() => {
        if (vigente) setResposta({ chave, estado: { tipo: "erro" } });
      });
    return () => {
      vigente = false;
    };
  }, [chave, tanqueId, dataIso, consultar]);

  if (!chave) return { tipo: "vazio" };
  if (resposta?.chave !== chave) return { tipo: "carregando" };
  return resposta.estado;
}

/** Frase da dica embaixo do campo de litros. */
export function dicaDoEstoque(estado: EstadoEstoque, prefixo: string, semConsulta?: string): string | undefined {
  switch (estado.tipo) {
    case "ok":
      return `${prefixo}: ${formatarLitros(estado.litros)}`;
    case "carregando":
      return "Consultando o estoque do tanque...";
    case "erro":
      return "Não foi possível consultar o estoque; o banco confere ao salvar";
    default:
      return semConsulta;
  }
}
