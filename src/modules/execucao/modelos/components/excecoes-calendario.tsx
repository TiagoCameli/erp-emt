"use client";

import * as React from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";

import { CampoFormulario, Combobox, InputHoras } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { excluirExcecao, salvarExcecao } from "@/modules/execucao/modelos/actions";
import type { Excecao } from "@/modules/execucao/modelos/queries";
import { excecaoSchema } from "@/modules/execucao/modelos/schemas";

const ROTULO_TIPO: Record<Excecao["tipo"], string> = { feriado: "Feriado", paralisacao: "Paralisação", extra: "Dia extra" };
const OPCOES_TIPO = (Object.keys(ROTULO_TIPO) as Excecao["tipo"][]).map((t) => ({ valor: t, rotulo: ROTULO_TIPO[t] }));

export interface ExcecoesCalendarioProps {
  calendarioId: string;
  excecoes: Excecao[];
  podeEditar: boolean;
  /** Depois de salvar ou excluir: quem chama atualiza a lista. */
  onAlterado?: () => void;
}

/** Exceções de um calendário salvo: lista (com as herdadas do pai em leitura) e formulário em linha. */
export function ExcecoesCalendario({ calendarioId, excecoes, podeEditar, onAlterado }: ExcecoesCalendarioProps) {
  const [data, setData] = React.useState("");
  const [horas, setHoras] = React.useState("");
  const [tipo, setTipo] = React.useState<Excecao["tipo"]>("paralisacao");
  const [descricao, setDescricao] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [ocupado, setOcupado] = React.useState(false);

  async function adicionar() {
    setErro(null);
    const v = excecaoSchema.safeParse({ data, horas, tipo, descricao });
    if (!v.success) {
      setErro(v.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setOcupado(true);
    try {
      const r = await salvarExcecao(calendarioId, { data, horas, tipo, descricao });
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      toast.success("Exceção salva");
      setData("");
      setHoras("");
      setDescricao("");
      onAlterado?.();
    } finally {
      setOcupado(false);
    }
  }

  async function remover(e: Excecao) {
    setOcupado(true);
    try {
      const r = await excluirExcecao(calendarioId, e.data);
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      toast.success("Exceção excluída");
      onAlterado?.();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Exceções do calendário">
      <h3 className="text-corpo font-semibold">Exceções</h3>
      <p className="text-detalhe text-muted-foreground">
        Dia que foge da semana padrão: feriado trabalhado, paralisação ou dia extra. A exceção vale mais que o feriado e que a semana.
      </p>
      {excecoes.length === 0 ? (
        <p className="text-detalhe text-muted-foreground">Nenhuma exceção neste calendário.</p>
      ) : (
        <table className="w-full text-detalhe">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Data</th>
              <th className="py-1 pr-2 text-right font-medium">Horas</th>
              <th className="py-1 pr-2 font-medium">Tipo</th>
              <th className="py-1 pr-2 font-medium">Descrição</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {excecoes.map((e) => (
              <tr key={`${e.herdada ? "h" : "p"}-${e.data}`} className="border-t">
                <td className="py-1.5 pr-2 tabular-nums">{formatarData(e.data)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatarQuantidade(e.horas)}</td>
                <td className="py-1.5 pr-2">{ROTULO_TIPO[e.tipo] ?? e.tipo}</td>
                <td className="py-1.5 pr-2">
                  {e.descricao}
                  {e.herdada ? <span className="block text-muted-foreground">vem do calendário {e.origemNome ?? "modelo"}</span> : null}
                </td>
                <td className="py-1.5 text-right">
                  {podeEditar && !e.herdada ? (
                    <Button type="button" size="icon" variant="ghost" aria-label={`Excluir exceção de ${formatarData(e.data)}`} disabled={ocupado} onClick={() => remover(e)}>
                      <Trash2 />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {podeEditar ? (
        <div className="flex flex-col gap-3 rounded-md border p-3" role="group" aria-label="Nova exceção">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <CampoFormulario id="excecao-data" rotulo="Data" obrigatorio>
              <Input id="excecao-data" type="date" value={data} onChange={(ev) => setData(ev.target.value)} disabled={ocupado} />
            </CampoFormulario>
            <CampoFormulario id="excecao-horas" rotulo="Horas" obrigatorio>
              <InputHoras id="excecao-horas" valor={horas} onValorChange={setHoras} disabled={ocupado} />
            </CampoFormulario>
            <CampoFormulario id="excecao-tipo" rotulo="Tipo" obrigatorio>
              <Combobox id="excecao-tipo" valor={tipo} onValorChange={(v) => setTipo(v as Excecao["tipo"])} opcoes={OPCOES_TIPO} disabled={ocupado} />
            </CampoFormulario>
          </div>
          <CampoFormulario id="excecao-descricao" rotulo="Descrição" obrigatorio>
            <Input id="excecao-descricao" value={descricao} onChange={(ev) => setDescricao(ev.target.value)} disabled={ocupado} />
          </CampoFormulario>
          {erro ? (
            <p role="alert" className="text-detalhe text-destructive">
              {erro}
            </p>
          ) : null}
          <div>
            <Button type="button" size="sm" variant="outline" onClick={adicionar} disabled={ocupado}>
              {ocupado ? <LoaderCircle className="animate-spin" /> : <Plus />}
              Nova exceção
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
