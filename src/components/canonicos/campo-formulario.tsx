"use client";

import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** Espaçamento padrão entre os campos de um formulário de cadastro. */
export const classesFormulario = "flex flex-col gap-5";

/**
 * Largura do campo, proporcional ao conteúdo. Data e valor são curtos; nome e
 * descrição são longos. Sem isso todo campo estica na largura da coluna, e um
 * input de data com 40rem fica ridículo.
 */
export type LarguraCampo = "curto" | "medio" | "longo" | "cheio";

const CLASSES_LARGURA: Record<LarguraCampo, string> = {
  curto: "max-w-[10rem]",
  medio: "max-w-xs",
  longo: "max-w-xl",
  cheio: "",
};

/** Empilha um label, o controle e uma mensagem de erro opcional. */
export function CampoFormulario({
  id,
  rotulo,
  obrigatorio,
  erro,
  ajuda,
  largura = "cheio",
  children,
  className,
}: {
  id: string;
  rotulo: string;
  obrigatorio?: boolean;
  erro?: string;
  ajuda?: string;
  largura?: LarguraCampo;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", CLASSES_LARGURA[largura], className)}>
      <Label htmlFor={id}>
        {rotulo}
        {obrigatorio ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </Label>
      {children}
      {ajuda && !erro ? (
        <p className="text-legenda text-muted-foreground">{ajuda}</p>
      ) : null}
      {erro ? (
        <p className="text-legenda text-destructive" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

/** Switch "Ativo" pronto para react-hook-form (value/onChange) ou controle simples. */
export function SelectAtivo({
  value,
  onChange,
  disabled,
  rotulo = "Ativo",
  ajuda = "Registros inativos somem das listas de seleção, mas continuam no histórico.",
  className,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  rotulo?: string;
  ajuda?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex flex-col gap-1">
        <Label htmlFor="campo-ativo">{rotulo}</Label>
        {ajuda ? (
          <p className="text-legenda text-muted-foreground">{ajuda}</p>
        ) : null}
      </div>
      <Switch
        id="campo-ativo"
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={rotulo}
      />
    </div>
  );
}
