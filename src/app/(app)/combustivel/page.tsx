import { notFound, redirect } from "next/navigation";

import { EmptyState, GradeKpis, KPICard, MoneyText, PageHeader, SecaoDetalhe } from "@/components/canonicos";
import { dataHojeISO, formatarMesAno, mesHojeISO } from "@/lib/formatadores";
import { abasVisiveis, getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { ROTA_ANOMALIAS } from "@/modules/combustivel/anomalias/links";
import { carregarAnomalias, listarSemSuprimento } from "@/modules/combustivel/anomalias/queries";
import { FiltroMesPainel } from "@/modules/combustivel/painel/components/filtro-mes-painel";
import { carregarPainel } from "@/modules/combustivel/painel/queries";
import { mesValido, ultimosDias } from "@/modules/combustivel/relatorios/periodo";

/**
 * A contagem de anomalias roda a detecção inteira dos últimos 90 dias (e dos 90
 * antes deles), página por página: passa do teto padrão da Vercel com folga.
 */
export const maxDuration = 60;

function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
}

const CELULA = "px-3 py-2";
const CABECALHO = "px-3 py-2 font-medium";

/**
 * Visão geral do Combustível. Sem permissão de vê-la, a rota do módulo cai na
 * primeira aba que a pessoa pode ver (mesmo padrão de /manutencao).
 */
