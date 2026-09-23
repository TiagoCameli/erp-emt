"use client";

import * as React from "react";

export type EstadoConsulta<T> =
  | { tipo: "vazio" }
  | { tipo: "carregando" }
  | { tipo: "ok"; valor: T }
  | { tipo: "erro" };

/**
 * Consulta assíncrona do formulário (estoque na data, preço médio, combustível
 * na data), guardada com a CHAVE da consulta: enquanto a chave atual não tem
 * resposta, o estado é "carregando", e resposta de uma consulta antiga (a
 * pessoa trocou de tanque no meio) é descartada. Chave null não consulta.
 * Nada de setState síncrono no efeito, só no retorno da action.
 */
export function useConsulta<T>(chave: string | null, executar: () => Promise<T | null>): EstadoConsulta<T> {
  const [resposta, setResposta] = React.useState<{ chave: string; estado: EstadoConsulta<T> } | null>(null);
  const executarRef = React.useRef(executar);
  React.useEffect(() => {
    executarRef.current = executar;
  });

  React.useEffect(() => {
    if (!chave) return;
    let vigente = true;
    void executarRef
      .current()
      .then((valor) => {
        if (!vigente) return;
        setResposta({ chave, estado: valor === null ? { tipo: "erro" } : { tipo: "ok", valor } });
      })
      .catch(() => {
        if (vigente) setResposta({ chave, estado: { tipo: "erro" } });
      });
    return () => {
      vigente = false;
    };
  }, [chave]);

  if (!chave) return { tipo: "vazio" };
  if (resposta?.chave !== chave) return { tipo: "carregando" };
  return resposta.estado;
}

/** O valor da consulta quando respondeu, ou o `reserva` (vazio, carregando ou erro). */
export function valorDaConsulta<T, R>(estado: EstadoConsulta<T>, reserva: R): T | R {
  return estado.tipo === "ok" ? estado.valor : reserva;
}
