"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCheck, CircleCheck } from "lucide-react";

import { CelulaVazia, ConfirmDialog, DataTable, FormDrawer, InputQuantidade } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { numeroExibicao } from "@/modules/medicao/planilha/formato";
import {
  glosaDoItem,
  medidaParaCampo,
  resumirAprovacao,
  type LinhaAprovacao,
  type ResumoAprovacao,
} from "@/modules/medicao/medicoes/aprovacao";
import { aprovarMedicao } from "@/modules/medicao/medicoes/ciclo-actions";

export interface AprovarDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  medicaoId: string;
  /** "REV01": a revisão enviada que vai ser aprovada. */
  revisaoRotulo: string;
  /** Itens congelados da revisão enviada, com a medida (texto do banco). */
  linhas: LinhaAprovacao[];
  onAprovado?: () => void;
}

function nomeItem(l: LinhaAprovacao): string {
  return [l.codigo, l.descricao].filter(Boolean).join(" · ") || "Item sem código";
}

function comUnidade(quantidade: string, unidade: string | null): string {
  const n = numeroExibicao(quantidade);
  return unidade ? `${n} ${unidade}` : n;
}

/** O que está na tabela do drawer: a linha mais o valor digitado e o erro do campo. */
interface LinhaTela extends LinhaAprovacao {
  valor: string;
  erro?: string;
}

/**
 * Aprovação da revisão enviada (Fase 5, Task 4). Cada item mostra a medida congelada no envio e o
 * campo da quantidade aprovada; "Aprovar tudo como medido" preenche cada campo com a medida e, se
 * ninguém mexer depois, a aprovação vai como `tudoComoMedido` (a RPC usa a medida congelada). A
 * glosa da tela é só exibição (medida menos aprovada, exata): quem grava e recalcula é o banco.
 *
 * Antes de confirmar, o diálogo lista os itens que vão com aprovada 0 (campo vazio ou zero) e a
 * glosa de cada item. O confirmar fica desabilitado enquanto aprova; se mesmo assim chegarem dois
 * pedidos, a RPC trava a medição e recusa o segundo pelo status. A recusa do banco aparece no toast
 * e o drawer continua aberto com o que foi digitado.
 */
