"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputMoeda,
  InputQuantidade,
  LinhaCampos,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CASAS_DINHEIRO, CASAS_TAXA } from "@/lib/casas-decimais";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";
import { iniciarLocacao, type ResultadoMapa } from "@/modules/mapa/actions";
import {
  locacaoFormSchema,
  type IniciarLocacaoInput,
  type LocacaoFormInput,
} from "@/modules/mapa/schemas";
import {
  ROTULO_PROPRIEDADE,
  ROTULO_TIPO_ALUGUEL,
  TIPOS_ALUGUEL,
  type EquipamentoForaDoMapa,
  type FornecedorOpcao,
} from "@/modules/mapa/tipos";

const ID_FORM = "form-locacao-mapa";

export interface DrawerLocacaoProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  hoje: string;
  candidatos: EquipamentoForaDoMapa[];
  fornecedores: FornecedorOpcao[];
  /** Fornecedor Colorado do cadastro (config mapa.fornecedor_colorado), pré-escolhido para máquina da Colorado. */
  fornecedorColorado: string | null;
  /** Tipos de máquina já usados no cadastro, para sugerir na máquina nova. */
  tiposConhecidos: string[];
  onSucesso: (
    resultado: Extract<ResultadoMapa, { ok: true }>,
    equipamentoId: string | null,
  ) => void;
}

function valoresIniciais(hoje: string): LocacaoFormInput {
  return {
    origem: "existente",
    equipamentoId: "",
    fornecedorId: "",
    tipoAluguel: "dia",
    valorUnitario: "",
    inicio: hoje,
    fimPrevisto: "",
    medicaoInicio: "",
    observacao: "",
    novaDescricao: "",
    novoTipo: "",
    novaMarca: "",
    novoModelo: "",
    novaPlaca: "",
  };
}

/**
 * "Adicionar máquina alugada": abre a locação de uma máquina da Colorado ou alugada que está
 * fora do mapa, ou cadastra uma máquina nova de terceiro (entra no cadastro como alugada). Ao
 * salvar, a máquina aparece no mapa sem posição e a tela já pede para posicionar.
 */
