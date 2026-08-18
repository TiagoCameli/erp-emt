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
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  dataHojeISO,
  mesHojeISO,
  mesParaCompetencia,
} from "@/lib/formatadores";
import { criarReceber } from "@/modules/financeiro/contas-receber/actions";
import type { CategoriaOpcao } from "@/modules/financeiro/contas-receber/queries";
import {
  receberFormSchema,
  type ReceberFormInput,
} from "@/modules/financeiro/contas-receber/schemas";

const SEM_CATEGORIA = "sem-categoria";
const ID_FORM = "form-receber";

/** Valores iniciais do formulário, sempre em branco (só criação). */
function valoresIniciais(): ReceberFormInput {
  return {
    descricao: "",
    categoriaId: undefined,
    valor: "",
    dataDocumento: dataHojeISO(),
    mesCompetencia: mesHojeISO(),
    dataVencimento: "",
  };
}

export interface ReceberFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  categorias: CategoriaOpcao[];
  /** Recarrega a listagem após criar. */
  onCriado: () => void;
}

/**
 * Drawer de criação de conta a receber. Caso simples: descrição, categoria de
 * receita, valor e vencimento, em parcela única e sem rateio. A action monta a
 * parcela única e chama fn_salvar_lancamento com tipo a_receber. Recebíveis
 * mais complexos (parcelado, rateado) são montados manualmente aqui.
 */
export function ReceberFormDrawer({
  aberto,
  onAbertoChange,
  categorias,
  onCriado,
}: ReceberFormDrawerProps) {
  const form = useForm<ReceberFormInput>({
    resolver: zodResolver(receberFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(valores: ReceberFormInput) {
    const valor = Number(valores.valor.replace(",", "."));
    const vencimento =
      valores.dataVencimento === "" ? undefined : valores.dataVencimento;

    const resultado = await criarReceber(
      {
        descricao: valores.descricao,
        categoriaId: valores.categoriaId,
        valor,
        dataDocumento: valores.dataDocumento,
        mesCompetencia: mesParaCompetencia(valores.mesCompetencia),
        dataVencimento: vencimento,
        parcelas: [],
        rateios: [],
      },
      [{ valor, dataVencimento: vencimento }],
      [],
    );

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success("Conta a receber criada");
    onAbertoChange(false);
    onCriado();
  }

  const categoriaValor = form.watch("categoriaId") ?? SEM_CATEGORIA;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Novo a receber"
      descricao="Cadastre um recebível. Some valor em parcela única; o vencimento controla o que está em aberto"
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
                Salvando...
              </>
            ) : (
              "Criar recebível"
            )}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="receber-descricao"
          rotulo="Descrição"
          obrigatorio
          erro={form.formState.errors.descricao?.message}
        >
          <Input
            id="receber-descricao"
            placeholder="Ex: Locação de equipamento - jan/2026"
            disabled={salvando}
            {...form.register("descricao")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="receber-categoria"
          rotulo="Categoria"
          ajuda="Categoria de receita para o relatório"
          erro={form.formState.errors.categoriaId?.message}
        >
          <Combobox
            valor={categoriaValor}
            onValorChange={(valor) =>
              form.setValue(
                "categoriaId",
                valor === SEM_CATEGORIA ? undefined : valor,
                { shouldValidate: true },
              )
            }
            opcoes={[
              { valor: SEM_CATEGORIA, rotulo: "Sem categoria" },
              ...categorias.map((categoria) => ({
                valor: categoria.id,
                rotulo: categoria.nome,
              })),
            ]}
            placeholder="Sem categoria"
            disabled={salvando}
            id="receber-categoria"
          />
        </CampoFormulario>

        <CampoFormulario
          id="receber-valor"
          rotulo="Valor"
          obrigatorio
          erro={form.formState.errors.valor?.message}
        >
          <InputDecimal
            id="receber-valor"
            placeholder="0,00"
            className="text-right tabular-nums"
            disabled={salvando}
            {...form.register("valor")}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="receber-data-documento"
            rotulo="Data do documento"
            obrigatorio
            erro={form.formState.errors.dataDocumento?.message}
          >
            <Input
              id="receber-data-documento"
              type="date"
              max={dataHojeISO()}
              className="tabular-nums"
              disabled={salvando}
              {...form.register("dataDocumento")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="receber-mes-competencia"
            rotulo="Mês de referência"
            obrigatorio
            ajuda="Define em qual mês esta receita entra"
            erro={form.formState.errors.mesCompetencia?.message}
          >
            <Input
              id="receber-mes-competencia"
              type="month"
              className="tabular-nums"
              disabled={salvando}
              {...form.register("mesCompetencia")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="receber-vencimento"
            rotulo="Vencimento"
            erro={form.formState.errors.dataVencimento?.message}
          >
            <Input
              id="receber-vencimento"
              type="date"
              disabled={salvando}
              {...form.register("dataVencimento")}
            />
          </CampoFormulario>
        </LinhaCampos>
      </form>
    </FormDrawer>
  );
}
