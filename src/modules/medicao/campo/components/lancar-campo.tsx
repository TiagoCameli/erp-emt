"use client";

import * as React from "react";
import { ClipboardCheck, Loader2, TriangleAlert } from "lucide-react";

import { CampoFormulario, Combobox, InputQuantidade } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO } from "@/lib/formatadores";
import { avisoDeFalhas, type FalhaDeEnvio } from "@/modules/_shared/anexos/fila";
import {
  FILA_VAZIA,
  FilaFotosEArquivos,
  filaTemAlgo,
  subirFilaFotosEArquivos,
  type FilaDeFotosEArquivos,
} from "@/modules/_shared/anexos/fotos-e-arquivos";
import { salvarLancamento } from "@/modules/medicao/lancamentos/actions";
import { LANCAMENTO_FORM_VAZIO, lancamentoFormSchema, type LancamentoFormInput } from "@/modules/medicao/lancamentos/schemas";
import { numeroExibicao } from "@/modules/medicao/planilha/formato";
import type { ServicoParaLancar } from "@/modules/medicao/lancamentos/tipos";

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Mesma mensagem para "sem sinal antes de mandar" e "a conexão caiu no meio do envio": os dois
 * casos pedem a mesma reação da pessoa, anotar e tentar de novo com sinal (decisão do Tiago de
 * 28/09/2026, igual ao Abastecer da Manutenção). */
const SEM_INTERNET = "Sem internet. Anote e lance quando tiver sinal.";

type CampoComErro = "itemId" | "data" | "quantidade" | "kmInicial" | "kmFinal" | "motivoExcesso";

/** Rótulo do combobox: código, descrição, unidade e previsto (mesmo formato do drawer de mesa). */
function rotuloServico(s: ServicoParaLancar): string {
  const previsto = s.quantidadePrevista === null ? "-" : numeroExibicao(s.quantidadePrevista);
  return `${s.codigo} · ${s.descricao} (${s.unidade ?? "-"}) · previsto ${previsto}`;
}

export interface LancarCampoProps {
  contratoId: string;
  tipoLocalizacao: "rodovia" | "texto";
  /** Serviços das medições ABERTAS do contrato (servicosParaLancar). */
  servicos: ServicoParaLancar[];
}

/**
 * Lançar um serviço executado pelo celular, com foto carimbada (data, hora e GPS, `carimbarFotos`
 * dentro do `FilaFotosEArquivos`). Como o Abastecer da Manutenção: precisa de sinal, sem fila
 * offline (decisão do Tiago de 28/09/2026) — sem sinal, ou com a conexão caindo no meio do envio,
 * nada é gravado nem tentado de novo (o botão trava com `enviando` para não regravar em dois
 * toques).
 *
 * Gravou: as fotos sobem depois, no id que a action devolveu; foto que falha vira aviso, sem
 * regravar o lançamento (nunca duplica). O formulário limpa para o próximo serviço, mantendo a
 * data e o contrato — quem está no campo costuma lançar vários serviços seguidos do mesmo dia.
 */
