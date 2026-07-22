"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";

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
  CampoFormulario,
  classesFormulario,
  Combobox,
} from "@/components/canonicos";
import { cn } from "@/lib/utils";
import { importarOfx } from "@/modules/financeiro/conciliacao/actions";
import type { ContaBancariaOpcao } from "@/modules/financeiro/conciliacao/queries";

export interface ImportarOfxDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  contas: ContaBancariaOpcao[];
  /** Conta pré-selecionada (a do filtro da página, quando houver). */
  contaInicialId?: string;
}

interface ResultadoImportacao {
  inseridas: number;
  ignoradas: number;
}

/**
 * Importação de extrato OFX: escolhe a conta bancária e o arquivo .ofx,
 * envia por FormData para a action importarOfx e mostra quantas transações
 * foram inseridas e quantas foram ignoradas por já existirem.
 */
export function ImportarOfxDialog({
  aberto,
  onAbertoChange,
  contas,
  contaInicialId,
}: ImportarOfxDialogProps) {
  const router = useRouter();
  const [contaId, setContaId] = React.useState(contaInicialId ?? "");
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [arrastando, setArrastando] = React.useState(false);
  const [resultado, setResultado] = React.useState<ResultadoImportacao | null>(
    null,
  );
  const inputRef = React.useRef<HTMLInputElement>(null);

  function limpar() {
    setContaId(contaInicialId ?? "");
    setArquivo(null);
    setErro(null);
    setEnviando(false);
    setArrastando(false);
    setResultado(null);
  }

  function trocarAberto(novoAberto: boolean) {
    if (enviando) return;
    if (!novoAberto) limpar();
    onAbertoChange(novoAberto);
  }

  function escolherArquivo(escolhido: File | undefined) {
    if (!escolhido) return;
    if (!escolhido.name.toLowerCase().endsWith(".ofx")) {
      setErro("Selecione um arquivo .ofx");
      return;
    }
    setErro(null);
    setArquivo(escolhido);
  }

  async function importar() {
    if (!contaId) {
      setErro("Selecione a conta bancária do extrato");
      return;
    }
    if (!arquivo) {
      setErro("Selecione o arquivo .ofx do extrato");
      return;
    }

    setErro(null);
    setEnviando(true);

    const formData = new FormData();
    formData.append("contaId", contaId);
    formData.append("arquivo", arquivo);

    const resposta = await importarOfx(formData);
    setEnviando(false);

    if ("erro" in resposta) {
      setErro(resposta.erro);
      return;
    }

    setResultado({
      inseridas: resposta.inseridas,
      ignoradas: resposta.ignoradas,
    });
    toast.success(
      resposta.inseridas === 1
        ? "1 transação importada"
        : `${resposta.inseridas} transações importadas`,
    );
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={trocarAberto}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar extrato OFX</DialogTitle>
          <DialogDescription>
            {resultado
              ? "Importação concluída"
              : "Escolha a conta e envie o arquivo .ofx do banco"}
          </DialogDescription>
        </DialogHeader>

        {erro ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Erro ao importar o extrato</AlertTitle>
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        ) : null}

        {resultado ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CircleCheck className="size-10 text-status-aprovado" />
              <div className="text-detalhe">
                <p className="font-medium">
                  {resultado.inseridas === 1
                    ? "1 transação importada"
                    : `${resultado.inseridas} transações importadas`}
                </p>
                {resultado.ignoradas > 0 ? (
                  <p className="text-muted-foreground">
                    {resultado.ignoradas === 1
                      ? "1 transação ignorada por já existir"
                      : `${resultado.ignoradas} transações ignoradas por já existirem`}
                  </p>
                ) : null}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => trocarAberto(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className={classesFormulario}>
            <CampoFormulario id="conta-ofx" rotulo="Conta bancária">
              <Combobox
                valor={contaId}
                onValorChange={setContaId}
                opcoes={contas.map((conta) => ({
                  valor: conta.id,
                  rotulo: `${conta.nome} (${conta.bancoRotulo})`,
                }))}
                placeholder="Selecione a conta"
                id="conta-ofx"
              />
            </CampoFormulario>

            <div
              role="button"
              tabIndex={0}
              aria-label="Escolher arquivo .ofx"
              onClick={() => {
                if (!enviando) inputRef.current?.click();
              }}
              onKeyDown={(evento) => {
                if (evento.key === "Enter" || evento.key === " ") {
                  evento.preventDefault();
                  if (!enviando) inputRef.current?.click();
                }
              }}
              onDragOver={(evento) => {
                evento.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(evento) => {
                evento.preventDefault();
                setArrastando(false);
                if (!enviando) escolherArquivo(evento.dataTransfer.files?.[0]);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface px-6 py-10 text-center transition-colors hover:border-primary/50",
                arrastando && "border-primary bg-primary/5",
                enviando && "pointer-events-none opacity-80",
              )}
            >
              <Upload className="size-6 text-muted-foreground" />
              <p className="text-detalhe font-medium">
                {arquivo
                  ? arquivo.name
                  : "Arraste o arquivo aqui ou clique para escolher"}
              </p>
              <p className="text-legenda text-muted-foreground">
                Somente arquivos .ofx
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".ofx"
                className="hidden"
                onChange={(evento) => {
                  escolherArquivo(evento.target.files?.[0]);
                  evento.target.value = "";
                }}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => trocarAberto(false)}
                disabled={enviando}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => void importar()}
                disabled={enviando || !contaId || !arquivo}
              >
                {enviando ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Upload />
                )}
                Importar extrato
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
