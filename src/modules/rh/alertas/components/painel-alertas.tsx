import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

import {
  EmptyState,
  GradeKpis,
  KPICard,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatadores";
import { contarPorUrgencia, corKpi, type ContagemUrgencia } from "@/modules/rh/alertas/calculo";
import type {
  AlertaAdiantamento,
  AlertaCadastro,
  AlertaDocumento,
  AlertaEpi,
  AlertaFerias,
} from "@/modules/rh/alertas/queries";
import { SecaoDetalhe } from "@/modules/compras/_shared/secao-detalhe";
import { ROTULO_TIPO_DOCUMENTO, type TipoDocumento } from "@/modules/rh/documentos/schemas";

/**
 * Painel de alertas de RH (Task 3): recebe as 4 listas já filtradas por
 * permissão pelo Server Component da rota (`page.tsx`). Uma lista `null`
 * significa que o usuário não tem "ver" no recurso de origem — a categoria
 * inteira (KPI + seção) simplesmente não é renderizada, sem checar
 * permissão aqui de novo (a UI só reage ao que já chegou filtrado).
 * Read-only: cada linha é só um `Link` para a aba/registro de origem.
 */
export interface PainelAlertasProps {
  documentos: AlertaDocumento[] | null;
  ferias: AlertaFerias[] | null;
  epis: AlertaEpi[] | null;
  cadastros: AlertaCadastro[] | null;
  /**
   * Colaborador inativo com saldo de adiantamento em aberto. Exige as duas
   * permissões que a leitura precisa (`rh.adiantamentos:ver` E
   * `cadastros.colaboradores:ver`) — ver `listarAlertasAdiantamentoInativo`.
   */
  adiantamentos: AlertaAdiantamento[] | null;
}

/** Quantos itens mais urgentes aparecem por seção antes do "ver tudo". */
const LIMITE_ITENS = 5;

const CLASSE_COR_KPI: Record<"critico" | "aviso" | "neutro", string> = {
  critico: "text-status-rejeitado",
  aviso: "text-status-pendente",
  neutro: "",
};

/** Texto de apoio do KPICard: contagem por urgência, ou "Sem alertas" quando zero. */
function detalheContagem(
  contagem: ContagemUrgencia,
  rotuloCritico: string,
  rotuloAviso?: string,
): string {
  if (contagem.total === 0) return "Sem alertas";

  const partes: string[] = [];
  if (contagem.critico > 0) partes.push(`${contagem.critico} ${rotuloCritico}`);
  if (rotuloAviso && contagem.aviso > 0) partes.push(`${contagem.aviso} ${rotuloAviso}`);
  return partes.join(" · ");
}

/** Botão "Ver tudo" padrão de cada seção, como na ficha do colaborador. */
function VerTudo({ href }: { href: string }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={href}>
        Ver tudo
        <ArrowRight />
      </Link>
    </Button>
  );
}

/** Texto exibido quando a categoria não tem nenhum alerta no momento. */
function SemAlertas({ texto }: { texto: string }) {
  return <p className="text-detalhe text-muted-foreground">{texto}</p>;
}

/** Nota "mostrando N de M" quando a lista foi cortada em `LIMITE_ITENS`. */
function NotaMostrando({ total }: { total: number }) {
  if (total <= LIMITE_ITENS) return null;
  return (
    <p className="mt-3 text-legenda text-muted-foreground">
      Mostrando {LIMITE_ITENS} de {total}
    </p>
  );
}

/** Linha clicável padrão das seções: leva para a aba/registro de origem. */
function LinhaAlerta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li className="border-b border-border pb-2 last:border-0 last:pb-0">
      <Link
        href={href}
        className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors hover:bg-surface"
      >
        {children}
      </Link>
    </li>
  );
}

