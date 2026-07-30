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
  SecaoFormulario,
} from "@/components/canonicos";
import { FilaAnexos } from "@/components/canonicos/fila-anexos";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CategoriaOpcao } from "@/modules/compras/cotacoes/queries";
import {
  cotacaoFormSchema,
  type CotacaoFormInput,
} from "@/modules/compras/cotacoes/schemas";

const ID_FORM = "form-nova-cotacao";

/** Formulário em branco: um só lugar para o estado inicial e o reset. */
const VALORES_INICIAIS: CotacaoFormInput = {
  descricao: "",
  categoriaId: "",
  observacoes: "",
};

export interface NovaCotacaoDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  criando: boolean;
  categorias: CategoriaOpcao[];
  /** Recebe o cabeçalho e os arquivos enfileirados (sobem após criar). */
  onCriar: (dados: CotacaoFormInput, anexos: File[]) => void | Promise<void>;
}

/**
 * Drawer de nova cotação avulsa: descrição do que está sendo cotado, categoria
 * do custo e observações. A montagem do mapa de preços acontece no detalhe.
 *
 * Kit canônico: `CampoFormulario` + `classesFormulario`, e `SecaoFormulario`
 * separando o cabeçalho dos anexos. Este drawer não lista itens: a lista de
 * insumos e preços da cotação é editada em `mapa-comparativo.tsx`, uma matriz
 * comparativa com uma coluna por fornecedor (layout N×M), que não casa com a
 * `TabelaItens`.
 */
export function NovaCotacaoDrawer({
  aberto,
  onAbertoChange,
  criando,
  categorias,
  onCriar,
}: NovaCotacaoDrawerProps) {
  const form = useForm<CotacaoFormInput>({
    resolver: zodResolver(cotacaoFormSchema),
    defaultValues: VALORES_INICIAIS,
  });

  const [filaAnexos, setFilaAnexos] = React.useState<File[]>([]);

  const categoriaId = form.watch("categoriaId");

  React.useEffect(() => {
    if (aberto) form.reset(VALORES_INICIAIS);
  }, [aberto, form]);

  // Zera a fila ao abrir ajustando o estado durante a renderização (padrão do
  // projeto), em vez de setState dentro de efeito, que dispara render em cascata.
  const [abertoAnterior, setAbertoAnterior] = React.useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto && filaAnexos.length > 0) setFilaAnexos([]);
  }

  function aoEnviar(valores: CotacaoFormInput) {
    void onCriar(valores, filaAnexos);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Nova cotação"
      descricao="Os fornecedores e preços você adiciona no detalhe"
      larguraClassName="sm:max-w-2xl"
      temAlteracoesNaoSalvas={form.formState.isDirty && !criando}
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={criando}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={criando}>
            {criando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Criando...
              </>
            ) : (
              "Criar cotação"
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
        <SecaoFormulario titulo="Dados da cotação" className="gap-5">
          <CampoFormulario
            id="cotacao-descricao"
            rotulo="Descrição"
            obrigatorio
            ajuda="Vai junto para a ordem de compra e para o lançamento financeiro"
            erro={form.formState.errors.descricao?.message}
          >
            <Textarea
              id="cotacao-descricao"
              rows={2}
              placeholder="Ex.: brita 1 e cimento para o canteiro do km 120"
              disabled={criando}
              {...form.register("descricao")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="cotacao-categoria"
            rotulo="Categoria do custo"
            obrigatorio
            erro={form.formState.errors.categoriaId?.message}
          >
            <Combobox
              valor={categoriaId}
              onValorChange={(valor) =>
                form.setValue("categoriaId", valor, { shouldValidate: true })
              }
              opcoes={categorias.map((categoria) => ({
                valor: categoria.id,
                rotulo: categoria.nome,
              }))}
              placeholder={
                categorias.length === 0
                  ? "Nenhuma categoria ativa"
                  : "Escolha a categoria"
              }
              disabled={criando || categorias.length === 0}
              id="cotacao-categoria"
              className="w-full"
            />
          </CampoFormulario>

          <CampoFormulario
            id="cotacao-observacoes"
            rotulo="Observações"
            erro={form.formState.errors.observacoes?.message}
          >
            <Textarea
              id="cotacao-observacoes"
              rows={3}
              placeholder="Ex.: entrega em duas etapas, conferir com o encarregado"
              disabled={criando}
              {...form.register("observacoes")}
            />
          </CampoFormulario>
        </SecaoFormulario>

        <SecaoFormulario titulo="Anexos">
          <FilaAnexos
            arquivos={filaAnexos}
            onMudar={setFilaAnexos}
            ocupado={criando}
            legenda="Sobem junto quando você criar a cotação"
          />
        </SecaoFormulario>
      </form>
    </FormDrawer>
  );
}
