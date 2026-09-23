"use client";

import * as React from "react";
import { Fuel, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { CampoFormulario, Combobox, InputQuantidade, SeletorCentroCusto } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CASAS_TAXA } from "@/lib/casas-decimais";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { enviarPelaRede } from "@/modules/manutencao/campo/fila";
import type { TanqueCampo } from "@/modules/manutencao/campo/queries";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";

interface Props {
  equipamentoId: string;
  temEtapa: boolean;
  tanques: TanqueCampo[];
  centros: CentroCustoOpcao[];
  onFeito: () => void;
}

/**
 * Abastecer o equipamento pelo celular, do tanque da EMT. Só com sinal (a saída depende do
 * estoque do tanque naquele instante) e sem reenvio: a saída não tem id_cliente no banco, e
 * mandar de novo lançaria o diesel duas vezes. Se a conexão cai sem resposta, a tela não diz
 * "não lançou": diz para conferir, porque pode ter lançado.
 */
export function Abastecer({ equipamentoId, temEtapa, tanques, centros, onFeito }: Props) {
  const [tanqueId, setTanqueId] = React.useState(tanques.length === 1 ? tanques[0]!.id : "");
  const [litros, setLitros] = React.useState("");
  const [medicao, setMedicao] = React.useState("");
  const [centroCustoId, setCentroCustoId] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [erros, setErros] = React.useState<{ tanque?: string; litros?: string; centro?: string; medicao?: string }>({});
  const [enviando, setEnviando] = React.useState(false);

  const tanque = tanques.find((t) => t.id === tanqueId);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    const numero = textoParaNumero(litros, CASAS_TAXA);
    const leitura = medicao.trim() === "" ? null : textoParaNumero(medicao, CASAS_TAXA);
    const novos: typeof erros = {};
    if (!tanque) novos.tanque = "Escolha o tanque";
    if (numero === null || numero <= 0) novos.litros = "Informe os litros";
    else if (tanque && numero > tanque.nivel) novos.litros = `O tanque tem ${formatarLitros(tanque.nivel)}`;
    if (!temEtapa && centroCustoId === "") novos.centro = "Equipamento alugado: escolha a obra onde ele trabalha";
    if (medicao.trim() !== "" && leitura === null) novos.medicao = "Leitura inválida";
    setErros(novos);
    if (Object.keys(novos).length > 0 || numero === null) return;
    if (!navigator.onLine) {
      toast.error("Sem sinal: o abastecimento precisa de internet. Nada foi lançado.");
      return;
    }

    setEnviando(true);
    try {
      const resposta = await enviarPelaRede({
        tipo: "abastecimento",
        idCliente: crypto.randomUUID(),
        dados: {
          equipamentoId,
          tanqueId,
          litros: numero,
          data: new Date().toISOString(),
          medicao: leitura,
          centroCustoId: centroCustoId || null,
          observacoes: observacoes.trim(),
        },
      });
      if (resposta.ok) {
        toast.success(`Abastecimento de ${formatarLitros(numero)} lançado`);
        onFeito();
      } else if (resposta.semSessao) {
        toast.error("Sua sessão acabou. Entre de novo; nada foi lançado.");
      } else {
        toast.error(resposta.erro);
      }
    } catch {
      toast.error("A conexão caiu sem resposta. Confira na lista de abastecimentos antes de lançar de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (tanques.length === 0) {
    return <p className="text-detalhe text-muted-foreground">Nenhum tanque da EMT com combustível agora.</p>;
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
      <CampoFormulario id="abast-tanque" rotulo="Tanque" obrigatorio erro={erros.tanque}
        ajuda={tanque ? `Disponível: ${formatarLitros(tanque.nivel)}` : undefined}>
        <Combobox
          id="abast-tanque"
          valor={tanqueId}
          onValorChange={setTanqueId}
          opcoes={tanques.map((t) => ({ valor: t.id, rotulo: t.rotulo }))}
          placeholder="Escolha o tanque"
        />
      </CampoFormulario>
      <CampoFormulario id="abast-litros" rotulo="Litros" obrigatorio erro={erros.litros}>
        <InputQuantidade id="abast-litros" valor={litros} onValorChange={setLitros} className="h-12 text-lg" />
      </CampoFormulario>
      {!temEtapa ? (
        <SeletorCentroCusto idBase="abast-centro" centros={centros} valor={centroCustoId}
          onValorChange={setCentroCustoId} obrigatorio erro={erros.centro} />
      ) : null}
      <CampoFormulario id="abast-medicao" rotulo="Horímetro ou km agora" erro={erros.medicao}>
        <InputQuantidade id="abast-medicao" valor={medicao} onValorChange={setMedicao} className="h-12" />
      </CampoFormulario>
      <CampoFormulario id="abast-obs" rotulo="Observação">
        <Textarea id="abast-obs" value={observacoes} maxLength={500} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
      </CampoFormulario>
      <Button type="submit" size="lg" className="h-12" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <Fuel aria-hidden />}
        Lançar abastecimento
      </Button>
    </form>
  );
}
