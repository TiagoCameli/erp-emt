"use client";

import * as React from "react";
import {
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Resumo de uma linha inválida na prévia da importação. */
export interface LinhaInvalidaResumo {
  linha: number;
  erros: string[];
}

/** Resumo da validação retornado por onValidarArquivo. */
export interface ResumoValidacao {
  validas: number;
  invalidas: LinhaInvalidaResumo[];
  totalLinhas: number;
}

export interface ImportDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  titulo: string;
  /** Gera e baixa o modelo .xlsx. */
  onBaixarModelo: () => void | Promise<void>;
  /** Lê e valida o arquivo escolhido, retornando o resumo da prévia. */
  onValidarArquivo: (arquivo: File) => Promise<ResumoValidacao>;
  /** Importa as linhas válidas do último arquivo validado. */
  onConfirmarImportacao: () => Promise<{ importadas: number }>;
}

type Passo = "arquivo" | "previa" | "resultado";

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error && erro.message) return erro.message;
  return "Não foi possível processar o arquivo. Tente novamente.";
}

/**
 * Fluxo canônico de importação por planilha, em 3 passos:
 * 1. Baixar modelo e escolher o arquivo .xlsx
 * 2. Prévia da validação com as linhas inválidas
 * 3. Resultado da importação
 */
export function ImportDialog({
  aberto,
  onAbertoChange,
  titulo,
  onBaixarModelo,
  onValidarArquivo,
  onConfirmarImportacao,
}: ImportDialogProps) {
  const [passo, setPasso] = React.useState<Passo>("arquivo");
  const [nomeArquivo, setNomeArquivo] = React.useState<string | null>(null);
  const [validacao, setValidacao] = React.useState<ResumoValidacao | null>(null);
  const [importadas, setImportadas] = React.useState(0);
  const [erro, setErro] = React.useState<string | null>(null);
  const [baixandoModelo, setBaixandoModelo] = React.useState(false);
  const [validando, setValidando] = React.useState(false);
  const [importando, setImportando] = React.useState(false);
  const [arrastando, setArrastando] = React.useState(false);
  const inputArquivoRef = React.useRef<HTMLInputElement>(null);

  function limparEstado() {
    setPasso("arquivo");
    setNomeArquivo(null);
    setValidacao(null);
    setImportadas(0);
    setErro(null);
    setBaixandoModelo(false);
    setValidando(false);
    setImportando(false);
    setArrastando(false);
  }

  function handleAbertoChange(novoAberto: boolean) {
    if (!novoAberto) limparEstado();
    onAbertoChange(novoAberto);
  }

  async function baixarModelo() {
    setErro(null);
    setBaixandoModelo(true);
    try {
      await onBaixarModelo();
    } catch (excecao) {
      setErro(mensagemDeErro(excecao));
    } finally {
      setBaixandoModelo(false);
    }
  }

  async function processarArquivo(arquivo: File) {
    if (!arquivo.name.toLowerCase().endsWith(".xlsx")) {
      setErro("Selecione um arquivo .xlsx");
      return;
    }
    setErro(null);
    setNomeArquivo(arquivo.name);
    setValidando(true);
    try {
      const resumo = await onValidarArquivo(arquivo);
      setValidacao(resumo);
      setPasso("previa");
    } catch (excecao) {
      setErro(mensagemDeErro(excecao));
      setNomeArquivo(null);
    } finally {
      setValidando(false);
    }
  }

  function aoEscolherArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (arquivo) void processarArquivo(arquivo);
    evento.target.value = "";
  }

  function aoSoltar(evento: React.DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setArrastando(false);
    if (validando) return;
    const arquivo = evento.dataTransfer.files?.[0];
    if (arquivo) void processarArquivo(arquivo);
  }

  function voltarParaArquivo() {
    setPasso("arquivo");
    setNomeArquivo(null);
    setValidacao(null);
    setErro(null);
  }

  async function confirmarImportacao() {
    setErro(null);
    setImportando(true);
    try {
      const resultado = await onConfirmarImportacao();
      setImportadas(resultado.importadas);
      setPasso("resultado");
    } catch (excecao) {
      setErro(mensagemDeErro(excecao));
    } finally {
      setImportando(false);
    }
  }

  const descricaoPorPasso: Record<Passo, string> = {
    arquivo: "Baixe o modelo, preencha e envie o arquivo .xlsx",
    previa: "Confira a validação antes de confirmar a importação",
    resultado: "Importação concluída",
  };

  return (
    <Dialog open={aberto} onOpenChange={handleAbertoChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricaoPorPasso[passo]}</DialogDescription>
        </DialogHeader>

        {erro && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Erro ao processar o arquivo</AlertTitle>
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        {passo === "arquivo" && (
          <div className="flex flex-col gap-4">
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => void baixarModelo()}
              disabled={baixandoModelo || validando}
            >
              {baixandoModelo ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Download />
              )}
              Baixar modelo
            </Button>

            <div
              role="button"
              tabIndex={0}
              aria-label="Escolher arquivo .xlsx"
              onClick={() => {
                if (!validando) inputArquivoRef.current?.click();
              }}
              onKeyDown={(evento) => {
                if (evento.key === "Enter" || evento.key === " ") {
                  evento.preventDefault();
                  if (!validando) inputArquivoRef.current?.click();
                }
              }}
              onDragOver={(evento) => {
                evento.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={aoSoltar}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface px-6 py-10 text-center transition-colors hover:border-primary/50",
                arrastando && "border-primary bg-primary/5",
                validando && "pointer-events-none opacity-80",
              )}
            >
              {validando ? (
                <>
                  <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Validando {nomeArquivo}...
                  </p>
                </>
              ) : (
                <>
                  <Upload className="size-6 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    Arraste o arquivo aqui ou clique para escolher
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Somente arquivos .xlsx
                  </p>
                </>
              )}
              <input
                ref={inputArquivoRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={aoEscolherArquivo}
              />
            </div>
          </div>
        )}

        {passo === "previa" && validacao && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{nomeArquivo}</span>
            </div>

            <p className="text-sm">
              <span className="font-semibold tabular-nums">
                {validacao.validas}
              </span>{" "}
              de <span className="tabular-nums">{validacao.totalLinhas}</span>{" "}
              {validacao.totalLinhas === 1 ? "linha válida" : "linhas válidas"}
            </p>

            {validacao.invalidas.length > 0 && (
              <>
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>As linhas com erro serão ignoradas</span>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8 w-20 text-xs">
                          Linha
                        </TableHead>
                        <TableHead className="h-8 text-xs">Erros</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validacao.invalidas.map((linhaInvalida) => (
                        <TableRow key={linhaInvalida.linha}>
                          <TableCell className="py-1.5 font-mono text-xs tabular-nums">
                            {linhaInvalida.linha}
                          </TableCell>
                          <TableCell className="py-1.5 text-xs text-destructive">
                            {linhaInvalida.erros.join("; ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={voltarParaArquivo}
                disabled={importando}
              >
                Escolher outro arquivo
              </Button>
              <Button
                onClick={() => void confirmarImportacao()}
                disabled={validacao.validas === 0 || importando}
              >
                {importando && <LoaderCircle className="animate-spin" />}
                Importar {validacao.validas}{" "}
                {validacao.validas === 1 ? "válida" : "válidas"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {passo === "resultado" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CircleCheck className="size-10 text-green-700" />
              <p className="text-sm font-medium">
                {importadas === 1
                  ? "1 linha importada"
                  : `${importadas} linhas importadas`}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => handleAbertoChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
