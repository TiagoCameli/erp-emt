"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";

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
import {
  importarOfx,
  type MovimentoIgnorado,
} from "@/modules/financeiro/conciliacao/actions";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { decodificarOfx, parseOfx, sugerirIntervalo, type ExtratoOfx } from "@/lib/ofx";
import { Input } from "@/components/ui/input";
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
  ignorados: MovimentoIgnorado[];
  /** Quantos movimentos o casamento automático já vinculou. */
  casadas: number;
  /** Quantos as regras automáticas por histórico lançaram. */
  regras: number;
  /** Frase do aviso quando o arquivo não é um mês fechado. */
  aviso: string | null;
}

/** Um arquivo escolhido, com o intervalo que vai entrar dele. */
interface ArquivoEscolhido {
  chave: string;
  arquivo: File;
  // O que o arquivo traz, lido aqui mesmo para a pessoa escolher o intervalo.
  previa: ExtratoOfx | null;
  de: string;
  ate: string;
}

/** O que aconteceu com cada arquivo de um envio com vários. */
type ResultadoArquivo =
  | { item: ArquivoEscolhido; ok: true; resultado: ResultadoImportacao }
  | { item: ArquivoEscolhido; ok: false; erro: string };

function chaveDoArquivo(arquivo: File): string {
  return `${arquivo.name}|${arquivo.size}|${arquivo.lastModified}`;
}

function inicioDoArquivo(previa: ExtratoOfx): string {
  return previa.periodoInicio ?? previa.transacoes.map((t) => t.data).sort()[0] ?? "";
}

function fimDoArquivo(previa: ExtratoOfx): string {
  return previa.periodoFim ?? previa.transacoes.map((t) => t.data).sort().at(-1) ?? "";
}

function movimentosNoIntervalo(item: ArquivoEscolhido): number {
  if (!item.previa || !item.de || !item.ate) return 0;
  return item.previa.transacoes.filter((t) => t.data >= item.de && t.data <= item.ate).length;
}

// Arquivo sem movimento nenhum o servidor recusa com a mensagem certa.
function intervaloInvalido(item: ArquivoEscolhido): boolean {
  return (
    !!item.previa &&
    item.previa.transacoes.length > 0 &&
    (!item.de || !item.ate || item.de > item.ate || movimentosNoIntervalo(item) === 0)
  );
}

function fraseImportadas(inseridas: number): string {
  return inseridas === 1 ? "1 transação importada" : `${inseridas} transações importadas`;
}

/**
 * Importação de extrato OFX: escolhe a conta bancária e um ou mais arquivos
 * .ofx. Cada arquivo vai numa chamada da action importarOfx, em ordem de data,
 * e o resultado mostra, por arquivo, quantas transações entraram e quantas
 * foram ignoradas por já existirem.
 */
