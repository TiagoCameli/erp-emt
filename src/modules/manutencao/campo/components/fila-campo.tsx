"use client";

import * as React from "react";
import { CloudOff, CloudUpload, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatarDataHora } from "@/lib/formatadores";
import { ROTULO_ENVIO_CAMPO, type EnvioCampo } from "@/modules/manutencao/campo/envio";
import {
  armazemEmMemoria,
  armazemIndexedDb,
  enviarPelaRede,
  enviarPendentes,
  itensDoUsuario,
  novoItem,
  type ArmazemFila,
  type ItemFila,
} from "@/modules/manutencao/campo/fila";

interface ContextoFila {
  itens: ItemFila[];
  /** A fila vive só na memória (aba anônima, armazenamento bloqueado): fechar a página perde o que não foi. */
  soMemoria: boolean;
  semSessao: boolean;
  /** Grava na fila e tenta mandar na hora. Resolve "enviado" ou "na_fila" (nunca lança). */
  adicionar: (dados: { equipamentoId: string; resumo: string; envio: EnvioCampo }) => Promise<"enviado" | "na_fila" | "recusado">;
  enviarAgora: () => Promise<void>;
  descartar: (idCliente: string) => Promise<void>;
}

const Contexto = React.createContext<ContextoFila | null>(null);

export function useFilaCampo(): ContextoFila {
  const contexto = React.useContext(Contexto);
  if (!contexto) throw new Error("useFilaCampo fora do FilaCampoProvider");
  return contexto;
}

const INTERVALO_MS = 30_000;

export function FilaCampoProvider({ usuarioId, children }: { usuarioId: string; children: React.ReactNode }) {
  const armazemRef = React.useRef<Promise<ArmazemFila> | null>(null);
  const enviandoRef = React.useRef<Promise<void> | null>(null);
  const [itens, setItens] = React.useState<ItemFila[]>([]);
  const [soMemoria, setSoMemoria] = React.useState(false);
  const [semSessao, setSemSessao] = React.useState(false);

  const armazem = React.useCallback((): Promise<ArmazemFila> => {
    if (!armazemRef.current) {
      armazemRef.current = armazemIndexedDb().catch(() => {
        setSoMemoria(true);
        return armazemEmMemoria();
      });
    }
    return armazemRef.current;
  }, []);

  const recarregar = React.useCallback(async () => {
    const a = await armazem();
    setItens(itensDoUsuario(await a.listar(), usuarioId));
  }, [armazem, usuarioId]);

  // Uma rodada por vez: o `online`, o foco e o botão chegando juntos não mandam o mesmo
  // item em paralelo (o idCliente absorveria, mas a tela piscaria contagem errada).
  const enviarAgora = React.useCallback(async () => {
    if (enviandoRef.current) return enviandoRef.current;
    const rodada = (async () => {
      try {
        const a = await armazem();
        const resultado = await enviarPendentes(a, enviarPelaRede, usuarioId);
        setSemSessao(resultado.semSessao);
        if (resultado.recusados > 0) {
          toast.error("Um lançamento foi recusado", { description: "Veja o motivo na fila, no topo da tela." });
        }
      } finally {
        await recarregar();
        enviandoRef.current = null;
      }
    })();
    enviandoRef.current = rodada;
    return rodada;
  }, [armazem, recarregar, usuarioId]);

  const adicionar = React.useCallback<ContextoFila["adicionar"]>(
    async ({ equipamentoId, resumo, envio }) => {
      const a = await armazem();
      await a.gravar(novoItem({ usuarioId, equipamentoId, resumo, envio }));
      await recarregar();
      await enviarAgora();
      const restante = (await a.listar()).find((item) => item.idCliente === envio.idCliente);
      if (!restante) return "enviado";
      return restante.recusado ? "recusado" : "na_fila";
    },
    [armazem, enviarAgora, recarregar, usuarioId],
  );

  const descartar = React.useCallback(
    async (idCliente: string) => {
      const a = await armazem();
      await a.remover(idCliente);
      await recarregar();
    },
    [armazem, recarregar],
  );

  React.useEffect(() => {
    void enviarAgora();
    const aoVoltarRede = () => void enviarAgora();
    const aoVoltarFoco = () => {
      if (document.visibilityState === "visible") void enviarAgora();
    };
    window.addEventListener("online", aoVoltarRede);
    document.addEventListener("visibilitychange", aoVoltarFoco);
    return () => {
      window.removeEventListener("online", aoVoltarRede);
      document.removeEventListener("visibilitychange", aoVoltarFoco);
    };
  }, [enviarAgora]);

  const pendentes = itens.filter((item) => !item.recusado).length;
  React.useEffect(() => {
    if (pendentes === 0) return;
    const intervalo = window.setInterval(() => {
      if (navigator.onLine) void enviarAgora();
    }, INTERVALO_MS);
    return () => window.clearInterval(intervalo);
  }, [pendentes, enviarAgora]);

  const valor = React.useMemo(
    () => ({ itens, soMemoria, semSessao, adicionar, enviarAgora, descartar }),
    [itens, soMemoria, semSessao, adicionar, enviarAgora, descartar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Chip do topo: quantos lançamentos ainda não chegaram, e a lista deles. */
export function IndicadorFila() {
  const { itens, soMemoria, semSessao, enviarAgora, descartar } = useFilaCampo();
  const [enviando, setEnviando] = React.useState(false);
  if (itens.length === 0 && !soMemoria) return null;

  const recusados = itens.filter((item) => item.recusado).length;
  const pendentes = itens.length - recusados;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={recusados > 0 ? "border-destructive text-destructive" : undefined}
          aria-label={`Fila do celular: ${pendentes} para enviar, ${recusados} recusados`}
        >
          {pendentes > 0 ? <CloudOff aria-hidden /> : <CloudUpload aria-hidden />}
          {itens.length > 0 ? `${itens.length} na fila` : "Fila"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <div className="flex flex-col gap-3">
          {soMemoria ? (
            <p className="text-detalhe text-destructive">
              Este navegador não guarda a fila: não feche a página antes de enviar.
            </p>
          ) : null}
          {semSessao ? (
            <p className="text-detalhe text-destructive">
              Sua sessão acabou. Entre de novo para enviar; a fila continua guardada.
            </p>
          ) : null}
          {itens.length === 0 ? (
            <p className="text-detalhe text-muted-foreground">Nada esperando envio.</p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {itens.map((item) => (
                <li key={item.idCliente} className="rounded-md border border-border p-2">
                  <p className="text-detalhe font-medium">
                    {ROTULO_ENVIO_CAMPO[item.envio.tipo]}: {item.resumo}
                  </p>
                  <p className="text-legenda text-muted-foreground">
                    Lançado em {formatarDataHora(item.criadoEm)}
                  </p>
                  {item.ultimoErro ? (
                    <p className={item.recusado ? "text-legenda text-destructive" : "text-legenda text-muted-foreground"}>
                      {item.recusado ? "Recusado: " : ""}
                      {item.ultimoErro}
                    </p>
                  ) : null}
                  {item.recusado ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 text-destructive"
                      onClick={() => void descartar(item.idCliente)}
                    >
                      <Trash2 aria-hidden />
                      Descartar
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {pendentes > 0 ? (
            <Button
              size="sm"
              disabled={enviando}
              onClick={async () => {
                setEnviando(true);
                try {
                  await enviarAgora();
                } finally {
                  setEnviando(false);
                }
              }}
            >
              <RefreshCw aria-hidden className={enviando ? "animate-spin" : undefined} />
              Enviar agora
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
