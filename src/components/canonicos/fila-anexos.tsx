"use client";

import * as React from "react";
import { Download, Eye, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { Button } from "@/components/ui/button";
import {
  ANEXO_TAMANHO_MAXIMO_BYTES,
  ANEXO_TAMANHO_MAXIMO_MB,
} from "@/lib/anexos-limite";
import { cn } from "@/lib/utils";
import { enviarAnexoDoNavegador } from "@/modules/_shared/anexos/enviar-do-navegador";

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
    // Aqui o documento JÁ foi criado: uma falha de envio não pode derrubar o
    // fluxo de salvar nem sumir calada. Vira falha contada e mensagem com o
    // nome do arquivo.
    const envio = await enviarAnexoDoNavegador(entidade, entidadeId, arquivo);
    if ("erro" in envio) {
      falhas += 1;
      toast.error(`${arquivo.name}: ${envio.erro}`);
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

  // URL local de cada arquivo da fila, para ver e baixar ANTES de subir. O
  // documento ainda não existe, então não há URL no servidor: quem confere se
  // anexou o arquivo certo precisa abrir o que está na mão.
  const urls = React.useMemo(
    () => arquivos.map((arquivo) => URL.createObjectURL(arquivo)),
    [arquivos],
  );

  // Revoga na troca da fila e ao desmontar, senão o navegador segura os bytes.
  React.useEffect(
    () => () => urls.forEach((url) => URL.revokeObjectURL(url)),
    [urls],
  );

  // Recusa o arquivo grande na HORA de escolher, não depois de salvar: na fila
  // o documento só existe no fim, e descobrir o limite lá na frente é perder o
  // trabalho todo.
  function adicionar(novos: File[]) {
    const aceitos = novos.filter((arquivo) => {
      if (arquivo.size <= ANEXO_TAMANHO_MAXIMO_BYTES) return true;
      toast.error(
        `${arquivo.name} tem ${tamanhoLegivel(arquivo.size)} e o limite é ${ANEXO_TAMANHO_MAXIMO_MB} MB`,
      );
      return false;
    });
    if (aceitos.length === 0) return;
    onMudar([...arquivos, ...aceitos]);
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
              <Button asChild variant="ghost" size="icon-sm">
                <a
                  href={urls[indice]}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Visualizar ${arquivo.name}`}
                  title="Visualizar"
                >
                  <Eye aria-hidden="true" />
                </a>
              </Button>
              <Button asChild variant="ghost" size="icon-sm">
                <a
                  href={urls[indice]}
                  download={arquivo.name}
                  aria-label={`Baixar ${arquivo.name}`}
                  title="Baixar"
                >
                  <Download aria-hidden="true" />
                </a>
              </Button>
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
