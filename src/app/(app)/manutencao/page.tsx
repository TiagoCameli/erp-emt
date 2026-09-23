import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  EmptyState,
  GradeKpis,
  KPICard,
  MoneyText,
  PageHeader,
  SecaoDetalhe,
} from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { abasVisiveis, getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { carregarPainel } from "@/modules/manutencao/painel/queries";

/** Link para o caderno com o filtro que reproduz o número do cartão. */
function linkCaderno(parametros: Record<string, string>): string {
  return `/manutencao/servicos?${new URLSearchParams(parametros).toString()}`;
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/**
 * Painel da Manutenção. Sem o painel, a rota do módulo cai na primeira aba que
 * a pessoa pode ver (mesmo padrão de /cadastros).
 */
export default async function PainelManutencao() {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "manutencao.painel", "ver")) {
    const primeiraAba = abasVisiveis(usuario, "manutencao").find((aba) => aba.rota !== "/manutencao");
    if (!primeiraAba) notFound();
    redirect(primeiraAba.rota);
  }

  const painel = await carregarPainel(dataHojeISO());
  const { janelas } = painel;
  // O cartão só vira link quando a pessoa pode abrir o caderno: link para 404 é pior que nenhum.
  const veCaderno = temPermissao(usuario, "manutencao.servicos", "ver");
  const ano = janelas.anoDe.slice(0, 4);

  return (
    <>
      <PageHeader
        modulo="Manutenção"
        titulo="Painel"
        descricao="Ordens de serviço em andamento e o custo da manutenção por data de conclusão"
      />

      <GradeKpis className="mb-4">
        <KPICard
          titulo="OS abertas"
          valor={<span className="tabular-nums">{painel.abertas}</span>}
          detalhe="Aguardando início"
          href={veCaderno ? linkCaderno({ status: "aberta" }) : undefined}
        />
        <KPICard
          titulo="OS em execução"
          valor={<span className="tabular-nums">{painel.emExecucao}</span>}
          detalhe="Serviço em andamento"
          href={veCaderno ? linkCaderno({ status: "em_execucao" }) : undefined}
        />
        <KPICard
          titulo="Equipamentos em manutenção"
          valor={<span className="tabular-nums">{painel.equipamentosEmManutencao}</span>}
          detalhe="Parados agora por OS em execução ou no cadastro"
        />
        <KPICard
          titulo="Custo do mês"
          valor={<MoneyText valor={painel.custoMes} />}
          detalhe={`${plural(painel.osConcluidasMes, "OS concluída", "OS concluídas")} no mês`}
          href={
            veCaderno
              ? linkCaderno({ status: "concluida", conclusaoDe: janelas.mesDe, conclusaoAte: janelas.mesAte })
              : undefined
          }
        />
        <KPICard
          titulo={`Custo de ${ano}`}
          valor={<MoneyText valor={painel.custoAno} />}
          detalhe={`${plural(painel.osConcluidasAno, "OS concluída", "OS concluídas")} no ano`}
          href={
            veCaderno
              ? linkCaderno({ status: "concluida", conclusaoDe: janelas.anoDe, conclusaoAte: janelas.anoAte })
              : undefined
          }
        />
      </GradeKpis>

      <SecaoDetalhe card titulo={`Maiores custos por equipamento em ${ano}`}>
        {painel.maioresCustos.length === 0 ? (
          <EmptyState
            titulo="Nenhuma OS concluída no ano"
            descricao="O ranking aparece quando houver OS concluídas com custo"
            className="border-none bg-transparent"
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-detalhe">
              <thead>
                <tr className="border-b border-border text-legenda text-muted-foreground">
                  <th className="w-10 px-3 py-2 text-center font-medium">#</th>
                  <th className="px-3 py-2 text-center font-medium">Equipamento</th>
                  <th className="px-3 py-2 text-right font-medium">OS concluídas</th>
                  <th className="px-3 py-2 text-right font-medium">Custo no ano</th>
                </tr>
              </thead>
              <tbody>
                {painel.maioresCustos.map((linha, indice) => (
                  <tr key={linha.equipamentoId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{indice + 1}</td>
                    <td className="px-3 py-2 text-center">
                      {veCaderno ? (
                        <Link
                          className="font-medium hover:underline"
                          href={linkCaderno({
                            status: "concluida",
                            equipamento: linha.equipamentoId,
                            conclusaoDe: janelas.anoDe,
                            conclusaoAte: janelas.anoAte,
                          })}
                        >
                          {linha.equipamentoNome}
                        </Link>
                      ) : (
                        <span className="font-medium">{linha.equipamentoNome}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{linha.quantidadeOs}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={linha.custo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SecaoDetalhe>
    </>
  );
}
