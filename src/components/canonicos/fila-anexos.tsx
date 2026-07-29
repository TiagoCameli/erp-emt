"use client";

import * as React from "react";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { enviarAnexos } from "@/modules/_shared/anexos/actions";

/** Tamanho legível: 1,2 MB, 340 KB. */
function tamanhoLegivel(bytes: number): string {
  const mb = 1024 * 1024;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < mb) {
    return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  }
  return `${(bytes / mb).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

/**
 * Sobe uma fila de arquivos para um documento que ACABOU de ser criado. Serve
 * aos formulários de criação: vínculo de anexo aponta para um documento, então
 * na criação os arquivos esperam no navegador e sobem aqui, no instante
 * seguinte, sem precisar criar documento fantasma para pendurar arquivo.
 *
 * Devolve quantos falharam; cada falha já avisou na tela pelo nome do arquivo,
 * para nenhum anexo desaparecer em silêncio.
 */
export async function subirFilaDeAnexos(
  entidade: string,
  entidadeId: string,
  arquivos: File[],
): Promise<number> {
  let falhas = 0;

  for (const arquivo of arquivos) {
    const dados = new FormData();
    dados.append("entidade", entidade);
    dados.append("entidadeId", entidadeId);
    dados.append("arquivo", arquivo);

    const envio = await enviarAnexos(dados);
    if ("erro" in envio) {
      falhas += 1;
      toast.error(`${arquivo.name}: ${envio.erro}`);
      continue;
    }
    falhas += envio.erros.length;
    for (const falha of envio.erros) {
      toast.error(`${falha.nome}: ${falha.erro}`);
    }
  }

  return falhas;
}

export interface FilaAnexosProps {
  arquivos: File[];
  onMudar: (arquivos: File[]) => void;
  /** Trava a área enquanto salva ou sobe. */
  ocupado?: boolean;
  /** Texto embaixo do convite, dizendo quando os arquivos sobem. */
  legenda?: string;
}

/**
 * Área de anexos de um formulário de CRIAÇÃO: escolhe e enfileira os arquivos,
 * sem subir nada ainda (o documento não existe). Mesma cara da seção de anexos
 * definitiva, para a pessoa não sentir que são duas coisas diferentes.
 */
export function FilaAnexos({
  arquivos,
  onMudar,
  ocupado = false,
  legenda = "Sobem junto quando você salvar",
}: FilaAnexosProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = React.useState(false);

  function adicionar(novos: File[]) {
    if (novos.length === 0) return;
    onMudar([...arquivos, ...novos]);
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(evento) => {
          adicionar(Array.from(evento.target.files ?? []));
          evento.target.value = "";
        }}
      />

      <button
        type="button"
        disabled={ocupado}
        onClick={() => inputRef.current?.click()}
        onDragOver={(evento) => {
          evento.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(evento) => {
          evento.preventDefault();
          setArrastando(false);
          adicionar(Array.from(evento.dataTransfer.files));
        }}
        className={cn(
          "flex w-full flex-col items-center gap-1 rounded-md border border-dashed px-4 py-5 text-detalhe transition-colors",
          arrastando
            ? "border-faixa bg-accent/40"
            : "border-border bg-surface/50 hover:bg-accent/20",
          ocupado && "cursor-wait opacity-70",
        )}
      >
        <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium">
          Arraste arquivos aqui ou clique para escolher
        </span>
        <span className="text-legenda text-muted-foreground">{legenda}</span>
      </button>

      {arquivos.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {arquivos.map((arquivo, indice) => (
            <li
              key={`${arquivo.name}-${indice}`}
              className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2"
            >
              <Paperclip
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-detalhe">
                {arquivo.name}
              </span>
              <span className="shrink-0 text-legenda text-muted-foreground tabular-nums">
                {tamanhoLegivel(arquivo.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Tirar ${arquivo.name} da fila`}
                disabled={ocupado}
                onClick={() => onMudar(arquivos.filter((_, i) => i !== indice))}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
