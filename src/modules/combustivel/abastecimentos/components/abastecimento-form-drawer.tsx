"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputPreco,
  InputQuantidade,
  LinhaCampos,
  SecaoFormulario,
  SeletorCentroCusto,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import type { FIFOResult } from "@/modules/combustivel/_shared/fifo-ts";
import {
  dataHoraLocalParaIso,
  formatarLitros,
  ORIGENS_SAIDA,
  ROTULO_ORIGEM_SAIDA,
  ROTULO_TIPO_CONSUMIDOR,
  TIPOS_CONSUMIDOR,
  type OrigemSaida,
  type TipoConsumidor,
} from "@/modules/combustivel/_shared/rotulos";
import {
  calcularPrecoFifo,
  consultarEstoqueNaData,
  consultarInicioCiclo,
  consultarUltimaLeitura,
  salvarAbastecimento,
} from "@/modules/combustivel/abastecimentos/actions";
import {
  acharDieselS10,
  linhasImpacto,
  taxaPadraoDaTransportadora,
  tipoCombustivelDoTanque,
  tipoMedicaoDoControle,
  valoresDoAbastecimento,
  valoresNovoAbastecimento,
} from "@/modules/combustivel/abastecimentos/formulario";
import type {
  AbastecimentoCompleto,
  EquipamentoOpcao,
  TransportadoraOpcao,
} from "@/modules/combustivel/abastecimentos/queries";
import {
  avisosDeConferencia,
  ehPosto,
  precoUnitarioSaida,
  saidaDoForm,
  saidaFormSchema,
  saldoInsuficiente as calcularSaldoInsuficiente,
  taxaEfetiva,
  tipoIncompativel as calcularTipoIncompativel,
  usaSnapshotSalvo,
  type SaidaFormInput,
} from "@/modules/combustivel/abastecimentos/schemas";
import type { InsumoCombustivel, TanqueOpcao } from "@/modules/combustivel/entradas/queries";
import { formatarPercentual, formatarQuantidade } from "@/lib/formatadores";
import { formatarValorOperacional, rotuloPropriedade } from "@/modules/manutencao/servicos/formato";
import { numeroParaCampo } from "@/modules/manutencao/servicos/numero";

const ID_FORM = "form-abastecimento";

const OPCOES_ORIGEM = ORIGENS_SAIDA.map((o) => ({ valor: o, rotulo: ROTULO_ORIGEM_SAIDA[o] }));
const OPCOES_CONSUMIDOR = TIPOS_CONSUMIDOR.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_CONSUMIDOR[t] }));

const COR_IMPACTO = { verde: "text-status-aprovado", vermelho: "text-status-rejeitado", cinza: "text-foreground" } as const;

export interface OpcoesAbastecimento {
  tanques: TanqueOpcao[];
  equipamentos: EquipamentoOpcao[];
  transportadoras: TransportadoraOpcao[];
  insumos: InsumoCombustivel[];
  /** Raízes de obra, para a alocação. */
  obras: CentroCustoOpcao[];
  /** Tanque -> combustível da entrada viva mais nova (o tipo do tanque na origem). */
  combustivelPorTanque?: Record<string, string>;
}

export interface AbastecimentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Nulo: novo abastecimento. */
  abastecimento: AbastecimentoCompleto | null;
  opcoes: OpcoesAbastecimento;
  onSalvo?: (id: string) => void;
}

/**
 * Consulta a uma action com resposta guardada pela CHAVE (a consulta vigente): resposta de
 * uma chave velha é descartada, e o setState só acontece no retorno, nunca no efeito.
 */