export function AprovarDrawer({ aberto, onAbertoChange, medicaoId, revisaoRotulo, linhas, onAprovado }: AprovarDrawerProps) {
  const [valores, setValores] = React.useState<Record<string, string>>({});
  const [tudoComoMedido, setTudoComoMedido] = React.useState(false);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [resumo, setResumo] = React.useState<ResumoAprovacao | null>(null);

  // Cada abertura começa limpa (ajuste de estado no render, sem efeito: padrão do React para
  // "resetar quando a prop muda").
  const [abertoAntes, setAbertoAntes] = React.useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setValores({});
      setTudoComoMedido(false);
      setErros({});
      setResumo(null);
    }
  }

  const mudarValor = React.useCallback((itemId: string, valor: string) => {
    setValores((v) => ({ ...v, [itemId]: valor }));
    setTudoComoMedido(false);
    setErros((e) => {
      if (!(itemId in e)) return e;
      const resto = { ...e };
      delete resto[itemId];
      return resto;
    });
  }, []);

  function aprovarTudo() {
    setValores(Object.fromEntries(linhas.map((l) => [l.itemId, medidaParaCampo(l.medida)])));
    setTudoComoMedido(true);
    setErros({});
  }

  function revisar() {
    const r = resumirAprovacao(linhas, valores);
    if (Object.keys(r.erros).length > 0) {
      setErros(r.erros);
      return;
    }
    setResumo(r);
  }

  async function confirmar() {
    // Quantidades cruas (o servidor converte); campo vazio vai como "0".
    const itens = tudoComoMedido ? [] : linhas.map((l) => ({ itemId: l.itemId, quantidade: (valores[l.itemId] ?? "").trim() || "0" }));
    const resultado = await aprovarMedicao({ id: medicaoId, itens, tudoComoMedido });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`${revisaoRotulo} aprovada`);
    onAbertoChange(false);
    onAprovado?.();
  }

  const dados: LinhaTela[] = React.useMemo(
    () => linhas.map((l) => ({ ...l, valor: valores[l.itemId] ?? "", erro: erros[l.itemId] })),
    [linhas, valores, erros],
  );

  const colunas = React.useMemo<ColumnDef<LinhaTela, unknown>[]>(
    () => [
      {
        accessorKey: "codigo",
        header: "Código",
        size: 100,
        meta: { fixa: true, atomico: true },
        cell: ({ row }) => (row.original.codigo ? <span className="font-mono">{row.original.codigo}</span> : <CelulaVazia />),
      },
      {
        accessorKey: "descricao",
        header: "Descrição",
        size: 260,
        cell: ({ row }) => row.original.descricao ?? <CelulaVazia />,
      },
      {
        accessorKey: "unidade",
        header: "Unid.",
        size: 70,
        meta: { atomico: true },
        cell: ({ row }) => row.original.unidade ?? <CelulaVazia />,
      },
      {
        accessorKey: "medida",
        header: "Medida",
        size: 120,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <span className="tabular-nums">{numeroExibicao(row.original.medida)}</span>,
      },
      {
        id: "aprovada",
        header: "Aprovada",
        size: 150,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <InputQuantidade
              ariaLabel={`Aprovada do item ${row.original.codigo ?? row.original.itemId}`}
              valor={row.original.valor}
              onValorChange={(v) => mudarValor(row.original.itemId, v)}
              placeholder="0"
            />
            {row.original.erro ? (
              <span role="alert" className="text-legenda text-destructive">
                {row.original.erro}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "glosa",
        header: "Glosa",
        size: 110,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => {
          const g = glosaDoItem(row.original.medida, row.original.valor);
          return g === null ? <CelulaVazia /> : <span className="tabular-nums">{numeroExibicao(g)}</span>;
        },
      },
    ],
    [mudarValor],
  );

  const conteudoAviso = resumo ? (
    <div className="flex flex-col gap-3 text-detalhe">
      {resumo.zerados.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-medium">Vão com aprovada 0</span>
          <ul aria-label="Itens que vão com aprovada 0" className="list-disc pl-5">
            {resumo.zerados.map((l) => (
              <li key={l.itemId}>{`${nomeItem(l)} (medida ${comUnidade(l.medida, l.unidade)})`}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {resumo.glosas.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-medium">Glosa por item (quantidade)</span>
          <ul aria-label="Glosa por item" className="list-disc pl-5">
            {resumo.glosas.map(({ linha, glosa }) => (
              <li key={linha.itemId}>{`${nomeItem(linha)}: ${comUnidade(glosa, linha.unidade)}`}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  ) : null;

  const semGlosa = resumo !== null && resumo.glosas.length === 0;
  const descricaoAviso =
    tudoComoMedido || semGlosa
      ? "Todos os itens vão com a quantidade medida, sem glosa. O banco grava a aprovada e recalcula o valor."
      : "Confira os itens abaixo. O banco grava a aprovada de cada item e recalcula a glosa e o valor.";

  return (
    <>
      <FormDrawer
        aberto={aberto}
        onAbertoChange={onAbertoChange}
        titulo={`Aprovar a ${revisaoRotulo}`}
        descricao="Quantidade aprovada por item. Campo vazio vai como 0; a glosa é a medida menos a aprovada"
        temAlteracoesNaoSalvas={Object.values(valores).some((v) => v.trim() !== "")}
        larguraClassName="sm:max-w-[95vw] xl:max-w-6xl"
        rodape={
          <>
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={revisar} disabled={linhas.length === 0}>
              <CircleCheck />
              Revisar e aprovar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <Button type="button" variant="outline" size="sm" onClick={aprovarTudo} disabled={linhas.length === 0}>
              <CheckCheck />
              Aprovar tudo como medido
            </Button>
          </div>
          <DataTable columns={colunas} data={dados} idDaLinha={(l) => l.itemId} />
        </div>
      </FormDrawer>

      <ConfirmDialog
        aberto={resumo !== null}
        onAbertoChange={(a) => {
          if (!a) setResumo(null);
        }}
        titulo={`Confirmar a aprovação da ${revisaoRotulo}`}
        descricao={descricaoAviso}
        conteudo={conteudoAviso}
        textoConfirmar={`Aprovar ${revisaoRotulo}`}
        onConfirmar={confirmar}
      />
    </>
  );
}

export interface BotaoAprovarProps {
  medicaoId: string;
  revisaoRotulo: string;
  linhas: LinhaAprovacao[];
}

/** Botão do cabeçalho do detalhe que abre o drawer de aprovação; atualiza a tela ao aprovar. */
export function BotaoAprovar({ medicaoId, revisaoRotulo, linhas }: BotaoAprovarProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <CircleCheck />
        {`Aprovar ${revisaoRotulo}`}
      </Button>
      <AprovarDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        medicaoId={medicaoId}
        revisaoRotulo={revisaoRotulo}
        linhas={linhas}
        onAprovado={() => semDerrubarSucesso("medicao.medicoes.aprovar", () => router.refresh())}
      />
    </>
  );
}
