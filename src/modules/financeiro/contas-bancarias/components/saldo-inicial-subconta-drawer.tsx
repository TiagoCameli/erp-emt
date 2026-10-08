"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  InputMoeda,
  MoneyText,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { paraNumero } from "@/modules/compras/ordens/calculo";
import {
  carregarSaldoInicialSubconta,
  salvarSaldoInicialSubconta,
  type SaldoInicialDaAplicacao,
} from "@/modules/financeiro/contas-bancarias/actions";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";

const ID_FORM = "form-saldo-inicial-subconta";

export interface SaldoInicialSubcontaDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** A subconta de investimentos (tipo "investimento"). */
  subconta: ContaLista;
}

/** 1234.5 -> "1234,50", o formato cru do InputMoeda. */
function paraTexto(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

/** Texto do InputMoeda em centavos inteiros; vazio é zero. */
function centavosDe(texto: string): number {
  if (texto.trim() === "") return 0;
  const n = paraNumero(texto);
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
}

/**
 * Saldo inicial da subconta de investimentos, DIVIDIDO por aplicação (pedido do
 * Tiago em 07/10/2026).
 *
 * O saldo inicial da subconta não se digita: é a soma das aplicações, e quem
 * soma é o banco (trigger). Assim o total da subconta e a soma do que a aba
 * Aplicações mostra por aplicação não têm como divergir.
 *
 * As aplicações vêm de uma action ao abrir, e não da listagem: a parte de cada
 * aplicação é saldo, filtrado por `fn_pode_ver_saldo`, e a listagem de contas
 * não precisa carregar isso para todas as linhas.
 */
export function SaldoInicialSubcontaDrawer({
  aberto,
  onAbertoChange,
  subconta,
}: SaldoInicialSubcontaDrawerProps) {
  const [aplicacoes, setAplicacoes] = React.useState<SaldoInicialDaAplicacao[] | null>(null);
  const [erroCarga, setErroCarga] = React.useState<string | null>(null);
  const [data, setData] = React.useState(subconta.saldoInicialData ?? "");
  const [valores, setValores] = React.useState<Record<string, string>>({});
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  React.useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setAplicacoes(null);
    setErroCarga(null);
    setErro(null);
    setData(subconta.saldoInicialData ?? "");
    carregarSaldoInicialSubconta(subconta.id).then((resultado) => {
      if (!vivo) return;
      if ("erro" in resultado) {
        setErroCarga(resultado.erro);
        return;
      }
      setAplicacoes(resultado.aplicacoes);
      setValores(
        Object.fromEntries(
          resultado.aplicacoes.map((a) => [a.aplicacaoId, paraTexto(a.saldoInicial)]),
        ),
      );
    });
    return () => {
      vivo = false;
    };
  }, [aberto, subconta.id, subconta.saldoInicialData]);

  const centavos = (aplicacoes ?? []).map((a) => centavosDe(valores[a.aplicacaoId] ?? ""));
  const totalCentavos = centavos.reduce((s, c) => s + (Number.isNaN(c) ? 0 : c), 0);
  const alterado =
    aplicacoes !== null &&
    (data !== (subconta.saldoInicialData ?? "") ||
      aplicacoes.some((a, i) => centavos[i] !== Math.round(a.saldoInicial * 100)));

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!aplicacoes || salvando) return;
    setErro(null);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      setErro("Informe a data do extrato de onde o saldo inicial foi lido");
      return;
    }
    if (centavos.some((c) => Number.isNaN(c) || c < 0)) {
      setErro("Cada saldo precisa ser um valor maior ou igual a zero");
      return;
    }

    setSalvando(true);
    try {
      const resultado = await salvarSaldoInicialSubconta({
        subcontaId: subconta.id,
        data,
        saldos: aplicacoes.map((a, i) => ({
          aplicacaoId: a.aplicacaoId,
          valor: (centavos[i] ?? 0) / 100,
        })),
      });
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Saldo inicial salvo");
      onAbertoChange(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Saldo inicial por aplicação"
      descricao={subconta.nome}
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
          <Button
            type="submit"
            form={ID_FORM}
            disabled={salvando || !aplicacoes || aplicacoes.length === 0}
          >
            {salvando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
            Salvar saldo inicial
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={aoEnviar} className={classesFormulario}>
        {erroCarga ? (
          <p role="alert" className="text-detalhe text-status-rejeitado">
            {erroCarga}
          </p>
        ) : aplicacoes === null ? (
          <p className="flex items-center gap-2 text-detalhe text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Carregando as aplicações da subconta
          </p>
        ) : aplicacoes.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">
            Esta subconta não tem aplicação cadastrada. Cadastre a aplicação em
            Cadastros &gt; Centros de custo, no centro Investimentos, escolhendo
            esta conta, e volte aqui para dividir o saldo.
          </p>
        ) : (
          <>
            <CampoFormulario
              id="saldo-inicial-data"
              rotulo="Data do extrato"
              obrigatorio
              ajuda="O saldo de cada aplicação nesta data, inclusive. O saldo da subconta soma só o movimento posterior."
            >
              <Input
                id="saldo-inicial-data"
                type="date"
                value={data}
                onChange={(evento) => setData(evento.target.value)}
              />
            </CampoFormulario>

            {aplicacoes.map((a) => (
              <CampoFormulario
                key={a.aplicacaoId}
                id={`saldo-inicial-${a.aplicacaoId}`}
                rotulo={a.ativa ? a.nome : `${a.nome} (inativa)`}
              >
                <InputMoeda
                  id={`saldo-inicial-${a.aplicacaoId}`}
                  valor={valores[a.aplicacaoId] ?? ""}
                  onValorChange={(valor) =>
                    setValores((atual) => ({ ...atual, [a.aplicacaoId]: valor }))
                  }
                />
              </CampoFormulario>
            ))}

            <div className="flex items-center justify-between border-t border-border pt-3 text-corpo">
              <span className="font-medium">Saldo inicial da subconta</span>
              <MoneyText valor={totalCentavos / 100} className="font-semibold" />
            </div>

            {erro ? (
              <p role="alert" className="text-detalhe text-status-rejeitado">
                {erro}
              </p>
            ) : null}
          </>
        )}
      </form>
    </FormDrawer>
  );
}
