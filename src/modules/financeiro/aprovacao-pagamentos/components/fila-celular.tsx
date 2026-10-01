"use client";

import * as React from "react";
import Link from "next/link";
import { Check, CheckCheck, PenLine } from "lucide-react";

import { FiltroBusca, MoneyText, StatusBadge } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { rotuloParcela } from "@/modules/financeiro/_shared/formato";
import { urlTelaInteira } from "@/modules/financeiro/aprovacao-pagamentos/link-aprovacao";
import type { ParcelaPendente } from "@/modules/financeiro/aprovacao-pagamentos/queries";

/** Cards por vez. A fila inteira passa de 800 parcelas; o link, de uma dezena. */
const POR_VEZ = 20;

export interface FilaCelularProps {
  /** A fila já recortada (link) e filtrada (busca). */
  parcelas: ParcelaPendente[];
  selecionadas: Set<string>;
  onAlternar: (id: string) => void;
  podeAprovar: boolean;
  podeRevisar: boolean;
  onAprovar: (parcela: ParcelaPendente) => void;
  onRevisar: (parcela: ParcelaPendente) => void;
  onAprovarSelecionadas: () => void;
  onRevisarSelecionadas: () => void;
  /**
   * Só no link: aprova o recorte inteiro de uma vez. Fora do link não existe,
   * porque "aprovar todos" na fila inteira é autorizar centenas de pagamentos
   * com um toque.
   */
  onAprovarTodas?: () => void;
  /** Recorte do link: troca a busca pelo resumo do link. */
  link: {
    ativo: boolean;
    /** Uma frase por parcela do link que já saiu da fila. */
    avisos: { id: string; texto: string }[];
    onVerFilaInteira: () => void;
  };
  busca: { valor: string; onValorChange: (valor: string) => void };
  /** Mesmo estado vazio da tabela, para a explicação não divergir. */
  vazio: React.ReactNode;
}

function somar(parcelas: ParcelaPendente[]): number {
  return (
    parcelas.reduce(
      (total, parcela) => total + Math.round(parcela.valor * 100),
      0,
    ) / 100
  );
}

/**
 * A fila de aprovação no celular: uma lista de cards com o que decide o
 * pagamento, e nada além disso.
 *
 * É a tela de quem recebe o link no WhatsApp. No computador a fila é tabela
 * com dezessete colunas, quatro KPIs e doze filtros, e no celular isso virava
 * rolagem para o lado procurando o botão de aprovar. Aqui cada card diz quem
 * recebe, quanto, quando vence e o que é, com Aprovar e Revisar embaixo. O
 * resto (rateio, itens da OC, anexos, trilha) está a um toque, no número do
 * lançamento, que abre a tela inteira do pagamento.
 *
 * Os botões chamam os mesmos modais e as mesmas actions da tabela: o celular
 * muda a apresentação, não a regra.
 */
