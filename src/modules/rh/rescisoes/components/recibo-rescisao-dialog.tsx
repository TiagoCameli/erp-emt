"use client";

import * as React from "react";
import { Printer } from "lucide-react";

import { MoneyText } from "@/components/canonicos";
import {
  CabecalhoDocumento,
  PistaEmt,
  RodapeEmpresa,
} from "@/components/canonicos/marca-documento";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import {
  ROTULO_AVISO,
  ROTULO_TIPO_RESCISAO,
} from "@/modules/rh/rescisoes/formato";
import type { RescisaoDetalhe } from "@/modules/rh/rescisoes/queries";

/** Linha de valor: rótulo à esquerda, dinheiro à direita. */
function Linha({
  rotulo,
  referencia,
  valor,
  forte,
}: {
  rotulo: string;
  referencia?: string | null;
  valor: number;
  forte?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className={forte ? "font-medium" : undefined}>
        {rotulo}
        {referencia ? (
          <span className="text-muted-foreground ml-1.5 text-[11px]">
            {referencia}
          </span>
        ) : null}
      </span>
      <span className={forte ? "font-medium" : undefined}>
        <MoneyText valor={valor} />
      </span>
    </div>
  );
}

export interface ReciboRescisaoDialogProps {
  rescisao: RescisaoDetalhe;
}

/**
 * Recibo da rescisão para impressão. Usa a moldura canônica (`CabecalhoDocumento`,
 * `PistaEmt`, `RodapeEmpresa`), como o holerite e o espelho: o papel vai para a
 * mão de quem está saindo da empresa, e tem de dizer de qual empresa ele é.
 * Cabeçalho próprio por tela é proibido — dois documentos com CNPJ diferente é
 * problema de contabilidade.
 *
 * Não é o TRCT oficial e o rodapé diz isso: é o recibo gerencial que a EMT
 * emite, conferido contra o termo que o contador manda.
 */
export function ReciboRescisaoDialog({ rescisao }: ReciboRescisaoDialogProps) {
  const [aberto, setAberto] = React.useState(false);

  const proventos = rescisao.itens.filter(
    (item) => item.natureza === "provento",
  );
  const descontos = rescisao.itens.filter(
    (item) => item.natureza === "desconto",
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAberto(true)}
      >
        <Printer />
        Recibo
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        {/* O teto de altura e o scroll existem para o recibo caber na TELA. A
            classe `recibo-rescisao-caixa` é o que o @media print usa para
            desfazer os dois: no papel a folha não rola, e um `max-height` vivo
            cortaria o documento na altura da caixa. */}
        <DialogContent className="recibo-rescisao-caixa max-h-[85vh] max-w-lg overflow-y-auto">
          <div className="recibo-rescisao-print flex flex-col gap-4">
            <CabecalhoDocumento
              titulo="Recibo de rescisão"
              subtitulo={rescisao.numero}
            />
            <PistaEmt />

            <DialogHeader>
              <DialogTitle>{rescisao.colaboradorNome}</DialogTitle>
              <DialogDescription>
                {rescisao.colaboradorFuncao ?? "Sem função"}
              </DialogDescription>
            </DialogHeader>

            <dl className="text-detalhe grid grid-cols-2 gap-x-4 gap-y-1">
              <div>
                <dt className="text-muted-foreground">Tipo</dt>
                <dd>{ROTULO_TIPO_RESCISAO[rescisao.tipo]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Aviso prévio</dt>
                <dd>{ROTULO_AVISO[rescisao.aviso]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Admissão</dt>
                <dd>{formatarData(rescisao.colaboradorAdmissao) || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Desligamento</dt>
                <dd>{formatarData(rescisao.dataDesligamento)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">CPF</dt>
                <dd>{rescisao.colaboradorCpf ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Base da rescisão</dt>
                <dd className="tabular-nums">
                  {formatarBRL(rescisao.remuneracaoBase)}
                </dd>
              </div>
            </dl>

            <div className="text-detalhe flex flex-col gap-4">
              <section>
                <h3 className="text-legenda text-muted-foreground mb-1 font-medium uppercase">
                  Proventos
                </h3>
                {proventos.map((item) => (
                  <Linha
                    key={item.id}
                    rotulo={item.descricao}
                    referencia={item.referencia}
                    valor={item.valor}
                  />
                ))}
                <div className="border-border mt-1 border-t pt-1">
                  <Linha
                    rotulo="Total de proventos"
                    valor={rescisao.valorProventos}
                    forte
                  />
                </div>
              </section>

              <section>
                <h3 className="text-legenda text-muted-foreground mb-1 font-medium uppercase">
                  Descontos
                </h3>
                {descontos.map((item) => (
                  <Linha
                    key={item.id}
                    rotulo={item.descricao}
                    referencia={item.referencia}
                    valor={item.valor}
                  />
                ))}
                <div className="border-border mt-1 border-t pt-1">
                  <Linha
                    rotulo="Total de descontos"
                    valor={rescisao.valorDescontos}
                    forte
                  />
                </div>
              </section>

              <section className="border-border bg-surface rounded-md border p-3">
                <Linha
                  rotulo="Líquido a receber"
                  valor={rescisao.valorLiquido}
                  forte
                />
              </section>

              {/* Assinatura: o papel existe para ser assinado. Sem as linhas, o
                  recibo impresso vira um extrato e não prova entrega. */}
              <section className="mt-6 grid grid-cols-2 gap-6">
                <div className="border-border border-t pt-1 text-center">
                  <span className="text-legenda text-muted-foreground">
                    {rescisao.colaboradorNome}
                  </span>
                </div>
                <div className="border-border border-t pt-1 text-center">
                  <span className="text-legenda text-muted-foreground">
                    EMT Construtora
                  </span>
                </div>
              </section>
            </div>

            <footer className="border-border mt-1 border-t pt-2">
              <RodapeEmpresa />
              <p className="text-legenda text-muted-foreground mt-1">
                Recibo gerencial. Não substitui o Termo de Rescisão do Contrato
                de Trabalho.
              </p>
            </footer>
          </div>

          <DialogFooter className="nao-imprime">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.print()}
            >
              <Printer />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
