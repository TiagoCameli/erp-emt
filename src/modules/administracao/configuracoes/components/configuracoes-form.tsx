"use client";

import * as React from "react";
import { toast } from "sonner";

import { CampoFormulario, Combobox, classesFormulario } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Json } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { salvarConfiguracao } from "@/modules/administracao/configuracoes/actions";
import {
  AJUDA_JANELA,
  JANELA_PADRAO,
  ROTULO_JANELA,
  type JanelaPagamento,
} from "@/modules/financeiro/_shared/janela-pagamento";
import type { Configuracao } from "@/modules/administracao/configuracoes/queries";

interface ConfiguracoesFormProps {
  configuracoes: Configuracao[];
  podeEditar: boolean;
}

type DefinicaoConfig =
  | { rotulo: string; tipo: "percentual"; min: number; max: number }
  | { rotulo: string; tipo: "booleano" }
  | {
      rotulo: string;
      tipo: "opcao";
      opcoes: { valor: string; rotulo: string; ajuda: string }[];
      padrao: string;
    };

const DEFINICOES: Record<string, DefinicaoConfig> = {
  tolerancia_divergencia_nf_percentual: {
    rotulo: "Tolerância de divergência NF x OC (%)",
    tipo: "percentual",
    min: 0,
    max: 100,
  },
  banco_horas_ativo: {
    rotulo: "Banco de horas",
    tipo: "booleano",
  },
  pagamento_janela: {
    rotulo: "Janela de pagamento",
    tipo: "opcao",
    padrao: JANELA_PADRAO,
    opcoes: (["exata", "a_partir"] satisfies JanelaPagamento[]).map((valor) => ({
      valor,
      rotulo: ROTULO_JANELA[valor],
      ajuda: AJUDA_JANELA[valor],
    })),
  },
};

/**
 * Salvar de uma configuração. Enquanto nada mudou o botão fica cinza, e não
 * âmbar esmaecido: primária com opacidade vira um tom que não existe no design
 * system e o botão parece quebrado em vez de desabilitado. Só ganha a cor de
 * ação quando existe alteração para salvar.
 */
function BotaoSalvar({
  mudou,
  pendente,
  podeEditar,
  onSalvar,
}: {
  mudou: boolean;
  pendente: boolean;
  podeEditar: boolean;
  onSalvar: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={mudou ? "default" : "secondary"}
      onClick={onSalvar}
      disabled={!podeEditar || !mudou || pendente}
    >
      {pendente ? "Salvando" : "Salvar"}
    </Button>
  );
}

interface CartaoOpcaoProps {
  chave: string;
  rotulo: string;
  descricao: string | null;
  valorInicial: string;
  opcoes: { valor: string; rotulo: string; ajuda: string }[];
  podeEditar: boolean;
}

/**
 * Configuração de escolha única. Usa o Combobox canônico (com busca), não o
 * Select, e mostra embaixo a explicação da opção escolhida: aqui a diferença
 * entre as opções muda quando o dinheiro pode sair, então o texto tem que estar
 * na tela e não no manual.
 */