export function DrawerLocacao({
  aberto,
  onAbertoChange,
  hoje,
  candidatos,
  fornecedores,
  fornecedorColorado,
  tiposConhecidos,
  onSucesso,
}: DrawerLocacaoProps) {
  const form = useForm<LocacaoFormInput>({
    resolver: zodResolver(locacaoFormSchema),
    defaultValues: valoresIniciais(hoje),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(hoje));
  }, [aberto, hoje, form]);

  const salvando = form.formState.isSubmitting;
  const origem = form.watch("origem");
  const equipamentoId = form.watch("equipamentoId");
  const tipoAluguel = form.watch("tipoAluguel");
  const valor = form.watch("valorUnitario");
  const medicao = form.watch("medicaoInicio");
  const erros = form.formState.errors;

  const opcoesEquipamento = React.useMemo(
    () =>
      candidatos.map((c) => ({
        valor: c.id,
        rotulo: `${c.codigo ? `${c.codigo} · ` : ""}${c.descricao}${c.tipo ? ` (${c.tipo})` : ""} · ${ROTULO_PROPRIEDADE[c.propriedade]}`,
      })),
    [candidatos],
  );
  const opcoesFornecedor = React.useMemo(
    () => fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome })),
    [fornecedores],
  );

  // Máquina da Colorado: o fornecedor é a própria Colorado, já escolhido.
  React.useEffect(() => {
    if (!equipamentoId || !fornecedorColorado) return;
    const escolhido = candidatos.find((c) => c.id === equipamentoId);
    if (
      escolhido?.propriedade === "colorado" &&
      !form.getValues("fornecedorId")
    ) {
      form.setValue("fornecedorId", fornecedorColorado, { shouldDirty: true });
    }
  }, [equipamentoId, fornecedorColorado, candidatos, form]);

  async function aoEnviar(valores: LocacaoFormInput) {
    const valorNumero = textoParaNumero(valores.valorUnitario, CASAS_DINHEIRO);
    if (valorNumero === null || valorNumero < 0) {
      form.setError("valorUnitario", { message: "Valor inválido" });
      return;
    }
    const medicaoNumero = valores.medicaoInicio
      ? textoParaNumero(valores.medicaoInicio, CASAS_TAXA)
      : null;
    if (valores.medicaoInicio && medicaoNumero === null) {
      form.setError("medicaoInicio", { message: "Medição inválida" });
      return;
    }
    if (valores.origem === "existente" && !valores.equipamentoId) {
      form.setError("equipamentoId", { message: "Escolha a máquina" });
      return;
    }
    if (
      valores.origem === "nova" &&
      (!valores.novaDescricao || !valores.novoTipo)
    ) {
      if (!valores.novaDescricao)
        form.setError("novaDescricao", { message: "Informe a descrição" });
      if (!valores.novoTipo)
        form.setError("novoTipo", { message: "Informe o tipo de máquina" });
      return;
    }
    const pedido: IniciarLocacaoInput = {
      equipamentoId:
        valores.origem === "existente" ? valores.equipamentoId : null,
      fornecedorId: valores.fornecedorId,
      tipoAluguel: valores.tipoAluguel,
      valorUnitario: valorNumero,
      inicio: valores.inicio,
      fimPrevisto: valores.fimPrevisto || null,
      medicaoInicio: medicaoNumero,
      observacao: valores.observacao || undefined,
      novo:
        valores.origem === "nova"
          ? {
              descricao: valores.novaDescricao,
              tipo: valores.novoTipo,
              marca: valores.novaMarca || undefined,
              modelo: valores.novoModelo || undefined,
              placa: valores.novaPlaca || undefined,
            }
          : null,
    };
    const resultado = await iniciarLocacao(pedido);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Locação iniciada. Agora posicione a máquina no mapa.");
    onAbertoChange(false);
    onSucesso(
      resultado,
      valores.origem === "existente" ? valores.equipamentoId : null,
    );
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Adicionar máquina alugada"
      descricao="Máquina da Colorado ou de terceiro entra no mapa pela locação: fornecedor, tipo de aluguel e valor. O custo estimado aparece na ficha."
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      larguraClassName="max-w-2xl"
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Iniciando...
              </>
            ) : (
              "Iniciar locação"
            )}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={submeterComAviso(form, aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="loc-origem"
          rotulo="Máquina"
          obrigatorio
          largura="medio"
        >
          <Select
            value={origem}
            onValueChange={(v) =>
              form.setValue("origem", v as "existente" | "nova", {
                shouldDirty: true,
              })
            }
            disabled={salvando}
          >
            <SelectTrigger id="loc-origem" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="existente">
                Já cadastrada (Colorado ou alugada)
              </SelectItem>
              <SelectItem value="nova">Nova, de terceiro</SelectItem>
            </SelectContent>
          </Select>
        </CampoFormulario>

        {origem === "existente" ? (
          <CampoFormulario
            id="loc-equipamento"
            rotulo="Qual"
            obrigatorio
            erro={erros.equipamentoId?.message}
            largura="longo"
            ajuda={
              candidatos.length === 0
                ? "Nenhuma máquina da Colorado ou alugada fora do mapa."
                : undefined
            }
          >
            <Combobox
              id="loc-equipamento"
              valor={equipamentoId}
              onValorChange={(v) =>
                form.setValue("equipamentoId", v, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              opcoes={opcoesEquipamento}
              placeholder="Escolha a máquina"
              buscaPlaceholder="Código, descrição ou tipo"
              disabled={salvando}
            />
          </CampoFormulario>
        ) : (
          <>
            <LinhaCampos>
              <CampoFormulario
                id="loc-nova-descricao"
                rotulo="Descrição"
                obrigatorio
                erro={erros.novaDescricao?.message}
                largura="longo"
              >
                <Input
                  id="loc-nova-descricao"
                  disabled={salvando}
                  maxLength={300}
                  {...form.register("novaDescricao")}
                />
              </CampoFormulario>
              <CampoFormulario
                id="loc-novo-tipo"
                rotulo="Tipo de máquina"
                obrigatorio
                erro={erros.novoTipo?.message}
                largura="medio"
                ajuda="Como no cadastro de equipamentos (Escavadeira Hidráulica, Caminhão Pipa...)"
              >
                <Input
                  id="loc-novo-tipo"
                  list="loc-tipos-conhecidos"
                  disabled={salvando}
                  maxLength={100}
                  {...form.register("novoTipo")}
                />
                <datalist id="loc-tipos-conhecidos">
                  {tiposConhecidos.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </CampoFormulario>
            </LinhaCampos>
            <LinhaCampos>
              <CampoFormulario
                id="loc-nova-marca"
                rotulo="Marca"
                largura="medio"
              >
                <Input
                  id="loc-nova-marca"
                  disabled={salvando}
                  maxLength={100}
                  {...form.register("novaMarca")}
                />
              </CampoFormulario>
              <CampoFormulario
                id="loc-novo-modelo"
                rotulo="Modelo"
                largura="medio"
              >
                <Input
                  id="loc-novo-modelo"
                  disabled={salvando}
                  maxLength={100}
                  {...form.register("novoModelo")}
                />
              </CampoFormulario>
              <CampoFormulario
                id="loc-nova-placa"
                rotulo="Placa"
                largura="curto"
              >
                <Input
                  id="loc-nova-placa"
                  disabled={salvando}
                  maxLength={20}
                  className="font-mono uppercase"
                  {...form.register("novaPlaca")}
                />
              </CampoFormulario>
            </LinhaCampos>
          </>
        )}

        <CampoFormulario
          id="loc-fornecedor"
          rotulo="Fornecedor (locador)"
          obrigatorio
          erro={erros.fornecedorId?.message}
          largura="longo"
        >
          <Combobox
            id="loc-fornecedor"
            valor={form.watch("fornecedorId")}
            onValorChange={(v) =>
              form.setValue("fornecedorId", v, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            opcoes={opcoesFornecedor}
            placeholder="Escolha o fornecedor"
            buscaPlaceholder="Nome do fornecedor"
            disabled={salvando}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="loc-tipo"
            rotulo="Tipo de aluguel"
            obrigatorio
            largura="curto"
          >
            <Select
              value={tipoAluguel}
              onValueChange={(v) =>
                form.setValue(
                  "tipoAluguel",
                  v as (typeof TIPOS_ALUGUEL)[number],
                  { shouldDirty: true },
                )
              }
              disabled={salvando}
            >
              <SelectTrigger id="loc-tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_ALUGUEL.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ROTULO_TIPO_ALUGUEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoFormulario>
          <CampoFormulario
            id="loc-valor"
            rotulo={`Valor por ${tipoAluguel === "hora" ? "hora" : tipoAluguel === "dia" ? "dia" : "mês"} (R$)`}
            obrigatorio
            erro={erros.valorUnitario?.message}
            largura="curto"
          >
            <InputMoeda
              id="loc-valor"
              valor={valor}
              onValorChange={(v) =>
                form.setValue("valorUnitario", v, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              disabled={salvando}
            />
          </CampoFormulario>
          {tipoAluguel === "hora" ? (
            <CampoFormulario
              id="loc-medicao"
              rotulo="Horímetro na entrada"
              erro={erros.medicaoInicio?.message}
              largura="curto"
              ajuda="O custo por hora conta a partir daqui"
            >
              <InputQuantidade
                id="loc-medicao"
                valor={medicao}
                onValorChange={(v) =>
                  form.setValue("medicaoInicio", v, { shouldDirty: true })
                }
                disabled={salvando}
              />
            </CampoFormulario>
          ) : null}
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="loc-inicio"
            rotulo="Início"
            obrigatorio
            erro={erros.inicio?.message}
            largura="curto"
          >
            <Input
              id="loc-inicio"
              type="date"
              disabled={salvando}
              {...form.register("inicio")}
            />
          </CampoFormulario>
          <CampoFormulario
            id="loc-fim"
            rotulo="Fim previsto"
            erro={erros.fimPrevisto?.message}
            largura="curto"
          >
            <Input
              id="loc-fim"
              type="date"
              disabled={salvando}
              {...form.register("fimPrevisto")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario id="loc-obs" rotulo="Observação" largura="longo">
          <Textarea
            id="loc-obs"
            rows={2}
            maxLength={2000}
            disabled={salvando}
            {...form.register("observacao")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
