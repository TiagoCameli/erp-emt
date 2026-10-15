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

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rotuloMes(mes: string): string {
  return MESES_CURTOS[Number(mes.slice(5, 7)) - 1] ?? mes;
}

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
      {linha.tipo !== "socio" && linha.tipo !== "empresa_ligada" ? (
        <span className="block text-detalhe font-normal text-muted-foreground">
          {rotuloTipoSocioLigada(linha.tipo)}
        </span>
      ) : null}
    </span>
  );
}

const GRADE_SOCIOS =
  "md:grid-cols-[minmax(10rem,16rem)_minmax(4rem,1fr)_8.5rem_8.5rem_8.5rem_9rem]";

function BlocoSocios({ dados }: { dados: SociosLigadasRelatorio }) {
  const { ano, socios, totalSocios, serieSocios } = dados;
  const maximo = Math.max(0, ...socios.map((s) => s.ano.enviado));
  const maximoMes = Math.max(0, ...serieSocios.map((m) => m.total));
  const nomes = new Map(socios.map((s) => [s.centroId, s.centro.replace(/^Sócio\s+/i, "")]));
  const periodoDoAno = { de: `${ano}-01`, ate: `${ano}-12` };

  return (
    <section aria-labelledby="socios-titulo" className="flex flex-col gap-3">
      <h3 id="socios-titulo" className="text-detalhe font-semibold uppercase tracking-wide text-foreground">
        Sócios: distribuição de lucro
      </h3>
      <p className="max-w-4xl text-corpo text-foreground">
        Em {ano}, os sócios retiraram{" "}
        <strong className="font-semibold tabular-nums">{formatarBRL(totalSocios.ano.enviado)}</strong>
        {totalSocios.ano.enviadoAberto > 0 ? (
          <>
            , dos quais{" "}
            <strong className="font-semibold tabular-nums text-chart-2">
              {formatarBRL(totalSocios.ano.enviadoAberto)}
            </strong>{" "}
            ainda não foram pagos
          </>
        ) : null}
        . Desde o início, foram{" "}
        <strong className="font-semibold tabular-nums">{formatarBRL(totalSocios.acumulado.enviado)}</strong>.
      </p>

      {socios.length === 0 ? (
        <p className="text-detalhe text-muted-foreground">Nenhum centro de sócio cadastrado.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <Cabecalho
            grade={GRADE_SOCIOS}
            colunas={["Sócio", "", `Retirado em ${ano}`, "Já pago", "Em aberto", "Desde o início"]}
          />
          <ul className="flex flex-col gap-3 md:gap-2">
            {socios.map((s, i) => (
              <li key={s.centroId} className={cn("grid items-center gap-x-3 gap-y-1", GRADE_SOCIOS)}>
                <LinkDrill
                  href={drillSocioLigada({
                    centroId: s.centroId,
                    natureza: "distribuicao",
                    tipo: "a_pagar",
                    periodo: periodoDoAno,
                  })}
                  titulo={`Lançamentos de distribuição de ${s.centro} em ${ano}`}
                  className="min-w-0"
                >
                  <NomeDoCentro linha={s} />
                </LinkDrill>
                <BarraProporcional valor={s.ano.enviado} maximo={maximo} ordem={i} cor="bg-chart-3" />
                <Valor valor={s.ano.enviado} rotulo={`Retirado em ${ano}`} forte />
                <Valor valor={s.ano.enviadoPago} rotulo="Já pago" />
                <Valor valor={s.ano.enviadoAberto} rotulo="Em aberto" alerta />
                <Valor valor={s.acumulado.enviado} rotulo="Desde o início" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {socios.length > 0 ? (
        <div className="flex flex-col gap-2 pt-2">
          <h4 className="text-detalhe font-medium text-foreground">Mês a mês em {ano}</h4>
          <ul className="flex flex-col gap-1.5">
            {serieSocios.map((m, i) => {
              const partes = Object.entries(m.porCentro).sort((a, b) => b[1] - a[1]);
              return (
                <li
                  key={m.mes}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)_8.5rem] items-center gap-3 md:grid-cols-[2.5rem_minmax(0,1fr)_8.5rem_minmax(0,18rem)]"
                  title={partes.map(([id, v]) => `${nomes.get(id) ?? id}: ${formatarBRL(v)}`).join(" · ")}
                >
                  <span className="text-detalhe text-muted-foreground">{rotuloMes(m.mes)}</span>
                  <BarraProporcional valor={m.total} maximo={maximoMes} ordem={i} cor="bg-chart-3" />
                  <MoneyText
                    valor={m.total}
                    className={cn("text-right text-detalhe", m.total === 0 ? "text-muted-foreground" : "text-foreground")}
                  />
                  <span className="hidden truncate text-detalhe text-muted-foreground md:block">
                    {partes.length > 1
                      ? partes.map(([id, v]) => `${nomes.get(id) ?? id} ${formatarBRL(v)}`).join(" · ")
                      : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
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
 * Sócios e empresas ligadas em dois blocos que não se somam: a distribuição é
 * dinheiro que saiu para o sócio; o mútuo é dinheiro que a ligada deve à EMT.
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
      <BlocoSocios dados={dados} />
      <BlocoLigadas dados={dados} />
    </div>
  );
}