function useConsulta<T>(chave: string | null, consultar: () => Promise<T | null>, esperaMs = 350): T | null {
  const [resposta, setResposta] = React.useState<{ chave: string; valor: T | null } | null>(null);
  const consultarRef = React.useRef(consultar);
  React.useEffect(() => {
    consultarRef.current = consultar;
  });
  React.useEffect(() => {
    if (!chave) return;
    let vigente = true;
    const espera = setTimeout(() => {
      void consultarRef.current().then((valor) => {
        if (vigente) setResposta({ chave, valor });
      });
    }, esperaMs);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [chave, esperaMs]);
  return chave && resposta?.chave === chave ? resposta.valor : null;
}

/**
 * Lançar ou editar um abastecimento pela `fn_comb_salvar_saida`, com as regras da tela da
 * origem (SaidaCombustivelForm do Gestão Obras):
 *
 * - tanques: equipamento próprio vê só os internos ativos; carreta vê todos os ativos;
 * - combustível: tanque externo começa em "Diesel S10" e pode trocar; tanque da EMT usa o
 *   combustível da entrada mais nova do tanque ("tanque sem entradas" quando não há);
 * - taxa por litro: vem da TRANSPORTADORA (`taxa_litro_padrao`) quando ela muda, só na
 *   saída nova; só conta na carreta;
 * - carreta no tanque: preço obrigatório, sugerido pelo FIFO em TS (4 casas) enquanto vazio;
 *   tanque externo pede também o preço do dono, que começa igual ao da transportadora;
 * - dinheiro e requisição: preço por litro digitado; pago só na requisição;
 * - obra sempre obrigatória (a 100%);
 * - saldo na data, combustível incompatível, avisos de volume e valor altos, leitura menor.
 *
 * Editar: na origem pede a senha de edição, menos para o Administrador. No ERP é a
 * permissão `combustivel.saidas` / editar (quem não tem nem vê o botão), mudança necessária.
 */
export function AbastecimentoFormDrawer({
  aberto,
  onAbertoChange,
  abastecimento,
  opcoes,
  onSalvo,
}: AbastecimentoFormDrawerProps) {
  const editando = abastecimento !== null;
  const saida = abastecimento?.saida ?? null;
  const combustivelPorTanque = opcoes.combustivelPorTanque ?? {};

  const iniciais = React.useCallback(
    (): SaidaFormInput => (abastecimento ? valoresDoAbastecimento(abastecimento) : valoresNovoAbastecimento()),
    [abastecimento],
  );

  const form = useForm<SaidaFormInput>({
    resolver: zodResolver(saidaFormSchema),
    defaultValues: iniciais(),
  });
  const salvando = form.formState.isSubmitting;

  React.useEffect(() => {
    if (!aberto) return;
    form.reset(iniciais());
  }, [aberto, iniciais, form]);

  const valores = useWatch({ control: form.control }) as SaidaFormInput;
  const origem = valores.origem ?? "tanque";
  const tipoConsumidor = valores.tipoConsumidor ?? "equipamento_proprio";
  const carreta = tipoConsumidor === "carreta_transportadora";
  const noTanque = origem === "tanque";
  const tanque = noTanque ? (opcoes.tanques.find((t) => t.id === valores.tanqueId) ?? null) : null;
  const externo = tanque?.ehExterno ?? false;
  const equipamento = opcoes.equipamentos.find((e) => e.id === valores.equipamentoId) ?? null;
  const dados = saidaDoForm(valores);
  const dataIso = dataHoraLocalParaIso(valores.dataHora ?? "");

  const dieselS10 = acharDieselS10(opcoes.insumos);
  const tipoDoTanque = tipoCombustivelDoTanque({
    noTanque,
    tanque,
    dieselS10Id: dieselS10?.id ?? null,
    combustivelPorTanque,
  });

  // Saldo na data (a trava de saldo da origem), sem contar o próprio abastecimento.
  const chaveEstoque = noTanque && tanque && !externo && dataIso ? `${tanque.id}|${dataIso}` : null;
  const estoque = useConsulta(chaveEstoque, async () => {
    if (!tanque || !dataIso) return null;
    const r = await consultarEstoqueNaData(tanque.id, dataIso, saida?.id ?? null);
    return "erro" in r ? null : r.litros;
  });

  // O FIFO em TS da origem, calculado no servidor com os movimentos vivos do tanque.
  const chaveFifo =
    noTanque && tanque && dataIso && dados.litros > 0
      ? `${tanque.id}|${dataIso}|${dados.litros}|${dados.insumoId ?? ""}`
      : null;
  const fifo = useConsulta<FIFOResult>(chaveFifo, async () => {
    if (!tanque || !dataIso) return null;
    const r = await calcularPrecoFifo(tanque.id, dataIso, dados.litros, dados.insumoId, saida?.id ?? null);
    return "erro" in r ? null : r;
  });
  const precoMedioTanqueCorrente = fifo?.precoMedio ?? 0;

  // Edição sem trocar tanque nem origem, com snapshot > 0: vale o salvo (HF.11 da origem).
  const usaSnapshot = usaSnapshotSalvo(
    saida ? { tanqueId: saida.tanqueId, origem: saida.origem, precoMedioTanque: saida.precoMedioTanque } : null,
    { tanqueId: dados.tanqueId, origem },
  );
  const precoMedioTanque = usaSnapshot ? (saida?.precoMedioTanque ?? 0) : precoMedioTanqueCorrente;

  // Última leitura do equipamento (aviso de leitura menor, só na saída nova).
  const chaveLeitura = !carreta && equipamento ? equipamento.id : null;
  const ultimaLeitura = useConsulta(
    chaveLeitura,
    async () => {
      if (!equipamento) return null;
      const r = await consultarUltimaLeitura(equipamento.id);
      return "erro" in r ? null : r.valor;
    },
    0,
  );

  // Ciclo fechado: na edição de saída de tanque antes do ciclo aberto, trava tanque,
  // litros e data (o banco recusa também).
  const chaveCiclo = saida && saida.origem === "tanque" && saida.tanqueId ? saida.tanqueId : null;
  const inicioCiclo = useConsulta(
    chaveCiclo,
    async () => {
      if (!chaveCiclo) return null;
      const r = await consultarInicioCiclo(chaveCiclo);
      return "erro" in r ? null : r.inicio;
    },
    0,
  );
  const cicloFechado =
    saida !== null && inicioCiclo !== null && new Date(saida.data).getTime() < new Date(inicioCiclo).getTime();

  function definir<K extends keyof SaidaFormInput>(campo: K, valor: SaidaFormInput[K], validar = true) {
    form.setValue(campo, valor as never, { shouldDirty: true, shouldValidate: validar });
  }

  // Carreta no tanque: preço do combustível = preço médio do tanque (4 casas) enquanto vazio.
  const precoCombustivelVazio = (valores.precoCombustivel ?? "").trim() === "";
  React.useEffect(() => {
    if (carreta && noTanque && precoMedioTanque > 0 && precoCombustivelVazio) {
      form.setValue("precoCombustivel", numeroParaCampo(parseFloat(precoMedioTanque.toFixed(4))), {
        shouldValidate: true,
      });
    }
  }, [carreta, noTanque, precoMedioTanque, precoCombustivelVazio, form]);

  // Tanque externo: preço do dono = o cobrado da transportadora enquanto vazio.
  const precoProprietarioVazio = (valores.precoProprietario ?? "").trim() === "";
  const precoCombustivelTexto = valores.precoCombustivel ?? "";
  React.useEffect(() => {
    if (carreta && externo && (dados.precoCombustivel ?? 0) > 0 && precoProprietarioVazio) {
      form.setValue("precoProprietario", precoCombustivelTexto, { shouldValidate: true });
    }
  }, [carreta, externo, dados.precoCombustivel, precoCombustivelTexto, precoProprietarioVazio, form]);

  function aoEscolherConsumidor(valor: string) {
    definir("tipoConsumidor", valor as TipoConsumidor);
    if (valor === "equipamento_proprio") {
      // Como a origem: limpa os campos da carreta.
      definir("transportadoraId", "", false);
      definir("placa", "", false);
      definir("motorista", "", false);
      // Equipamento próprio só vê tanque interno: tira a escolha que sumiu da lista.
      if (form.getValues("tanqueExterno")) {
        definir("tanqueId", "", false);
        definir("tanqueExterno", false, false);
      }
    } else {
      // Limpa os campos do equipamento próprio.
      definir("equipamentoId", "", false);
      definir("medicao", "", false);
      definir("tipoMedicao", "", false);
    }
  }

  function aoEscolherOrigem(valor: string) {
    definir("origem", valor as OrigemSaida);
    if (valor !== "tanque") {
      definir("tanqueId", "", false);
      definir("tanqueExterno", false, false);
    } else {
      definir("precoUnitario", "", false);
    }
  }

  function aoEscolherObra(valor: string) {
    definir("obraId", valor);
    // Como a origem: trocar a obra limpa o tanque.
    definir("tanqueId", "", false);
    definir("tanqueExterno", false, false);
  }

  function aoEscolherTanque(id: string) {
    const escolhido = opcoes.tanques.find((t) => t.id === id) ?? null;
    definir("tanqueId", id);
    definir("tanqueExterno", escolhido?.ehExterno ?? false, false);
    // Saída nova: o combustível acompanha o tanque. Na edição fica o salvo.
    if (!editando) {
      const tipo = tipoCombustivelDoTanque({
        noTanque: true,
        tanque: escolhido,
        dieselS10Id: dieselS10?.id ?? null,
        combustivelPorTanque,
      });
      definir("insumoId", tipo, tipo !== "");
    }
  }

  function aoEscolherTransportadora(id: string) {
    definir("transportadoraId", id);
    // Só na saída nova: a taxa padrão da TRANSPORTADORA.
    if (editando) return;
    const taxa = taxaPadraoDaTransportadora(opcoes.transportadoras, id);
    if (taxa !== null) definir("taxaLitro", numeroParaCampo(taxa), false);
  }

  function aoEscolherEquipamento(id: string) {
    const escolhido = opcoes.equipamentos.find((e) => e.id === id);
    definir("equipamentoId", id);
    definir("tipoMedicao", tipoMedicaoDoControle(escolhido?.controlePor), false);
    definir("medicao", "", false);
  }

  const opcoesTanques = React.useMemo(
    () =>
      opcoes.tanques
        .filter((t) => (t.ativo || t.id === saida?.tanqueId) && (carreta || !t.ehExterno))
        .map((t) => ({
          valor: t.id,
          rotulo: t.ehExterno ? `${t.rotulo} · externo${t.proprietarioNome ? `, de ${t.proprietarioNome}` : ""}` : t.rotulo,
        })),
    [opcoes.tanques, carreta, saida],
  );
  const opcoesEquipamentos = React.useMemo(
    () =>
      opcoes.equipamentos
        .filter((e) => e.ativo || e.id === saida?.equipamentoId)
        .map((e) => ({ valor: e.id, rotulo: `${e.rotulo} · ${rotuloPropriedade(e.propriedade)}` })),
    [opcoes.equipamentos, saida],
  );
  const opcoesTransportadoras = React.useMemo(
    () =>
      opcoes.transportadoras
        .filter((t) => t.ativo || t.id === saida?.transportadoraId)
        .map((t) => ({ valor: t.id, rotulo: t.nome })),
    [opcoes.transportadoras, saida],
  );
  const opcoesInsumos = React.useMemo(
    () =>
      opcoes.insumos
        .filter((i) => i.ativo || i.id === saida?.insumoId)
        .map((i) => ({ valor: i.id, rotulo: i.nome })),
    [opcoes.insumos, saida],
  );
  const nomeInsumo = (id: string | null | undefined) =>
    (id ? opcoes.insumos.find((i) => i.id === id)?.nome : undefined) ??
    (id && id === saida?.insumoId ? saida.insumoNome : "-");

  // Travas da origem.
  const saldoInsuficiente =
    estoque !== null &&
    calcularSaldoInsuficiente({
      origem,
      temTanque: tanque !== null,
      tanqueEhExterno: externo,
      litros: dados.litros,
      saldoNaData: estoque,
    });
  const tipoIncompativel = calcularTipoIncompativel({
    origem,
    temTanque: tanque !== null,
    tanqueEhExterno: externo,
    tipoDoTanque,
    tipoDaSaida: dados.insumoId,
  });
  const mensagemIncompativel = tipoIncompativel
    ? `Combustível incompatível: a saída é de ${nomeInsumo(dados.insumoId)}, mas o tanque hoje tem ${nomeInsumo(tipoDoTanque)}`
    : null;
  const mensagemSaldo =
    saldoInsuficiente && estoque !== null
      ? `Saldo insuficiente: ${formatarLitros(estoque)} disponíveis na data selecionada. Reduza os litros, escolha outro tanque ou ajuste a data`
      : null;

  // Preço e valor, como o submit da origem.
  const taxa = taxaEfetiva(dados);
  const precoUnitario = precoUnitarioSaida(dados, precoMedioTanque);
  const valorTotal = dados.litros * precoUnitario;
  const avisos = avisosDeConferencia(dados.litros, valorTotal);
  const transportadora = opcoes.transportadoras.find((t) => t.id === valores.transportadoraId) ?? null;
  const impacto = linhasImpacto({
    carreta,
    noTanque,
    tanque: tanque ? { nome: tanque.rotulo, externo, donoNome: tanque.proprietarioNome } : null,
    transportadoraNome: transportadora?.nome ?? saida?.transportadoraNome ?? null,
    litros: dados.litros,
    valorTotal,
    precoProprietario: dados.precoProprietario ?? 0,
    taxa,
  });

  const medicaoAlerta =
    !editando && dados.medicao !== null && ultimaLeitura !== null && dados.medicao < ultimaLeitura
      ? `A última leitura registrada foi ${ultimaLeitura.toLocaleString("pt-BR")} ${valores.tipoMedicao === "km" ? "km" : "h"}. Confirme se o valor está correto`
      : null;

  async function aoEnviar(dadosForm: SaidaFormInput) {
    if (mensagemIncompativel) {
      toast.error(mensagemIncompativel);
      return;
    }
    if (mensagemSaldo) {
      toast.error(mensagemSaldo);
      return;
    }
    const resultado = await salvarAbastecimento(saida?.id ?? null, saidaDoForm(dadosForm));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Abastecimento salvo" : "Abastecimento lançado");
    onAbertoChange(false);
    onSalvo?.(resultado.id);
  }

  const erros = form.formState.errors;
  const donoNome = tanque?.proprietarioNome ?? "o dono";
  const tanqueSemObra = !valores.obraId && !valores.manterAlocacoes;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar abastecimento" : "Lançar abastecimento"}
      descricao="Saída de combustível para um equipamento da EMT ou para a carreta de uma transportadora"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      larguraClassName="max-w-3xl"
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando || saldoInsuficiente || tipoIncompativel}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar abastecimento"
            ) : (
              "Lançar abastecimento"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        {cicloFechado ? (
          <p className="rounded-md border border-status-pendente/40 bg-status-pendente/10 px-3 py-2 text-detalhe">
            Ciclo fechado: este tanque já zerou e recebeu combustível novo depois desta saída. Para não bagunçar o
            saldo, tanque, litros e data ficam travados. Você ainda pode ajustar equipamento, obra, observação e medição.
          </p>
        ) : null}

        <LinhaCampos>
          <CampoFormulario id="abast-consumidor" rotulo="Consumidor" obrigatorio>
            <Combobox
              id="abast-consumidor"
              valor={tipoConsumidor}
              onValorChange={aoEscolherConsumidor}
              opcoes={OPCOES_CONSUMIDOR}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="abast-origem" rotulo="Origem" obrigatorio>
            <Combobox
              id="abast-origem"
              valor={origem}
              onValorChange={aoEscolherOrigem}
              opcoes={OPCOES_ORIGEM}
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario id="abast-data" rotulo="Data e hora" obrigatorio erro={erros.dataHora?.message}>
            <Input
              id="abast-data"
              type="datetime-local"
              disabled={salvando || cicloFechado}
              {...form.register("dataHora")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <SecaoFormulario titulo="Onde trabalhou">
          {valores.manterAlocacoes && abastecimento ? (
            <div className="flex flex-col gap-1 text-detalhe">
              <p className="text-muted-foreground">
                Este abastecimento veio da origem com {abastecimento.alocacoes.length} alocações. Elas ficam como estão.
              </p>
              <ul className="flex flex-col gap-0.5">
                {abastecimento.alocacoes.map((a) => (
                  <li key={a.id} className="tabular-nums">
                    {a.centroCustoNome} · {formatarPercentual(a.percentual, 4)} · {formatarQuantidade(a.litros)} L
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <SeletorCentroCusto
                idBase="abast-obra"
                centros={opcoes.obras}
                valor={valores.obraId ?? ""}
                onValorChange={aoEscolherObra}
                obrigatorio
                disabled={salvando}
                rotuloDoValor={
                  abastecimento?.alocacoes.length === 1 && abastecimento.alocacoes[0].centroCustoId === valores.obraId
                    ? abastecimento.alocacoes[0].centroCustoNome
                    : undefined
                }
                erro={erros.obraId?.message}
              />
              <p className="text-legenda text-muted-foreground">A obra recebe 100% dos litros e o custo deste abastecimento</p>
            </>
          )}
        </SecaoFormulario>

        {carreta ? (
          <>
            <CampoFormulario id="abast-transportadora" rotulo="Transportadora" obrigatorio erro={erros.transportadoraId?.message}>
              <Combobox
                id="abast-transportadora"
                valor={valores.transportadoraId ?? ""}
                rotuloDoValor={saida?.transportadoraNome ?? undefined}
                onValorChange={aoEscolherTransportadora}
                opcoes={opcoesTransportadoras}
                placeholder="Selecione a transportadora"
                vazioTexto="Nenhum fornecedor marcado como transportadora"
                disabled={salvando}
              />
            </CampoFormulario>
            <LinhaCampos>
              <CampoFormulario id="abast-placa" rotulo="Placa da carreta" erro={erros.placa?.message}>
                <Input id="abast-placa" autoComplete="off" className="uppercase" disabled={salvando} {...form.register("placa")} />
              </CampoFormulario>
              <CampoFormulario id="abast-motorista" rotulo="Motorista" erro={erros.motorista?.message}>
                <Input id="abast-motorista" autoComplete="off" disabled={salvando} {...form.register("motorista")} />
              </CampoFormulario>
            </LinhaCampos>
          </>
        ) : (
          <LinhaCampos>
            <CampoFormulario
              id="abast-equipamento"
              rotulo="Equipamento"
              obrigatorio
              ajuda={equipamento ? rotuloPropriedade(equipamento.propriedade) : undefined}
              erro={erros.equipamentoId?.message}
            >
              <Combobox
                id="abast-equipamento"
                valor={valores.equipamentoId ?? ""}
                rotuloDoValor={saida?.equipamentoNome ?? undefined}
                onValorChange={aoEscolherEquipamento}
                opcoes={opcoesEquipamentos}
                placeholder="Buscar equipamento por código ou nome"
                disabled={salvando}
              />
            </CampoFormulario>
            {equipamento && valores.tipoMedicao ? (
              <CampoFormulario
                id="abast-medicao"
                rotulo={valores.tipoMedicao === "km" ? "Hodômetro no abastecimento (km)" : "Horímetro no abastecimento (h)"}
                ajuda={
                  medicaoAlerta
                    ? undefined
                    : ultimaLeitura !== null && !(valores.medicao ?? "").trim()
                      ? `Última leitura registrada: ${ultimaLeitura.toLocaleString("pt-BR")} ${valores.tipoMedicao === "km" ? "km" : "h"}`
                      : undefined
                }
                erro={erros.medicao?.message ?? medicaoAlerta ?? undefined}
              >
                <InputQuantidade
                  id="abast-medicao"
                  valor={valores.medicao ?? ""}
                  placeholder={ultimaLeitura !== null ? `Última: ${ultimaLeitura.toLocaleString("pt-BR")}` : "Leitura atual do painel"}
                  onValorChange={(v) => definir("medicao", v, false)}
                  onBlur={() => void form.trigger("medicao")}
                  disabled={salvando}
                />
              </CampoFormulario>
            ) : null}
          </LinhaCampos>
        )}

        <LinhaCampos>
          {noTanque ? (
            <CampoFormulario
              id="abast-tanque"
              rotulo="Tanque"
              obrigatorio
              ajuda={
                externo
                  ? "Tanque externo: gera crédito para o dono e débito para a transportadora na conta corrente"
                  : undefined
              }
              erro={erros.tanqueId?.message}
            >
              <Combobox
                id="abast-tanque"
                valor={valores.tanqueId ?? ""}
                rotuloDoValor={saida?.tanqueNome ?? undefined}
                onValorChange={aoEscolherTanque}
                opcoes={opcoesTanques}
                placeholder={tanqueSemObra ? "Selecione a obra primeiro" : "Selecione o tanque"}
                disabled={salvando || cicloFechado || tanqueSemObra}
              />
            </CampoFormulario>
          ) : null}

          {noTanque && tanque && !externo ? (
            <CampoFormulario
              id="abast-insumo"
              rotulo="Combustível"
              obrigatorio
              ajuda={tipoDoTanque ? undefined : "Tanque sem entradas: registre uma entrada antes de fazer saída"}
              erro={
                mensagemIncompativel
                  ? `Esta saída foi lançada como ${nomeInsumo(dados.insumoId)}, mas o tanque hoje contém ${nomeInsumo(tipoDoTanque)}. Mude o tanque ou estorne esta saída`
                  : tipoDoTanque
                    ? undefined
                    : erros.insumoId?.message
              }
            >
              <span id="abast-insumo" className="flex h-9 items-center text-detalhe">
                {tipoDoTanque ? nomeInsumo(tipoDoTanque) : "-"}
              </span>
            </CampoFormulario>
          ) : (
            <CampoFormulario id="abast-insumo" rotulo="Combustível" obrigatorio erro={erros.insumoId?.message}>
              <Combobox
                id="abast-insumo"
                valor={valores.insumoId ?? ""}
                rotuloDoValor={saida?.insumoNome}
                onValorChange={(v) => definir("insumoId", v)}
                opcoes={opcoesInsumos}
                placeholder="Selecione o combustível"
                disabled={salvando}
              />
            </CampoFormulario>
          )}
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="abast-litros"
            rotulo="Quantidade (litros)"
            obrigatorio
            ajuda={mensagemSaldo ? undefined : estoque !== null ? `Estoque no tanque nessa data: ${formatarLitros(estoque)}` : undefined}
            erro={mensagemSaldo ?? erros.litros?.message}
          >
            <InputQuantidade
              id="abast-litros"
              valor={valores.litros ?? ""}
              onValorChange={(v) => definir("litros", v, false)}
              onBlur={() => void form.trigger("litros")}
              disabled={salvando || cicloFechado}
            />
          </CampoFormulario>
          {ehPosto(origem) ? (
            <CampoFormulario id="abast-preco-unit" rotulo="Preço unitário (R$/L)" obrigatorio erro={erros.precoUnitario?.message}>
              <InputPreco
                id="abast-preco-unit"
                valor={valores.precoUnitario ?? ""}
                onValorChange={(v) => definir("precoUnitario", v, false)}
                onBlur={() => void form.trigger("precoUnitario")}
                disabled={salvando}
              />
            </CampoFormulario>
          ) : null}
        </LinhaCampos>

        {noTanque && carreta ? (
          <SecaoFormulario titulo="Preço">
            <LinhaCampos colunas={externo ? 3 : 2}>
              {externo ? (
                <CampoFormulario
                  id="abast-preco-dono"
                  rotulo={`Preço que ${donoNome} cobra (R$/L)`}
                  obrigatorio
                  erro={erros.precoProprietario?.message}
                >
                  <InputPreco
                    id="abast-preco-dono"
                    valor={valores.precoProprietario ?? ""}
                    onValorChange={(v) => definir("precoProprietario", v, false)}
                    onBlur={() => void form.trigger("precoProprietario")}
                    disabled={salvando}
                  />
                </CampoFormulario>
              ) : null}
              <CampoFormulario
                id="abast-preco"
                rotulo={externo ? "Preço cobrado da transportadora (R$/L)" : "Preço do combustível (R$/L)"}
                obrigatorio
                erro={erros.precoCombustivel?.message}
              >
                <InputPreco
                  id="abast-preco"
                  valor={valores.precoCombustivel ?? ""}
                  placeholder={precoMedioTanque > 0 ? numeroParaCampo(parseFloat(precoMedioTanque.toFixed(4))) : "0,0000"}
                  onValorChange={(v) => definir("precoCombustivel", v, false)}
                  onBlur={() => void form.trigger("precoCombustivel")}
                  disabled={salvando}
                />
              </CampoFormulario>
              <CampoFormulario
                id="abast-taxa"
                rotulo={externo ? `Taxa ${donoNome} (R$/L)` : "Taxa por litro (R$/L)"}
                erro={erros.taxaLitro?.message}
              >
                <InputPreco
                  id="abast-taxa"
                  valor={valores.taxaLitro ?? ""}
                  placeholder="0,0000"
                  onValorChange={(v) => definir("taxaLitro", v, false)}
                  onBlur={() => void form.trigger("taxaLitro")}
                  disabled={salvando}
                />
              </CampoFormulario>
            </LinhaCampos>
            {(dados.precoCombustivel ?? 0) > 0 || taxa > 0 ? (
              <p className="text-detalhe">
                Preço unitário cobrado:{" "}
                <span className="font-medium tabular-nums">{formatarValorOperacional(precoUnitario)}/L</span> (
                <span className="tabular-nums">{formatarValorOperacional(dados.precoCombustivel ?? 0)}</span> combustível
                + <span className="tabular-nums">{formatarValorOperacional(taxa)}</span> taxa)
              </p>
            ) : null}
          </SecaoFormulario>
        ) : null}

        {origem === "requisicao" ? (
          <LinhaCampos>
            <div className="flex items-center gap-2 pt-2">
              <Switch
                id="abast-pago"
                checked={valores.pago ?? false}
                onCheckedChange={(v) => definir("pago", v)}
                disabled={salvando}
              />
              <label htmlFor="abast-pago" className="text-detalhe">
                Pago
              </label>
            </div>
            <CampoFormulario id="abast-pago-em" rotulo="Pago em" largura="medio" erro={erros.pagoEm?.message}>
              <Input id="abast-pago-em" type="date" disabled={salvando || !valores.pago} {...form.register("pagoEm")} />
            </CampoFormulario>
          </LinhaCampos>
        ) : null}

        {dados.litros > 0 && precoUnitario > 0 ? (
          <div className="flex flex-col gap-1 rounded-md border border-border bg-surface px-3 py-2 text-detalhe">
            <p className="tabular-nums">
              {dados.litros.toLocaleString("pt-BR")} L × {formatarValorOperacional(precoUnitario)} ={" "}
              <span className="font-medium">{formatarValorOperacional(valorTotal)}</span>
            </p>
            {noTanque && precoMedioTanque > 0 ? (
              <p className="text-legenda text-muted-foreground tabular-nums">
                ({usaSnapshot ? "preço salvo (snapshot)" : "preço FIFO atual do tanque"}:{" "}
                {formatarValorOperacional(precoMedioTanque)}
                {taxa > 0 ? ` + taxa ${formatarValorOperacional(taxa)}` : ""})
                {usaSnapshot && precoMedioTanqueCorrente > 0 && Math.abs(precoMedioTanqueCorrente - precoMedioTanque) > 0.01
                  ? ` · preço FIFO atual: ${formatarValorOperacional(precoMedioTanqueCorrente)}`
                  : ""}
              </p>
            ) : null}
            {!usaSnapshot && noTanque && fifo && fifo.detalhamento.length > 1 ? (
              <details className="text-legenda">
                <summary className="cursor-pointer text-muted-foreground">
                  Detalhamento FIFO ({fifo.detalhamento.length} lotes)
                </summary>
                <ul className="mt-1 flex flex-col gap-0.5 tabular-nums">
                  {fifo.detalhamento.map((p) => (
                    <li key={`${p.fonteTipo}-${p.fonteId}`}>
                      {formatarLitros(p.litros)} × {formatarValorOperacional(p.preco)}/L ={" "}
                      {formatarValorOperacional(p.litros * p.preco)}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {!usaSnapshot && noTanque && fifo && fifo.litrosSemSuprimento > 0 ? (
              <p className="text-legenda text-status-pendente">
                {formatarLitros(fifo.litrosSemSuprimento)} sem suprimento na linha do tempo. Vai para Sem suprimento, nas
                Anomalias, para revisão.
              </p>
            ) : null}
          </div>
        ) : noTanque && !carreta ? (
          <p className="text-detalhe text-muted-foreground">Preço calculado pelo FIFO do tanque</p>
        ) : null}

        {impacto.length > 0 ? (
          <div className="flex flex-col gap-1 text-detalhe">
            <span className="text-legenda font-medium text-muted-foreground">Impacto financeiro</span>
            {impacto.map((linha) => (
              <span key={linha.texto} className={`tabular-nums ${COR_IMPACTO[linha.cor]}`}>
                {linha.sinal} {linha.texto}
              </span>
            ))}
          </div>
        ) : null}

        <CampoFormulario id="abast-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea id="abast-observacoes" rows={2} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>

        {avisos.length > 0 ? (
          <div className="flex flex-col gap-1">
            {avisos.map((aviso) => (
              <p key={aviso} className="text-detalhe text-status-pendente">
                {aviso}
              </p>
            ))}
          </div>
        ) : null}
      </form>
    </FormDrawer>
  );
}
