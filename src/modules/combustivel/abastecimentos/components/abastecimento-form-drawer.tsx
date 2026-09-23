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
import { consultarEstoqueNaData, salvarAbastecimento } from "@/modules/combustivel/abastecimentos/actions";
import {
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
  ehPosto,
  montarDadosSaida,
  pedeCombustivel,
  previaValorSaida,
  saidaDoForm,
  saidaFormSchema,
  type SaidaFormInput,
} from "@/modules/combustivel/abastecimentos/schemas";
import type { InsumoCombustivel, TanqueOpcao } from "@/modules/combustivel/entradas/queries";
import { formatarPercentual, formatarQuantidade } from "@/lib/formatadores";
import { formatarValorOperacional, rotuloPropriedade } from "@/modules/manutencao/servicos/formato";
import { numeroParaCampo } from "@/modules/manutencao/servicos/numero";

const ID_FORM = "form-abastecimento";

const OPCOES_ORIGEM = ORIGENS_SAIDA.map((o) => ({ valor: o, rotulo: ROTULO_ORIGEM_SAIDA[o] }));
const OPCOES_CONSUMIDOR = TIPOS_CONSUMIDOR.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_CONSUMIDOR[t] }));

export interface OpcoesAbastecimento {
  tanques: TanqueOpcao[];
  equipamentos: EquipamentoOpcao[];
  transportadoras: TransportadoraOpcao[];
  insumos: InsumoCombustivel[];
  /** Raízes de obra, para a alocação. */
  obras: CentroCustoOpcao[];
}

export interface AbastecimentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Nulo: novo abastecimento. */
  abastecimento: AbastecimentoCompleto | null;
  opcoes: OpcoesAbastecimento;
  onSalvo?: (id: string) => void;
}

