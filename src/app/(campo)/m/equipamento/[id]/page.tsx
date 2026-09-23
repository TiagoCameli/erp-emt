import Link from "next/link";
import { SearchX, ShieldOff } from "lucide-react";

import { EmptyState, StatusBadge } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { getUsuarioLogado } from "@/lib/permissoes";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import { FichaTecnicaResumo } from "@/modules/cadastros/equipamentos/components/ficha-tecnica-resumo";
import { obterFichaTecnica } from "@/modules/cadastros/equipamentos/queries";
import { ROTULO_STATUS_EQUIPAMENTO } from "@/modules/cadastros/equipamentos/schemas";
import { BADGE_STATUS_OS, ROTULO_STATUS_OS } from "@/modules/manutencao/_shared/rotulos";
import { AcoesEquipamento } from "@/modules/manutencao/campo/components/acoes-equipamento";
import { permissoesCampo, veManutencao } from "@/modules/manutencao/campo/permissao";
import { listarTanquesCampo, obterEquipamentoCampo } from "@/modules/manutencao/campo/queries";
import { UNIDADE_MEDICAO } from "@/modules/manutencao/medicoes/schemas";

export const metadata = { title: "Equipamento" };

/**
 * Em operação é o normal e fica neutro: o verde de "aprovado" diz que algo passou por
 * aprovação (CLAUDE.md), e máquina rodando não passou. A cor fica para o que pede atenção.
 */
const BADGE_STATUS_EQUIPAMENTO = {
  ativa: "em_operacao",
  em_manutencao: "pendente_aprovacao",
  fora_funcionamento: "rejeitado",
} as const;

/**
 * A tela que o QR da máquina abre. Mostra o essencial para quem está na frente dela
 * (situação, última leitura, OS em aberto, ficha técnica) e os dois lançamentos de campo.
 * O worker guarda a última versão aberta, então sem sinal ela abre como estava.
 */
export default async function EquipamentoCampoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuarioLogado();
  if (!veManutencao(usuario)) {
    return (
      <EmptyState
        icone={ShieldOff}
        titulo="Sem acesso à Manutenção"
        descricao="Peça acesso a quem cuida das permissões para abrir equipamentos pelo QR."
      />
    );
  }

  const equipamento = await obterEquipamentoCampo(id);
  if (!equipamento) {
    return (
      <EmptyState
        icone={SearchX}
        titulo="Equipamento não encontrado"
        descricao="O QR não corresponde a nenhum equipamento que você possa ver."
        acao={
          <Button asChild>
            <Link href="/m/leitor">Voltar ao leitor</Link>
          </Button>
        }
      />
    );
  }

  const permissoes = permissoesCampo(usuario);
  const [ficha, centros, tanques] = await Promise.all([
    obterFichaTecnica(equipamento.id),
    // A OS só pede obra ao alugado (sem etapa); o abastecimento pede sempre, igual à origem.
    permissoes.abastecer || (permissoes.abrirOs && !equipamento.temEtapa) ? listarCentrosCusto() : Promise.resolve([]),
    permissoes.abastecer ? listarTanquesCampo() : Promise.resolve([]),
  ]);
  const unidade = equipamento.controlePor ? UNIDADE_MEDICAO[equipamento.controlePor] : "";

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {equipamento.codigo ? (
              <p className="font-mono text-detalhe text-muted-foreground">{equipamento.codigo}</p>
            ) : null}
            <h1 className="text-titulo font-semibold break-words">{equipamento.descricao}</h1>
            {[equipamento.tipo, equipamento.marcaModelo, equipamento.placa].filter(Boolean).length > 0 ? (
              <p className="text-detalhe text-muted-foreground">
                {[equipamento.tipo, equipamento.marcaModelo, equipamento.placa].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
          <StatusBadge
            status={BADGE_STATUS_EQUIPAMENTO[equipamento.status]}
            rotulo={ROTULO_STATUS_EQUIPAMENTO[equipamento.status]}
          />
        </div>
        {!equipamento.ativo ? (
          <p className="text-detalhe text-destructive">
            Equipamento inativo no cadastro: não recebe leitura nem OS nova.
          </p>
        ) : null}
        {equipamento.controlePor ? (
          <p className="text-corpo tabular-nums">
            Última leitura:{" "}
            {equipamento.ultimaLeitura ? (
              <>
                <strong>
                  {formatarQuantidade(equipamento.ultimaLeitura.valor)} {unidade}
                </strong>{" "}
                <span className="text-muted-foreground">em {formatarData(equipamento.ultimaLeitura.data)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">nenhuma ainda</span>
            )}
          </p>
        ) : null}
      </section>

      {equipamento.ativo ? (
        <AcoesEquipamento
          equipamentoId={equipamento.id}
          controlePor={equipamento.controlePor}
          ultimaLeitura={equipamento.ultimaLeitura?.valor ?? null}
          temEtapa={equipamento.temEtapa}
          centros={centros}
          podeLancarLeitura={permissoes.lancarLeitura}
          podeAbrirOs={permissoes.abrirOs}
          tanques={tanques}
          podeAbastecer={permissoes.abastecer && tanques.length > 0}
        />
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-secao font-semibold">OS em aberto</h2>
        {equipamento.osEmAberto.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">Nenhuma OS aberta ou em execução.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {equipamento.osEmAberto.map((os) => (
              <li key={os.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <p className="font-mono text-detalhe">{os.numero}</p>
                  <p className="text-detalhe break-words">{os.descricao}</p>
                  <p className="text-legenda text-muted-foreground">Aberta em {formatarData(os.dataAbertura)}</p>
                </div>
                <StatusBadge status={BADGE_STATUS_OS[os.status]} rotulo={ROTULO_STATUS_OS[os.status]} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {ficha ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-secao font-semibold">Ficha técnica</h2>
          <FichaTecnicaResumo ficha={ficha} controlePor={equipamento.controlePor ?? undefined} />
        </section>
      ) : null}
    </>
  );
}