function CartaoOpcao({
  chave,
  rotulo,
  descricao,
  valorInicial,
  opcoes,
  podeEditar,
}: CartaoOpcaoProps) {
  const [valor, setValor] = React.useState(valorInicial);
  const [valorBase, setValorBase] = React.useState(valorInicial);
  const [pendente, startTransition] = React.useTransition();

  // Reinicia o controle quando o valor salvo muda no servidor (revalidatePath).
  if (valorBase !== valorInicial) {
    setValorBase(valorInicial);
    setValor(valorInicial);
  }

  const mudou = valor !== valorInicial;
  const idCampo = `config-${chave}`;
  const ajudaOpcao = opcoes.find((opcao) => opcao.valor === valor)?.ajuda;

  function salvar() {
    startTransition(async () => {
      const resultado = await salvarConfiguracao(chave, valor);
      if (resultado?.erro) toast.error(resultado.erro);
      else toast.success("Configuração salva");
    });
  }

  return (
    <Card>
      <CardContent>
        <CampoFormulario
          id={idCampo}
          rotulo={rotulo}
          ajuda={descricao ?? undefined}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <Combobox
                id={idCampo}
                valor={valor}
                onValorChange={setValor}
                opcoes={opcoes.map((opcao) => ({
                  valor: opcao.valor,
                  rotulo: opcao.rotulo,
                }))}
                disabled={!podeEditar || pendente}
                className="w-full max-w-sm"
              />
              <BotaoSalvar
                mudou={mudou}
                pendente={pendente}
                podeEditar={podeEditar}
                onSalvar={salvar}
              />
            </div>
            {ajudaOpcao ? (
              <p className="text-legenda text-muted-foreground">{ajudaOpcao}</p>
            ) : null}
          </div>
        </CampoFormulario>
      </CardContent>
    </Card>
  );
}

interface CartaoPercentualProps {
  chave: string;
  rotulo: string;
  descricao: string | null;
  valorInicial: number;
  min: number;
  max: number;
  podeEditar: boolean;
}

function CartaoPercentual({
  chave,
  rotulo,
  descricao,
  valorInicial,
  min,
  max,
  podeEditar,
}: CartaoPercentualProps) {
  const [texto, setTexto] = React.useState(String(valorInicial));
  const [valorBase, setValorBase] = React.useState(valorInicial);
  const [pendente, startTransition] = React.useTransition();

  // Reinicia o campo quando o valor salvo muda no servidor (revalidatePath).
  if (valorBase !== valorInicial) {
    setValorBase(valorInicial);
    setTexto(String(valorInicial));
  }

  const numero = Number(texto.replace(",", "."));
  const mudou = texto.trim() !== "" && numero !== valorInicial;
  const idCampo = `config-${chave}`;

  function salvar() {
    if (Number.isNaN(numero)) {
      toast.error("Informe um número válido");
      return;
    }
    startTransition(async () => {
      const resultado = await salvarConfiguracao(chave, numero);
      if (resultado?.erro) toast.error(resultado.erro);
      else toast.success("Configuração salva");
    });
  }

  return (
    <Card>
      <CardContent>
        <CampoFormulario
          id={idCampo}
          rotulo={rotulo}
          ajuda={descricao ?? undefined}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-40">
              <Input
                id={idCampo}
                type="number"
                inputMode="decimal"
                min={min}
                max={max}
                step="0.01"
                value={texto}
                onChange={(evento) => setTexto(evento.target.value)}
                disabled={!podeEditar || pendente}
                className="pr-8 text-right tabular-nums"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-detalhe text-muted-foreground">
                %
              </span>
            </div>
            <BotaoSalvar
              mudou={mudou}
              pendente={pendente}
              podeEditar={podeEditar}
              onSalvar={salvar}
            />
          </div>
        </CampoFormulario>
      </CardContent>
    </Card>
  );
}

interface CartaoBooleanoProps {
  chave: string;
  rotulo: string;
  descricao: string | null;
  valorInicial: boolean;
  podeEditar: boolean;
}

