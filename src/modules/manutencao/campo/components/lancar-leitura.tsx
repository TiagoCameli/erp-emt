"use client";

import * as React from "react";
import { Gauge, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { CampoFormulario, InputQuantidade } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO, formatarQuantidade } from "@/lib/formatadores";
import { useFilaCampo } from "@/modules/manutencao/campo/components/fila-campo";
import {
  LEITURA_MAXIMA,
  ROTULO_TIPO_MEDICAO,
  UNIDADE_MEDICAO,
  dataNoFuturo,
  leituraMenorQueUltima,
  leituraParaNumero,
  type TipoMedicao,
} from "@/modules/manutencao/medicoes/schemas";

interface Props {
  equipamentoId: string;
  tipo: TipoMedicao;
  ultima: number | null;
  onFeito: () => void;
}

/**
 * Lançar horímetro ou km pelo celular. Grava na fila do aparelho e manda; sem sinal, fica
 * guardado e sai sozinho. A data vai como a pessoa viu na tela: a leitura de ontem sem
 * sinal chega hoje com a data de ontem.
 */
export function LancarLeitura({ equipamentoId, tipo, ultima, onFeito }: Props) {
  const { adicionar } = useFilaCampo();
  const [valor, setValor] = React.useState("");
  const [data, setData] = React.useState(() => dataHojeISO());
  const [observacoes, setObservacoes] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  const numero = leituraParaNumero(valor);
  const menor = leituraMenorQueUltima(numero, ultima);
  const unidade = UNIDADE_MEDICAO[tipo];

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (numero === undefined || numero > LEITURA_MAXIMA) {
      setErro("Informe a leitura com até 4 casas decimais");
      return;
    }
    if (dataNoFuturo(data, dataHojeISO())) {
      setErro("A data da leitura não pode ser depois de hoje");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const destino = await adicionar({
        equipamentoId,
        resumo: `${ROTULO_TIPO_MEDICAO[tipo]} ${formatarQuantidade(numero)} ${unidade}`,
        envio: {
          tipo: "medicao",
          idCliente: crypto.randomUUID(),
          dados: { equipamentoId, data, valor: numero, observacoes: observacoes.trim() },
        },
      });
      if (destino === "enviado") toast.success("Leitura lançada");
      else if (destino === "na_fila") toast.info("Sem sinal: a leitura ficou guardada e sai sozinha");
      else toast.error("A leitura foi recusada", { description: "Veja o motivo na fila, no topo da tela." });
      onFeito();
    } catch {
      setErro("Não foi possível guardar a leitura neste celular");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
      <CampoFormulario
        id="leitura-valor"
        rotulo={`${ROTULO_TIPO_MEDICAO[tipo]} (${unidade})`}
        obrigatorio
        erro={erro ?? undefined}
        ajuda={ultima !== null ? `Última: ${formatarQuantidade(ultima)} ${unidade}` : undefined}
      >
        <InputQuantidade id="leitura-valor" valor={valor} onValorChange={setValor} className="h-12 text-lg" />
      </CampoFormulario>
      {menor && ultima !== null ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-status-pendente/30 bg-status-pendente/5 px-3 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-pendente" aria-hidden="true" />
          <div>
            <p className="text-detalhe font-medium">
              A leitura é menor que a última: {formatarQuantidade(ultima)} {unidade}
            </p>
            <p className="text-legenda text-muted-foreground">
              Confira o número. Se o painel foi trocado ou zerado, pode lançar assim e explicar na observação.
            </p>
          </div>
        </div>
      ) : null}
      <CampoFormulario id="leitura-data" rotulo="Data" obrigatorio>
        <Input
          id="leitura-data"
          type="date"
          value={data}
          max={dataHojeISO()}
          onChange={(e) => setData(e.target.value)}
          className="h-12"
        />
      </CampoFormulario>
      <CampoFormulario id="leitura-obs" rotulo="Observação">
        <Textarea
          id="leitura-obs"
          value={observacoes}
          maxLength={500}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={2}
        />
      </CampoFormulario>
      <Button type="submit" size="lg" className="h-12" disabled={salvando}>
        {salvando ? <Loader2 className="animate-spin" aria-hidden /> : <Gauge aria-hidden />}
        Lançar leitura
      </Button>
    </form>
  );
}
