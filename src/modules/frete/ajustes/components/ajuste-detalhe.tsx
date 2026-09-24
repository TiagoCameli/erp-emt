"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Pencil, ReceiptText } from "lucide-react";

import {
  ApprovalBar,
  CelulaVazia,
  PageHeader,
  SecaoDetalhe,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { formatarMesAno } from "@/lib/formatadores";
import { formatarDataHoraRioBranco } from "@/modules/combustivel/_shared/rotulos";
import { aprovarAjuste, desaprovarAjuste, rejeitarAjuste } from "@/modules/frete/ajustes/actions";
import { AjusteFormDrawer, type OpcaoSimples } from "@/modules/frete/ajustes/components/ajuste-form-drawer";
import type { AjusteLista } from "@/modules/frete/ajustes/queries";
import { acoesDoAjuste, ROTULO_SINAL, rotuloStatusAjuste, type PermissoesAjuste } from "@/modules/frete/ajustes/regras";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";

const ROTA_LISTA = "/frete/ajustes";

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

export interface AjusteDetalheViewProps {
  ajuste: AjusteLista;
  permissoes: PermissoesAjuste;
  trilha: EventoTrilha[];
  /** Opções do formulário, só para quem pode editar. */
  transportadoras: OpcaoSimples[];
  obras: OpcaoSimples[];
}

const AVISO: Record<string, string> = {
  pendente_aprovacao: "Pendente de aprovação: este ajuste ainda não entra no saldo da transportadora.",
  rejeitado: "Rejeitado: este ajuste não entra no saldo da transportadora.",
};

export function AjusteDetalheView({ ajuste, permissoes, trilha, transportadoras, obras }: AjusteDetalheViewProps) {
  const router = useRouter();
  const [editando, setEditando] = React.useState(false);
  const acoes = acoesDoAjuste(ajuste.status, permissoes);
  const rotulo = rotuloStatusAjuste(ajuste.status);

  function depois(contexto: string, resultado: { ok: true } | { erro: string }, sucesso: string) {
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(sucesso);
    semDerrubarSucesso(contexto, () => router.refresh());
  }

  const aviso = AVISO[ajuste.status];

  return (
    <>
      <PageHeader
        modulo="Frete"
        titulo={`Ajuste de saldo: ${ajuste.transportadoraNome}`}
        descricao={`${ROTULO_SINAL[ajuste.sinal]} de ${formatarValorOperacional(ajuste.valor)} em ${formatarDataHoraRioBranco(ajuste.data)}`}
        voltarPara={{ rota: ROTA_LISTA, rotulo: "Voltar para a lista de ajustes" }}
        selos={<StatusBadge status={ajuste.status} rotulo={rotulo} />}
        acoes={
          <Button type="button" size="sm" variant="outline" asChild>
            <Link href={`/frete/conta-corrente/${ajuste.transportadoraId}`}>
              <ReceiptText />
              Ver extrato
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-6">
        <ApprovalBar
          status={ajuste.status}
          rotulo={rotulo}
          podeAprovar={permissoes.aprovar}
          podeDesaprovar={permissoes.desaprovar}
          textosRejeitar={{
            botao: "Rejeitar",
            titulo: "Rejeitar ajuste",
            descricao: "Informe o motivo da rejeição. O ajuste não entra no saldo e o motivo fica registrado.",
            confirmar: "Rejeitar ajuste",
          }}
          onAprovar={async () => depois("frete.ajustes.aprovar", await aprovarAjuste(ajuste.id), "Ajuste aprovado. Entrou no saldo")}
          onRejeitar={async (motivo) =>
            depois("frete.ajustes.rejeitar", await rejeitarAjuste(ajuste.id, motivo), "Ajuste rejeitado")
          }
          onDesaprovar={async (motivo) =>
            depois(
              "frete.ajustes.desaprovar",
              await desaprovarAjuste(ajuste.id, motivo),
              "Ajuste desaprovado. Saiu do saldo e voltou a pendente",
            )
          }
          acoesExtras={
            acoes.editar ? (
              <Button type="button" variant="outline" onClick={() => setEditando(true)}>
                <Pencil />
                Editar ajuste
              </Button>
            ) : null
          }
        />

        {aviso ? (
          <div role="note" className="flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-detalhe">
            <Info className="mt-0.5 size-4 shrink-0 text-status-pendente" aria-hidden />
            <p>{aviso}</p>
          </div>
        ) : null}

        <SecaoDetalhe titulo="Dados" card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Dado rotulo="Transportadora">{ajuste.transportadoraNome || <CelulaVazia />}</Dado>
            <Dado rotulo="Tipo">
              <span className={ajuste.sinal === "credito" ? "text-status-aprovado" : "text-status-rejeitado"}>
                {ajuste.sinal === "credito" ? "Crédito (soma)" : "Débito (subtrai)"}
              </span>
            </Dado>
            <Dado rotulo="Valor">
              <span className="tabular-nums">{formatarValorOperacional(ajuste.valor)}</span>
            </Dado>
            <Dado rotulo="Data">{formatarDataHoraRioBranco(ajuste.data)}</Dado>
            <Dado rotulo="Mês de referência">
              <span className="tabular-nums">{formatarMesAno(ajuste.mesReferencia)}</span>
            </Dado>
            <Dado rotulo="Obra">{ajuste.obraNome ?? <CelulaVazia />}</Dado>
            <Dado rotulo="Criado por">{ajuste.criadoPorNome ?? <CelulaVazia />}</Dado>
            {ajuste.status === "aprovado" ? (
              <Dado rotulo="Aprovado por">
                {ajuste.aprovadoPorNome ?? <CelulaVazia />}
                {ajuste.aprovadoEm ? ` em ${formatarDataHoraRioBranco(ajuste.aprovadoEm)}` : ""}
              </Dado>
            ) : null}
            {ajuste.motivoStatus ? (
              <Dado rotulo={ajuste.status === "rejeitado" ? "Motivo da rejeição" : "Motivo da desaprovação"}>
                {ajuste.motivoStatus}
              </Dado>
            ) : null}
            {ajuste.origem === "migracao" ? <Dado rotulo="Origem">Migração do Gestão Obras</Dado> : null}
          </div>
          <p className="mt-4 whitespace-pre-wrap text-detalhe">{ajuste.descricao}</p>
        </SecaoDetalhe>

        <SecaoDetalhe titulo="Histórico">
          <Trilha eventos={trilha} />
        </SecaoDetalhe>
      </div>

      {acoes.editar ? (
        <AjusteFormDrawer
          aberto={editando}
          onAbertoChange={setEditando}
          transportadoras={transportadoras}
          obras={obras}
          ajuste={ajuste}
          onSalvo={() => semDerrubarSucesso("frete.ajustes.editar", () => router.refresh())}
        />
      ) : null}
    </>
  );
}
