"use client";

import * as React from "react";
import { toast } from "sonner";

import { CampoFormulario, classesFormulario } from "@/components/canonicos";
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
import type { Configuracao } from "@/modules/administracao/configuracoes/queries";

interface ConfiguracoesFormProps {
  configuracoes: Configuracao[];
  podeEditar: boolean;
}

type DefinicaoConfig =
  | { rotulo: string; tipo: "percentual"; min: number; max: number }
  | { rotulo: string; tipo: "booleano" };

const DEFINICOES: Record<string, DefinicaoConfig> = {
  tolerancia_divergencia_nf_percentual: {
    rotulo: "Tolerância de divergência NF x OC (%)",
    tipo: "percentual",
    min: 0,
    max: 100,
  },
  encargos_estimados_percentual: {
    rotulo: "Encargos estimados sobre salário (%)",
    tipo: "percentual",
    min: 0,
    max: 300,
  },
  banco_horas_ativo: {
    rotulo: "Banco de horas",
    tipo: "booleano",
  },
};

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
            <Button
              type="button"
              size="sm"
              onClick={salvar}
              disabled={!podeEditar || !mudou || pendente}
            >
              {pendente ? "Salvando" : "Salvar"}
            </Button>
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
            <Button
              type="button"
              size="sm"
              onClick={salvar}
              disabled={!podeEditar || !mudou || pendente}
            >
              {pendente ? "Salvando" : "Salvar"}
            </Button>
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
    <div className={cn(classesFormulario, "max-w-2xl")}>
      {configuracoes.map((configuracao) => {
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