export function ImportarOfxDialog({
  aberto,
  onAbertoChange,
  contas,
  contaInicialId,
}: ImportarOfxDialogProps) {
  const router = useRouter();
  const [contaId, setContaId] = React.useState(contaInicialId ?? "");
  const [arquivos, setArquivos] = React.useState<ArquivoEscolhido[]>([]);
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  // Qual arquivo está subindo agora, para o botão dizer "2 de 5".
  const [enviandoNumero, setEnviandoNumero] = React.useState(0);
  const [arrastando, setArrastando] = React.useState(false);
  const [resultados, setResultados] = React.useState<ResultadoArquivo[] | null>(
    null,
  );
  const inputRef = React.useRef<HTMLInputElement>(null);

  function limpar() {
    setContaId(contaInicialId ?? "");
    setArquivos([]);
    setErro(null);
    setEnviando(false);
    setEnviandoNumero(0);
    setArrastando(false);
    setResultados(null);
  }

  function trocarAberto(novoAberto: boolean) {
    if (enviando) return;
    if (!novoAberto) limpar();
    onAbertoChange(novoAberto);
  }

  function atualizar(chave: string, mudanca: Partial<ArquivoEscolhido>) {
    setArquivos((atuais) =>
      atuais.map((item) => (item.chave === chave ? { ...item, ...mudanca } : item)),
    );
  }

  function escolherArquivos(lista: FileList | File[] | null | undefined) {
    const escolhidos = Array.from(lista ?? []);
    if (escolhidos.length === 0) return;
    const validos = escolhidos.filter((a) => a.name.toLowerCase().endsWith(".ofx"));
    setErro(
      validos.length < escolhidos.length
        ? "Só arquivos .ofx entram; os outros foram deixados de fora"
        : null,
    );

    // O mesmo arquivo escolhido duas vezes entra uma vez só.
    const jaEscolhidas = new Set(arquivos.map((item) => item.chave));
    const novos: ArquivoEscolhido[] = [];
    for (const arquivo of validos) {
      const chave = chaveDoArquivo(arquivo);
      if (jaEscolhidas.has(chave)) continue;
      jaEscolhidas.add(chave);
      novos.push({ chave, arquivo, previa: null, de: "", ate: "" });
    }
    if (novos.length === 0) return;
    setArquivos((atuais) => [...atuais, ...novos]);

    for (const novo of novos) {
      void novo.arquivo.arrayBuffer().then((bytes) => {
        const extrato = parseOfx(decodificarOfx(bytes));
        const sugerido = sugerirIntervalo(extrato);
        atualizar(novo.chave, {
          previa: extrato,
          de: sugerido?.de ?? "",
          ate: sugerido?.ate ?? "",
        });
      });
    }
  }

  function remover(chave: string) {
    setArquivos((atuais) => atuais.filter((item) => item.chave !== chave));
  }

  const algumInvalido = arquivos.some(intervaloInvalido);

  async function importar() {
    if (!contaId) {
      setErro("Selecione a conta bancária do extrato");
      return;
    }
    if (arquivos.length === 0) {
      setErro("Selecione o arquivo .ofx do extrato");
      return;
    }

    setErro(null);
    setEnviando(true);

    // Em ordem de data: o mês mais antigo entra primeiro, como se a pessoa
    // importasse um por um.
    const fila = [...arquivos].sort((a, b) =>
      (a.de || (a.previa ? inicioDoArquivo(a.previa) : "")).localeCompare(
        b.de || (b.previa ? inicioDoArquivo(b.previa) : ""),
      ),
    );

    const feitos: ResultadoArquivo[] = [];
    for (const [indice, item] of fila.entries()) {
      setEnviandoNumero(indice + 1);
      const formData = new FormData();
      formData.append("contaId", contaId);
      formData.append("arquivo", item.arquivo);
      if (item.de && item.ate) {
        formData.append("de", item.de);
        formData.append("ate", item.ate);
      }

      // Um arquivo que falha não segura os outros.
      let resposta: Awaited<ReturnType<typeof importarOfx>>;
      try {
        resposta = await importarOfx(formData);
      } catch {
        resposta = { erro: "Não foi possível enviar o arquivo. Tente novamente" };
      }
      feitos.push(
        "erro" in resposta
          ? { item, ok: false, erro: resposta.erro }
          : {
              item,
              ok: true,
              resultado: {
                inseridas: resposta.inseridas,
                ignoradas: resposta.ignoradas,
                ignorados: resposta.ignorados,
                casadas: resposta.casadas,
                regras: resposta.regras,
                aviso: resposta.aviso,
              },
            },
      );
    }
    setEnviando(false);
    setEnviandoNumero(0);

    // Um arquivo só que falhou continua no formulário, para corrigir e mandar
    // de novo, como sempre foi.
    if (feitos.length === 1 && !feitos[0].ok) {
      setErro(feitos[0].erro);
      return;
    }

    setResultados(feitos);
    const inseridas = feitos.reduce(
      (soma, feito) => soma + (feito.ok ? feito.resultado.inseridas : 0),
      0,
    );
    const falharam = feitos.filter((feito) => !feito.ok).length;
    if (falharam === feitos.length) {
      toast.error("Nenhum arquivo foi importado");
    } else if (feitos.length === 1) {
      toast.success(
        inseridas === 0 ? "Esse arquivo já estava importado" : fraseImportadas(inseridas),
      );
    } else {
      toast.success(
        `${fraseImportadas(inseridas)} de ${feitos.length - falharam} ${feitos.length - falharam === 1 ? "arquivo" : "arquivos"}`,
      );
    }
    if (falharam < feitos.length) router.refresh();
  }

  /** Volta ao formulário só com os arquivos que não entraram. */
  function tentarDeNovoOsQueFalharam() {
    if (!resultados) return;
    setArquivos(resultados.filter((feito) => !feito.ok).map((feito) => feito.item));
    setResultados(null);
    setErro(null);
  }

  const varios = arquivos.length > 1;
  const falhas = resultados?.filter((feito) => !feito.ok).length ?? 0;

  return (
    <Dialog open={aberto} onOpenChange={trocarAberto}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar extrato OFX</DialogTitle>
          <DialogDescription>
            {resultados
              ? "Importação concluída"
              : "Escolha a conta e envie um ou mais arquivos .ofx do banco"}
          </DialogDescription>
        </DialogHeader>

        {erro ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Erro ao importar o extrato</AlertTitle>
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        ) : null}

        {resultados ? (
          <div className="flex flex-col gap-4">
            {resultados.length === 1 && resultados[0].ok ? (
              <ResumoArquivo resultado={resultados[0].resultado} />
            ) : (
              <ul className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
                {resultados.map((feito) => (
                  <li
                    key={feito.item.chave}
                    className="flex flex-col gap-2 rounded-md border border-border px-3 py-3"
                  >
                    <p className="flex items-center gap-2 text-detalhe font-medium">
                      {feito.ok ? (
                        <CircleCheck className="size-4 shrink-0 text-status-aprovado" />
                      ) : (
                        <CircleAlert className="size-4 shrink-0 text-status-rejeitado" />
                      )}
                      <span className="min-w-0 truncate" title={feito.item.arquivo.name}>
                        {feito.item.arquivo.name}
                      </span>
                    </p>
                    {feito.ok ? (
                      <ResumoArquivo resultado={feito.resultado} compacto />
                    ) : (
                      <p className="text-detalhe text-status-rejeitado">{feito.erro}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <DialogFooter>
              {falhas > 0 ? (
                <Button variant="outline" onClick={tentarDeNovoOsQueFalharam}>
                  {falhas === 1
                    ? "Tentar de novo o que falhou"
                    : `Tentar de novo os ${falhas} que falharam`}
                </Button>
              ) : null}
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
              aria-label="Escolher arquivos .ofx"
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
                if (!enviando) escolherArquivos(evento.dataTransfer.files);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface px-6 text-center transition-colors hover:border-primary/50",
                arquivos.length > 0 ? "py-5" : "py-10",
                arrastando && "border-primary bg-primary/5",
                enviando && "pointer-events-none opacity-80",
              )}
            >
              <Upload className="size-6 text-muted-foreground" />
              <p className="text-detalhe font-medium">
                {arquivos.length > 0
                  ? "Arraste mais arquivos ou clique para acrescentar"
                  : "Arraste os arquivos aqui ou clique para escolher"}
              </p>
              <p className="text-legenda text-muted-foreground">
                Somente arquivos .ofx; dá para mandar vários de uma vez
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".ofx"
                multiple
                className="hidden"
                onChange={(evento) => {
                  escolherArquivos(evento.target.files);
                  evento.target.value = "";
                }}
              />
            </div>

            {arquivos.length > 0 ? (
              <ul className={cn("flex flex-col gap-3", varios && "max-h-[45vh] overflow-y-auto")}>
                {arquivos.map((item) => (
                  <ArquivoNaFila
                    key={item.chave}
                    item={item}
                    enviando={enviando}
                    onMudar={(mudanca) => atualizar(item.chave, mudanca)}
                    onRemover={() => remover(item.chave)}
                  />
                ))}
              </ul>
            ) : null}

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
                disabled={enviando || !contaId || arquivos.length === 0 || algumInvalido}
              >
                {enviando ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Upload />
                )}
                {enviando && varios
                  ? `Importando ${enviandoNumero} de ${arquivos.length}`
                  : varios
                    ? `Importar ${arquivos.length} extratos`
                    : "Importar extrato"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Um arquivo da fila: nome, o que ele traz e o intervalo que vai entrar. */
function ArquivoNaFila({
  item,
  enviando,
  onMudar,
  onRemover,
}: {
  item: ArquivoEscolhido;
  enviando: boolean;
  onMudar: (mudanca: Partial<ArquivoEscolhido>) => void;
  onRemover: () => void;
}) {
  const { previa } = item;
  const inicioArquivo = previa ? inicioDoArquivo(previa) : "";
  const fimArquivo = previa ? fimDoArquivo(previa) : "";
  const invalido = intervaloInvalido(item);
  const idBase = `ofx-${item.chave.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border px-3 py-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-detalhe font-medium" title={item.arquivo.name}>
          {item.arquivo.name}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={`Tirar ${item.arquivo.name}`}
          onClick={onRemover}
          disabled={enviando}
        >
          <X />
        </Button>
      </div>
      {previa ? (
        <>
          <p className="text-detalhe">
            O arquivo vai de {formatarData(inicioArquivo)} a {formatarData(fimArquivo)}, com{" "}
            {previa.transacoes.length} movimentos. Escolha o que usar:
          </p>
          <div className="grid grid-cols-2 gap-3">
            <CampoFormulario id={`${idBase}-de`} rotulo="Usar movimentos de">
              <Input
                id={`${idBase}-de`}
                type="date"
                value={item.de}
                min={inicioArquivo}
                max={fimArquivo}
                onChange={(e) => onMudar({ de: e.target.value })}
                disabled={enviando}
                className="tabular-nums"
              />
            </CampoFormulario>
            <CampoFormulario id={`${idBase}-ate`} rotulo="até">
              <Input
                id={`${idBase}-ate`}
                type="date"
                value={item.ate}
                min={inicioArquivo}
                max={fimArquivo}
                onChange={(e) => onMudar({ ate: e.target.value })}
                disabled={enviando}
                className="tabular-nums"
              />
            </CampoFormulario>
          </div>
          <p className={cn("text-legenda", invalido ? "text-status-rejeitado" : "text-muted-foreground")}>
            {invalido
              ? "Nenhum movimento nesse intervalo."
              : `${movimentosNoIntervalo(item)} de ${previa.transacoes.length} movimentos entram.`}{" "}
            {previa.saldoFinal !== null && item.ate && item.ate < fimArquivo
              ? "O saldo final do arquivo não será usado, porque o intervalo para antes do fim do arquivo."
              : null}
          </p>
        </>
      ) : (
        <p className="text-legenda text-muted-foreground">Lendo o arquivo…</p>
      )}
    </li>
  );
}

/** O que entrou de um arquivo: importadas, casadas, ignoradas e o aviso. */
function ResumoArquivo({
  resultado,
  compacto = false,
}: {
  resultado: ResultadoImportacao;
  compacto?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "flex flex-col gap-3",
          !compacto && "items-center py-6 text-center",
        )}
      >
        {compacto ? null : <CircleCheck className="size-10 text-status-aprovado" />}
        <div className="text-detalhe">
          <p className={cn(!compacto && "font-medium")}>
            {resultado.inseridas === 0
              ? `Esse arquivo já estava importado (${resultado.ignoradas} ${resultado.ignoradas === 1 ? "movimento" : "movimentos"}), nada foi acrescentado`
              : fraseImportadas(resultado.inseridas)}
          </p>
          {resultado.casadas > 0 ? (
            <p className="text-muted-foreground">
              {resultado.casadas === 1
                ? "1 já casada com o app automaticamente"
                : `${resultado.casadas} já casadas com o app automaticamente`}
            </p>
          ) : null}
          {resultado.regras > 0 ? (
            <p className="text-muted-foreground">
              {resultado.regras === 1
                ? "1 lançada por regra (Rende Fácil, tarifa)"
                : `${resultado.regras} lançadas por regra (Rende Fácil, tarifa)`}
            </p>
          ) : null}
          {resultado.ignoradas > 0 ? (
            <p className="text-muted-foreground">
              {resultado.ignoradas === 1
                ? "1 transação ignorada por já existir"
                : `${resultado.ignoradas} transações ignoradas por já existirem`}
            </p>
          ) : null}
        </div>
      </div>
      {/* Os ignorados à vista, não só o número: é o que permite ver
          que nenhum movimento novo foi tomado por repetido. */}
      {resultado.ignorados.length > 0 ? (
        <details className="rounded-md border border-border px-3 py-2 text-detalhe">
          <summary className="cursor-pointer text-muted-foreground">
            {resultado.ignorados.length === 1
              ? "1 movimento já estava importado: ver"
              : `${resultado.ignorados.length} movimentos já estavam importados: ver`}
          </summary>
          <ul className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto">
            {resultado.ignorados.map((m, i) => (
              <li
                key={`${m.fitid ?? ""}-${i}`}
                className="flex items-baseline gap-3"
              >
                <span className="tabular-nums text-muted-foreground">
                  {formatarData(m.data)}
                </span>
                <span
                  className="min-w-0 flex-1 truncate"
                  title={m.memo ?? ""}
                >
                  {m.memo ?? "-"}
                </span>
                <span className="tabular-nums">
                  {formatarBRL(m.valor)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {/* O arquivo entrou, mas se ele não cobre o mês inteiro a
          conferência nasce furada: o extrato do BB de janeiro/2026 vinha
          de 30/12 a 31/01. Avisar aqui, com o resultado à vista, é o que
          faz a pessoa reexportar antes de começar a conciliar. */}
      {resultado.aviso ? (
        <Alert>
          <TriangleAlert className="text-status-pendente" />
          <AlertTitle>O extrato não é de um mês fechado</AlertTitle>
          <AlertDescription>{resultado.aviso}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
