"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarOff, Pencil, Plus, Trash2 } from "lucide-react";

import { Combobox, ConfirmDialog, DataTable, EmptyState, SecaoDetalhe } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/formatadores";
import { excluirFeriado } from "@/modules/execucao/modelos/actions";
import { FeriadoDrawer } from "@/modules/execucao/modelos/components/feriado-drawer";
import type { Feriado } from "@/modules/execucao/modelos/queries";

function diaDaSemana(data: string): string {
  return new Date(`${data}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
}

export function rotuloAbrangencia(f: Feriado): string {
  if (f.abrangencia === "nacional") return "Nacional";
  if (f.abrangencia === "AC") return "Acre";
  return f.municipio ? `Municipal: ${f.municipio}` : "Municipal";
}

const colunas: ColumnDef<Feriado, unknown>[] = [
  {
    id: "data",
    header: "Data",
    size: 160,
    meta: { atomico: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarData(row.original.data)} <span className="text-muted-foreground">{diaDaSemana(row.original.data)}</span>
      </span>
    ),
  },
  { accessorKey: "nome", header: "Nome", size: 280 },
  { id: "abrangencia", header: "Abrangência", size: 220, cell: ({ row }) => rotuloAbrangencia(row.original) },
];

export interface FeriadosTabelaProps {
  /** Todos os anos, em ordem de data; o filtro por ano é daqui. */
  feriados: Feriado[];
  /** Ano corrente (padrão do filtro), vindo do servidor. */
  anoAtual: number;
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

export function FeriadosTabela({ feriados, anoAtual, podeCriar, podeEditar, podeExcluir }: FeriadosTabelaProps) {
  const router = useRouter();
  const [ano, setAno] = React.useState(String(anoAtual));
  const [aberto, setAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<Feriado | null>(null);
  const [excluindo, setExcluindo] = React.useState<Feriado | null>(null);

  const anos = React.useMemo(() => {
    const conjunto = new Set<number>([anoAtual, ...feriados.map((f) => Number(f.data.slice(0, 4)))]);
    return [...conjunto].sort((a, b) => a - b);
  }, [feriados, anoAtual]);
  const opcoesAno = anos.map((a) => ({ valor: String(a), rotulo: String(a) }));
  const doAno = React.useMemo(() => feriados.filter((f) => f.data.startsWith(`${ano}-`)), [feriados, ano]);

  async function confirmarExclusao() {
    if (!excluindo) return false;
    const r = await excluirFeriado(excluindo.id);
    if ("erro" in r) {
      toast.error(r.erro);
      return false;
    }
    toast.success("Feriado excluído");
    setExcluindo(null);
    semDerrubarSucesso("execucao.modelos.excluirFeriado.refresh", () => router.refresh());
  }

  const botaoNovo = podeCriar ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        setEmEdicao(null);
        setAberto(true);
      }}
    >
      <Plus />
      Novo feriado
    </Button>
  ) : undefined;

  return (
    <SecaoDetalhe
      titulo="Feriados"
      acao={
        <div className="flex items-center gap-2">
          <div className="w-28">
            <Combobox id="feriados-ano" valor={ano} onValorChange={(v) => v && setAno(v)} opcoes={opcoesAno} />
          </div>
          {botaoNovo}
        </div>
      }
    >
      <p className="mb-3 text-detalhe text-muted-foreground">
        Feriado vale para todos os cronogramas cujo calendário usa essa abrangência, e as datas são recalculadas ao salvar. Para trabalhar num feriado em
        um cronograma só, use uma exceção no calendário dele com as horas do dia.
      </p>
      <DataTable<Feriado>
        columns={colunas}
        data={doAno}
        idDaLinha={(f) => f.id}
        acoesLinha={
          podeEditar || podeExcluir
            ? (f) => (
                <>
                  {podeEditar ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        setEmEdicao(f);
                        setAberto(true);
                      }}
                    >
                      <Pencil />
                      Editar
                    </DropdownMenuItem>
                  ) : null}
                  {podeExcluir ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(f)}>
                      <Trash2 />
                      Excluir
                    </DropdownMenuItem>
                  ) : null}
                </>
              )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={CalendarOff}
            titulo={`Nenhum feriado em ${ano}`}
            descricao="Cadastre os feriados que valem para os calendários"
            acao={botaoNovo}
            className="border-none bg-transparent"
          />
        }
      />
      <FeriadoDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        feriado={emEdicao}
        onSalvo={() => semDerrubarSucesso("execucao.modelos.feriado.refresh", () => router.refresh())}
      />
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(a) => {
          if (!a) setExcluindo(null);
        }}
        titulo="Excluir feriado"
        descricao={excluindo ? `${formatarData(excluindo.data)} - ${excluindo.nome} deixa de valer e as datas dos cronogramas são recalculadas.` : ""}
        textoConfirmar="Excluir"
        variante="destrutivo"
        onConfirmar={confirmarExclusao}
      />
    </SecaoDetalhe>
  );
}
