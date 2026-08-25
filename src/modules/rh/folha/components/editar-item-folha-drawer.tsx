"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  InputMoeda,
  InputPercentual,
  LinhaCampos,
  MoneyText,
  SecaoFormulario,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  ROTULO_VINCULO,
  type Vinculo,
} from "@/modules/cadastros/colaboradores/schemas";
import { editarItemFolha } from "@/modules/rh/folha/actions";
import type { FolhaItem } from "@/modules/rh/folha/queries";
import {
  descontoDoSalario,
  liquidoPrevisto,
} from "@/modules/rh/folha/previa-desconto";
import { paraNumero } from "@/modules/rh/percentual";

const ID_FORM = "form-editar-item-folha";

/** Número do banco no formato que o InputMoeda/InputPercentual editam. */
function paraCampo(valor: number | null): string {
  if (valor === null) return "";
  return String(valor).replace(".", ",");
}

export interface EditarItemFolhaDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Item em edição, ou null quando o drawer está fechado. */
  item: FolhaItem | null;
  /** Folha do item, só para revalidar a rota do detalhe depois de salvar. */
  folhaId: string;
  /** Chamado depois de salvar com sucesso. */
  onSalvo?: () => void;
}

/**
 * Altera a linha de um colaborador na folha em rascunho: salário base,
 * gratificação salarial e percentual descontado do salário.
 *
 * O drawer é o lugar onde a gratificação de quem tem gratificação é lançada. A
 * gratificação NÃO entra na base do desconto nem da provisão (regra do Tiago),
 * e o rodapé mostra isso em números ANTES de confirmar.
 *
 * O percentual DESCONTA do salário: o líquido da pessoa cai, e o custo da
 * empresa não muda (o dinheiro sai da conta igual, o desconto só muda quem
 * fica com ele). Até 25/08/2026 este mesmo campo era encargo patronal e SOMAVA
 * no custo — o que fez a folha mostrar custo R$ 2.028,58 num bruto de
 * R$ 1.907,00 e não descontar nada de ninguém.
 *
 * Vazio não é zero: vazio é "não tem desconto", zero é "tem, e é 0%". A
 * distinção existe porque o Regerar preserva o que foi digitado, e precisa
 * saber diferenciar "não mexeram nisso" de "decidiram que é zero".
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
  onSalvo,
}: EditarItemFolhaDrawerProps) {
  const [salarioBase, setSalarioBase] = React.useState("");
  const [gratificacao, setGratificacao] = React.useState("");
  const [percentual, setPercentual] = React.useState("");
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
      setSalarioBase(paraCampo(item.salarioBase));
      setGratificacao(paraCampo(item.gratificacao));
      setPercentual(paraCampo(item.descontoPercentual));
    }
  }

  const baseNumero = paraNumero(salarioBase);
  const gratNumero = gratificacao.trim() === "" ? 0 : paraNumero(gratificacao);
  const percentualInformado = percentual.trim() !== "";
  const percentualNumero = percentualInformado ? paraNumero(percentual) : null;

  const baseValida = Number.isFinite(baseNumero) && baseNumero >= 0;
  const gratValida = Number.isFinite(gratNumero) && gratNumero >= 0;
  const percentualValido =
    percentualNumero === null ||
    (Number.isFinite(percentualNumero) &&
      percentualNumero >= 0 &&
      percentualNumero <= 100);
  // Linha zerada não existe na folha: a mesma trava está no schema e no banco.
  const temValor =
    baseValida && gratValida && (baseNumero > 0 || gratNumero > 0);
  const podeSalvar =
    item !== null && baseValida && gratValida && percentualValido && temValor;

  // Prévia: o desconto incide só sobre o salário base, e vazio vale zero aqui
  // (a diferença entre vazio e zero está no que se GRAVA, não no que se desconta).
  //
  // As contas moram em `previa-desconto.ts`, com teste ancorado no que o banco
  // gravou de verdade: é o teste que impede a prévia de divergir da fórmula
  // oficial por um centavo, no número que a pessoa está conferindo.
  const percentualAplicado = percentualNumero ?? 0;
  const descontoPrevisto =
    baseValida && percentualValido
      ? descontoDoSalario(baseNumero, percentualAplicado)
      : null;
  // INSS e IRRF vêm do item, não são recalculados aqui: quem os calcula são as
  // faixas do banco, e chutar daria um número que a tela desmente no refresh.
  const liquidoEstimado =
    descontoPrevisto !== null && temValor
      ? liquidoPrevisto({
          salarioBase: baseNumero,
          gratificacao: gratNumero,
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
    if (!percentualValido) {
      toast.error("O percentual de desconto vai de 0 a 100");
      return;
    }
    if (!temValor) {
      toast.error(
        "Salário base e gratificação não podem ser os dois zero. Se a pessoa não entra nesta folha, ajuste o cadastro dela e regere",
      );
      return;
    }

    setSalvando(true);
    const resultado = await editarItemFolha(folhaId, {
      itemId: item.id,
      salarioBase: baseNumero,
      gratificacao: gratNumero,
      descontoPercentual: percentualNumero,
    });
    setSalvando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success("Valores da linha atualizados");
    onAbertoChange(false);
    onSalvo?.();
  }

  const vinculo = item
    ? (ROTULO_VINCULO[item.colaboradorVinculo as Vinculo] ??
      item.colaboradorVinculo)
    : "";

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={item ? `Valores de ${item.colaboradorNome}` : "Valores da linha"}
      descricao={
        item
          ? `${vinculo} · ajuste o que esta folha paga a esta pessoa. Regerar a folha preserva o que você mudar aqui.`
          : undefined
      }
      rodape={
        <div className="flex w-full flex-wrap items-center justify-between gap-4">
          {/* A prévia existe para o desconto aparecer como número ANTES de
              salvar: é o que mostra que o percentual sai do salário, e não do
              bolso da empresa. */}
          <div className="text-detalhe text-muted-foreground">
            {descontoPrevisto !== null && liquidoEstimado !== null ? (
              <>
                Desconto{" "}
                <MoneyText valor={descontoPrevisto} className="inline" /> sobre
                o salário base ({percentualAplicado}%) · líquido estimado{" "}
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

        <SecaoFormulario titulo="Desconto do salário">
          <CampoFormulario
            id="item-folha-desconto"
            rotulo="Percentual descontado do salário"
            largura="medio"
            ajuda="Incide sobre o salário base e sai do líquido: a pessoa recebe menos. Não muda o custo da empresa. Em branco = sem desconto."
          >
            <InputPercentual
              id="item-folha-desconto"
              valor={percentual}
              onValorChange={setPercentual}
              disabled={salvando}
              placeholder="0"
            />
          </CampoFormulario>
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
