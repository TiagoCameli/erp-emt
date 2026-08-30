"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  InputHoras,
  InputMoeda,
  LinhaCampos,
  MoneyText,
  SecaoFormulario,
  SeletorCentroCusto,
} from "@/components/canonicos";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { Button } from "@/components/ui/button";
import { formatarBRL } from "@/lib/formatadores";
import {
  ROTULO_VINCULO,
  type Vinculo,
} from "@/modules/cadastros/colaboradores/schemas";
import { editarItemFolha } from "@/modules/rh/folha/actions";
import type { FolhaItem } from "@/modules/rh/folha/queries";
import {
  HORAS_MES,
  horasDoValor,
  valorDaHora,
  valorDasHoras,
} from "@/modules/rh/folha/horas-e-valor";
import { liquidoPrevisto } from "@/modules/rh/folha/previa-desconto";
import { paraNumero } from "@/modules/rh/percentual";

const ID_FORM = "form-editar-item-folha";

/**
 * Teto das horas trabalhadas: o mês inteiro sem dormir (31 × 24). Não é jornada,
 * é impossibilidade — pega dedo escorregado (2000 no lugar de 200) sem julgar
 * escala de trabalho. O mesmo número está no schema e na `fn_editar_item_folha`.
 */
const HORAS_MAX = 744;

/** Número do banco no formato que o InputMoeda edita. */
function paraCampo(valor: number | null): string {
  if (valor === null) return "";
  return String(valor).replace(".", ",");
}

/**
 * Os campos como eles nascem para um item. Serve para preencher o formulário ao
 * abrir e, comparado com o estado atual, para saber se a pessoa mexeu em algo:
 * este drawer não usa React Hook Form, então não há `formState.isDirty`.
 */
function camposDoItem(item: FolhaItem): {
  salarioBase: string;
  gratificacao: string;
  desconto: string;
  horas: string;
  centroCusto: string;
  horasNormais: string;
  horasExtras: string;
  valorExtras: string;
} {
  return {
    salarioBase: paraCampo(item.salarioBase),
    gratificacao: paraCampo(item.gratificacao),
    desconto: paraCampo(item.descontos),
    horas: item.descontoHoras === null ? "" : paraCampo(item.descontoHoras),
    // Vazio quando a linha não tem centro: é o estado que trava a aprovação,
    // e o campo em branco com asterisco é o que faz alguém reparar nele.
    centroCusto: item.centroCustoId ?? "",
    horasNormais: paraCampo(item.horasNormais),
    horasExtras: paraCampo(item.horasExtras),
    valorExtras: paraCampo(item.valorExtras),
  };
}

export interface EditarItemFolhaDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Item em edição, ou null quando o drawer está fechado. */
  item: FolhaItem | null;
  /** Folha do item, só para revalidar a rota do detalhe depois de salvar. */
  folhaId: string;
  /** Raízes e etapas ativas, para o seletor de centro de custo. */
  centros: readonly CentroCustoOpcao[];
  /** Chamado depois de salvar com sucesso. */
  onSalvo?: () => void;
}

/**
 * Altera a linha de um colaborador na folha em rascunho: salário base,
 * gratificação salarial e valor descontado do salário.
 *
 * O drawer é o lugar onde a gratificação de quem tem gratificação é lançada. A
 * gratificação NÃO entra na base do desconto nem da provisão (regra do Tiago),
 * e o rodapé mostra isso em números ANTES de confirmar.
 *
 * O desconto SAI do salário: o líquido da pessoa cai, e o custo da empresa não
 * muda (o dinheiro sai da conta igual, o desconto só muda quem fica com ele).
 * Até 25/08/2026 este mesmo campo era encargo patronal e SOMAVA no custo — o que
 * fez a folha mostrar custo R$ 2.028,58 num bruto de R$ 1.907,00 e não descontar
 * nada de ninguém.
 *
 * O campo é VALOR EM REAIS desde 26/08/2026, e era percentual antes. 7,5% sobre
 * o salário mínimo de R$ 1.621,00 dá 121,575: a metade exata do centavo, onde
 * nenhum arredondamento é "o certo". O sistema subia para R$ 121,58 e o
 * contracheque descia para R$ 121,57. Quem decide esse centavo é quem emite o
 * contracheque, então o número entra digitado — e vazio vale R$ 0,00, sem a
 * antiga distinção entre "não tem desconto" e "tem, e é zero".
 *
 * Quem calcula é o banco (`fn_editar_item_folha`, as mesmas funções da
 * geração). O que aparece aqui é PRÉVIA: desconto e líquido estimados para a
 * pessoa conferir a ordem de grandeza. Os valores oficiais chegam no
 * `router.refresh()` de quem chamou.
 */
