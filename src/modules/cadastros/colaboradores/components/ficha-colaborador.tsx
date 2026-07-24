import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { MoneyText, PageHeader, StatusBadge } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { SecaoDetalhe } from "@/modules/compras/_shared/secao-detalhe";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { ROTULO_VINCULO, ROTULO_TIPO_CONTA } from "@/modules/cadastros/colaboradores/schemas";
import type { ColaboradorFicha } from "@/modules/cadastros/colaboradores/ficha";
import type {
  FichaAdiantamentos,
  FichaDiarias,
  FichaDocumentos,
  FichaEpis,
  FichaFerias,
  FichaOcorrencias,
  FichaPonto,
} from "@/modules/cadastros/colaboradores/ficha";
import { ROTULO_TIPO_DOCUMENTO } from "@/modules/rh/documentos/schemas";
import { ROTULO_STATUS_FERIAS } from "@/modules/rh/ferias/schemas";
import { ROTULO_TIPO_OCORRENCIA } from "@/modules/rh/ocorrencias/schemas";
import { ROTULO_TIPO_APONTAMENTO, STATUS_PONTO } from "@/modules/rh/_shared/formato";

export interface FichaColaboradorProps {
  colaborador: ColaboradorFicha;
  ponto: FichaPonto | null;
  ferias: FichaFerias | null;
  documentos: FichaDocumentos | null;
  epis: FichaEpis | null;
  ocorrencias: FichaOcorrencias | null;
  adiantamentos: FichaAdiantamentos | null;
  diarias: FichaDiarias | null;
}

/** Linha rotulada para os dados do cabeçalho. */
function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

/** Texto exibido quando o bloco não tem nenhum registro. */
function SemRegistros({ texto }: { texto: string }) {
  return <p className="text-detalhe text-muted-foreground">{texto}</p>;
}

/** Botão "Ver tudo" padrão de cada bloco da ficha, como ação da seção. */
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

const SITUACAO_FERIAS_BADGE: Record<
  FichaFerias["itens"][number]["situacao"],
  { status: "rejeitado" | "pendente_aprovacao" | "aprovado"; rotulo: string }
> = {
  vencida: { status: "rejeitado", rotulo: "Vencida" },
  a_vencer: { status: "pendente_aprovacao", rotulo: "A vencer" },
  ok: { status: "aprovado", rotulo: "Em dia" },
  gozada: { status: "aprovado", rotulo: "Gozada" },
};

const SITUACAO_DOCUMENTO_BADGE: Record<
  FichaDocumentos["itens"][number]["situacao"],
  { status: "rejeitado" | "pendente_aprovacao" | "aprovado"; rotulo: string } | null
> = {
  vencido: { status: "rejeitado", rotulo: "Vencido" },
  a_vencer: { status: "pendente_aprovacao", rotulo: "A vencer" },
  ok: { status: "aprovado", rotulo: "Em dia" },
  sem_vencimento: null,
};

/**
 * Ficha unificada do colaborador (#13): cabeçalho com os dados cadastrais e um
 * card por fonte de RH (ponto, férias, documentos, EPI, ocorrências,
 * adiantamentos, diárias), cada um com o resumo mais recente e um link "ver
 * tudo" para a aba correspondente. Read-only: nenhuma ação de lançamento mora
 * aqui, só nas abas do RH. Cada card só chega ao componente (não-nulo) quando
 * o Server Component já confirmou que o usuário tem "ver" no recurso — por
 * isso a permissão nunca aparece explicitamente aqui, ela já filtrou os props.
 *
 * Cabeçalho e cards usam os canônicos `PageHeader` e `SecaoDetalhe` (variante
 * card, a mesma dos detalhes de Compras) em vez de reimplementar o container.
 * Como o `PageHeader` só comporta título/descrição/ações (strings simples),
 * o badge ativo/inativo e o botão de voltar vão nas ações; os metadados
 * cadastrais (CPF, banco etc.) ficam num `SecaoDetalhe` próprio, como já era.
 */
