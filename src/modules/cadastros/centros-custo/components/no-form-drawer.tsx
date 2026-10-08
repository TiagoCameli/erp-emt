"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputDecimal,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  criarEtapa,
  criarItem,
  editarNo,
} from "@/modules/cadastros/centros-custo/actions";
import {
  PRODUTOS_APLICACAO,
  ROTULO_PRODUTO_APLICACAO,
  criarEtapaSchema,
  criarItemSchema,
  editarNoSchema,
  type AplicacaoDaEtapaInput,
  type ProdutoAplicacao,
} from "@/modules/cadastros/centros-custo/schemas";
import type {
  AplicacaoDaEtapa,
  ContaParaAplicacao,
  NoCentroCusto,
} from "@/modules/cadastros/centros-custo/queries";

const ID_FORM = "form-no-centro-custo";

/** Modo do drawer: criar etapa, criar item ou editar um nó existente. */
export type ModoNo =
  | { tipo: "criar-etapa"; pai: NoCentroCusto }
  | { tipo: "criar-item"; pai: NoCentroCusto }
  /** `investimento`: etapa do centro Investimentos, que é uma aplicação. */
  | { tipo: "editar"; no: NoCentroCusto; investimento?: boolean };

export interface NoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  modo: ModoNo | null;
  aplicacoes: Record<string, AplicacaoDaEtapa>;
  contas: ContaParaAplicacao[];
}

/** O drawer está criando ou editando uma etapa de Investimentos (uma aplicação)? */
function ehAplicacao(modo: ModoNo | null): boolean {
  if (modo?.tipo === "criar-etapa") return modo.pai.tipo === "investimento";
  if (modo?.tipo === "editar") return modo.investimento === true;
  return false;
}