export default async function VisaoGeralCombustivel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "combustivel.painel", "ver")) {
    const primeiraAba = abasVisiveis(usuario, "combustivel").find((aba) => aba.rota !== "/combustivel");
    if (!primeiraAba) notFound();
    redirect(primeiraAba.rota);
  }

  const params = await searchParams;
  const mesUrl = mesValido(Array.isArray(params.mes) ? params.mes[0] : params.mes);
  const mes = mesUrl ?? mesHojeISO();
  const veAnomalias = temPermissao(usuario, "combustivel.anomalias", "ver");

  const [painel, anomalias, semSuprimento] = await Promise.all([
    carregarPainel(mes),
    carregarAnomalias(ultimosDias(dataHojeISO(), 90)),
    listarSemSuprimento(),
  ]);
  const { resumo } = painel;
  const semSuprimentoPendentes = semSuprimento.filter((linha) => linha.revisao === null).length;
  const rotuloMes = formatarMesAno(`${mes}-01`);

  return (
    <>
      <PageHeader
        modulo="Combustível"
        titulo="Visão geral"
        descricao="Consumo e custo do mês, nível dos tanques e o que precisa de conferência"
      />

      <FiltroMesPainel mes={mes} escolhido={mesUrl !== null} />

      <GradeKpis className="my-4">
        <KPICard
          titulo={`Litros em ${rotuloMes}`}
          valor={formatarLitros(resumo.litros)}
          detalhe={plural(resumo.abastecimentos, "abastecimento", "abastecimentos")}
        />
        <KPICard
          titulo={`Custo em ${rotuloMes}`}
          valor={<MoneyText valor={resumo.custo} />}
          detalhe="Abastecimentos de equipamento próprio"
        />
        <KPICard
          titulo="Anomalias pendentes"
          valor={<span className="tabular-nums">{anomalias.pendentes}</span>}
          detalhe="Nos últimos 90 dias"
          href={veAnomalias ? ROTA_ANOMALIAS : undefined}
        />
        <KPICard
          titulo="Sem suprimento"
          valor={<span className="tabular-nums">{semSuprimentoPendentes}</span>}
          detalhe="Saídas ainda não revisadas"
          href={veAnomalias ? ROTA_ANOMALIAS : undefined}
        />
      </GradeKpis>

      <div className="grid gap-4 lg:grid-cols-2">
        <SecaoDetalhe card titulo="Litros por combustível">
          {painel.porCombustivel.length === 0 ? (
            <EmptyState
              titulo={`Nenhum abastecimento em ${rotuloMes}`}
              descricao="Escolha outro mês ou lance um abastecimento"
              className="border-none bg-transparent"
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-detalhe">
                <thead>
                  <tr className="border-b border-border text-legenda text-muted-foreground">
                    <th className={`${CABECALHO} text-left`}>Combustível</th>
                    <th className={`${CABECALHO} text-right`}>Abastecimentos</th>
                    <th className={`${CABECALHO} text-right`}>Litros</th>
                    <th className={`${CABECALHO} text-right`}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {painel.porCombustivel.map((linha) => (
                    <tr key={linha.id} className="border-b border-border last:border-0">
                      <td className={`${CELULA} font-medium`}>{linha.nome}</td>
                      <td className={`${CELULA} text-right tabular-nums`}>{linha.abastecimentos}</td>
                      <td className={`${CELULA} text-right tabular-nums`}>{formatarLitros(linha.litros)}</td>
                      <td className={`${CELULA} text-right`}>
                        <MoneyText valor={linha.valor} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SecaoDetalhe>

        <SecaoDetalhe card titulo="Tanques">
          {painel.tanques.length === 0 ? (
            <EmptyState
              titulo="Nenhum tanque ativo da EMT"
              descricao="Cadastre um tanque para acompanhar o nível"
              className="border-none bg-transparent"
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-detalhe">
                <thead>
                  <tr className="border-b border-border text-legenda text-muted-foreground">
                    <th className={`${CABECALHO} text-left`}>Tanque</th>
                    <th className={`${CABECALHO} text-left`}>Combustível</th>
                    <th className={`${CABECALHO} text-right`}>Nível</th>
                    <th className={`${CABECALHO} text-right`}>Capacidade</th>
                    <th className={`${CABECALHO} text-right`}>Ocupação</th>
                  </tr>
                </thead>
                <tbody>
                  {painel.tanques.map((tanque) => (
                    <tr key={tanque.id} className="border-b border-border last:border-0">
                      <td className={`${CELULA} font-medium`}>{tanque.nome}</td>
                      <td className={CELULA}>{tanque.combustivel ?? <span className="text-muted-foreground">Vazio</span>}</td>
                      <td className={`${CELULA} text-right tabular-nums`}>{formatarLitros(tanque.nivel)}</td>
                      <td className={`${CELULA} text-right tabular-nums`}>{formatarLitros(tanque.capacidade)}</td>
                      <td className={`${CELULA} text-right tabular-nums`}>
                        {tanque.percentual === null
                          ? "Sem capacidade"
                          : `${tanque.percentual.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SecaoDetalhe>
      </div>

      <div className="mt-4">
        <SecaoDetalhe card titulo={`Equipamentos que mais consumiram em ${rotuloMes}`}>
          {painel.maioresConsumidores.length === 0 ? (
            <EmptyState
              titulo="Nenhum abastecimento de equipamento no mês"
              descricao="O ranking aparece quando houver abastecimento de equipamento próprio"
              className="border-none bg-transparent"
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-detalhe">
                <thead>
                  <tr className="border-b border-border text-legenda text-muted-foreground">
                    <th className={`${CABECALHO} w-10 text-center`}>#</th>
                    <th className={`${CABECALHO} text-left`}>Equipamento</th>
                    <th className={`${CABECALHO} text-right`}>Abastecimentos</th>
                    <th className={`${CABECALHO} text-right`}>Litros</th>
                    <th className={`${CABECALHO} text-right`}>Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {painel.maioresConsumidores.map((linha, indice) => (
                    <tr key={linha.id} className="border-b border-border last:border-0">
                      <td className={`${CELULA} text-center tabular-nums text-muted-foreground`}>{indice + 1}</td>
                      <td className={`${CELULA} font-medium`}>{linha.nome}</td>
                      <td className={`${CELULA} text-right tabular-nums`}>{linha.abastecimentos}</td>
                      <td className={`${CELULA} text-right tabular-nums`}>{formatarLitros(linha.litros)}</td>
                      <td className={`${CELULA} text-right`}>
                        <MoneyText valor={linha.valor} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SecaoDetalhe>
      </div>
    </>
  );
}