function CartaoBooleano({
  chave,
  rotulo,
  descricao,
  valorInicial,
  podeEditar,
}: CartaoBooleanoProps) {
  const [ativo, setAtivo] = React.useState(valorInicial);
  const [valorBase, setValorBase] = React.useState(valorInicial);
  const [pendente, startTransition] = React.useTransition();

  // Reinicia o controle quando o valor salvo muda no servidor (revalidatePath).
  if (valorBase !== valorInicial) {
    setValorBase(valorInicial);
    setAtivo(valorInicial);
  }

  const mudou = ativo !== valorInicial;
  const idCampo = `config-${chave}`;

  function salvar() {
    startTransition(async () => {
      const resultado = await salvarConfiguracao(chave, ativo);
      if (resultado?.erro) toast.error(resultado.erro);
      else toast.success("Configuração salva");
    });
  }

  return (
    <Card>
      <CardContent>
        <CampoFormulario
          id={idCampo}
          rotulo={rotulo}
          ajuda={descricao ?? undefined}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id={idCampo}
                checked={ativo}
                onCheckedChange={setAtivo}
                disabled={!podeEditar || pendente}
              />
              <span className="text-detalhe text-muted-foreground">
                {ativo ? "Ativado" : "Desativado"}
              </span>
            </div>
            <BotaoSalvar
              mudou={mudou}
              pendente={pendente}
              podeEditar={podeEditar}
              onSalvar={salvar}
            />
          </div>
        </CampoFormulario>
      </CardContent>
    </Card>
  );
}

function CartaoDesconhecido({
  chave,
  descricao,
  valor,
}: {
  chave: string;
  descricao: string | null;
  valor: Json;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="codigo-doc">{chave}</CardTitle>
        <CardDescription>
          {descricao ?? "Configuração sem editor nesta versão"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="codigo-doc max-h-40 overflow-auto rounded-md border border-border bg-surface p-3 whitespace-pre-wrap">
          {JSON.stringify(valor, null, 2)}
        </pre>
        <p className="mt-2 text-legenda text-muted-foreground">
          Somente leitura
        </p>
      </CardContent>
    </Card>
  );
}

export function ConfiguracoesForm({
  configuracoes,
  podeEditar,
}: ConfiguracoesFormProps) {
  return (
    // Coluna única e não grade: cada configuração é uma linha "o que é" à
    // esquerda e "como muda" à direita, que só funciona se a linha for larga.
    // Em duas colunas o rótulo colaria no controle e a última linha ficaria com
    // um buraco. A largura sobe de 42rem para 56rem, que enche a tela sem
    // esticar o campo: acima disso o Salvar fica longe demais do controle.
    <div className={cn(classesFormulario, "max-w-4xl")}>
      {configuracoes.map((configuracao) => {
        // Chave legada da folha gerencial: os encargos agora vêm de
        // folha_encargos, então esta config não dirige mais nada. Escondida
        // para não confundir (o valor não tinha efeito).
        if (configuracao.chave === "encargos_estimados_percentual") return null;

        const definicao = DEFINICOES[configuracao.chave];

        if (definicao?.tipo === "percentual") {
          const valorNumero =
            typeof configuracao.valor === "number" ? configuracao.valor : 0;
          return (
            <CartaoPercentual
              key={configuracao.chave}
              chave={configuracao.chave}
              rotulo={definicao.rotulo}
              descricao={configuracao.descricao}
              valorInicial={valorNumero}
              min={definicao.min}
              max={definicao.max}
              podeEditar={podeEditar}
            />
          );
        }

        if (definicao?.tipo === "opcao") {
          const valorTexto =
            typeof configuracao.valor === "string"
              ? configuracao.valor
              : definicao.padrao;
          return (
            <CartaoOpcao
              key={configuracao.chave}
              chave={configuracao.chave}
              rotulo={definicao.rotulo}
              descricao={configuracao.descricao}
              valorInicial={valorTexto}
              opcoes={definicao.opcoes}
              podeEditar={podeEditar}
            />
          );
        }

        if (definicao?.tipo === "booleano") {
          return (
            <CartaoBooleano
              key={configuracao.chave}
              chave={configuracao.chave}
              rotulo={definicao.rotulo}
              descricao={configuracao.descricao}
              valorInicial={configuracao.valor === true}
              podeEditar={podeEditar}
            />
          );
        }

        return (
          <CartaoDesconhecido
            key={configuracao.chave}
            chave={configuracao.chave}
            descricao={configuracao.descricao}
            valor={configuracao.valor}
          />
        );
      })}
    </div>
  );
}