/** Converte o texto do campo orçamento em number ou undefined. */
function lerOrcamento(texto: string): number | undefined {
  const limpo = texto.trim();
  if (limpo === "") return undefined;
  const numero = Number(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isNaN(numero) ? Number.NaN : numero;
}

/**
 * Valores com que os campos nascem para um dado modo de abertura. Função pura
 * porque serve a duas coisas: preencher os campos ao abrir e, comparada com o
 * estado atual, dizer se a pessoa mexeu em algo (este drawer não usa React Hook
 * Form, então não há `formState.isDirty` para consultar).
 */
function valoresIniciais(
  modo: ModoNo | null,
  aplicacoes: Record<string, AplicacaoDaEtapa>,
): {
  nome: string;
  codigo: string;
  orcamento: string;
  contaId: string;
  produto: string;
} {
  if (modo?.tipo !== "editar") {
    return { nome: "", codigo: "", orcamento: "", contaId: "", produto: "" };
  }
  const aplicacao = aplicacoes[modo.no.id];
  return {
    contaId: aplicacao?.contaId ?? "",
    produto: aplicacao?.produto ?? "",
    nome: modo.no.nome,
    codigo: modo.no.codigo ?? "",
    orcamento:
      modo.no.orcamento === null
        ? ""
        : String(modo.no.orcamento).replace(".", ","),
  };
}

/**
 * Drawer único para criar etapa, criar item e editar nó. Em nó gerido pelo
 * sistema (sistema=true ou equipamento), o nome e o código ficam travados e só
 * o orçamento é editável.
 */
export function NoFormDrawer({
  aberto,
  onAbertoChange,
  modo,
  aplicacoes,
  contas,
}: NoFormDrawerProps) {
  const [nome, setNome] = React.useState("");
  const [contaId, setContaId] = React.useState("");
  const [produto, setProduto] = React.useState("");
  const [erroAplicacao, setErroAplicacao] = React.useState<string | null>(null);
  const aplicacao = ehAplicacao(modo);
  const [codigo, setCodigo] = React.useState("");
  const [orcamento, setOrcamento] = React.useState("");
  const [erroNome, setErroNome] = React.useState<string | null>(null);
  const [erroOrcamento, setErroOrcamento] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  const editando = modo?.tipo === "editar";
  const noEditado = modo?.tipo === "editar" ? modo.no : null;
  const geridoSistema = Boolean(
    noEditado &&
      (noEditado.nivel === 1 ||
        noEditado.sistema ||
        noEditado.equipamento_id !== null ||
        noEditado.obra_id !== null),
  );

  // Sincroniza os campos com o modo no momento em que o drawer abre. Em vez de um
  // efeito com setState (que dispara renders em cascata), guarda a chave da última
  // abertura e ajusta o estado durante a renderização, padrão recomendado pelo React
  // para reiniciar estado quando uma prop muda.
  const chaveAbertura = aberto && modo ? `${modo.tipo}:${
    modo.tipo === "editar" ? modo.no.id : modo.pai.id
  }` : null;
  const [ultimaAbertura, setUltimaAbertura] = React.useState<string | null>(null);

  if (chaveAbertura !== null && chaveAbertura !== ultimaAbertura) {
    setUltimaAbertura(chaveAbertura);
    setErroNome(null);
    setErroOrcamento(null);
    setErroAplicacao(null);
    const iniciais = valoresIniciais(modo, aplicacoes);
    setContaId(iniciais.contaId);
    setProduto(iniciais.produto);
    setNome(iniciais.nome);
    setCodigo(iniciais.codigo);
    setOrcamento(iniciais.orcamento);
  } else if (chaveAbertura === null && ultimaAbertura !== null) {
    setUltimaAbertura(null);
  }

  function titulo(): string {
    if (!modo) return "";
    if (modo.tipo === "criar-etapa") return aplicacao ? "Adicionar aplicação" : "Adicionar etapa";
    if (modo.tipo === "criar-item") return "Adicionar item";
    return geridoSistema ? "Editar orçamento" : "Editar nó";
  }

  function descricao(): string {
    if (!modo) return "";
    if (modo.tipo === "criar-etapa") {
      return `Nova etapa sob ${modo.pai.nome}`;
    }
    if (modo.tipo === "criar-item") {
      return `Novo item sob ${modo.pai.nome}`;
    }
    return geridoSistema
      ? "Este nó é gerido pelo sistema. Só o orçamento pode ser ajustado."
      : `Edição de ${modo.no.nome}`;
  }

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!modo || salvando) return;

    setErroNome(null);
    setErroOrcamento(null);
    setErroAplicacao(null);

    // Etapa de Investimentos é uma aplicação: a conta e o tipo são obrigatórios.
    let dadosAplicacao: AplicacaoDaEtapaInput | undefined;
    if (aplicacao) {
      if (!contaId || !produto) {
        setErroAplicacao("Escolha a conta e o tipo da aplicação");
        return;
      }
      dadosAplicacao = { conta_id: contaId, produto: produto as ProdutoAplicacao };
    }

    const orcamentoNumero = lerOrcamento(orcamento);
    if (orcamentoNumero !== undefined && Number.isNaN(orcamentoNumero)) {
      setErroOrcamento("Informe um valor numérico");
      return;
    }

    setSalvando(true);
    try {
      if (modo.tipo === "criar-etapa") {
        const validado = criarEtapaSchema.safeParse({
          nome,
          pai_id: modo.pai.id,
          orcamento: orcamentoNumero,
        });
        if (!validado.success) {
          setErroNome(validado.error.issues[0]?.message ?? "Dados inválidos");
          return;
        }
        const resultado = await criarEtapa(validado.data, dadosAplicacao);
        if ("erro" in resultado) {
          toast.error(resultado.erro);
          return;
        }
        toast.success(aplicacao ? "Aplicação criada" : "Etapa criada");
      } else if (modo.tipo === "criar-item") {
        const validado = criarItemSchema.safeParse({
          nome,
          pai_id: modo.pai.id,
          orcamento: orcamentoNumero,
        });
        if (!validado.success) {
          setErroNome(validado.error.issues[0]?.message ?? "Dados inválidos");
          return;
        }
        const resultado = await criarItem(validado.data);
        if ("erro" in resultado) {
          toast.error(resultado.erro);
          return;
        }
        toast.success("Item criado");
      } else {
        const validado = editarNoSchema.safeParse({
          nome,
          codigo: codigo.trim() === "" ? undefined : codigo,
          orcamento: orcamentoNumero,
        });
        if (!validado.success) {
          setErroNome(validado.error.issues[0]?.message ?? "Dados inválidos");
          return;
        }
        const resultado = await editarNo(modo.no.id, validado.data, dadosAplicacao);
        if ("erro" in resultado) {
          toast.error(resultado.erro);
          return;
        }
        toast.success("Alterações salvas");
      }
      onAbertoChange(false);
    } finally {
      setSalvando(false);
    }
  }

  const nomeTravado = editando && geridoSistema;

  // Substitui o `formState.isDirty` do React Hook Form, que este drawer não tem:
  // compara os campos com o valor que eles ganharam ao abrir.
  const iniciais = valoresIniciais(modo, aplicacoes);
  const alterado =
    nome !== iniciais.nome ||
    contaId !== iniciais.contaId ||
    produto !== iniciais.produto ||
    codigo !== iniciais.codigo ||
    orcamento !== iniciais.orcamento;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={titulo()}
      descricao={descricao()}
      temAlteracoesNaoSalvas={alterado && !salvando}
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
            {editando ? "Salvar alterações" : "Criar"}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={aoEnviar} className={classesFormulario}>
        <CampoFormulario
          id="no-nome"
          rotulo="Nome"
          ajuda={
            nomeTravado
              ? "O nome é gerido pelo sistema e não pode ser alterado aqui."
              : undefined
          }
          erro={erroNome ?? undefined}
        >
          <Input
            id="no-nome"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Ex: Terraplenagem"
            disabled={nomeTravado}
            autoFocus={!nomeTravado}
          />
        </CampoFormulario>

        {aplicacao ? (
          <>
            <CampoFormulario
              id="no-conta"
              rotulo="Conta"
              obrigatorio
              ajuda="A conta onde a aplicação está. O dinheiro aplicado mora na subconta de investimentos dela."
              erro={erroAplicacao && !contaId ? erroAplicacao : undefined}
            >
              <Combobox
                id="no-conta"
                valor={contaId}
                onValorChange={setContaId}
                opcoes={contas.map((conta) => ({ valor: conta.id, rotulo: conta.nome }))}
                rotuloDoValor={modo?.tipo === "editar" ? aplicacoes[modo.no.id]?.contaNome : undefined}
                placeholder="Selecione a conta"
                className="w-full"
              />
            </CampoFormulario>
            <CampoFormulario
              id="no-produto"
              rotulo="Tipo da aplicação"
              obrigatorio
              erro={erroAplicacao && !produto ? erroAplicacao : undefined}
            >
              <Combobox
                id="no-produto"
                valor={produto}
                onValorChange={setProduto}
                opcoes={PRODUTOS_APLICACAO.map((p) => ({
                  valor: p,
                  rotulo: ROTULO_PRODUTO_APLICACAO[p],
                }))}
                placeholder="Selecione o tipo"
                className="w-full"
              />
            </CampoFormulario>
          </>
        ) : null}

        {editando ? (
          <CampoFormulario
            id="no-codigo"
            rotulo="Código"
            ajuda={nomeTravado ? "O código é gerido pelo sistema." : undefined}
          >
            <Input
              id="no-codigo"
              value={codigo}
              onChange={(evento) => setCodigo(evento.target.value)}
              placeholder="Opcional, ex: 1.2.3"
              disabled={nomeTravado}
              className="font-mono"
            />
          </CampoFormulario>
        ) : null}

        <CampoFormulario
          id="no-orcamento"
          rotulo="Orçamento"
          ajuda="Quando preenchido, habilita o orçado x realizado deste nó."
          erro={erroOrcamento ?? undefined}
        >
          <InputDecimal
            id="no-orcamento"
            value={orcamento}
            onChange={(evento) => setOrcamento(evento.target.value)}
            placeholder="Opcional, ex: 150000,00"
            className="text-right tabular-nums"
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