export function LancarCampo({ contratoId, tipoLocalizacao, servicos }: LancarCampoProps) {
  const [data, setData] = React.useState(() => dataHojeISO());
  const [itemId, setItemId] = React.useState("");
  const [quantidade, setQuantidade] = React.useState("");
  const [kmInicial, setKmInicial] = React.useState("");
  const [kmFinal, setKmFinal] = React.useState("");
  const [estaca, setEstaca] = React.useState("");
  const [observacao, setObservacao] = React.useState("");
  const [motivoExcesso, setMotivoExcesso] = React.useState("");
  const [erros, setErros] = React.useState<Partial<Record<CampoComErro, string>>>({});
  const [excesso, setExcesso] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [enviandoFotos, setEnviandoFotos] = React.useState(false);
  const [fila, setFila] = React.useState<FilaDeFotosEArquivos>(FILA_VAZIA);

  const dataValida = DATA_ISO.test(data);
  const servicosDaData = dataValida ? servicos.filter((s) => s.periodoInicio <= data && data <= s.periodoFim) : servicos;
  // Código repetido entre serviços da mesma medição (Lote 09, "02.02" duas vezes): acrescenta a
  // linha da planilha só nas opções cujo código aparece mais de uma vez, para dar para escolher a
  // certa (mesma regra do drawer de mesa).
  const contagemPorCodigo = new Map<string, number>();
  for (const s of servicosDaData) contagemPorCodigo.set(s.codigo, (contagemPorCodigo.get(s.codigo) ?? 0) + 1);
  const opcoesServico = servicosDaData.map((s) => ({
    valor: s.itemId,
    rotulo:
      (contagemPorCodigo.get(s.codigo) ?? 0) > 1 ? `${rotuloServico(s)} · linha ${s.ordem} da planilha` : rotuloServico(s),
  }));

  const mostrarMotivo = excesso !== null;

  function limparParaProximo() {
    setItemId("");
    setQuantidade("");
    setKmInicial("");
    setKmFinal("");
    setEstaca("");
    setObservacao("");
    setMotivoExcesso("");
    setExcesso(null);
    setErros({});
    setFila(FILA_VAZIA);
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;

    const valores: LancamentoFormInput = {
      ...LANCAMENTO_FORM_VAZIO,
      contratoId,
      itemId,
      data,
      quantidade,
      kmInicial,
      kmFinal,
      estaca,
      observacao,
      motivoExcesso,
    };
    const validado = lancamentoFormSchema(tipoLocalizacao).safeParse(valores);
    if (!validado.success) {
      const novosErros: Partial<Record<CampoComErro, string>> = {};
      for (const problema of validado.error.issues) {
        const campo = problema.path[0] as CampoComErro;
        if (!novosErros[campo]) novosErros[campo] = problema.message;
      }
      setErros(novosErros);
      toast.error(validado.error.issues[0]?.message ?? "Confira os campos");
      return;
    }
    setErros({});

    // Confere ANTES de chamar o servidor: no celular, sem sinal o fetch nem sai — não vale
    // esperar a rejeição para dizer a mesma coisa.
    if (!navigator.onLine) {
      toast.error(SEM_INTERNET);
      return;
    }

    setEnviando(true);
    try {
      const resultado = await salvarLancamento(validado.data);
      if (!resultado.ok) {
        toast.error(resultado.erro);
        // Só ACRESCENTA o alerta quando o banco acabou de recusar por excesso: um erro comum
        // depois não pode apagar o motivo que a pessoa já estava vendo (o excesso continua valendo).
        if (resultado.excesso) setExcesso(resultado.erro);
        return;
      }
      setExcesso(null);

      let falhas: FalhaDeEnvio[] = [];
      if (filaTemAlgo(fila)) {
        setEnviandoFotos(true);
        try {
          falhas = await subirFilaFotosEArquivos("mc_lancamento", resultado.id, fila);
        } finally {
          setEnviandoFotos(false);
        }
      }

      const servicoLancado = servicos.find((s) => s.itemId === itemId);
      const mensagem = servicoLancado ? `Lançado na ${servicoLancado.medicaoNumero}ª medição` : "Lançamento gravado";
      const aviso = avisoDeFalhas(mensagem, falhas);
      if (aviso) toast.warning(aviso, { duration: 12000 });
      else toast.success(mensagem);

      limparParaProximo();
    } catch {
      // A conexão caiu no meio do envio: no celular a reação é a mesma de não ter sinal nenhum —
      // anotar e mandar de novo quando voltar. Sem regravar sozinho.
      toast.error(SEM_INTERNET);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <CampoFormulario id="campo-lanc-data" rotulo="Data" obrigatorio erro={erros.data}>
        <Input
          id="campo-lanc-data"
          type="date"
          value={data}
          max={dataHojeISO()}
          disabled={enviando}
          onChange={(evento) => setData(evento.target.value)}
          className="h-12"
        />
      </CampoFormulario>

      <CampoFormulario id="campo-lanc-servico" rotulo="Serviço" obrigatorio erro={erros.itemId}>
        <Combobox
          id="campo-lanc-servico"
          valor={itemId}
          onValorChange={setItemId}
          opcoes={opcoesServico}
          placeholder="Buscar por código ou descrição"
          vazioTexto={dataValida ? "Nenhum serviço na medição aberta desta data" : "Escolha a data para ver os serviços"}
          disabled={enviando}
        />
      </CampoFormulario>

      <CampoFormulario id="campo-lanc-quantidade" rotulo="Quantidade" obrigatorio erro={erros.quantidade}>
        <InputQuantidade id="campo-lanc-quantidade" valor={quantidade} onValorChange={setQuantidade} className="h-12 text-lg" disabled={enviando} />
      </CampoFormulario>

      {tipoLocalizacao === "rodovia" ? (
        <div className="grid grid-cols-2 gap-3">
          <CampoFormulario id="campo-lanc-km-inicial" rotulo="Km inicial" obrigatorio erro={erros.kmInicial}>
            <InputQuantidade id="campo-lanc-km-inicial" valor={kmInicial} onValorChange={setKmInicial} className="h-12" disabled={enviando} />
          </CampoFormulario>
          <CampoFormulario id="campo-lanc-km-final" rotulo="Km final" obrigatorio erro={erros.kmFinal}>
            <InputQuantidade id="campo-lanc-km-final" valor={kmFinal} onValorChange={setKmFinal} className="h-12" disabled={enviando} />
          </CampoFormulario>
        </div>
      ) : null}

      <CampoFormulario id="campo-lanc-estaca" rotulo="Estaca">
        <Input
          id="campo-lanc-estaca"
          autoComplete="off"
          value={estaca}
          disabled={enviando}
          onChange={(evento) => setEstaca(evento.target.value)}
          className="h-12"
        />
      </CampoFormulario>

      <CampoFormulario id="campo-lanc-observacao" rotulo="Observação">
        <Textarea
          id="campo-lanc-observacao"
          value={observacao}
          disabled={enviando}
          maxLength={500}
          onChange={(evento) => setObservacao(evento.target.value)}
          rows={2}
        />
      </CampoFormulario>

      {excesso ? (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-detalhe text-destructive"
        >
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <TriangleAlert className="size-4" aria-hidden />
            Excesso sobre o previsto
          </span>
          <span>{excesso}</span>
        </div>
      ) : null}
      {mostrarMotivo ? (
        <CampoFormulario id="campo-lanc-motivo-excesso" rotulo="Motivo do excesso" obrigatorio erro={erros.motivoExcesso}>
          <Textarea
            id="campo-lanc-motivo-excesso"
            rows={2}
            placeholder="Por que este item passou do previsto"
            value={motivoExcesso}
            disabled={enviando}
            onChange={(evento) => setMotivoExcesso(evento.target.value)}
          />
        </CampoFormulario>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Foto (opcional)</span>
        <FilaFotosEArquivos fila={fila} onMudar={setFila} ocupado={enviando} soFotos />
      </div>

      <Button type="submit" size="lg" className="h-12" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <ClipboardCheck aria-hidden />}
        {enviandoFotos ? "Enviando foto..." : "Lançar"}
      </Button>
    </form>
  );
}
