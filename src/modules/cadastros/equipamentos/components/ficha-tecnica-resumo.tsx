import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import type { FichaTecnica } from "@/modules/cadastros/equipamentos/ficha-tecnica";
import type { ControlePor } from "@/modules/cadastros/equipamentos/schemas";

/**
 * Resumo só de leitura da ficha técnica: mostra apenas o que foi preenchido,
 * em blocos curtos que cabem na tela do celular.
 *
 * Sem busca de dado e sem estado: quem usa passa a ficha. Sem "use client",
 * então serve tanto no drawer quanto numa página de servidor.
 */

interface Item {
  rotulo: string;
  valor: string;
}

interface Grupo {
  titulo: string;
  itens: Item[];
}

function litros(numero: number | null): string | null {
  return numero === null ? null : `${formatarQuantidade(numero)} L`;
}

/** "15 L, 15W40", ou só uma das partes quando a outra falta. */
function oleo(capacidade: number | null, tipo: string | null): string | null {
  const partes = [litros(capacidade), tipo?.trim() || null].filter(
    (parte): parte is string => parte !== null,
  );
  return partes.length === 0 ? null : partes.join(", ");
}

/** "295/80R22.5 (6 un.)", ou só uma das partes. */
function comQuantidade(texto: string | null, quantidade: number | null): string | null {
  const descricao = texto?.trim() || null;
  const qtd = quantidade === null ? null : `${quantidade} un.`;
  if (descricao && qtd) return `${descricao} (${qtd})`;
  return descricao ?? qtd;
}

function unidadeMedicao(controlePor: ControlePor | undefined): string {
  if (controlePor === "km") return " km";
  if (controlePor === "horimetro") return " h";
  return "";
}

function item(rotulo: string, valor: string | null): Item | null {
  return valor === null || valor === "" ? null : { rotulo, valor };
}

function grupo(titulo: string, itens: (Item | null)[]): Grupo {
  return { titulo, itens: itens.filter((i): i is Item => i !== null) };
}

export interface FichaTecnicaResumoProps {
  ficha: FichaTecnica;
  /** Unidade da medição de fim da garantia (h ou km). Sem ela, só o número. */
  controlePor?: ControlePor;
  className?: string;
}

export function FichaTecnicaResumo({
  ficha,
  controlePor,
  className,
}: FichaTecnicaResumoProps) {
  const grupos = [
    grupo("Combustível e fluidos", [
      item("Tanque de combustível", litros(ficha.capacidadeTanqueL)),
      item("Óleo do motor", oleo(ficha.capacidadeOleoMotorL, ficha.tipoOleoMotor)),
      item(
        "Óleo hidráulico",
        oleo(ficha.capacidadeOleoHidraulicoL, ficha.tipoOleoHidraulico),
      ),
      item(
        "Óleo da transmissão",
        oleo(ficha.capacidadeOleoTransmissaoL, ficha.tipoOleoTransmissao),
      ),
      item("Óleo do diferencial", litros(ficha.capacidadeOleoDiferencialL)),
      item("Arrefecedor", litros(ficha.capacidadeArrefecedorL)),
    ]),
    grupo("Pneus e bateria", [
      item("Pneus", comQuantidade(ficha.pneuMedida, ficha.pneuQtd)),
      item("Bateria", comQuantidade(ficha.bateriaEspecificacao, ficha.bateriaQtd)),
    ]),
    grupo(
      "Filtros",
      ficha.filtros.map((filtro) =>
        item(filtro.tipo.trim() || "Filtro", filtro.codigo.trim() || null),
      ),
    ),
    grupo("Consumo esperado", [
      item(
        "Por hora",
        ficha.consumoEsperadoLH === null
          ? null
          : `${formatarQuantidade(ficha.consumoEsperadoLH)} L/h`,
      ),
      item(
        "Por km",
        ficha.consumoEsperadoKmL === null
          ? null
          : `${formatarQuantidade(ficha.consumoEsperadoKmL)} km/L`,
      ),
    ]),
    grupo("Garantia", [
      item("Até a data", ficha.garantiaFimData ? formatarData(ficha.garantiaFimData) : null),
      item(
        "Até a medição",
        ficha.garantiaFimMedicao === null
          ? null
          : `${formatarQuantidade(ficha.garantiaFimMedicao)}${unidadeMedicao(controlePor)}`,
      ),
    ]),
  ].filter((g) => g.itens.length > 0);

  const observacoes = ficha.observacoesTecnicas?.trim() || null;

  if (grupos.length === 0 && !observacoes) {
    return (
      <p className={cn("text-detalhe text-muted-foreground", className)}>
        Ficha técnica não preenchida
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {grupos.map((g) => (
        <section key={g.titulo} className="flex flex-col gap-1.5">
          <h4 className="text-legenda font-semibold uppercase tracking-wide text-muted-foreground">
            {g.titulo}
          </h4>
          <dl className="flex flex-col divide-y divide-border rounded-md border border-border">
            {g.itens.map((i, indice) => (
              <div
                key={`${i.rotulo}-${indice}`}
                className="flex items-baseline justify-between gap-3 px-3 py-2"
              >
                <dt className="text-detalhe text-muted-foreground">{i.rotulo}</dt>
                <dd className="text-right text-detalhe font-medium tabular-nums break-words">
                  {i.valor}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {observacoes ? (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-legenda font-semibold uppercase tracking-wide text-muted-foreground">
            Observações técnicas
          </h4>
          <p className="whitespace-pre-line rounded-md border border-border px-3 py-2 text-detalhe">
            {observacoes}
          </p>
        </section>
      ) : null}
    </div>
  );
}
