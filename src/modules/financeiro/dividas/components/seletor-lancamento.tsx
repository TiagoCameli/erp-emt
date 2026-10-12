"use client";

import * as React from "react";
import { LoaderCircle, X } from "lucide-react";

import { MoneyText } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buscarLancamentos, type LancamentoOpcao } from "@/modules/financeiro/dividas/actions";

export interface LancamentoEscolhido {
  id: string;
  numero: string;
  descricao: string;
}

export interface SeletorLancamentoProps {
  id: string;
  tipo: "a_pagar" | "a_receber";
  valor: LancamentoEscolhido | null;
  onValorChange: (valor: LancamentoEscolhido | null) => void;
  disabled?: boolean;
}

/**
 * O lançamento ligado ao contrato ou à cota, buscado pelo número
 * (LAN-2026-6722) ou pela descrição. Busca sob demanda, e não um Combobox com
 * a lista inteira: são milhares de lançamentos a receber, e só um interessa.
 */
export function SeletorLancamento({ id, tipo, valor, onValorChange, disabled }: SeletorLancamentoProps) {
  const [texto, setTexto] = React.useState("");
  // O resultado guarda o texto que o gerou: a lista só mostra o que bate com o
  // que está digitado agora, sem apagar estado dentro do efeito.
  const [resultado, setResultado] = React.useState<{ texto: string; opcoes: LancamentoOpcao[] | string } | null>(
    null,
  );
  const termo = texto.trim();

  React.useEffect(() => {
    if (termo.length < 2) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await buscarLancamentos(tipo, termo);
      if (vivo) setResultado({ texto: termo, opcoes: "erro" in r ? r.erro : r });
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [termo, tipo]);

  if (valor) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-detalhe">
        <span className="font-mono">{valor.numero}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={valor.descricao}>
          {valor.descricao}
        </span>
        {disabled ? null : (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Tirar o lançamento"
            onClick={() => onValorChange(null)}
          >
            <X />
          </Button>
        )}
      </div>
    );
  }

  const atual = resultado && resultado.texto === termo ? resultado.opcoes : null;
  const buscando = termo.length >= 2 && atual === null;

  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Número (LAN-2026-...) ou descrição"
        disabled={disabled}
        autoComplete="off"
      />
      {buscando ? (
        <p className="flex items-center gap-1 text-legenda text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin" aria-hidden />
          Buscando...
        </p>
      ) : typeof atual === "string" ? (
        <p className="text-legenda text-destructive">{atual}</p>
      ) : atual && atual.length === 0 ? (
        <p className="text-legenda text-muted-foreground">
          Nenhum lançamento {tipo === "a_pagar" ? "a pagar" : "a receber"} com esse texto
        </p>
      ) : atual ? (
        <ul className="max-h-56 overflow-y-auto rounded-md border border-border" role="listbox" aria-label="Lançamentos">
          {atual.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-detalhe hover:bg-surface"
                onClick={() => {
                  onValorChange({ id: l.id, numero: l.numero, descricao: l.descricao });
                  setTexto("");
                }}
              >
                <span className="font-mono">{l.numero}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.descricao}</span>
                <MoneyText valor={l.valor} className="text-legenda" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
