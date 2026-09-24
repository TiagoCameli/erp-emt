import type { HeatmapDiaHora as DadosHeatmap } from "@/modules/combustivel/painel/calculo";

import { CartaoGrafico, GraficoVazio } from "./cartao-grafico";

const DIA_DA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
/** Segunda primeiro, domingo por último, como na origem. */
const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const HORAS = Array.from({ length: 24 }, (_, h) => h);

/** Intensidade -> cor: o verde da marca misturado ao fundo do cartão (a escala da origem). */
function corDaCelula(quantidade: number, maximo: number): string {
  if (quantidade <= 0 || maximo <= 0) return "var(--color-muted)";
  const peso = 0.18 + (quantidade / maximo) * 0.82;
  return `color-mix(in srgb, var(--color-emt-verde) ${Math.round(peso * 100)}%, var(--color-card))`;
}

/**
 * O DiaHoraHeatmap da origem: saídas por dia da semana × hora, em tabela HTML (a origem
 * também não usava Recharts aqui), com a legenda "Menos … Mais".
 */
export function HeatmapDiaHora({ dados }: { dados: DadosHeatmap }) {
  return (
    <CartaoGrafico titulo="Padrão semanal" subtitulo="Saídas por dia da semana × hora">
      {dados.maximo === 0 ? (
        <GraficoVazio />
      ) : (
        <div className="h-full w-full overflow-x-auto">
          <table className="w-full border-separate border-spacing-0.5 text-[10px]">
            <thead>
              <tr>
                <th aria-label="Dia da semana" className="w-10" />
                {HORAS.map((h) => (
                  <th key={h} className="pb-1 text-center font-normal text-muted-foreground" style={{ minWidth: 12 }}>
                    {h % 3 === 0 ? h : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ORDEM.map((dia) => (
                <tr key={dia}>
                  <td className="pr-2 text-right text-muted-foreground">{DIA_DA_SEMANA[dia]}</td>
                  {HORAS.map((h) => {
                    const quantidade = dados.matriz[dia]?.[h] ?? 0;
                    const texto = `${DIA_DA_SEMANA[dia]} ${String(h).padStart(2, "0")}:00: ${quantidade} saída${quantidade !== 1 ? "s" : ""}`;
                    return (
                      <td
                        key={h}
                        title={texto}
                        aria-label={texto}
                        className="rounded-[3px]"
                        style={{ background: corDaCelula(quantidade, dados.maximo), height: 18, minWidth: 12 }}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex items-center justify-end gap-2 px-2 text-[10px] text-muted-foreground">
            <span>Menos</span>
            <span className="flex gap-0.5">
              {[0.2, 0.4, 0.6, 0.8, 1].map((a) => (
                <span
                  key={a}
                  className="size-3 rounded-[3px]"
                  style={{ background: `color-mix(in srgb, var(--color-emt-verde) ${Math.round(a * 100)}%, var(--color-card))` }}
                />
              ))}
            </span>
            <span>Mais</span>
          </div>
        </div>
      )}
    </CartaoGrafico>
  );
}
