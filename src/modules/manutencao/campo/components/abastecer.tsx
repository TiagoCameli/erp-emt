"use client";

import * as React from "react";
import { Fuel, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { CampoFormulario, Combobox, InputQuantidade, SeletorCentroCusto } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CASAS_TAXA } from "@/lib/casas-decimais";
import { formatarBRL } from "@/lib/formatadores";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { calcularPrecoFifo } from "@/modules/combustivel/abastecimentos/actions";
import { enviarPelaRede } from "@/modules/manutencao/campo/fila";
import type { TanqueCampo } from "@/modules/manutencao/campo/queries";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";

interface Props {
  equipamentoId: string;
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
export function Abastecer({ equipamentoId, tanques, centros, onFeito }: Props) {
  const [tanqueId, setTanqueId] = React.useState(tanques.length === 1 ? tanques[0]!.id : "");
  const [litros, setLitros] = React.useState("");
  const [medicao, setMedicao] = React.useState("");
  const [centroCustoId, setCentroCustoId] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [erros, setErros] = React.useState<{ tanque?: string; litros?: string; centro?: string; medicao?: string }>({});
  const [enviando, setEnviando] = React.useState(false);

  const tanque = tanques.find((t) => t.id === tanqueId);
  const litrosNumero = textoParaNumero(litros, CASAS_TAXA);

  // Resumo da saída, igual à origem: o FIFO do tanque com os litros digitados e "agora".
  // Só prévia: quem grava o snapshot é o servidor, recalculado na hora do envio.
  // A prévia vale para o tanque e os litros com que foi calculada; trocou, some até a nova.
  const chave = tanque && litrosNumero !== null && litrosNumero > 0 ? `${tanque.id}|${litrosNumero}` : null;
  const [calculada, setCalculada] = React.useState<{ chave: string; preco: number; semSuprimento: number } | null>(
    null,
  );
  const previa = calculada && calculada.chave === chave ? calculada : null;
  React.useEffect(() => {
    if (!tanque || chave === null || litrosNumero === null) return;
    let vivo = true;
    const espera = setTimeout(() => {
      calcularPrecoFifo(tanque.id, new Date().toISOString(), litrosNumero, tanque.combustivelId, null)
        .then((r) => {
          if (vivo && "ok" in r) setCalculada({ chave, preco: r.precoMedio, semSuprimento: r.litrosSemSuprimento });
        })
        .catch(() => undefined);
    }, 350);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [tanque, chave, litrosNumero]);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    const numero = textoParaNumero(litros, CASAS_TAXA);
    const leitura = medicao.trim() === "" ? null : textoParaNumero(medicao, CASAS_TAXA);
    const novos: typeof erros = {};
    if (!tanque) novos.tanque = "Escolha o tanque";
    if (numero === null || numero <= 0) novos.litros = "Informe os litros";
    // Igual à origem: o saldo só trava no tanque da EMT; o externo não tem estoque nosso.
    else if (tanque && !tanque.externo && numero > tanque.nivel) {
      novos.litros = `Saldo insuficiente: ${formatarLitros(tanque.nivel)} disponíveis no tanque`;
    }
    // A origem pede obra e etapa sempre; aqui a etapa é a obra (centro de custo) a 100%.
    if (centroCustoId === "") novos.centro = "Escolha a obra";
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
          centroCustoId,
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
    return <p className="text-detalhe text-muted-foreground">Nenhum tanque ativo cadastrado.</p>;
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
      <CampoFormulario id="abast-tanque" rotulo="Tanque" obrigatorio erro={erros.tanque}
        ajuda={tanque?.combustivel ? `Combustível: ${tanque.combustivel}` : undefined}>
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
      {tanque ? (
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/40 p-3 text-center">
          <div>
            <p className="text-detalhe text-muted-foreground">Combustível</p>
            <p className="truncate text-corpo font-semibold">{tanque.combustivel ?? "Sem combustível"}</p>
          </div>
          <div>
            <p className="text-detalhe text-muted-foreground">R$ / litro</p>
            <p className="text-corpo font-semibold tabular-nums">
              {previa && previa.preco > 0 ? formatarBRL(previa.preco) : "Sem preço"}
            </p>
          </div>
          <div>
            <p className="text-detalhe text-muted-foreground">Total</p>
            <p className="text-corpo font-semibold tabular-nums">
              {previa && previa.preco > 0 && litrosNumero ? formatarBRL(litrosNumero * previa.preco) : "Sem total"}
            </p>
          </div>
        </div>
      ) : null}
      {previa && previa.semSuprimento > 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-detalhe text-amber-800">
          {formatarLitros(previa.semSuprimento)} sem suprimento registrado neste tanque.
        </p>
      ) : null}
      <SeletorCentroCusto idBase="abast-centro" centros={centros} valor={centroCustoId}
        onValorChange={setCentroCustoId} obrigatorio erro={erros.centro} />
      <CampoFormulario id="abast-medicao" rotulo="Horímetro ou km agora" erro={erros.medicao}>
        <InputQuantidade id="abast-medicao" valor={medicao} onValorChange={setMedicao} className="h-12" />
      </CampoFormulario>
      <CampoFormulario id="abast-obs" rotulo="Observação">
        <Textarea id="abast-obs" value={observacoes} placeholder="Opcional" maxLength={500} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
      </CampoFormulario>
      <Button type="submit" size="lg" className="h-12" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <Fuel aria-hidden />}
        Lançar abastecimento
      </Button>
    </form>
  );
}
