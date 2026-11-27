"use client";

import * as React from "react";
import { Fuel, Loader2 } from "lucide-react";


import { CampoFormulario, Combobox, InputQuantidade, SeletorCentroCusto } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CASAS_TAXA } from "@/lib/casas-decimais";
import { formatarBRL } from "@/lib/formatadores";
import { avisoDeFalhas, type FalhaDeEnvio } from "@/modules/_shared/anexos/fila";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import {
  FILA_VAZIA,
  FilaAnexosCombustivel,
  filaTemAlgo,
  subirFilaCombustivel,
  type FilaCombustivel,
} from "@/modules/combustivel/_shared/components/anexos-combustivel";
import {
  odometroObrigatorio,
  problemasDeLeitura,
  textoUltimaLeitura,
  type ClasseConsumo,
  type UltimasLeituras,
} from "@/modules/combustivel/_shared/leituras";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { calcularPrecoFifo } from "@/modules/combustivel/abastecimentos/actions";
import { enviarPelaRede } from "@/modules/manutencao/campo/fila";
import type { TanqueCampo } from "@/modules/manutencao/campo/queries";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";

interface Props {
  equipamentoId: string;
  /** Carro, moto e cavalo exigem o odômetro. */
  classeConsumo: ClasseConsumo;
  ultimasLeituras: UltimasLeituras;
  tanques: TanqueCampo[];
  centros: CentroCustoOpcao[];
  onFeito: () => void;
}

/**
 * Abastecer o equipamento pelo celular, do tanque da EMT. Só com sinal (a saída depende do
 * estoque do tanque naquele instante) e sem reenvio: a saída não tem id_cliente no banco, e
 * mandar de novo lançaria o diesel duas vezes. Se a conexão cai sem resposta, a tela não diz
 * "não lançou": diz para conferir, porque pode ter lançado.
 *
 * Fotos (bomba, hodômetro, equipamento), até 8, como a origem: esperam no celular e sobem
 * depois que a saída foi lançada, penduradas no id que a rota devolveu. Foto que não sobe
 * não desfaz o abastecimento: vira aviso com o nome dela.
 */
