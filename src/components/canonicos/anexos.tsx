"use client";

import * as React from "react";
import {
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { ConfirmDialog } from "@/components/canonicos/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ANEXO_TAMANHO_MAXIMO_MB } from "@/lib/anexos-limite";
import { formatarDataHora } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import {
  anexosDoDocumento,
  removerAnexo,
  urlDoAnexo,
} from "@/modules/_shared/anexos/actions";
import { enviarAnexoDoNavegador } from "@/modules/_shared/anexos/enviar-do-navegador";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";

/** Mesmo limite do servidor: a constante é uma só, o número não pode divergir. */
const TAMANHO_MAXIMO_MB = ANEXO_TAMANHO_MAXIMO_MB;
const BYTES_POR_MB = 1024 * 1024;

/** Tamanho legível: 1,2 MB, 340 KB. */
function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < BYTES_POR_MB) {
    return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  }
  return `${(bytes / BYTES_POR_MB).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

function ehImagem(mime: string | null): boolean {
  return (mime ?? "").startsWith("image/");
}

function ehPdf(mime: string | null): boolean {
  return (mime ?? "") === "application/pdf";
}

/** Ícone por tipo de arquivo. */
function IconeDoTipo({ mime }: { mime: string | null }) {
  const tipo = mime ?? "";
  const classe = "size-4 shrink-0 text-muted-foreground";
  if (tipo.startsWith("image/")) return <FileImage className={classe} aria-hidden />;
  if (tipo === "application/pdf") return <FileText className={classe} aria-hidden />;
  if (
    tipo.includes("spreadsheet") ||
    tipo.includes("excel") ||
    tipo === "text/csv"
  ) {
    return <FileSpreadsheet className={classe} aria-hidden />;
  }
  if (tipo.includes("zip") || tipo.includes("compressed")) {
    return <FileArchive className={classe} aria-hidden />;
  }
  return <Paperclip className={classe} aria-hidden />;
}

export interface AnexosProps {
  /** Tipo do documento: cotacao, ordem_compra, lancamento, pagamento, rh_*. */
  entidade: string;
  entidadeId: string;
  /** Lista vinda do servidor. Sem isto o componente não busca nada sozinho. */
  anexos: AnexoDoDocumento[];
  /** Libera enviar e remover. Falso deixa só ver e baixar. */
  podeEditar: boolean;
  /** Chamado depois de enviar ou remover, para a página recarregar o resto. */
  onMudou?: () => void;
}

/**
 * Seção de anexos canônica, usada por Cotação, OC, Lançamento, Pagamento e as
 * telas de RH.
 *
 * A lista SEMPRE vem do servidor por prop: o componente não busca nada na
 * montagem, então não existe estado de carregamento que possa ficar preso (era
 * o bug do "Carregando anexos" da versão antiga). Depois de enviar ou remover,
 * ele repede a lista e avisa o pai.
 *
 * Arquivo é único no bucket: o mesmo binário aparece aqui e nos outros
 * documentos da cadeia. Remover aqui remove só o vínculo deste documento.
 */
export function Anexos({
  entidade,
  entidadeId,
  anexos: anexosIniciais,
  podeEditar,
  onMudou,
}: AnexosProps) {
  const [anexos, setAnexos] = React.useState(anexosIniciais);
  const [enviando, setEnviando] = React.useState(false);
  const [progresso, setProgresso] = React.useState({ feitos: 0, total: 0 });
  const [arrastando, setArrastando] = React.useState(false);
  const [ocupadoId, setOcupadoId] = React.useState<string | null>(null);
  const [removendo, setRemovendo] = React.useState<AnexoDoDocumento | null>(null);
  const [preview, setPreview] = React.useState<{
    anexo: AnexoDoDocumento;
    url: string;
  } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // A lista é do servidor: quando ele manda uma nova, ela manda.
  const [anexosAnteriores, setAnexosAnteriores] = React.useState(anexosIniciais);
  if (anexosIniciais !== anexosAnteriores) {
    setAnexosAnteriores(anexosIniciais);
    setAnexos(anexosIniciais);
  }

  async function recarregar() {
    setAnexos(await anexosDoDocumento(entidade, entidadeId));
  }

  /** Envia um por vez para a barra de progresso dizer a verdade. */
  async function enviar(arquivos: File[]) {
    const aceitos: File[] = [];
    for (const arquivo of arquivos) {
      if (arquivo.size > TAMANHO_MAXIMO_MB * BYTES_POR_MB) {
        toast.error(
          `${arquivo.name} tem ${tamanhoLegivel(arquivo.size)} e o limite é ${TAMANHO_MAXIMO_MB} MB`,
        );
        continue;
      }
      aceitos.push(arquivo);
    }
    if (aceitos.length === 0) return;

    setEnviando(true);
    setProgresso({ feitos: 0, total: aceitos.length });
    let enviadosOk = 0;

    try {
      for (const [indice, arquivo] of aceitos.entries()) {
        // Um arquivo por vez, e a falha de um não derruba os outros: o envio
        // devolve o motivo em pt-BR em vez de estourar, para nenhum anexo
        // sumir em silêncio (era o defeito: a tela girava e nada aparecia).
        const resultado = await enviarAnexoDoNavegador(
          entidade,
          entidadeId,
          arquivo,
        );
        setProgresso({ feitos: indice + 1, total: aceitos.length });

        if ("erro" in resultado) {
          toast.error(`${arquivo.name}: ${resultado.erro}`);
          continue;
        }
        enviadosOk += 1;
      }

      if (enviadosOk > 0) {
        toast.success(
          enviadosOk === 1 ? "Arquivo anexado" : `${enviadosOk} arquivos anexados`,
        );
        await recarregar();
        onMudou?.();
      }
    } finally {
      setEnviando(false);
      setProgresso({ feitos: 0, total: 0 });
    }
  }

  async function abrir(anexo: AnexoDoDocumento, modo: "preview" | "download") {
    setOcupadoId(anexo.vinculoId);
    try {
      const resultado = await urlDoAnexo(anexo.vinculoId);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      if (modo === "preview") {
        setPreview({ anexo, url: resultado.url });
        return;
      }
      window.open(resultado.url, "_blank", "noopener,noreferrer");
    } finally {
      setOcupadoId(null);
    }
  }

  async function confirmarRemocao() {
    if (!removendo) return;
    const resultado = await removerAnexo(removendo.vinculoId);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Anexo removido deste documento");
    setRemovendo(null);
    await recarregar();
    onMudou?.();
  }

  const podePrever = (anexo: AnexoDoDocumento) =>
    ehImagem(anexo.tipoMime) || ehPdf(anexo.tipoMime);

  return (
    <div className="flex flex-col gap-3">
      {podeEditar ? (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(evento) => {
              const arquivos = Array.from(evento.target.files ?? []);
              evento.target.value = "";
              void enviar(arquivos);
            }}
          />
          <button
            type="button"
            disabled={enviando}
            onClick={() => inputRef.current?.click()}
            onDragOver={(evento) => {
              evento.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(evento) => {
              evento.preventDefault();
              setArrastando(false);
              void enviar(Array.from(evento.dataTransfer.files));
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-6 text-detalhe transition-colors",
              arrastando
                ? "border-faixa bg-accent/40"
                : "border-border bg-surface/50 hover:bg-accent/20",
              enviando && "cursor-wait opacity-70",
            )}
          >
            {enviando ? (
              <>
                <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">
                  Enviando {progresso.feitos} de {progresso.total}
                </span>
                <span
                  className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-border"
                  role="progressbar"
                  aria-valuenow={progresso.feitos}
                  aria-valuemin={0}
                  aria-valuemax={progresso.total}
                >
                  <span
                    className="block h-full bg-primary transition-all"
                    style={{
                      width: `${progresso.total === 0 ? 0 : (progresso.feitos / progresso.total) * 100}%`,
                    }}
                  />
                </span>
              </>
            ) : (
              <>
                <Upload className="size-5 text-muted-foreground" aria-hidden />
                <span className="font-medium">
                  Arraste arquivos aqui ou clique para escolher
                </span>
                <span className="text-legenda text-muted-foreground">
                  Qualquer tipo, até {TAMANHO_MAXIMO_MB} MB por arquivo
                </span>
              </>
            )}
          </button>
        </>
      ) : null}

      {anexos.length === 0 ? (
        <p className="text-detalhe text-muted-foreground">Nenhum anexo</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {anexos.map((anexo) => (
            <li
              key={anexo.vinculoId}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2"
            >
              <IconeDoTipo mime={anexo.tipoMime} />
              <span className="min-w-0 flex-1 truncate text-detalhe" title={anexo.nome}>
                {anexo.nome}
              </span>

              {anexo.propagado ? (
                <Badge
                  variant="secondary"
                  className="shrink-0 border-transparent bg-accent text-legenda font-normal text-accent-foreground"
                  title="Anexo herdado de outro documento da cadeia"
                >
                  {anexo.origemNumero
                    ? `da ${anexo.origemNumero}`
                    : `da ${anexo.origemRotulo ?? "origem"}`}
                </Badge>
              ) : null}

              <span className="shrink-0 text-legenda text-muted-foreground tabular-nums">
                {tamanhoLegivel(anexo.tamanhoBytes)}
              </span>
              <span className="shrink-0 text-legenda text-muted-foreground">
                {anexo.criadoPorNome ? `${anexo.criadoPorNome} · ` : ""}
                {formatarDataHora(anexo.criadoEm)}
              </span>

              {podePrever(anexo) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Visualizar ${anexo.nome}`}
                  disabled={ocupadoId === anexo.vinculoId}
                  onClick={() => void abrir(anexo, "preview")}
                >
                  {ocupadoId === anexo.vinculoId ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Eye aria-hidden />
                  )}
                </Button>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Baixar ${anexo.nome}`}
                disabled={ocupadoId === anexo.vinculoId}
                onClick={() => void abrir(anexo, "download")}
              >
                <Download aria-hidden />
              </Button>

              {podeEditar ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover ${anexo.nome} deste documento`}
                  onClick={() => setRemovendo(anexo)}
                >
                  <Trash2 aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={preview !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setPreview(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate text-secao">
              {preview?.anexo.nome}
            </DialogTitle>
          </DialogHeader>
          {preview ? (
            ehImagem(preview.anexo.tipoMime) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.url}
                alt={preview.anexo.nome}
                className="max-h-[70vh] w-full object-contain"
              />
            ) : (
              <iframe
                src={preview.url}
                title={preview.anexo.nome}
                className="h-[70vh] w-full rounded-md border border-border"
              />
            )
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        aberto={removendo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setRemovendo(null);
        }}
        titulo="Remover anexo deste documento"
        descricao={
          removendo
            ? `${removendo.nome} sai deste documento. Se o mesmo arquivo estiver anexado em outro documento da cadeia, ele continua lá.`
            : ""
        }
        textoConfirmar="Remover"
        variante="destrutivo"
        onConfirmar={confirmarRemocao}
      />
    </div>
  );
}
