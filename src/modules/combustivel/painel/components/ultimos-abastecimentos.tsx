import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { MoneyText } from "@/components/canonicos";
import type { Modo } from "@/modules/combustivel/anomalias/base";
import { linkDaSaida } from "@/modules/combustivel/anomalias/links";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import type { SaidaRecente } from "@/modules/combustivel/painel/queries";

/** "AAAA-MM-DDTHH:MM" (relógio de parede) -> "dd/mm/aaaa HH:mm", sem fuso. */
export function dataHoraDeParede(data: string): string {
  const dia = `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
  const hora = data.slice(11, 16);
  return hora.length === 5 ? `${dia} ${hora}` : dia;
}

/** Iniciais (até 2) para o avatar do operador, como a origem. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return `${partes[0]![0]}${partes[partes.length - 1]![0]}`.toUpperCase();
}

function precoPorLitro(saida: SaidaRecente): string {
  if (!(saida.litros > 0)) return "Sem litros";
  const valor = saida.valorTotal / saida.litros;
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

const TH = "px-3 py-2.5 font-semibold";

function Operador({ nome }: { nome: string | null }) {
  if (!nome) return <span className="text-legenda italic text-muted-foreground">Sem operador</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
        {iniciais(nome)}
      </span>
      <span className="text-legenda text-foreground">{nome}</span>
    </span>
  );
}

/**
 * A UltimosAbastecimentosTable da origem: as 10 saídas mais recentes do recorte, colunas
 * conforme o modo, e "Ver todos (N)" levando à aba Saídas com o mesmo recorte.
 */
export function UltimosAbastecimentos({
  modo,
  saidas,
  total,
  hrefVerTodos,
}: {
  modo: Modo;
  saidas: SaidaRecente[];
  /** Saídas no recorte (o N do "Ver todos"). */
  total: number;
  hrefVerTodos: string;
}) {
  if (saidas.length === 0) return null;
  const todasVisiveis = saidas.length === total;
  const proprios = modo === "proprios";

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            {todasVisiveis ? "Abastecimentos no período" : "Últimos abastecimentos"}
          </h3>
          <p className="mt-0.5 text-detalhe text-muted-foreground">
            {todasVisiveis ? `Todos os abastecimentos no período (${total})` : `${saidas.length} mais recentes no período`}
          </p>
        </div>
        {!todasVisiveis ? (
          <Link href={hrefVerTodos} className="inline-flex items-center gap-1 text-legenda font-medium text-primary hover:underline">
            Ver todos ({total}) <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-detalhe">
          <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className={`${TH} whitespace-nowrap pl-4 text-left`}>Data/hora</th>
              {proprios ? (
                <>
                  <th className={`${TH} text-left`}>Equipamento</th>
                  <th className={`${TH} text-left`}>Operador</th>
                </>
              ) : (
                <>
                  <th className={`${TH} text-left`}>Placa</th>
                  <th className={`${TH} text-left`}>Motorista</th>
                  <th className={`${TH} text-left`}>Transportadora</th>
                </>
              )}
              <th className={`${TH} text-left`}>Combustível</th>
              <th className={`${TH} whitespace-nowrap text-right`}>Litros</th>
              <th className={`${TH} whitespace-nowrap text-right`}>R$/L</th>
              <th className={`${TH} whitespace-nowrap pr-4 text-right`}>Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {saidas.map((s) => (
              <tr key={s.id} className="transition-colors hover:bg-muted/40">
                <td className="whitespace-nowrap px-3 py-2.5 pl-4 text-legenda text-muted-foreground">
                  <Link href={linkDaSaida(s.id)} className="hover:text-foreground hover:underline">
                    {dataHoraDeParede(s.data)}
                  </Link>
                </td>
                {proprios ? (
                  <>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground">{s.consumidor ?? "Equipamento não encontrado"}</div>
                      {s.codigo ? <div className="font-mono text-[10px] text-muted-foreground">{s.codigo}</div> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <Operador nome={s.operador} />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2.5 font-mono font-semibold text-foreground">
                      {s.consumidor ?? <span className="font-sans font-normal italic text-muted-foreground">Sem placa</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Operador nome={s.operador} />
                    </td>
                    <td className="px-3 py-2.5 text-legenda text-muted-foreground">
                      {s.transportadora ?? <span className="italic">Sem transportadora</span>}
                    </td>
                  </>
                )}
                <td className="px-3 py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: `color-mix(in srgb, ${s.corCombustivel} 14%, transparent)`, color: s.corCombustivel }}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: s.corCombustivel }} />
                    {s.combustivel}
                  </span>
                  {s.obra ? <div className="mt-0.5 text-[10px] text-muted-foreground">{s.obra}</div> : null}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatarLitros(s.litros)}</td>
                <td className="px-3 py-2.5 text-right text-legenda tabular-nums text-muted-foreground">{precoPorLitro(s)}</td>
                <td className="px-3 py-2.5 pr-4 text-right font-semibold">
                  <MoneyText valor={s.valorTotal} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