export function FichaColaborador({
  colaborador,
  ponto,
  ferias,
  documentos,
  epis,
  ocorrencias,
  adiantamentos,
  diarias,
}: FichaColaboradorProps) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo={colaborador.nome}
        descricao={`${colaborador.funcao ?? "Sem função cadastrada"} · ${ROTULO_VINCULO[colaborador.vinculo]}${colaborador.obraNome ? ` · ${colaborador.obraNome}` : ""}`}
        acoes={
          <>
            {colaborador.ativo ? (
              <StatusBadge status="aprovado" rotulo="Ativo" />
            ) : (
              <StatusBadge status="rascunho" rotulo="Inativo" />
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/cadastros/colaboradores">
                <ArrowLeft />
                Voltar
              </Link>
            </Button>
          </>
        }
      />

      <SecaoDetalhe titulo="Dados cadastrais" card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Dado rotulo="CPF">{colaborador.cpf ?? "-"}</Dado>
          <Dado rotulo="Telefone">{colaborador.telefone ?? "-"}</Dado>
          <Dado rotulo="Admissão">
            {colaborador.dataAdmissao ? formatarData(colaborador.dataAdmissao) : "-"}
          </Dado>
          <Dado rotulo="Centro de custo">{colaborador.centroCustoNome ?? "-"}</Dado>
          <Dado rotulo="Salário">
            {colaborador.salario !== null ? (
              <MoneyText valor={colaborador.salario} />
            ) : (
              "-"
            )}
          </Dado>
          <Dado rotulo="Valor da diária">
            {colaborador.valorDiaria !== null ? (
              <MoneyText valor={colaborador.valorDiaria} />
            ) : (
              "-"
            )}
          </Dado>
          <Dado rotulo="Banco">
            {colaborador.banco ?? "-"}
            {colaborador.agencia ? ` · Ag. ${colaborador.agencia}` : ""}
          </Dado>
          <Dado rotulo="Conta">
            {colaborador.conta ?? "-"}
            {colaborador.tipoConta ? ` (${ROTULO_TIPO_CONTA[colaborador.tipoConta]})` : ""}
          </Dado>
          <Dado rotulo="Chave PIX">{colaborador.chavePix ?? "-"}</Dado>
        </div>
      </SecaoDetalhe>

      <div className="grid gap-4 lg:grid-cols-2">
        {ponto ? (
          <SecaoDetalhe titulo="Ponto e apontamentos" card acao={<VerTudo href="/rh/apontamentos" />}>
            {ponto.itens.length === 0 ? (
              <SemRegistros texto="Nenhum apontamento registrado." />
            ) : (
              <ul className="flex flex-col gap-2">
                {ponto.itens.map((item) => (
                  <li
                    key={`${item.pontoId}-${item.tipo}`}
                    className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="text-detalhe tabular-nums">{formatarData(item.data)}</p>
                      <p className="text-legenda text-muted-foreground">
                        {item.obraNome} · {ROTULO_TIPO_APONTAMENTO[item.tipo]}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-detalhe tabular-nums">
                        {formatarQuantidade(item.horasNormais + item.horasExtras)} h
                      </span>
                      <StatusBadge
                        status={STATUS_PONTO[item.status].badge}
                        rotulo={STATUS_PONTO[item.status].rotulo}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-legenda text-muted-foreground">
              {ponto.totalRegistros}{" "}
              {ponto.totalRegistros === 1 ? "apontamento no total" : "apontamentos no total"}
            </p>
          </SecaoDetalhe>
        ) : null}

        {ferias ? (
          <SecaoDetalhe titulo="Férias" card acao={<VerTudo href="/rh/ferias" />}>
            {ferias.itens.length === 0 ? (
              <SemRegistros texto="Nenhum período de férias cadastrado." />
            ) : (
              <ul className="flex flex-col gap-2">
                {ferias.itens.map((item) => {
                  const badge = SITUACAO_FERIAS_BADGE[item.situacao];
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="text-detalhe tabular-nums">
                          {formatarData(item.periodoAquisitivoInicio)} a{" "}
                          {formatarData(item.periodoAquisitivoFim)}
                        </p>
                        <p className="text-legenda text-muted-foreground">
                          {ROTULO_STATUS_FERIAS[item.status]} · {item.dias} dias
                        </p>
                      </div>
                      <StatusBadge status={badge.status} rotulo={badge.rotulo} />
                    </li>
                  );
                })}
              </ul>
            )}
            {ferias.vencidas > 0 || ferias.aVencer > 0 ? (
              <p className="mt-3 text-legenda text-muted-foreground">
                {ferias.vencidas > 0 ? `${ferias.vencidas} vencida(s)` : null}
                {ferias.vencidas > 0 && ferias.aVencer > 0 ? " · " : null}
                {ferias.aVencer > 0 ? `${ferias.aVencer} a vencer` : null}
              </p>
            ) : null}
          </SecaoDetalhe>
        ) : null}

        {documentos ? (
          <SecaoDetalhe titulo="Documentos e ASO" card acao={<VerTudo href="/rh/documentos" />}>
            {documentos.itens.length === 0 ? (
              <SemRegistros texto="Nenhum documento cadastrado." />
            ) : (
              <ul className="flex flex-col gap-2">
                {documentos.itens.map((item) => {
                  const badge = SITUACAO_DOCUMENTO_BADGE[item.situacao];
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="text-detalhe">
                          {ROTULO_TIPO_DOCUMENTO[item.tipo]} · {item.descricao}
                        </p>
                        <p className="text-legenda text-muted-foreground tabular-nums">
                          {item.dataVencimento
                            ? `Vence em ${formatarData(item.dataVencimento)}`
                            : "Sem vencimento"}
                        </p>
                      </div>
                      {badge ? (
                        <StatusBadge status={badge.status} rotulo={badge.rotulo} />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {documentos.vencidos > 0 || documentos.aVencer > 0 ? (
              <p className="mt-3 text-legenda text-muted-foreground">
                {documentos.vencidos > 0 ? `${documentos.vencidos} vencido(s)` : null}
                {documentos.vencidos > 0 && documentos.aVencer > 0 ? " · " : null}
                {documentos.aVencer > 0 ? `${documentos.aVencer} a vencer` : null}
              </p>
            ) : null}
          </SecaoDetalhe>
        ) : null}

        {epis ? (
          <SecaoDetalhe titulo="EPI" card acao={<VerTudo href="/rh/epis" />}>
            {epis.itens.length === 0 ? (
              <SemRegistros texto="Nenhum EPI entregue." />
            ) : (
              <ul className="flex flex-col gap-2">
                {epis.itens.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="text-detalhe">
                        {item.descricao}
                        {item.ca ? ` · CA ${item.ca}` : ""}
                      </p>
                      <p className="text-legenda text-muted-foreground tabular-nums">
                        Entregue em {formatarData(item.dataEntrega)} · Qtd. {item.quantidade}
                      </p>
                    </div>
                    {item.dataDevolucao ? (
                      <StatusBadge status="aprovado" rotulo="Devolvido" />
                    ) : (
                      <StatusBadge status="pendente_aprovacao" rotulo="Em uso" />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {epis.pendentesDevolucao > 0 ? (
              <p className="mt-3 text-legenda text-muted-foreground">
                {epis.pendentesDevolucao} pendente(s) de devolução
              </p>
            ) : null}
          </SecaoDetalhe>
        ) : null}

        {ocorrencias ? (
          <SecaoDetalhe titulo="Ausências e ocorrências" card acao={<VerTudo href="/rh/ocorrencias" />}>
            {ocorrencias.itens.length === 0 ? (
              <SemRegistros texto="Nenhuma ocorrência registrada." />
            ) : (
              <ul className="flex flex-col gap-2">
                {ocorrencias.itens.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="text-detalhe tabular-nums">{formatarData(item.data)}</p>
                      <p className="text-legenda text-muted-foreground">{item.descricao}</p>
                    </div>
                    <StatusBadge status="rascunho" rotulo={ROTULO_TIPO_OCORRENCIA[item.tipo]} />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-legenda text-muted-foreground">
              {ocorrencias.totalRegistros}{" "}
              {ocorrencias.totalRegistros === 1 ? "ocorrência no total" : "ocorrências no total"}
            </p>
          </SecaoDetalhe>
        ) : null}

        {adiantamentos ? (
          <SecaoDetalhe titulo="Adiantamentos" card acao={<VerTudo href="/rh/adiantamentos" />}>
            {adiantamentos.itens.length === 0 ? (
              <SemRegistros texto="Nenhum adiantamento registrado." />
            ) : (
              <ul className="flex flex-col gap-2">
                {adiantamentos.itens.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="text-detalhe tabular-nums">{formatarData(item.data)}</p>
                      <p className="text-legenda text-muted-foreground">
                        {item.naFolha ? "Já entrou na folha" : "Em aberto"}
                      </p>
                    </div>
                    <MoneyText valor={item.valor} />
                  </li>
                ))}
              </ul>
            )}
            {adiantamentos.qtdEmAberto > 0 ? (
              <p className="mt-3 flex items-center justify-between text-legenda text-muted-foreground">
                <span>{adiantamentos.qtdEmAberto} em aberto</span>
                <MoneyText valor={adiantamentos.totalEmAberto} />
              </p>
            ) : null}
          </SecaoDetalhe>
        ) : null}

        {diarias ? (
          <SecaoDetalhe titulo="Diárias" card acao={<VerTudo href="/rh/diaristas" />}>
            {diarias.itens.length === 0 ? (
              <SemRegistros texto="Nenhuma diária registrada." />
            ) : (
              <ul className="flex flex-col gap-2">
                {diarias.itens.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="text-detalhe tabular-nums">{formatarData(item.data)}</p>
                      <p className="text-legenda text-muted-foreground">
                        {item.obraNome ?? "-"} · {item.fechada ? "Fechada" : "Em aberto"}
                      </p>
                    </div>
                    <MoneyText valor={item.valor} />
                  </li>
                ))}
              </ul>
            )}
            {diarias.qtdEmAberto > 0 ? (
              <p className="mt-3 flex items-center justify-between text-legenda text-muted-foreground">
                <span>{diarias.qtdEmAberto} em aberto</span>
                <MoneyText valor={diarias.totalEmAberto} />
              </p>
            ) : null}
          </SecaoDetalhe>
        ) : null}
      </div>
    </div>
  );
}
