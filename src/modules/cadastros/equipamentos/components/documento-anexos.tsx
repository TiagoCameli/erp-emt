"use client";

import { ChevronDown, LoaderCircle, Paperclip } from "lucide-react";

import { Anexos } from "@/components/canonicos/anexos";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EntidadeAnexo } from "@/modules/_shared/anexos/entidades";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";

/** Entidade dos anexos de um documento de equipamento (mesma do banco). */
export const ENTIDADE_DOCUMENTO_EQUIPAMENTO =
  "equipamento_documento" satisfies EntidadeAnexo;

/** "Sem anexo", "1 anexo", "3 anexos". */
export function rotuloQuantidadeAnexos(quantidade: number): string {
  if (quantidade === 0) return "Sem anexo";
  return quantidade === 1 ? "1 anexo" : `${quantidade} anexos`;
}

export interface BotaoAnexosDocumentoProps {
  /** Tipo do documento, para o rótulo acessível ("Licenciamento"). */
  tipoDocumento: string;
  /** null enquanto a lista ainda não chegou do servidor. */
  anexos: AnexoDoDocumento[] | null;
  aberto: boolean;
  onAlternar: () => void;
}

/**
 * Botão compacto da linha do documento: mostra quantos anexos ele tem e abre
 * a seção de anexos logo abaixo. Enquanto a lista não chegou fica desabilitado
 * com spinner, para ninguém ler "Sem anexo" de um documento que tem.
 */
export function BotaoAnexosDocumento({
  tipoDocumento,
  anexos,
  aberto,
  onAlternar,
}: BotaoAnexosDocumentoProps) {
  const carregando = anexos === null;
  const quantidade = anexos?.length ?? 0;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={carregando}
      aria-expanded={aberto}
      aria-label={
        carregando
          ? `Carregando anexos do documento ${tipoDocumento}`
          : `${rotuloQuantidadeAnexos(quantidade)} no documento ${tipoDocumento}`
      }
      onClick={onAlternar}
      className="gap-1 text-muted-foreground"
    >
      {carregando ? (
        <LoaderCircle className="animate-spin" aria-hidden />
      ) : (
        <Paperclip aria-hidden />
      )}
      <span className="tabular-nums">{carregando ? "" : quantidade}</span>
      <ChevronDown
        aria-hidden
        className={cn("transition-transform", aberto && "rotate-180")}
      />
    </Button>
  );
}

export interface AnexosDocumentoEquipamentoProps {
  documentoId: string;
  anexos: AnexoDoDocumento[];
  podeEditar: boolean;
  onMudou: () => void;
}

/**
 * Anexos de um documento do equipamento, pelo componente canônico. A lista
 * vem do servidor (vínculos em `anexo_vinculos`); a coluna legada `anexo_path`
 * não entra aqui.
 */
export function AnexosDocumentoEquipamento({
  documentoId,
  anexos,
  podeEditar,
  onMudou,
}: AnexosDocumentoEquipamentoProps) {
  return (
    <div className="border-t border-border bg-surface/50 px-3 py-3">
      <Anexos
        entidade={ENTIDADE_DOCUMENTO_EQUIPAMENTO}
        entidadeId={documentoId}
        anexos={anexos}
        podeEditar={podeEditar}
        onMudou={onMudou}
      />
    </div>
  );
}
