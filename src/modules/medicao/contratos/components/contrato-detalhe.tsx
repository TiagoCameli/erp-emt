"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Info, Pencil, Trash2 } from "lucide-react";

import { CelulaVazia, ConfirmDialog, MoneyText, PageHeader, SecaoDetalhe, StatusBadge, Trilha, type EventoTrilha } from "@/components/canonicos";
import { Anexos } from "@/components/canonicos/anexos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatadores";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { AcessoContrato, type UsuarioAtivo, type UsuarioDoContrato } from "@/modules/medicao/contratos/components/acesso-contrato";
import { AditivosContrato, type AditivoLista } from "@/modules/medicao/contratos/components/aditivos-contrato";
import { ContratoFormDrawer } from "@/modules/medicao/contratos/components/contrato-form-drawer";
import { excluirContrato } from "@/modules/medicao/contratos/actions";
import type { ContratoDetalhe as ContratoDetalheRow } from "@/modules/medicao/contratos/queries";
import {
  ROTULO_REGRA,
  ROTULO_STATUS_CONTRATO,
  ROTULO_TIPO_CONTRATANTE,
} from "@/modules/medicao/_shared/rotulos";

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

export interface ContratoDetalheProps {
  contrato: ContratoDetalheRow;
  podeEditar: boolean;
  podeExcluir: boolean;
  /** As duas permissões que `restaurarContrato` confere de novo (só usada para o texto do aviso de lixeira). */
  podeRestaurar: boolean;
  usuarios: UsuarioDoContrato[];
  usuariosAtivos: UsuarioAtivo[];
  aditivos: AditivoLista[];
  anexos: AnexoDoDocumento[];
  trilha: EventoTrilha[];
}

/**
 * Detalhe do contrato: dados cadastrais, acesso (D3), aditivos, anexos e a
 * trilha do registro. O link para a planilha contratual é só um link: a Fase 1
 * ainda não tem a tela dela (chega na Task seguinte).
 */
