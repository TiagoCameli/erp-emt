"use client";

import * as React from "react";
import { ClipboardPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { CampoFormulario, Combobox, InputQuantidade, SeletorCentroCusto } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CASAS_TAXA } from "@/lib/casas-decimais";
import { dataHojeISO } from "@/lib/formatadores";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import {
  PRIORIDADES_OS,
  ROTULO_PRIORIDADE_OS,
  ROTULO_TIPO_OS,
  TIPOS_OS,
  type PrioridadeOs,
  type TipoOs,
} from "@/modules/manutencao/_shared/rotulos";
import { useFilaCampo } from "@/modules/manutencao/campo/components/fila-campo";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";
import { osExigeCentroCusto } from "@/modules/manutencao/servicos/regras";

interface Props {
  equipamentoId: string;
  temEtapa: boolean;
  /** Só vem quando o equipamento é alugado (sem etapa): a OS pede a obra. */
  centros: CentroCustoOpcao[];
  onFeito: () => void;
}

const OPCOES_TIPO = TIPOS_OS.map((valor) => ({ valor, rotulo: ROTULO_TIPO_OS[valor] }));
const OPCOES_PRIORIDADE = PRIORIDADES_OS.map((valor) => ({ valor, rotulo: ROTULO_PRIORIDADE_OS[valor] }));

/**
 * Abrir OS pelo celular: o mínimo que o mecânico sabe na frente da máquina. Peça, óleo,
 * terceiro e conclusão continuam no computador. Nasce `aberta`, origem celular.
 */
export function AbrirOs({ equipamentoId, temEtapa, centros, onFeito }: Props) {
  const { adicionar } = useFilaCampo();
  const exigeCentro = osExigeCentroCusto({ temEtapa });
  const [tipo, setTipo] = React.useState<TipoOs>("corretiva");
  const [prioridade, setPrioridade] = React.useState<PrioridadeOs>("media");
  const [descricao, setDescricao] = React.useState("");
  const [defeito, setDefeito] = React.useState("");
  const [medicao, setMedicao] = React.useState("");
  const [centroCustoId, setCentroCustoId] = React.useState("");
  const [erros, setErros] = React.useState<{ descricao?: string; centro?: string; medicao?: string }>({});
  const [salvando, setSalvando] = React.useState(false);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    const medicaoNumero = medicao.trim() === "" ? null : textoParaNumero(medicao, CASAS_TAXA);
    const novos: typeof erros = {};
    if (descricao.trim() === "") novos.descricao = "Descreva o serviço";
    if (exigeCentro && centroCustoId === "") novos.centro = "Equipamento alugado: escolha a obra onde ele trabalha";
    if (medicao.trim() !== "" && medicaoNumero === null) novos.medicao = "Medição inválida: use número com até 4 casas";
    setErros(novos);
    if (Object.keys(novos).length > 0) return;

    setSalvando(true);
    try {
      const destino = await adicionar({
        equipamentoId,
        resumo: `${ROTULO_TIPO_OS[tipo]}: ${descricao.trim().slice(0, 60)}`,
        envio: {
          tipo: "os",
          idCliente: crypto.randomUUID(),
          dados: {
            equipamentoId,
            centroCustoId: exigeCentro ? centroCustoId : null,
            tipo,
            prioridade,
            descricao: descricao.trim(),
            defeitoReportado: defeito.trim() === "" ? null : defeito.trim(),
            causaRaiz: null,
            observacoes: null,
            dataAbertura: dataHojeISO(),
            medicaoAbertura: medicaoNumero,
          },
        },
      });
      if (destino === "enviado") toast.success("OS aberta");
      else if (destino === "na_fila") toast.info("Sem sinal: a OS ficou guardada e sai sozinha");
      else toast.error("A OS foi recusada", { description: "Veja o motivo na fila, no topo da tela." });
      onFeito();
    } catch {
      toast.error("Não foi possível guardar a OS neste celular");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
      <CampoFormulario id="os-tipo" rotulo="Tipo" obrigatorio>
        <Combobox id="os-tipo" valor={tipo} onValorChange={(v) => setTipo(v as TipoOs)} opcoes={OPCOES_TIPO} />
      </CampoFormulario>
      <CampoFormulario id="os-prioridade" rotulo="Prioridade" obrigatorio>
        <Combobox
          id="os-prioridade"
          valor={prioridade}
          onValorChange={(v) => setPrioridade(v as PrioridadeOs)}
          opcoes={OPCOES_PRIORIDADE}
        />
      </CampoFormulario>
      {exigeCentro ? (
        <SeletorCentroCusto
          idBase="os-centro"
          centros={centros}
          valor={centroCustoId}
          onValorChange={setCentroCustoId}
          obrigatorio
          erro={erros.centro}
        />
      ) : null}
      <CampoFormulario id="os-descricao" rotulo="O que precisa ser feito" obrigatorio erro={erros.descricao}>
        <Textarea
          id="os-descricao"
          value={descricao}
          maxLength={4000}
          onChange={(e) => setDescricao(e.target.value)}
          rows={3}
        />
      </CampoFormulario>
      <CampoFormulario id="os-defeito" rotulo="Defeito que o operador relatou">
        <Textarea id="os-defeito" value={defeito} maxLength={4000} onChange={(e) => setDefeito(e.target.value)} rows={2} />
      </CampoFormulario>
      <CampoFormulario id="os-medicao" rotulo="Horímetro ou km agora" erro={erros.medicao}>
        <InputQuantidade id="os-medicao" valor={medicao} onValorChange={setMedicao} className="h-12" />
      </CampoFormulario>
      <Button type="submit" size="lg" className="h-12" disabled={salvando}>
        {salvando ? <Loader2 className="animate-spin" aria-hidden /> : <ClipboardPlus aria-hidden />}
        Abrir OS
      </Button>
    </form>
  );
}