export function EditarItemFolhaDrawer({
  aberto,
  onAbertoChange,
  item,
  folhaId,
  centros,
  onSalvo,
}: EditarItemFolhaDrawerProps) {
  const [salarioBase, setSalarioBase] = React.useState("");
  const [gratificacao, setGratificacao] = React.useState("");
  const [desconto, setDesconto] = React.useState("");
  const [horas, setHoras] = React.useState("");
  const [centroCusto, setCentroCusto] = React.useState("");
  const [horasNormais, setHorasNormais] = React.useState("");
  const [horasExtras, setHorasExtras] = React.useState("");
  const [valorExtras, setValorExtras] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  // Ajuste de estado durante o render na transição de fechado para aberto
  // (padrão React, sem efeito): os três campos partem do que a linha tem hoje.
  // Precisa acontecer aqui e não num efeito porque o drawer fica montado com
  // `item` mudando — sem o reset, abrir a linha de outra pessoa mostraria os
  // valores da anterior, e confirmar gravaria o salário de um no item do outro.
  const [itemAberto, setItemAberto] = React.useState<string | null>(null);
  const idAtual = aberto && item ? item.id : null;
  if (idAtual !== itemAberto) {
    setItemAberto(idAtual);
    if (item) {
      const iniciais = camposDoItem(item);
      setSalarioBase(iniciais.salarioBase);
      setGratificacao(iniciais.gratificacao);
      setDesconto(iniciais.desconto);
      setHoras(iniciais.horas);
      setCentroCusto(iniciais.centroCusto);
      setHorasNormais(iniciais.horasNormais);
      setHorasExtras(iniciais.horasExtras);
      setValorExtras(iniciais.valorExtras);
    }
  }

  const baseNumero = paraNumero(salarioBase);
  const gratNumero = gratificacao.trim() === "" ? 0 : paraNumero(gratificacao);
  // Vazio vale zero, igual à gratificação: "sem desconto" e "R$ 0,00" são a
  // mesma coisa desde que o campo deixou de ser percentual.
  const descontoNumero = desconto.trim() === "" ? 0 : paraNumero(desconto);

  const baseValida = Number.isFinite(baseNumero) && baseNumero >= 0;
  const gratValida = Number.isFinite(gratNumero) && gratNumero >= 0;
  const descontoValido = Number.isFinite(descontoNumero) && descontoNumero >= 0;
  // Horas vazias são `null` (o desconto não foi informado por horas), e isso é
  // diferente de zero. Só o campo em branco vira null: "0" é uma declaração.
  const horasNumero = horas.trim() === "" ? null : paraNumero(horas);
  const horasValidas =
    horasNumero === null ||
    (Number.isFinite(horasNumero) &&
      horasNumero >= 0 &&
      horasNumero <= HORAS_MES);
  const extrasNumero = valorExtras.trim() === "" ? 0 : paraNumero(valorExtras);
  const extrasValido = Number.isFinite(extrasNumero) && extrasNumero >= 0;
  // Horas trabalhadas: vazio é ZERO (não trabalhou), diferente das horas do
  // desconto, onde vazio é null (não declarou motivo).
  const hnNumero = horasNormais.trim() === "" ? 0 : paraNumero(horasNormais);
  const heNumero = horasExtras.trim() === "" ? 0 : paraNumero(horasExtras);
  const horasTrabalhadasValidas = [hnNumero, heNumero].every(
    (valor) => Number.isFinite(valor) && valor >= 0 && valor <= HORAS_MAX,
  );

  // Linha zerada não existe na folha: a mesma trava está no schema e no banco.
  const temValor =
    baseValida && gratValida && (baseNumero > 0 || gratNumero > 0);
  const podeSalvar =
    item !== null &&
    baseValida &&
    gratValida &&
    descontoValido &&
    horasValidas &&
    // Sem centro de custo o banco recusa. Travar o botão em vez de deixar
    // clicar e cair num toast: o campo obrigatório está à vista, na primeira
    // seção do formulário.
    centroCusto !== "" &&
    extrasValido &&
    horasTrabalhadasValidas &&
    temValor;

  /**
   * Digitou HORAS: preenche o valor com a conversão (salário base ÷ 200 × horas).
   *
   * O valor fica editável depois disso, de propósito. Se o contracheque descontar
   * um centavo diferente do que a conta dá, quem vale é o contracheque — foi
   * exatamente por isso que o percentual saiu desta tela.
   */
  function aoMudarHoras(texto: string) {
    setHoras(texto);
    const novasHoras = texto.trim() === "" ? null : paraNumero(texto);
    if (novasHoras === null || !Number.isFinite(novasHoras)) return;
    if (!baseValida || baseNumero <= 0) return;
    setDesconto(paraCampo(valorDasHoras(baseNumero, novasHoras)));
  }

  /**
   * Digitou o VALOR: preenche as horas equivalentes — o cálculo inverso.
   *
   * Só mexe nas horas quando o valor dá para converter. Apagar o valor apaga as
   * horas junto: desconto zerado sem motivo é o estado de "não tem desconto", e
   * deixar "8h" ao lado de R$ 0,00 seria uma linha que se contradiz.
   */
  function aoMudarValor(texto: string) {
    setDesconto(texto);
    const novoValor = texto.trim() === "" ? 0 : paraNumero(texto);
    if (!Number.isFinite(novoValor) || novoValor <= 0) {
      setHoras("");
      return;
    }
    if (!baseValida || baseNumero <= 0) return;
    setHoras(paraCampo(horasDoValor(baseNumero, novoValor)));
  }

  // O desconto não tem mais prévia para calcular: o número digitado é o próprio
  // desconto. Sobrou a prévia do LÍQUIDO, que mora em `previa-desconto.ts` com
  // teste ancorado no que o banco gravou de verdade — é o teste que impede a
  // tela de divergir da fórmula oficial por um centavo, justamente no número que
  // a pessoa está conferindo.
  const descontoPrevisto = descontoValido ? descontoNumero : null;
  // INSS e IRRF vêm do item, não são recalculados aqui: quem os calcula são as
  // faixas do banco, e chutar daria um número que a tela desmente no refresh.
  const liquidoEstimado =
    descontoPrevisto !== null && temValor
      ? liquidoPrevisto({
          salarioBase: baseNumero,
          gratificacao: gratNumero,
          valorExtras: extrasValido ? extrasNumero : 0,
          desconto: descontoPrevisto,
          inss: item?.inss ?? 0,
          irrf: item?.irrf ?? 0,
          adiantamentos: item?.adiantamentos ?? 0,
        })
      : null;

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!item || salvando) return;

    if (!baseValida) {
      toast.error("Informe o salário base como número (ex: 2.500,00)");
      return;
    }
    if (!gratValida) {
      toast.error("Informe a gratificação como número (ex: 500,00)");
      return;
    }
    if (!descontoValido) {
      toast.error("Informe o desconto como número (ex: 121,57)");
      return;
    }
    if (!horasValidas) {
      toast.error(
        `Informe as horas não trabalhadas entre 0 e ${HORAS_MES} (o mês inteiro)`,
      );
      return;
    }
    if (!temValor) {
      toast.error(
        "Salário base e gratificação não podem ser os dois zero. Se a pessoa não entra nesta folha, ajuste o cadastro dela e regere",
      );
      return;
    }

    if (centroCusto === "") {
      toast.error("Escolha o centro de custo desta linha");
      return;
    }
    if (!extrasValido) {
      toast.error("Informe o valor de extras como número (ex: 350,00)");
      return;
    }
    if (!horasTrabalhadasValidas) {
      toast.error(`Informe as horas entre 0 e ${HORAS_MAX}`);
      return;
    }

    setSalvando(true);
    const resultado = await editarItemFolha(folhaId, {
      itemId: item.id,
      centroCustoId: centroCusto,
      salarioBase: baseNumero,
      gratificacao: gratNumero,
      horasNormais: hnNumero,
      horasExtras: heNumero,
      valorExtras: extrasNumero,
      desconto: descontoNumero,
      descontoHoras: horasNumero,
    });
    setSalvando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success("Linha da folha atualizada");
    onAbertoChange(false);
    onSalvo?.();
  }

  const vinculo = item
    ? (ROTULO_VINCULO[item.colaboradorVinculo as Vinculo] ??
      item.colaboradorVinculo)
    : "";

  // Substitui o `formState.isDirty` do React Hook Form: compara cada campo com o
  // valor que ele ganhou quando a linha foi aberta.
  const iniciais = item ? camposDoItem(item) : null;
  const alterado =
    iniciais !== null &&
    (salarioBase !== iniciais.salarioBase ||
      gratificacao !== iniciais.gratificacao ||
      desconto !== iniciais.desconto ||
      horas !== iniciais.horas ||
      centroCusto !== iniciais.centroCusto ||
      horasNormais !== iniciais.horasNormais ||
      horasExtras !== iniciais.horasExtras ||
      valorExtras !== iniciais.valorExtras);

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={item ? item.colaboradorNome : "Linha da folha"}
      descricao={
        item
          ? `${vinculo} · ajuste o que esta folha paga a esta pessoa. Regerar a folha preserva tudo o que você mudar aqui.`
          : undefined
      }
      temAlteracoesNaoSalvas={alterado && !salvando}
      rodape={
        <div className="flex w-full flex-wrap items-center justify-between gap-4">
          {/* A prévia existe para o líquido aparecer ANTES de salvar: é o que
              mostra que o desconto sai do salário da pessoa, e não do bolso da
              empresa. */}
          <div className="text-detalhe text-muted-foreground">
            {descontoPrevisto !== null && liquidoEstimado !== null ? (
              <>
                Desconto{" "}
                <MoneyText valor={descontoPrevisto} className="inline" /> ·
                líquido estimado{" "}
                <span className="font-semibold text-foreground">
                  <MoneyText valor={liquidoEstimado} className="inline" />
                </span>
              </>
            ) : (
              "Preencha os valores para ver o desconto e o líquido estimados"
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onAbertoChange(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form={ID_FORM}
              disabled={salvando || !podeSalvar}
            >
              {salvando ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar valores"
              )}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={aoEnviar}
        className={classesFormulario}
        noValidate
      >
        {/* Centro de custo primeiro: é a pergunta "de quem é este custo", e é
            o único campo aqui que, faltando, impede a folha inteira de ser
            aprovada. */}
        <SecaoFormulario titulo="Centro de custo">
          <SeletorCentroCusto
            centros={centros}
            valor={centroCusto}
            onValorChange={setCentroCusto}
            disabled={salvando}
            idBase="item-folha-centro"
            obrigatorio
            erro={
              centroCusto === ""
                ? "Nenhum custo da folha existe sem centro de custo"
                : undefined
            }
            rotuloDoValor={item?.centroCustoNome ?? undefined}
          />
        </SecaoFormulario>

        <SecaoFormulario titulo="Remuneração do mês">
          <LinhaCampos>
            <CampoFormulario
              id="item-folha-salario"
              rotulo="Salário base"
              obrigatorio
              largura="medio"
              ajuda={
                item?.colaboradorVinculo === "diarista"
                  ? "Para diarista, a folha traz a soma das diárias em aberto do mês. Alterar aqui desliga essa soma para esta folha."
                  : "Base do desconto e da provisão."
              }
            >
              <InputMoeda
                id="item-folha-salario"
                valor={salarioBase}
                onValorChange={setSalarioBase}
                disabled={salvando}
              />
            </CampoFormulario>

            <CampoFormulario
              id="item-folha-gratificacao"
              rotulo="Gratificação salarial"
              largura="medio"
              ajuda="Soma no líquido e no custo. NÃO entra na base do desconto nem da provisão."
            >
              <InputMoeda
                id="item-folha-gratificacao"
                valor={gratificacao}
                onValorChange={setGratificacao}
                disabled={salvando}
              />
            </CampoFormulario>
          </LinhaCampos>
        </SecaoFormulario>

        <SecaoFormulario titulo="Horas e extras do mês">
          <LinhaCampos>
            <CampoFormulario
              id="item-folha-horas-normais"
              rotulo="Horas normais"
              largura="medio"
              ajuda="Vem do apontamento aprovado. Terceiro e diarista não têm apontamento, então aqui é o único lugar de informar."
            >
              <InputHoras
                id="item-folha-horas-normais"
                valor={horasNormais}
                onValorChange={setHorasNormais}
                disabled={salvando}
                placeholder="0"
              />
            </CampoFormulario>

            <CampoFormulario
              id="item-folha-horas-extras"
              rotulo="Horas extras"
              largura="medio"
              ajuda="Só registro de produtividade: não vira dinheiro sozinha. O que paga é o valor abaixo."
            >
              <InputHoras
                id="item-folha-horas-extras"
                valor={horasExtras}
                onValorChange={setHorasExtras}
                disabled={salvando}
                placeholder="0"
              />
            </CampoFormulario>

            <CampoFormulario
              id="item-folha-valor-extras"
              rotulo="Valor de extras"
              largura="medio"
              ajuda="Soma no líquido e no custo. NÃO entra na base do encargo nem da provisão — é por isso que existe separado do salário base."
            >
              <InputMoeda
                id="item-folha-valor-extras"
                valor={valorExtras}
                onValorChange={setValorExtras}
                disabled={salvando}
                placeholder="0,00"
              />
            </CampoFormulario>
          </LinhaCampos>
        </SecaoFormulario>

        <SecaoFormulario titulo="Desconto do salário">
          <LinhaCampos>
            <CampoFormulario
              id="item-folha-horas"
              rotulo="Horas não trabalhadas"
              largura="medio"
              ajuda={`Digite as horas e o valor sai pronto (${HORAS_MES}h no mês). Em branco = o desconto não foi por horas.`}
            >
              <InputHoras
                id="item-folha-horas"
                valor={horas}
                onValorChange={aoMudarHoras}
                disabled={salvando}
                placeholder="0"
              />
            </CampoFormulario>

            <CampoFormulario
              id="item-folha-desconto"
              rotulo="Valor descontado do salário"
              largura="medio"
              ajuda="Sai do líquido: a pessoa recebe menos. Não muda o custo da empresa. Digitar aqui preenche as horas de volta."
            >
              <InputMoeda
                id="item-folha-desconto"
                valor={desconto}
                onValorChange={aoMudarValor}
                disabled={salvando}
                placeholder="0,00"
              />
            </CampoFormulario>
          </LinhaCampos>

          {/* O valor da hora à mostra: é ele que explica por que 8 horas viraram
              R$ 64,84, e é o número que a pessoa confere contra o contracheque
              antes de aceitar a sugestão. */}
          {baseValida && baseNumero > 0 ? (
            <p className="text-legenda text-muted-foreground">
              A hora desta pessoa vale{" "}
              <span className="font-medium text-foreground">
                {formatarBRL(valorDaHora(baseNumero))}
              </span>{" "}
              (salário base ÷ {HORAS_MES}h). Um campo preenche o outro, e o
              valor manda: se o contracheque tiver outro centavo, ajuste o valor
              e as horas ficam como referência.
            </p>
          ) : null}
        </SecaoFormulario>

        {item && item.adiantamentos > 0 ? (
          <p className="text-detalhe text-muted-foreground">
            Esta folha já descontou{" "}
            <MoneyText valor={item.adiantamentos} className="inline" /> de
            adiantamento desta pessoa. O plano de parcelas não é recalculado
            aqui: se o valor novo não cobrir esse desconto, o sistema recusa e
            pede para regerar a folha.
          </p>
        ) : null}
      </form>
    </FormDrawer>
  );
}