/** Litros no tanque na data, lidos do banco enquanto a pessoa preenche. */
function useEstoqueNaData(tanqueId: string, dataHora: string, excluirId: string | null, ativo: boolean) {
  const [estoque, setEstoque] = React.useState<number | null>(null);
  const dataIso = dataHoraLocalParaIso(dataHora ?? "");
  React.useEffect(() => {
    if (!ativo || !tanqueId || !dataIso) return;
    let cancelado = false;
    const espera = setTimeout(() => {
      void consultarEstoqueNaData(tanqueId, dataIso, excluirId).then((resultado) => {
        if (cancelado) return;
        setEstoque("erro" in resultado ? null : resultado.litros);
      });
    }, 350);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [ativo, tanqueId, dataIso, excluirId]);
  return ativo && tanqueId && dataIso ? estoque : null;
}

/**
 * Lançar ou editar um abastecimento pela `fn_comb_salvar_saida`.
 *
 * O formulário muda com o consumidor e a origem (regras em `schemas.ts`, iguais às
 * do banco). O preço do equipamento próprio no tanque é do PEPS; a tela não pede.
 * A alocação é uma obra a 100%: obrigatória para equipamento sem etapa própria
 * (alugado), opcional no resto.
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

  const iniciais = React.useCallback((): SaidaFormInput => {
    if (!abastecimento) return valoresNovoAbastecimento();
    const equipamento = opcoes.equipamentos.find((e) => e.id === abastecimento.saida.equipamentoId);
    return valoresDoAbastecimento(abastecimento, equipamento?.temEtapa ?? true);
  }, [abastecimento, opcoes.equipamentos]);

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

  const estoque = useEstoqueNaData(valores.tanqueId ?? "", valores.dataHora ?? "", saida?.id ?? null, noTanque && tanque !== null && !externo);

  function definir<K extends keyof SaidaFormInput>(campo: K, valor: SaidaFormInput[K], validar = true) {
    form.setValue(campo, valor as never, { shouldDirty: true, shouldValidate: validar });
  }

  function aoEscolherTanque(id: string) {
    const escolhido = opcoes.tanques.find((t) => t.id === id);
    definir("tanqueId", id);
    definir("tanqueExterno", escolhido?.ehExterno ?? false, false);
    // A taxa do dono vem do cadastro dele; a pessoa ainda pode trocar.
    if (escolhido?.ehExterno && !form.getValues("taxaLitro") && escolhido.proprietarioTaxaLitro) {
      definir("taxaLitro", numeroParaCampo(escolhido.proprietarioTaxaLitro), false);
    }
  }

  function aoEscolherEquipamento(id: string) {
    const escolhido = opcoes.equipamentos.find((e) => e.id === id);
    definir("equipamentoId", id);
    definir("equipamentoTemEtapa", escolhido?.temEtapa ?? true, false);
    definir("tipoMedicao", tipoMedicaoDoControle(escolhido?.controlePor), false);
  }

  function aoEscolherConsumidor(valor: string) {
    definir("tipoConsumidor", valor as TipoConsumidor);
    // Equipamento próprio nunca usa tanque externo: tira a escolha que ficou inválida.
    if (valor === "equipamento_proprio" && form.getValues("tanqueExterno")) {
      definir("tanqueId", "", false);
      definir("tanqueExterno", false, false);
    }
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

  const combustivelDoTanque = tanque?.combustivelAtualId
    ? (opcoes.insumos.find((i) => i.id === tanque.combustivelAtualId)?.nome ?? null)
    : null;

  const dadosPrevia = montarDadosSaida(saidaDoForm(valores), { tanqueExterno: externo });
  const previa = previaValorSaida(dadosPrevia);

  async function aoEnviar(dados: SaidaFormInput) {
    const resultado = await salvarAbastecimento(saida?.id ?? null, saidaDoForm(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Abastecimento salvo" : "Abastecimento lançado");
    onAbertoChange(false);
    onSalvo?.(resultado.id);
  }

  const erros = form.formState.errors;
  const exigeObra = !carreta && equipamento !== null && !equipamento.temEtapa;

  const ajudaLitros =
    estoque !== null ? `Estoque no tanque nessa data: ${formatarLitros(estoque)}` : undefined;

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
          <Button type="submit" form={ID_FORM} disabled={salvando}>
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
              onValorChange={(v) => definir("origem", v as OrigemSaida)}
              opcoes={OPCOES_ORIGEM}
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        {carreta ? (
          <>
            <CampoFormulario id="abast-transportadora" rotulo="Transportadora" obrigatorio erro={erros.transportadoraId?.message}>
              <Combobox
                id="abast-transportadora"
                valor={valores.transportadoraId ?? ""}
                rotuloDoValor={saida?.transportadoraNome ?? undefined}
                onValorChange={(v) => definir("transportadoraId", v)}
                opcoes={opcoesTransportadoras}
                placeholder="Selecione a transportadora"
                vazioTexto="Nenhum fornecedor marcado como transportadora"
                disabled={salvando}
              />
            </CampoFormulario>
            <LinhaCampos>
              <CampoFormulario id="abast-placa" rotulo="Placa" erro={erros.placa?.message}>
                <Input id="abast-placa" autoComplete="off" className="uppercase" disabled={salvando} {...form.register("placa")} />
              </CampoFormulario>
              <CampoFormulario id="abast-motorista" rotulo="Motorista" erro={erros.motorista?.message}>
                <Input id="abast-motorista" autoComplete="off" disabled={salvando} {...form.register("motorista")} />
              </CampoFormulario>
            </LinhaCampos>
          </>
        ) : (
          <CampoFormulario
            id="abast-equipamento"
            rotulo="Equipamento"
            obrigatorio
            ajuda={
              equipamento
                ? equipamento.temEtapa
                  ? `${rotuloPropriedade(equipamento.propriedade)}: o custo vai para a etapa do equipamento`
                  : `${rotuloPropriedade(equipamento.propriedade)}: sem etapa própria, informe a obra onde ele trabalhou`
                : undefined
            }
            erro={erros.equipamentoId?.message}
          >
            <Combobox
              id="abast-equipamento"
              valor={valores.equipamentoId ?? ""}
              rotuloDoValor={saida?.equipamentoNome ?? undefined}
              onValorChange={aoEscolherEquipamento}
              opcoes={opcoesEquipamentos}
              placeholder="Selecione o equipamento"
              disabled={salvando}
            />
          </CampoFormulario>
        )}

        <LinhaCampos>
          {noTanque ? (
            <CampoFormulario
              id="abast-tanque"
              rotulo="Tanque"
              obrigatorio
              ajuda={
                tanque && !externo && combustivelDoTanque
                  ? `Combustível do tanque: ${combustivelDoTanque}`
                  : externo
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
                placeholder="Selecione o tanque"
                disabled={salvando}
              />
            </CampoFormulario>
          ) : null}
          {pedeCombustivel(origem, externo) ? (
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
          ) : null}
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario id="abast-litros" rotulo="Litros" obrigatorio ajuda={ajudaLitros} erro={erros.litros?.message}>
            <InputQuantidade
              id="abast-litros"
              valor={valores.litros ?? ""}
              onValorChange={(v) => definir("litros", v, false)}
              onBlur={() => void form.trigger("litros")}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="abast-data" rotulo="Data e hora" obrigatorio erro={erros.dataHora?.message}>
            <Input id="abast-data" type="datetime-local" disabled={salvando} {...form.register("dataHora")} />
          </CampoFormulario>
        </LinhaCampos>

        <SecaoFormulario titulo="Preço">
          {noTanque && !carreta ? (
            <p className="text-detalhe text-muted-foreground">Preço calculado pelo PEPS do tanque</p>
          ) : null}

          {noTanque && carreta ? (
            <LinhaCampos colunas={externo ? 3 : 2}>
              <CampoFormulario
                id="abast-preco"
                rotulo="Preço cobrado da transportadora (R$/L)"
                obrigatorio={externo}
                ajuda={externo ? undefined : "Vazio: o preço do PEPS das camadas que a carreta consumiu"}
                erro={erros.precoCombustivel?.message}
              >
                <InputPreco
                  id="abast-preco"
                  valor={valores.precoCombustivel ?? ""}
                  onValorChange={(v) => definir("precoCombustivel", v, false)}
                  onBlur={() => void form.trigger("precoCombustivel")}
                  disabled={salvando}
                />
              </CampoFormulario>
              {externo ? (
                <CampoFormulario
                  id="abast-preco-dono"
                  rotulo="Preço que o dono cobra (R$/L)"
                  ajuda="Vazio: o mesmo preço cobrado da transportadora"
                  erro={erros.precoProprietario?.message}
                >
                  <InputPreco
                    id="abast-preco-dono"
                    valor={valores.precoProprietario ?? ""}
                    placeholder={valores.precoCombustivel || undefined}
                    onValorChange={(v) => definir("precoProprietario", v, false)}
                    onBlur={() => void form.trigger("precoProprietario")}
                    disabled={salvando}
                  />
                </CampoFormulario>
              ) : null}
              <CampoFormulario id="abast-taxa" rotulo="Taxa por litro (R$/L)" erro={erros.taxaLitro?.message}>
                <InputPreco
                  id="abast-taxa"
                  valor={valores.taxaLitro ?? ""}
                  onValorChange={(v) => definir("taxaLitro", v, false)}
                  onBlur={() => void form.trigger("taxaLitro")}
                  disabled={salvando}
                />
              </CampoFormulario>
            </LinhaCampos>
          ) : null}

          {ehPosto(origem) ? (
            <LinhaCampos>
              <CampoFormulario id="abast-preco-unit" rotulo="Preço por litro (R$/L)" obrigatorio erro={erros.precoUnitario?.message}>
                <InputPreco
                  id="abast-preco-unit"
                  valor={valores.precoUnitario ?? ""}
                  onValorChange={(v) => definir("precoUnitario", v, false)}
                  onBlur={() => void form.trigger("precoUnitario")}
                  disabled={salvando}
                />
              </CampoFormulario>
              {origem === "requisicao" ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 pt-7">
                    <Switch
                      id="abast-pago"
                      checked={valores.pago ?? false}
                      onCheckedChange={(v) => definir("pago", v)}
                      disabled={salvando}
                    />
                    <label htmlFor="abast-pago" className="text-detalhe">
                      {valores.pago ? "Requisição paga" : "Requisição a pagar"}
                    </label>
                  </div>
                </div>
              ) : null}
            </LinhaCampos>
          ) : null}

          {origem === "requisicao" && valores.pago ? (
            <CampoFormulario id="abast-pago-em" rotulo="Pago em" largura="medio" erro={erros.pagoEm?.message}>
              <Input id="abast-pago-em" type="date" disabled={salvando} {...form.register("pagoEm")} />
            </CampoFormulario>
          ) : null}

          {previa !== null ? (
            <p className="text-detalhe">
              Valor do abastecimento: <span className="font-medium tabular-nums">{formatarValorOperacional(previa)}</span>
            </p>
          ) : !(noTanque && !carreta) ? (
            <p className="text-detalhe text-muted-foreground">Valor calculado pelo PEPS ao salvar</p>
          ) : null}
        </SecaoFormulario>

        {!carreta && valores.tipoMedicao ? (
          <CampoFormulario
            id="abast-medicao"
            rotulo={valores.tipoMedicao === "km" ? "Hodômetro (km)" : "Horímetro (h)"}
            largura="medio"
            ajuda="Vira uma medição do equipamento"
            erro={erros.medicao?.message}
          >
            <InputQuantidade
              id="abast-medicao"
              valor={valores.medicao ?? ""}
              placeholder="0"
              onValorChange={(v) => definir("medicao", v, false)}
              onBlur={() => void form.trigger("medicao")}
              disabled={salvando}
            />
          </CampoFormulario>
        ) : null}

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
                onValorChange={(v) => definir("obraId", v)}
                obrigatorio={exigeObra}
                disabled={salvando}
                rotuloDoValor={
                  abastecimento?.alocacoes.length === 1 && abastecimento.alocacoes[0].centroCustoId === valores.obraId
                    ? abastecimento.alocacoes[0].centroCustoNome
                    : undefined
                }
                erro={erros.obraId?.message}
              />
              <p className="text-legenda text-muted-foreground">
                {exigeObra
                  ? "A obra recebe 100% dos litros e o custo deste abastecimento"
                  : "Opcional: a obra recebe 100% dos litros"}
              </p>
            </>
          )}
        </SecaoFormulario>

        <CampoFormulario id="abast-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea id="abast-observacoes" rows={3} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
