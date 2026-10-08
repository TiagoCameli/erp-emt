"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputDecimal,
  LinhaCampos,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO, formatarBRL } from "@/lib/formatadores";
import {
  criarDiaria,
  criarFuncaoDiaria,
  editarDiaria,
} from "@/modules/rh/diaristas/actions";
import { numeroPositivo, paraNumero } from "@/modules/rh/diaristas/numero";
import {
  calcularPeriodo,
  proximoTipoDia,
  type TipoDia,
} from "@/modules/rh/diaristas/periodo";
import type { DiariaLista, FuncaoDiaria } from "@/modules/rh/diaristas/queries";
import {
  diariaFormParaInput,
  diariaFormSchema,
  type DiariaFormInput,
} from "@/modules/rh/diaristas/schemas";
import type { DiaristaOpcao, ObraOpcao } from "@/modules/rh/_shared/queries";
import { PeriodoDias } from "./periodo-dias";

const ID_FORM = "form-diaria";
/** Valor da obra "sem obra" no combobox (Radix proíbe value vazio). */
const SEM_OBRA = "__sem_obra__";

function valoresIniciais(): DiariaFormInput {
  const hoje = dataHojeISO();
  return {
    colaboradorId: "",
    funcaoId: "",
    obraId: "",
    inicio: hoje,
    fim: hoje,
    meias: [],
    faltas: [],
    valorDiaria: "",
    observacao: "",
  };
}

/** Converte o valor numérico do banco na string pt-BR do formulário. */
function valorParaString(valor: number | null | undefined): string {
  return valor == null ? "" : String(valor).replace(".", ",");
}

/** Quantidade de diárias com vírgula: 12,5. */
function formatarQtd(qtd: number): string {
  return qtd.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export interface DiariaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  diaristas: DiaristaOpcao[];
  obras: ObraOpcao[];
  /** Funções do catálogo com o último valor de diária. */
  funcoes: FuncaoDiaria[];
  /** Diária em edição. Ausente significa registrar. */
  diaria?: DiariaLista | null;
}

/**
 * Drawer da diária por período: diarista, função (com "criar função" no próprio
 * campo), valor da diária, obra, período e a grade de dias para marcar meia
 * diária e dia sem trabalho. O resumo é a prévia da mesma conta que o banco faz
 * ao gravar (`fn_diaria_calcular`).
 *
 * Valor sugerido: o último valor da função; se a função ainda não tem, o valor do
 * cadastro do diarista. Diária já fechada também chega aqui: o diarista fica
 * travado e o banco recusa mudar de mês.
 */