export function FilaCelular({
  parcelas,
  selecionadas,
  onAlternar,
  podeAprovar,
  podeRevisar,
  onAprovar,
  onRevisar,
  onAprovarSelecionadas,
  onRevisarSelecionadas,
  onAprovarTodas,
  link,
  busca,
  vazio,
}: FilaCelularProps) {
  const [limite, setLimite] = React.useState(POR_VEZ);

  const total = somar(parcelas);
  const marcadas = parcelas.filter((parcela) => selecionadas.has(parcela.id));
  const totalMarcado = somar(marcadas);
  // O link mostra tudo de uma vez: é um recorte que alguém escolheu, e o
  // "Aprovar todos" só pode alcançar card que está na tela.
  const visiveis = link.ativo ? parcelas : parcelas.slice(0, limite);

  // Barra de baixo: o que foi marcado manda; sem marca, o link oferece aprovar
  // o recorte inteiro, que é o que quem mandou o link pediu.
  const barraSelecao = marcadas.length > 0;
  const barraTodas =
    !barraSelecao &&
    link.ativo &&
    podeAprovar &&
    parcelas.length > 1 &&
    onAprovarTodas !== undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-detalhe text-foreground">
          <span className="font-semibold">
            {parcelas.length}{" "}
            {parcelas.length === 1 ? "pagamento" : "pagamentos"}
          </span>{" "}
          para aprovar
        </p>
        <p className="text-detalhe font-semibold">
          <MoneyText valor={total} />
        </p>
      </div>

      {link.ativo ? (
        <div className="flex flex-col gap-1">
          {link.avisos.map((aviso) => (
            <p key={aviso.id} className="text-legenda text-muted-foreground">
              {aviso.texto}
            </p>
          ))}
          <button
            type="button"
            onClick={link.onVerFilaInteira}
            className="self-start text-legenda text-primary underline-offset-2 hover:underline"
          >
            Ver a fila inteira
          </button>
        </div>
      ) : (
        <FiltroBusca
          valor={busca.valor}
          onValorChange={busca.onValorChange}
          placeholder="Buscar fornecedor ou lançamento"
        />
      )}

      {parcelas.length === 0 ? (
        vazio
      ) : (
        <ul
          className="flex flex-col gap-2"
          aria-label="Pagamentos para aprovar"
        >
          {visiveis.map((parcela) => {
            const numero = rotuloParcela(
              parcela.lancamentoNumero,
              parcela.numeroParcela,
              parcela.totalParcelas,
            );
            return (
              <li
                key={parcela.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
              >
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    className="mt-0.5"
                    checked={selecionadas.has(parcela.id)}
                    onCheckedChange={() => onAlternar(parcela.id)}
                    aria-label={`Selecionar ${numero}`}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-detalhe font-semibold break-words">
                        {parcela.fornecedorNome}
                      </p>
                      <p className="shrink-0 text-detalhe font-semibold">
                        <MoneyText valor={parcela.valor} />
                      </p>
                    </div>
                    <p className="line-clamp-2 text-legenda text-muted-foreground">
                      {parcela.lancamentoDescricao}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-legenda text-muted-foreground">
                      <Link
                        href={urlTelaInteira(parcela.id)}
                        className="codigo-doc text-primary underline-offset-2 hover:underline"
                      >
                        {numero}
                      </Link>
                      {parcela.dataVencimento ? (
                        <span className="tabular-nums">
                          · vence {formatarData(parcela.dataVencimento)}
                        </span>
                      ) : null}
                      {parcela.semNota ? (
                        <StatusBadge
                          status="pendente_aprovacao"
                          rotulo="Sem nota"
                        />
                      ) : null}
                    </p>
                    {/* Inteira, e não num balão: no celular não há mouse para
                        o tooltip, e a observação é onde vêm o PIX e a data
                        combinada. */}
                    {parcela.observacoes?.trim() ? (
                      <p className="line-clamp-3 whitespace-pre-line text-legenda text-foreground">
                        {parcela.observacoes.trim()}
                      </p>
                    ) : null}
                  </div>
                </div>

                {podeAprovar || podeRevisar ? (
                  <div className="flex gap-2">
                    {podeAprovar ? (
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1"
                        aria-label={`Aprovar ${numero}`}
                        onClick={() => onAprovar(parcela)}
                      >
                        <Check />
                        Aprovar
                      </Button>
                    ) : null}
                    {podeRevisar ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        aria-label={`Revisar ${numero}`}
                        onClick={() => onRevisar(parcela)}
                      >
                        <PenLine />
                        Revisar
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {visiveis.length < parcelas.length ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLimite((atual) => atual + POR_VEZ)}
        >
          Mostrar mais {Math.min(POR_VEZ, parcelas.length - limite)} de{" "}
          {parcelas.length - limite}
        </Button>
      ) : null}

      {/* Gruda acima do menu inferior: o `main` do AppShell reserva o espaço
          dele no padding, e o sticky prende acima do padding. */}
      {barraSelecao || barraTodas ? (
        <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-t border-border bg-background px-4 py-2.5">
          {barraSelecao ? (
            <>
              <p className="min-w-0 flex-1 text-legenda text-muted-foreground">
                {marcadas.length} selecionado(s)
                <br />
                <span className="font-semibold text-foreground">
                  {formatarBRL(totalMarcado)}
                </span>
              </p>
              {podeRevisar ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onRevisarSelecionadas}
                >
                  <PenLine />
                  Revisar
                </Button>
              ) : null}
              {podeAprovar ? (
                <Button type="button" size="sm" onClick={onAprovarSelecionadas}>
                  <CheckCheck />
                  Aprovar {marcadas.length}
                </Button>
              ) : null}
            </>
          ) : (
            <Button type="button" className="flex-1" onClick={onAprovarTodas}>
              <CheckCheck />
              Aprovar todos ({parcelas.length}) · {formatarBRL(total)}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
