"use client";

import * as React from "react";
import { Download, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  baixarAnexo,
  enviarAnexo,
  excluirAnexo,
  listarAnexos,
  type AnexoResumo,
} from "@/modules/compras/_shared/anexos-actions";
import { formatarTamanhoArquivo } from "@/modules/compras/_shared/formato";

const TIPOS_ACEITOS = ".pdf,.png,.jpg,.jpeg";

export interface AnexosRegistroProps {
  /** Tabela do registro (pedidos, cotacoes, ordens_compra, recebimentos). */
  tabela: string;
  /** Id do registro dono dos anexos. */
  registroId: string;
  /** Libera upload e remoção. Quando false, só lista e baixa. */
  podeEditar: boolean;
  /** Lista inicial vinda do server, evita um carregamento extra. */
  anexosIniciais?: AnexoResumo[];
  /** Aviso de mudança para o pai recarregar dados relacionados, se quiser. */
  onMudou?: () => void;
}

/**
 * Lista os anexos de um registro de compras, com upload (.pdf/imagem),
 * download por URL assinada e remoção com confirmação. RLS e a action
 * cobrem a permissão; a UI esconde as ações de quem não pode editar.
 */
export function AnexosRegistro({
  tabela,
  registroId,
  podeEditar,
  anexosIniciais,
  onMudou,
}: AnexosRegistroProps) {
  const [anexos, setAnexos] = React.useState<AnexoResumo[]>(
    anexosIniciais ?? [],
  );
  const [carregando, setCarregando] = React.useState(anexosIniciais === undefined);
  const [enviando, setEnviando] = React.useState(false);
  const [baixandoId, setBaixandoId] = React.useState<string | null>(null);
  const [excluindo, setExcluindo] = React.useState<AnexoResumo | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const recarregar = React.useCallback(async () => {
    const lista = await listarAnexos(tabela, registroId);
    setAnexos(lista);
  }, [tabela, registroId]);

  React.useEffect(() => {
    if (anexosIniciais !== undefined) return;
    let ativo = true;
    async function carregar() {
      setCarregando(true);
      try {
        const lista = await listarAnexos(tabela, registroId);
        if (ativo) setAnexos(lista);
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, [tabela, registroId, anexosIniciais]);

  async function aoEscolherArquivo(
    evento: React.ChangeEvent<HTMLInputElement>,
  ) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!arquivo) return;

    setEnviando(true);
    try {
      const formData = new FormData();
      formData.append("tabela", tabela);
      formData.append("registroId", registroId);
      formData.append("arquivo", arquivo);

      const resultado = await enviarAnexo(formData);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Arquivo anexado");
      await recarregar();
      onMudou?.();
    } finally {
      setEnviando(false);
    }
  }

  async function aoBaixar(anexo: AnexoResumo) {
    setBaixandoId(anexo.id);
    try {
      const resultado = await baixarAnexo(anexo.id);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      window.open(resultado.url, "_blank", "noopener,noreferrer");
    } finally {
      setBaixandoId(null);
    }
  }

  async function aoConfirmarExclusao() {
    if (!excluindo) return;
    const resultado = await excluirAnexo(excluindo.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Anexo removido");
    setExcluindo(null);
    await recarregar();
    onMudou?.();
  }

  return (
    <div className="grid gap-3">
      {podeEditar ? (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={TIPOS_ACEITOS}
            className="hidden"
            onChange={(evento) => {
              void aoEscolherArquivo(evento);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={enviando}
            onClick={() => inputRef.current?.click()}
          >
            {enviando ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Paperclip aria-hidden="true" />
            )}
            Anexar arquivo
          </Button>
        </div>
      ) : null}

      {carregando ? (
        <p className="text-detalhe text-muted-foreground">Carregando anexos</p>
      ) : anexos.length === 0 ? (
        <p className="text-detalhe text-muted-foreground">Nenhum anexo</p>
      ) : (
        <ul className="grid gap-1.5">
          {anexos.map((anexo) => (
            <li
              key={anexo.id}
              className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2"
            >
              <Paperclip
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-detalhe">
                {anexo.nomeArquivo}
              </span>
              <span className="shrink-0 text-detalhe text-muted-foreground tabular-nums">
                {formatarTamanhoArquivo(anexo.tamanhoBytes)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Baixar ${anexo.nomeArquivo}`}
                disabled={baixandoId === anexo.id}
                onClick={() => {
                  void aoBaixar(anexo);
                }}
              >
                {baixandoId === anexo.id ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download aria-hidden="true" />
                )}
              </Button>
              {podeEditar ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover ${anexo.nomeArquivo}`}
                  onClick={() => setExcluindo(anexo)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Remover anexo"
        descricao={
          excluindo
            ? `O arquivo ${excluindo.nomeArquivo} será removido em definitivo.`
            : ""
        }
        textoConfirmar="Remover anexo"
        variante="destrutivo"
        onConfirmar={aoConfirmarExclusao}
      />
    </div>
  );
}