export function Abastecer({ equipamentoId, classeConsumo, ultimasLeituras, tanques, centros, onFeito }: Props) {
  const [tanqueId, setTanqueId] = React.useState(tanques.length === 1 ? tanques[0]!.id : "");
  const [litros, setLitros] = React.useState("");
  const [odometro, setOdometro] = React.useState("");
  const [horimetro, setHorimetro] = React.useState("");
  const [virada, setVirada] = React.useState(false);
  const [motivoVirada, setMotivoVirada] = React.useState("");
  const [centroCustoId, setCentroCustoId] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [erros, setErros] = React.useState<{
    tanque?: string;
    litros?: string;
    centro?: string;
    odometroKm?: string;
    horimetroH?: string;
    motivoVirada?: string;
  }>({});
  const kmObrigatorio = odometroObrigatorio(classeConsumo);
  const [enviando, setEnviando] = React.useState(false);
  const [fotos, setFotos] = React.useState<FilaCombustivel>(FILA_VAZIA);
  const [enviandoFotos, setEnviandoFotos] = React.useState(false);

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
    const km = odometro.trim() === "" ? null : textoParaNumero(odometro, CASAS_TAXA);
    const horas = horimetro.trim() === "" ? null : textoParaNumero(horimetro, CASAS_TAXA);
    const novos: typeof erros = {};
    if (!tanque) novos.tanque = "Escolha o tanque";
    if (numero === null || numero <= 0) novos.litros = "Informe os litros";
    // Igual à origem: o saldo só trava no tanque da EMT; o externo não tem estoque nosso.
    else if (tanque && !tanque.externo && numero > tanque.nivel) {
      novos.litros = `Saldo insuficiente: ${formatarLitros(tanque.nivel)} disponíveis no tanque`;
    }
    // A origem pede obra e etapa sempre; aqui a etapa é a obra (centro de custo) a 100%.
    if (centroCustoId === "") novos.centro = "Escolha a obra";
    if (odometro.trim() !== "" && km === null) novos.odometroKm = "Odômetro inválido";
    if (horimetro.trim() !== "" && horas === null) novos.horimetroH = "Horímetro inválido";
    // As travas do banco (odômetro obrigatório, leitura menor que a anterior, virada com motivo).
    for (const p of problemasDeLeitura({
      classe: classeConsumo,
      odometroKm: km,
      horimetroH: horas,
      virada,
      motivoVirada: motivoVirada.trim() || null,
      anteriores: ultimasLeituras,
    })) {
      novos[p.campo] ??= p.mensagem;
    }
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
          odometroKm: km,
          horimetroH: horas,
          virada,
          motivoVirada: virada ? motivoVirada.trim() || null : null,
          centroCustoId,
          observacoes: observacoes.trim(),
        },
      });
      if (resposta.ok) {
        let falhas: FalhaDeEnvio[] = [];
        if (filaTemAlgo(fotos)) {
          setEnviandoFotos(true);
          try {
            falhas = await subirFilaCombustivel("combustivel_saida", resposta.id, fotos);
          } finally {
            setEnviandoFotos(false);
          }
        }
        const lancado = `Abastecimento de ${formatarLitros(numero)} lançado`;
        const aviso = avisoDeFalhas(lancado, falhas);
        if (aviso) toast.warning(aviso, { duration: 12000 });
        else toast.success(lancado);
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
        <p className="rounded-md border border-status-pendente/40 bg-status-pendente/10 px-3 py-2 text-detalhe text-status-pendente">
          {formatarLitros(previa.semSuprimento)} sem suprimento registrado neste tanque.
        </p>
      ) : null}
      <SeletorCentroCusto idBase="abast-centro" centros={centros} valor={centroCustoId}
        onValorChange={setCentroCustoId} obrigatorio erro={erros.centro} />
      <CampoFormulario
        id="abast-odometro"
        rotulo="Odômetro agora (km)"
        obrigatorio={kmObrigatorio}
        ajuda={erros.odometroKm ? undefined : textoUltimaLeitura(ultimasLeituras.km, "km")}
        erro={erros.odometroKm}
      >
        <InputQuantidade id="abast-odometro" valor={odometro} onValorChange={setOdometro} className="h-12" />
      </CampoFormulario>
      <CampoFormulario
        id="abast-horimetro"
        rotulo="Horímetro agora (h)"
        ajuda={erros.horimetroH ? undefined : textoUltimaLeitura(ultimasLeituras.h, "h")}
        erro={erros.horimetroH}
      >
        <InputQuantidade id="abast-horimetro" valor={horimetro} onValorChange={setHorimetro} className="h-12" />
      </CampoFormulario>
      <div className="flex items-center gap-3">
        <Switch id="abast-virada" checked={virada} onCheckedChange={setVirada} />
        <label htmlFor="abast-virada" className="text-corpo">
          Trocou o painel ou virou o odômetro/horímetro
        </label>
      </div>
      {virada ? (
        <CampoFormulario
          id="abast-motivo-virada"
          rotulo="Motivo da troca ou virada"
          obrigatorio
          ajuda="A leitura reinicia a contagem"
          erro={erros.motivoVirada}
        >
          <Textarea
            id="abast-motivo-virada"
            value={motivoVirada}
            maxLength={500}
            onChange={(e) => setMotivoVirada(e.target.value)}
            rows={2}
          />
        </CampoFormulario>
      ) : null}
      <CampoFormulario id="abast-obs" rotulo="Observação">
        <Textarea id="abast-obs" value={observacoes} placeholder="Opcional" maxLength={500} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
      </CampoFormulario>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Fotos da bomba, do hodômetro ou do equipamento (opcional)</span>
        <FilaAnexosCombustivel fila={fotos} onMudar={setFotos} ocupado={enviando} soFotos />
      </div>
      <Button type="submit" size="lg" className="h-12" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <Fuel aria-hidden />}
        {enviandoFotos ? "Enviando fotos..." : "Lançar abastecimento"}
      </Button>
    </form>
  );
}
