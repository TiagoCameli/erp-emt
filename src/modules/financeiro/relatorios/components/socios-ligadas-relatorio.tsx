import { MoneyText } from "@/components/canonicos";
import { formatarBRL } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { BarraProporcional } from "@/modules/financeiro/relatorios/components/barra-proporcional";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import { drillSocioLigada } from "@/modules/financeiro/relatorios/drill";
import {
  rotuloTipoSocioLigada,
  type CentroSocioLigada,
  type SociosLigadasRelatorio,
} from "@/modules/financeiro/relatorios/socios-ligadas";

function Cabecalho({ colunas, grade }: { colunas: string[]; grade: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "hidden items-end gap-3 border-b border-border pb-1 text-detalhe text-muted-foreground md:grid",
        grade,
      )}
    >
      {colunas.map((c, i) => (
        <span key={c} className={i < 2 ? undefined : "text-right"}>
          {c}
        </span>
      ))}
    </div>
  );
}

function Valor({ valor, rotulo, forte, alerta }: { valor: number; rotulo: string; forte?: boolean; alerta?: boolean }) {
  return (
    <span className="flex items-baseline justify-between gap-2 md:block md:text-right">
      <span className="text-detalhe text-muted-foreground md:hidden">{rotulo}</span>
      <MoneyText
        valor={valor}
        className={cn(
          "text-detalhe",
          forte && "font-semibold",
          alerta && valor > 0 ? "text-chart-2 font-medium" : "text-foreground",
        )}
      />
    </span>
  );
}

function NomeDoCentro({ linha }: { linha: CentroSocioLigada }) {
  return (
    <span className="min-w-0 truncate text-detalhe font-medium text-foreground">
      {linha.centro}
      {linha.ativo ? null : <span className="font-normal text-muted-foreground"> (inativo)</span>}
      {linha.tipo !== "empresa_ligada" ? (
        <span className="block text-detalhe font-normal text-muted-foreground">
          {rotuloTipoSocioLigada(linha.tipo)}
        </span>
      ) : null}
    </span>
  );
}

const GRADE_LIGADAS =
  "md:grid-cols-[minmax(10rem,16rem)_minmax(4rem,1fr)_8.5rem_8.5rem_9rem_8.5rem]";

function BlocoLigadas({ dados }: { dados: SociosLigadasRelatorio }) {
  const { ano, ligadas, totalLigadas } = dados;
  const maximo = Math.max(0, ...ligadas.map((l) => Math.abs(l.acumulado.saldo)));
  const saldo = totalLigadas.acumulado.saldo;

  return (
    <section aria-labelledby="ligadas-titulo" className="flex flex-col gap-3">
      <h3 id="ligadas-titulo" className="text-detalhe font-semibold uppercase tracking-wide text-foreground">
        Empresas ligadas: mútuo
      </h3>
      <p className="max-w-4xl text-corpo text-foreground">
        {saldo >= 0 ? "As empresas ligadas devem " : "A EMT deve às empresas ligadas "}
        <strong className="font-semibold tabular-nums">{formatarBRL(Math.abs(saldo))}</strong>
        {saldo >= 0 ? " à EMT" : ""}: foram{" "}
        <span className="tabular-nums">{formatarBRL(totalLigadas.acumulado.enviado)}</span> enviados e{" "}
        <span className="tabular-nums">{formatarBRL(totalLigadas.acumulado.devolvido)}</span> devolvidos desde o
        início. Em {ano}, <span className="tabular-nums">{formatarBRL(totalLigadas.ano.enviado)}</span> foram e{" "}
        <span className="tabular-nums">{formatarBRL(totalLigadas.ano.devolvido)}</span> voltaram
        {totalLigadas.acumulado.enviadoAberto > 0 ? (
          <>
            ;{" "}
            <strong className="font-semibold tabular-nums text-chart-2">
              {formatarBRL(totalLigadas.acumulado.enviadoAberto)}
            </strong>{" "}
            do enviado ainda não saiu do caixa
          </>
        ) : null}
        .
      </p>

      {ligadas.length === 0 ? (
        <p className="text-detalhe text-muted-foreground">Nenhum centro de empresa ligada cadastrado.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <Cabecalho
            grade={GRADE_LIGADAS}
            colunas={["Empresa", "", "Enviado", "Devolvido", "Saldo a receber", "Ainda a pagar"]}
          />
          <ul className="flex flex-col gap-3 md:gap-2">
            {ligadas.map((l, i) => (
              <li key={l.centroId} className={cn("grid items-center gap-x-3 gap-y-1", GRADE_LIGADAS)}>
                <span className="min-w-0">
                  <NomeDoCentro linha={l} />
                  <span className="block text-detalhe text-muted-foreground tabular-nums">
                    Em {ano}: {formatarBRL(l.ano.enviado)} foram, {formatarBRL(l.ano.devolvido)} voltaram
                  </span>
                </span>
                <BarraProporcional valor={l.acumulado.saldo} maximo={maximo} ordem={i} cor="bg-chart-1" />
                <LinkDrill
                  href={drillSocioLigada({ centroId: l.centroId, natureza: "mutuo", tipo: "a_pagar" })}
                  titulo={`Mútuo enviado para ${l.centro}`}
                  className="justify-end"
                >
                  <Valor valor={l.acumulado.enviado} rotulo="Enviado" />
                </LinkDrill>
                <LinkDrill
                  href={drillSocioLigada({ centroId: l.centroId, natureza: "mutuo", tipo: "a_receber" })}
                  titulo={`Mútuo devolvido por ${l.centro}`}
                  className="justify-end"
                >
                  <Valor valor={l.acumulado.devolvido} rotulo="Devolvido" />
                </LinkDrill>
                <Valor valor={l.acumulado.saldo} rotulo="Saldo a receber" forte />
                <Valor valor={l.acumulado.enviadoAberto} rotulo="Ainda a pagar" alerta />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Empresas ligadas: o mútuo, dinheiro que a ligada deve à EMT. A distribuição
 * aos sócios saiu dos relatórios em 19/10/2026.
 */
export function SociosLigadasRelatorioTela({ dados }: { dados: SociosLigadasRelatorio }) {
  return (
    <div className="flex flex-col gap-8">
      {dados.divergentes.length > 0 ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-detalhe text-destructive">
          O mês a mês não fechou com o total de {dados.divergentes.join(", ")}. Os números abaixo vêm do mês a mês;
          avise o suporte.
        </p>
      ) : null}
      <BlocoLigadas dados={dados} />
    </div>
  );
}
