"use client";

import * as React from "react";
import { LoaderCircle, QrCode } from "lucide-react";

import { Combobox, type ComboboxOpcao } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { baixarBase64, MIME_PDF } from "@/lib/download";
import { MAX_ETIQUETAS } from "@/modules/cadastros/equipamentos/etiqueta-qr";
import { gerarEtiquetasQr } from "@/modules/cadastros/equipamentos/etiquetas-actions";

/** Equipamento oferecido na escolha: o mínimo para montar o rótulo. */
export interface EquipamentoParaEtiqueta {
  id: string;
  codigo: string | null;
  descricao: string;
}

export interface BotaoEtiquetasQrProps {
  /** Equipamentos ATIVOS. Vazio na escolha = etiqueta de todos eles. */
  equipamentosAtivos: EquipamentoParaEtiqueta[];
}

function rotulo(equipamento: EquipamentoParaEtiqueta): string {
  const codigo = equipamento.codigo?.trim();
  return codigo ? `${codigo} - ${equipamento.descricao}` : equipamento.descricao;
}

function contagem(escolhidos: number, ativos: number): string {
  if (escolhidos === 0) {
    if (ativos === 0) {
      return "Não há equipamento ativo. Cadastre ou reative um para gerar etiqueta.";
    }
    return ativos === 1
      ? "Sai a etiqueta do único equipamento ativo."
      : `Saem as etiquetas dos ${ativos} equipamentos ativos.`;
  }
  const folhas = Math.ceil(escolhidos / 8);
  const etiquetas = escolhidos === 1 ? "1 etiqueta" : `${escolhidos} etiquetas`;
  return `${etiquetas}, ${folhas === 1 ? "1 folha" : `${folhas} folhas`} A4.`;
}

/**
 * "Etiquetas QR" no cabeçalho de Equipamentos: PDF de etiquetas para colar na
 * frota, 8 por folha A4. O QR abre a tela de campo do equipamento no celular.
 *
 * Ação da PÁGINA, então mora no cabeçalho. Aparece para quem vê a página
 * (permissão `ver`), a mesma que a action cobra.
 */
export function BotaoEtiquetasQr({ equipamentosAtivos }: BotaoEtiquetasQrProps) {
  const [aberto, setAberto] = React.useState(false);
  const [escolhidos, setEscolhidos] = React.useState<string[]>([]);
  const [gerando, setGerando] = React.useState(false);

  const opcoes = React.useMemo<ComboboxOpcao[]>(
    () =>
      equipamentosAtivos.map((equipamento) => ({
        valor: equipamento.id,
        rotulo: rotulo(equipamento),
      })),
    [equipamentosAtivos],
  );

  const passouDoTeto = escolhidos.length > MAX_ETIQUETAS;
  const semNada = escolhidos.length === 0 && equipamentosAtivos.length === 0;

  async function aoGerar() {
    if (gerando) return;
    setGerando(true);
    try {
      const resultado = await gerarEtiquetasQr(
        escolhidos.length > 0 ? escolhidos : null,
      );
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      baixarBase64(resultado.base64, resultado.nomeArquivo, MIME_PDF);
      setAberto(false);
    } catch {
      toast.error("Não foi possível gerar as etiquetas. Tente de novo.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAberto(true)}
      >
        <QrCode />
        Etiquetas QR
      </Button>

      <Dialog
        open={aberto}
        onOpenChange={(proximo) => {
          if (!gerando) setAberto(proximo);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Etiquetas QR</DialogTitle>
            <DialogDescription className="text-detalhe text-muted-foreground">
              PDF com 8 etiquetas por folha A4, para recortar e colar no
              equipamento. O QR abre o equipamento no celular para lançar
              horímetro e abrir OS.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="etiquetas-qr-equipamentos"
              className="text-detalhe font-medium"
            >
              Equipamentos
            </label>
            <Combobox
              id="etiquetas-qr-equipamentos"
              valor=""
              onValorChange={() => undefined}
              valores={escolhidos}
              onValoresChange={setEscolhidos}
              opcoes={opcoes}
              limpavel
              placeholder="Todos os ativos"
              buscaPlaceholder="Buscar por código ou nome"
              vazioTexto="Nenhum equipamento encontrado"
              disabled={gerando}
            />
            <p
              className={
                passouDoTeto
                  ? "text-legenda text-destructive"
                  : "text-legenda text-muted-foreground tabular-nums"
              }
              aria-live="polite"
            >
              {passouDoTeto
                ? `Escolha no máximo ${MAX_ETIQUETAS} equipamentos por vez.`
                : contagem(escolhidos.length, equipamentosAtivos.length)}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAberto(false)}
              disabled={gerando}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={aoGerar}
              disabled={gerando || passouDoTeto || semNada}
            >
              {gerando ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {gerando ? "Gerando PDF" : "Gerar PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