export function ContratoDetalhe({
  contrato,
  podeEditar,
  podeExcluir,
  podeRestaurar,
  usuarios,
  usuariosAtivos,
  aditivos,
  anexos,
  trilha,
}: ContratoDetalheProps) {
  const router = useRouter();
  const [editando, setEditando] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState(false);

  const naLixeira = contrato.excluido_em !== null;
  const rotuloStatus =
    ROTULO_STATUS_CONTRATO[contrato.status as keyof typeof ROTULO_STATUS_CONTRATO] ?? contrato.status;

  // Enquanto o contrato está na lixeira, ninguém edita nada dele: acesso, aditivos e
  // anexos ficam só de consulta até alguém restaurar (Important 3 da revisão).
  const podeEditarAgora = podeEditar && !naLixeira;
  const podeExcluirAditivoAgora = podeExcluir && !naLixeira;

  async function confirmarExclusao(motivo?: string) {
    const resultado = await excluirContrato(contrato.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Contrato excluído. Ele foi para a lixeira");
    setExcluindo(false);
    router.push("/medicao/contratos");
  }

  return (
    <>
      <PageHeader
        modulo="Medição"
        titulo={contrato.nome_obra}
        descricao={`${contrato.codigo} · Contrato ${contrato.numero_contrato}`}
        voltarPara={{ rota: "/medicao/contratos", rotulo: "Voltar para a lista de contratos" }}
        selos={<StatusBadge status={naLixeira ? "rejeitado" : contrato.status} rotulo={naLixeira ? "Na lixeira" : rotuloStatus} />}
        acoes={
          <>
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href={`/medicao/planilha?contrato=${contrato.id}`}>
                <FileSpreadsheet />
                Planilha contratual
              </Link>
            </Button>
            {podeEditar && !naLixeira ? (
              <Button type="button" size="sm" onClick={() => setEditando(true)}>
                <Pencil />
                Editar contrato
              </Button>
            ) : null}
            {podeExcluir && !naLixeira ? (
              <Button type="button" size="sm" variant="destructive" onClick={() => setExcluindo(true)}>
                <Trash2 />
                Excluir contrato
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-6">
        {naLixeira ? (
          <div role="note" className="flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-detalhe">
            <Info className="mt-0.5 size-4 shrink-0 text-status-rejeitado" aria-hidden />
            <p>
              Este contrato está na lixeira{contrato.motivo_exclusao ? `: ${contrato.motivo_exclusao}` : ""}.
              {podeRestaurar ? " Restaure-o pela lista de contratos para voltar a editá-lo." : ""}
            </p>
          </div>
        ) : null}

        <SecaoDetalhe titulo="Dados do contrato" card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Dado rotulo="Código">
              <span className="font-mono">{contrato.codigo}</span>
            </Dado>
            <Dado rotulo="Número do contrato">{contrato.numero_contrato}</Dado>
            <Dado rotulo="Local">{contrato.local ?? <CelulaVazia />}</Dado>
            <Dado rotulo="Contratante">{contrato.contratante_nome}</Dado>
            <Dado rotulo="Tipo do contratante">
              {ROTULO_TIPO_CONTRATANTE[contrato.contratante_tipo as keyof typeof ROTULO_TIPO_CONTRATANTE] ??
                contrato.contratante_tipo}
            </Dado>
            <Dado rotulo="Documento">{contrato.contratante_documento ?? <CelulaVazia />}</Dado>
            <Dado rotulo="Valor do contrato">
              <MoneyText valor={contrato.valor_inicial} />
            </Dado>
            <Dado rotulo="Data de assinatura">{formatarData(contrato.data_assinatura)}</Dado>
            <Dado rotulo="Data da ordem de serviço">
              {contrato.data_ordem_servico ? formatarData(contrato.data_ordem_servico) : <CelulaVazia />}
            </Dado>
            <Dado rotulo="Prazo">
              <span className="tabular-nums">{contrato.prazo_meses}</span> meses
            </Dado>
            <Dado rotulo="Início do prazo">
              {contrato.inicio_prazo === "ordem_servico" ? "Da ordem de serviço" : "Da assinatura"}
            </Dado>
            <Dado rotulo="Dia de início do período">
              <span className="tabular-nums">{contrato.dia_inicio_periodo}</span>
            </Dado>
            <Dado rotulo="Localização">{contrato.tipo_localizacao === "rodovia" ? "Rodovia" : "Texto livre"}</Dado>
            <Dado rotulo="Regra de arredondamento">
              {contrato.regra_arredondamento
                ? (ROTULO_REGRA[contrato.regra_arredondamento as keyof typeof ROTULO_REGRA] ?? contrato.regra_arredondamento)
                : "Ainda não definida"}
            </Dado>
            <Dado rotulo="Alerta de prazo">
              <span className="tabular-nums">{contrato.alerta_prazo_dias}</span> dias antes do fim
            </Dado>
            <Dado rotulo="Alerta de valor">
              <span className="tabular-nums">{contrato.alerta_valor_pct}</span>% do contrato medido
            </Dado>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-detalhe">{contrato.objeto}</p>
          {contrato.observacoes ? (
            <p className="mt-2 whitespace-pre-wrap text-detalhe text-muted-foreground">{contrato.observacoes}</p>
          ) : null}
        </SecaoDetalhe>

        <AcessoContrato contratoId={contrato.id} usuarios={usuarios} usuariosAtivos={usuariosAtivos} podeEditar={podeEditarAgora} />

        <AditivosContrato
          contratoId={contrato.id}
          aditivos={aditivos}
          podeEditar={podeEditarAgora}
          podeExcluir={podeExcluirAditivoAgora}
        />

        <SecaoDetalhe titulo="Anexos" card>
          <Anexos
            entidade="mc_contrato"
            entidadeId={contrato.id}
            anexos={anexos}
            podeEditar={podeEditarAgora}
            onMudou={() => semDerrubarSucesso("medicao.contratos.anexos", () => router.refresh())}
            convite="Arraste o contrato assinado, a cláusula de reajuste ou a ordem de serviço"
            textoVazio="Nenhum documento anexado"
          />
        </SecaoDetalhe>

        <SecaoDetalhe titulo="Histórico">
          <Trilha eventos={trilha} />
        </SecaoDetalhe>
      </div>

      {podeEditarAgora ? (
        <ContratoFormDrawer
          aberto={editando}
          onAbertoChange={setEditando}
          contrato={contrato}
          onSalvo={() => semDerrubarSucesso("medicao.contratos.editar", () => router.refresh())}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo}
        onAbertoChange={setExcluindo}
        titulo="Excluir contrato"
        descricao={`${contrato.codigo} vai para a lixeira, com tudo que está nele. Informe o motivo.`}
        textoConfirmar="Excluir contrato"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={confirmarExclusao}
      />
    </>
  );
}