export function DiariaFormDrawer({
  aberto,
  onAbertoChange,
  diaristas,
  obras,
  funcoes,
  diaria,
}: DiariaFormDrawerProps) {
  const editando = Boolean(diaria);
  const fechada = diaria?.fechada ?? false;

  const form = useForm<DiariaFormInput>({
    resolver: zodResolver(diariaFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Funções criadas aqui nesta sessão, até a página recarregar a lista.
  const [funcoesCriadas, setFuncoesCriadas] = React.useState<FuncaoDiaria[]>(
    [],
  );
  const todasFuncoes = React.useMemo(() => {
    const ids = new Set(funcoes.map((f) => f.id));
    return [...funcoes, ...funcoesCriadas.filter((f) => !ids.has(f.id))];
  }, [funcoes, funcoesCriadas]);

  // "Criar função": o nome vem do texto digitado no campo, o valor daqui.
  const [novaFuncao, setNovaFuncao] = React.useState<string | null>(null);
  const [valorNovaFuncao, setValorNovaFuncao] = React.useState("");
  const [criandoFuncao, setCriandoFuncao] = React.useState(false);

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    setNovaFuncao(null);
    setValorNovaFuncao("");
    if (diaria) {
      form.reset({
        colaboradorId: diaria.colaboradorId,
        funcaoId: diaria.funcaoId ?? "",
        obraId: diaria.obraId ?? "",
        inicio: diaria.data,
        // Diária antiga é de um dia, com o valor inteiro numa diária.
        fim: diaria.dataFim ?? diaria.data,
        meias: diaria.diasMeia,
        faltas: diaria.diasFalta,
        valorDiaria: valorParaString(diaria.valorDiaria ?? diaria.valor),
        observacao: diaria.observacao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, diaria, form]);

  const salvando = form.formState.isSubmitting;
  const valores = form.watch();

  /** Valor sugerido para a função: o último dela, senão o do diarista. */
  function sugerirValor(funcaoId: string, colaboradorId: string) {
    const daFuncao = todasFuncoes.find((f) => f.id === funcaoId)?.valor;
    const doDiarista = diaristas.find(
      (d) => d.id === colaboradorId,
    )?.valorDiaria;
    const sugestao = daFuncao ?? doDiarista;
    if (sugestao != null) {
      form.setValue("valorDiaria", valorParaString(sugestao), {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }

  function aoEscolherDiarista(colaboradorId: string) {
    form.setValue("colaboradorId", colaboradorId, {
      shouldValidate: true,
      shouldDirty: true,
    });
    if (editando) return;
    // Nova diária: traz a função do cadastro (se a pessoa ainda não escolheu)
    // e o valor dela.
    const escolhido = diaristas.find((d) => d.id === colaboradorId);
    let funcaoId = form.getValues("funcaoId");
    if (!funcaoId && escolhido?.funcaoId) {
      funcaoId = escolhido.funcaoId;
      form.setValue("funcaoId", funcaoId, { shouldValidate: true });
    }
    if (form.getValues("valorDiaria").trim() === "") {
      sugerirValor(funcaoId, colaboradorId);
    }
  }

  function aoEscolherFuncao(funcaoId: string) {
    form.setValue("funcaoId", funcaoId, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setNovaFuncao(null);
    sugerirValor(funcaoId, form.getValues("colaboradorId"));
  }

  async function confirmarNovaFuncao() {
    if (!novaFuncao) return;
    if (!numeroPositivo(valorNovaFuncao)) {
      toast.error("Informe o valor da diária da função nova");
      return;
    }
    setCriandoFuncao(true);
    try {
      const valor = paraNumero(valorNovaFuncao);
      const r = await criarFuncaoDiaria({ nome: novaFuncao, valor });
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      setFuncoesCriadas((prev) => [
        ...prev,
        { id: r.id, nome: r.nome, valor, atualizadoEm: null, diariaId: null },
      ]);
      form.setValue("funcaoId", r.id, {
        shouldValidate: true,
        shouldDirty: true,
      });
      form.setValue("valorDiaria", valorParaString(valor), {
        shouldValidate: true,
        shouldDirty: true,
      });
      setNovaFuncao(null);
      setValorNovaFuncao("");
      toast.success(`Função ${r.nome} criada`);
    } finally {
      setCriandoFuncao(false);
    }
  }

  function alternarDia(dia: string, atual: TipoDia) {
    const proximo = proximoTipoDia(atual);
    const meias = form.getValues("meias").filter((d) => d !== dia);
    const faltas = form.getValues("faltas").filter((d) => d !== dia);
    if (proximo === "meia") meias.push(dia);
    if (proximo === "falta") faltas.push(dia);
    form.setValue("meias", meias, { shouldDirty: true, shouldValidate: true });
    form.setValue("faltas", faltas, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function aoEnviar(dados: DiariaFormInput) {
    const entrada = diariaFormParaInput(dados);
    const resultado = diaria
      ? await editarDiaria(diaria.id, entrada)
      : await criarDiaria(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Diária salva" : "Diária registrada");
    onAbertoChange(false);
  }

  const resumo = calcularPeriodo({
    inicio: valores.inicio,
    fim: valores.fim,
    meias: valores.meias,
    faltas: valores.faltas,
    valorDiaria: numeroPositivo(valores.valorDiaria)
      ? paraNumero(valores.valorDiaria)
      : 0,
  });

  const opcoesFuncao = todasFuncoes.map((f) => ({
    valor: f.id,
    rotulo: f.valor != null ? `${f.nome} · ${formatarBRL(f.valor)}` : f.nome,
  }));

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar diária" : "Nova diária"}
      descricao={
        fechada
          ? "Esta diária já foi fechada. Ao salvar, o lançamento a pagar é acertado com o novo valor. Diarista e mês não mudam: para isso, exclua e lance de novo."
          : "Informe o período e marque os dias de meia diária e os dias sem trabalho. O total é calculado sozinho."
      }
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => onAbertoChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            {editando ? "Salvar diária" : "Registrar diária"}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={submeterComAviso(form, aoEnviar)}
        className={classesFormulario}
      >
        <CampoFormulario
          id="diaria-colaborador"
          rotulo="Diarista"
          erro={form.formState.errors.colaboradorId?.message}
        >
          <Combobox
            valor={valores.colaboradorId}
            onValorChange={aoEscolherDiarista}
            opcoes={diaristas.map((diarista) => ({
              valor: diarista.id,
              rotulo: diarista.nome,
            }))}
            placeholder="Selecione o diarista"
            className="w-full"
            id="diaria-colaborador"
            disabled={fechada}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="diaria-funcao"
            rotulo="Função"
            erro={form.formState.errors.funcaoId?.message}
          >
            <Combobox
              valor={valores.funcaoId}
              onValorChange={aoEscolherFuncao}
              opcoes={opcoesFuncao}
              rotuloDoValor={diaria?.funcaoNome ?? undefined}
              onCriar={async (texto) => {
                // O nome vem daqui; o valor, da caixinha que abre abaixo.
                setNovaFuncao(texto.trim());
                setValorNovaFuncao(valores.valorDiaria);
                return null;
              }}
              placeholder="Selecione ou crie a função"
              buscaPlaceholder="Buscar ou digitar função nova"
              className="w-full"
              id="diaria-funcao"
            />
          </CampoFormulario>

          <CampoFormulario
            id="diaria-valor"
            rotulo="Valor da diária (R$)"
            erro={form.formState.errors.valorDiaria?.message}
          >
            <InputDecimal
              id="diaria-valor"
              placeholder="0,00"
              className="text-right tabular-nums"
              {...form.register("valorDiaria")}
            />
          </CampoFormulario>
        </LinhaCampos>

        {novaFuncao ? (
          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <p className="text-sm">
              Nova função{" "}
              <span className="font-medium">{novaFuncao.toUpperCase()}</span>
            </p>
            <div className="flex items-end gap-2">
              <CampoFormulario
                id="nova-funcao-valor"
                rotulo="Valor da diária (R$)"
                className="flex-1"
              >
                <InputDecimal
                  id="nova-funcao-valor"
                  placeholder="0,00"
                  className="text-right tabular-nums"
                  value={valorNovaFuncao}
                  onChange={(e) => setValorNovaFuncao(e.target.value)}
                />
              </CampoFormulario>
              <Button
                type="button"
                size="sm"
                disabled={criandoFuncao}
                onClick={confirmarNovaFuncao}
              >
                {criandoFuncao ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : null}
                Criar função
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={criandoFuncao}
                onClick={() => setNovaFuncao(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        <CampoFormulario
          id="diaria-obra"
          rotulo="Obra"
          erro={form.formState.errors.obraId?.message}
        >
          <Combobox
            valor={valores.obraId === "" ? SEM_OBRA : valores.obraId}
            onValorChange={(valor) =>
              form.setValue("obraId", valor === SEM_OBRA ? "" : valor, {
                shouldDirty: true,
              })
            }
            opcoes={[
              { valor: SEM_OBRA, rotulo: "Sem obra" },
              ...obras.map((obra) => ({
                valor: obra.id,
                rotulo: obra.nome + (obra.lote ? ` - Lote ${obra.lote}` : ""),
              })),
            ]}
            placeholder="Sem obra"
            className="w-full"
            id="diaria-obra"
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="diaria-inicio"
            rotulo="Início do período"
            erro={form.formState.errors.inicio?.message}
          >
            <Input
              id="diaria-inicio"
              type="date"
              {...form.register("inicio")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="diaria-fim"
            rotulo="Fim do período"
            erro={form.formState.errors.fim?.message}
          >
            <Input id="diaria-fim" type="date" {...form.register("fim")} />
          </CampoFormulario>
        </LinhaCampos>

        <PeriodoDias
          inicio={valores.inicio}
          fim={valores.fim}
          meias={valores.meias}
          faltas={valores.faltas}
          onAlternar={alternarDia}
        />

        <div className="rounded-md bg-muted/50 p-3 text-sm" aria-live="polite">
          {"erro" in resumo ? (
            <span className="text-muted-foreground">{resumo.erro}</span>
          ) : (
            <>
              <span>
                {resumo.integrais} integra{resumo.integrais === 1 ? "l" : "is"}
                {resumo.qtdMeias > 0
                  ? ` + ${resumo.qtdMeias} meia${resumo.qtdMeias === 1 ? "" : "s"}`
                  : ""}
                {resumo.qtdFaltas > 0
                  ? ` (${resumo.qtdFaltas} sem trabalho)`
                  : ""}
                {" = "}
                <span className="font-medium tabular-nums">
                  {formatarQtd(resumo.qtd)} diária{resumo.qtd === 1 ? "" : "s"}
                </span>
              </span>
              {numeroPositivo(valores.valorDiaria) ? (
                <span>
                  {" × "}
                  {formatarBRL(paraNumero(valores.valorDiaria))}
                  {" = "}
                  <span className="font-semibold tabular-nums">
                    {formatarBRL(resumo.total)}
                  </span>
                </span>
              ) : null}
            </>
          )}
        </div>

        <CampoFormulario
          id="diaria-observacao"
          rotulo="Observação"
          erro={form.formState.errors.observacao?.message}
        >
          <Textarea
            id="diaria-observacao"
            rows={2}
            placeholder="Opcional"
            {...form.register("observacao")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