export function PainelAlertas({
  documentos,
  ferias,
  epis,
  cadastros,
  adiantamentos,
}: PainelAlertasProps) {
  const contagemDocumentos = documentos
    ? contarPorUrgencia(documentos.map((d) => d.urgencia))
    : null;
  const contagemFerias = ferias ? contarPorUrgencia(ferias.map((f) => f.urgencia)) : null;
  const contagemEpis = epis ? contarPorUrgencia(epis.map(() => "critico" as const)) : null;
  const contagemCadastros = cadastros
    ? contarPorUrgencia(cadastros.map(() => "critico" as const))
    : null;
  const contagemAdiantamentos = adiantamentos
    ? contarPorUrgencia(adiantamentos.map(() => "critico" as const))
    : null;

  const totalGeral =
    (contagemDocumentos?.total ?? 0) +
    (contagemFerias?.total ?? 0) +
    (contagemEpis?.total ?? 0) +
    (contagemCadastros?.total ?? 0) +
    (contagemAdiantamentos?.total ?? 0);

  return (
    <div className="flex flex-col gap-4">
      {totalGeral === 0 ? (
        <EmptyState
          icone={CheckCircle2}
          titulo="Nenhum alerta de RH no momento"
          descricao="Nenhuma categoria que você acompanha tem pendência agora."
        />
      ) : (
        <>
          {/* Grade canônica: a quantidade de cartões varia com a permissão de
              cada categoria, e num grid fixo quem via só uma ficava com a linha
              vazia do lado. */}
          <GradeKpis>
            {contagemDocumentos ? (
              <KPICard
                titulo="Documentos"
                valor={
                  <span className={CLASSE_COR_KPI[corKpi(contagemDocumentos)]}>
                    {contagemDocumentos.total}
                  </span>
                }
                detalhe={detalheContagem(contagemDocumentos, "vencido(s)", "a vencer")}
                href="/rh/documentos"
              />
            ) : null}

            {contagemFerias ? (
              <KPICard
                titulo="Férias"
                valor={
                  <span className={CLASSE_COR_KPI[corKpi(contagemFerias)]}>
                    {contagemFerias.total}
                  </span>
                }
                detalhe={detalheContagem(contagemFerias, "vencida(s)", "a vencer")}
                href="/rh/ferias"
              />
            ) : null}

            {contagemEpis ? (
              <KPICard
                titulo="EPI a recolher"
                valor={
                  <span className={CLASSE_COR_KPI[corKpi(contagemEpis)]}>
                    {contagemEpis.total}
                  </span>
                }
                detalhe={detalheContagem(contagemEpis, "a recolher")}
                href="/rh/epis"
              />
            ) : null}

            {contagemCadastros ? (
              <KPICard
                titulo="Cadastro incompleto"
                valor={
                  <span className={CLASSE_COR_KPI[corKpi(contagemCadastros)]}>
                    {contagemCadastros.total}
                  </span>
                }
                detalhe={detalheContagem(contagemCadastros, "incompleto(s)")}
                href="/cadastros/colaboradores"
              />
            ) : null}

            {contagemAdiantamentos ? (
              <KPICard
                titulo="Adiantamento de inativo"
                valor={
                  <span className={CLASSE_COR_KPI[corKpi(contagemAdiantamentos)]}>
                    {contagemAdiantamentos.total}
                  </span>
                }
                detalhe={detalheContagem(contagemAdiantamentos, "com saldo")}
                href="/rh/adiantamentos"
              />
            ) : null}
          </GradeKpis>

          <div className="grid gap-4 lg:grid-cols-2">
            {documentos ? (
              <SecaoDetalhe
                titulo="Documentos e ASO"
                card
                acao={<VerTudo href="/rh/documentos" />}
              >
                {documentos.length === 0 ? (
                  <SemAlertas texto="Nenhum documento vencendo." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {documentos.slice(0, LIMITE_ITENS).map((item) => (
                      <LinhaAlerta key={item.id} href="/rh/documentos">
                        <div>
                          <p className="text-detalhe">{item.colaboradorNome}</p>
                          <p className="text-legenda text-muted-foreground tabular-nums">
                            {ROTULO_TIPO_DOCUMENTO[item.tipo as TipoDocumento]} ·{" "}
                            {item.descricao}
                            {item.dataVencimento
                              ? ` · Vence em ${formatarData(item.dataVencimento)}`
                              : ""}
                          </p>
                        </div>
                        <StatusBadge
                          status={item.situacao === "vencido" ? "rejeitado" : "pendente_aprovacao"}
                          rotulo={item.situacao === "vencido" ? "Vencido" : "A vencer"}
                        />
                      </LinhaAlerta>
                    ))}
                  </ul>
                )}
                <NotaMostrando total={documentos.length} />
              </SecaoDetalhe>
            ) : null}

            {ferias ? (
              <SecaoDetalhe titulo="Férias" card acao={<VerTudo href="/rh/ferias" />}>
                {ferias.length === 0 ? (
                  <SemAlertas texto="Nenhuma férias vencendo." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {ferias.slice(0, LIMITE_ITENS).map((item) => (
                      <LinhaAlerta key={item.id} href="/rh/ferias">
                        <div>
                          <p className="text-detalhe">{item.colaboradorNome}</p>
                          <p className="text-legenda text-muted-foreground tabular-nums">
                            Limite de gozo: {formatarData(item.limiteGozo)}
                          </p>
                        </div>
                        <StatusBadge
                          status={item.situacao === "vencida" ? "rejeitado" : "pendente_aprovacao"}
                          rotulo={item.situacao === "vencida" ? "Vencida" : "A vencer"}
                        />
                      </LinhaAlerta>
                    ))}
                  </ul>
                )}
                <NotaMostrando total={ferias.length} />
              </SecaoDetalhe>
            ) : null}

            {epis ? (
              <SecaoDetalhe titulo="EPI a recolher" card acao={<VerTudo href="/rh/epis" />}>
                {epis.length === 0 ? (
                  <SemAlertas texto="Nenhum EPI a recolher." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {epis.slice(0, LIMITE_ITENS).map((item) => (
                      <LinhaAlerta key={item.id} href="/rh/epis">
                        <div>
                          <p className="text-detalhe">{item.colaboradorNome}</p>
                          <p className="text-legenda text-muted-foreground tabular-nums">
                            {item.descricao}
                            {item.ca ? ` · CA ${item.ca}` : ""} · Entregue em{" "}
                            {formatarData(item.dataEntrega)}
                          </p>
                        </div>
                        <StatusBadge status="rejeitado" rotulo="Recolher" />
                      </LinhaAlerta>
                    ))}
                  </ul>
                )}
                <NotaMostrando total={epis.length} />
              </SecaoDetalhe>
            ) : null}

            {cadastros ? (
              <SecaoDetalhe
                titulo="Cadastro incompleto"
                card
                acao={<VerTudo href="/cadastros/colaboradores" />}
              >
                {cadastros.length === 0 ? (
                  <SemAlertas texto="Nenhum cadastro incompleto." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {cadastros.slice(0, LIMITE_ITENS).map((item) => (
                      <LinhaAlerta
                        key={item.colaboradorId}
                        href={`/cadastros/colaboradores/${item.colaboradorId}`}
                      >
                        <p className="text-detalhe">{item.colaboradorNome}</p>
                        <div className="flex items-center gap-2">
                          {item.semSalario ? (
                            <StatusBadge status="rejeitado" rotulo="Sem salário" />
                          ) : null}
                          {item.semBanco ? (
                            <StatusBadge status="rejeitado" rotulo="Sem banco" />
                          ) : null}
                        </div>
                      </LinhaAlerta>
                    ))}
                  </ul>
                )}
                <NotaMostrando total={cadastros.length} />
              </SecaoDetalhe>
            ) : null}

            {adiantamentos ? (
              <SecaoDetalhe
                titulo="Adiantamento de inativo"
                card
                acao={<VerTudo href="/rh/adiantamentos" />}
              >
                {adiantamentos.length === 0 ? (
                  <SemAlertas texto="Nenhum colaborador inativo com saldo em aberto." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {adiantamentos.slice(0, LIMITE_ITENS).map((item) => (
                      <LinhaAlerta
                        key={item.colaboradorId}
                        href="/rh/adiantamentos"
                      >
                        <div>
                          <p className="text-detalhe">{item.colaboradorNome}</p>
                          <p className="text-legenda text-muted-foreground">
                            Colaborador inativo
                          </p>
                        </div>
                        <MoneyText valor={item.saldo} className="font-medium" />
                      </LinhaAlerta>
                    ))}
                  </ul>
                )}
                <NotaMostrando total={adiantamentos.length} />
              </SecaoDetalhe>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
