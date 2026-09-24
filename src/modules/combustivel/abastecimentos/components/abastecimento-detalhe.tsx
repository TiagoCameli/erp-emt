"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, TriangleAlert } from "lucide-react";

import { CelulaVazia, ConfirmDialog, PageHeader, SecaoDetalhe } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { formatarData, formatarPercentual, formatarQuantidade } from "@/lib/formatadores";
import {
  formatarDataHoraRioBranco,
  formatarLitros,
  ROTULO_CANAL,
  ROTULO_ORIGEM_SAIDA,
  ROTULO_TIPO_CONSUMIDOR,
  ROTULO_TIPO_MOVIMENTO,
} from "@/modules/combustivel/_shared/rotulos";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { AnexosCombustivel } from "@/modules/combustivel/_shared/components/anexos-combustivel";
import { excluirAbastecimento } from "@/modules/combustivel/abastecimentos/actions";
import type { AbastecimentoCompleto } from "@/modules/combustivel/abastecimentos/queries";
import { formatarValorOperacional, somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";
import { AbastecimentoFormDrawer, type OpcoesAbastecimento } from "./abastecimento-form-drawer";

const ROTA_LISTA = "/combustivel/abastecimentos";

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

function Preco({ valor }: { valor: number | null }) {
  if (valor === null) return <CelulaVazia />;
  return <span className="tabular-nums">{formatarValorOperacional(valor)}</span>;
}

/** Tabela só de leitura, no padrão do detalhe da OS. */
function Tabela<L extends { id: string }>({
  colunas,
  linhas,
  vazio,
  rodape,
}: {
  colunas: { rotulo: string; direita?: boolean; celula: (linha: L) => React.ReactNode }[];
  linhas: L[];
  vazio: string;
  rodape?: React.ReactNode[];
}) {
  if (linhas.length === 0) return <p className="text-detalhe text-muted-foreground">{vazio}</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-detalhe">
        <thead>
          <tr className="border-b border-border text-legenda text-muted-foreground">
            {colunas.map((c) => (
              <th key={c.rotulo} className={`px-3 py-2 font-medium ${c.direita ? "text-right" : "text-left"}`}>
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.id} className="border-b border-border last:border-0">
              {colunas.map((c) => (
                <td key={c.rotulo} className={`px-3 py-2 ${c.direita ? "text-right tabular-nums" : "text-left"}`}>
                  {c.celula(linha)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {rodape ? (
          <tfoot>
            <tr className="border-t border-border font-medium">
              {rodape.map((celula, i) => (
                <td key={i} className={`px-3 py-2 ${colunas[i]?.direita ? "text-right tabular-nums" : "text-left"}`}>
                  {celula}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/**
 * O corpo do detalhe (dados, camadas do PEPS, conta corrente e alocações), sem cabeçalho
 * nem ações: serve a página `[id]` e o drawer de detalhe da lista.
 */
export function AbastecimentoDetalheConteudo({ abastecimento }: { abastecimento: AbastecimentoCompleto }) {
  const { saida, camadas, movimentos, alocacoes, semSuprimento } = abastecimento;
  const carreta = saida.tipoConsumidor === "carreta_transportadora";
  const litrosCamadas = somarValoresOperacionais(camadas.map((c) => c.litros));
  const valorCamadas = somarValoresOperacionais(camadas.map((c) => c.litros * c.preco));

  return (
    <div className="flex flex-col gap-6">
      {semSuprimento ? (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-detalhe">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
          <p>
            Sem suprimento: o tanque não tinha camada para {formatarLitros(semSuprimento.litrosSemSuprimento)} dos{" "}
            {formatarLitros(semSuprimento.litrosSolicitados)} pedidos. O preço saiu só das camadas encontradas.
          </p>
        </div>
      ) : null}

      <SecaoDetalhe titulo="Dados" card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Dado rotulo="Consumidor">{ROTULO_TIPO_CONSUMIDOR[saida.tipoConsumidor]}</Dado>
          <Dado rotulo="Origem">{ROTULO_ORIGEM_SAIDA[saida.origem]}</Dado>
          <Dado rotulo="Tanque">
            {saida.tanqueNome ? `${saida.tanqueNome}${saida.tanqueExterno ? " (externo)" : ""}` : <CelulaVazia />}
          </Dado>
          <Dado rotulo="Combustível">{saida.insumoNome}</Dado>
          {carreta ? (
            <>
              <Dado rotulo="Transportadora">{saida.transportadoraNome ?? <CelulaVazia />}</Dado>
              <Dado rotulo="Placa">{saida.placa ? <span className="codigo-doc">{saida.placa}</span> : <CelulaVazia />}</Dado>
              <Dado rotulo="Motorista">{saida.motorista ?? <CelulaVazia />}</Dado>
            </>
          ) : (
            <>
              <Dado rotulo="Equipamento">{saida.equipamentoNome ?? <CelulaVazia />}</Dado>
              <Dado rotulo="Centro de custo">{saida.centroCustoNome ?? <CelulaVazia />}</Dado>
              <Dado rotulo={saida.tipoMedicao === "km" ? "Hodômetro" : "Horímetro"}>
                {saida.medicao !== null ? (
                  <span className="tabular-nums">
                    {formatarQuantidade(saida.medicao)} {saida.tipoMedicao === "km" ? "km" : "h"}
                  </span>
                ) : (
                  <CelulaVazia />
                )}
              </Dado>
            </>
          )}
          <Dado rotulo="Litros">
            <span className="tabular-nums">{formatarLitros(saida.litros)}</span>
          </Dado>
          <Dado rotulo="Preço por litro">
            <Preco valor={saida.precoUnitario} />
          </Dado>
          <Dado rotulo="Valor">
            <Preco valor={saida.valorTotal} />
          </Dado>
          {carreta && saida.origem === "tanque" ? (
            <>
              <Dado rotulo="Preço cobrado da transportadora">
                <Preco valor={saida.precoCombustivel} />
              </Dado>
              {saida.tanqueExterno ? (
                <Dado rotulo="Preço que o dono cobra">
                  <Preco valor={saida.precoProprietario} />
                </Dado>
              ) : null}
              <Dado rotulo="Taxa por litro">
                <Preco valor={saida.taxaLitro} />
              </Dado>
            </>
          ) : null}
          {saida.origem === "requisicao" ? (
            <Dado rotulo="Pagamento">
              {saida.pago ? `Pago${saida.pagoEm ? ` em ${formatarData(saida.pagoEm)}` : ""}` : "A pagar"}
            </Dado>
          ) : null}
          <Dado rotulo="Canal">{ROTULO_CANAL[saida.canal]}</Dado>
        </div>
        {saida.observacoes ? <p className="mt-4 whitespace-pre-wrap text-detalhe">{saida.observacoes}</p> : null}
      </SecaoDetalhe>

      {saida.origem === "tanque" && !saida.tanqueExterno ? (
        <SecaoDetalhe titulo="Camadas do PEPS">
          <Tabela
            linhas={camadas}
            vazio="Nenhuma camada consumida"
            colunas={[
              { rotulo: "Fonte", celula: (c) => (c.fonteTipo === "entrada" ? "Entrada" : "Transferência recebida") },
              { rotulo: "Data da fonte", celula: (c) => (c.fonteData ? formatarDataHoraRioBranco(c.fonteData) : <CelulaVazia />) },
              { rotulo: "NF", celula: (c) => (c.fonteNotaFiscal ? <span className="codigo-doc">{c.fonteNotaFiscal}</span> : <CelulaVazia />) },
              { rotulo: "Litros", direita: true, celula: (c) => formatarLitros(c.litros) },
              { rotulo: "Preço por litro", direita: true, celula: (c) => formatarValorOperacional(c.preco) },
              { rotulo: "Valor", direita: true, celula: (c) => formatarValorOperacional(c.litros * c.preco) },
            ]}
            rodape={["Total", "", "", formatarLitros(litrosCamadas), "", formatarValorOperacional(valorCamadas)]}
          />
        </SecaoDetalhe>
      ) : null}

      {carreta ? (
        <SecaoDetalhe titulo="Conta corrente da transportadora">
          <Tabela
            linhas={movimentos}
            vazio="Nenhum movimento: só abastecimento de carreta em tanque gera movimento"
            colunas={[
              { rotulo: "Movimento", celula: (m) => ROTULO_TIPO_MOVIMENTO[m.tipo] ?? m.tipo },
              { rotulo: "Fornecedor", celula: (m) => m.transportadoraNome },
              { rotulo: "Data", celula: (m) => formatarDataHoraRioBranco(m.data) },
              { rotulo: "Valor", direita: true, celula: (m) => formatarValorOperacional(m.valor) },
            ]}
          />
        </SecaoDetalhe>
      ) : null}

      <SecaoDetalhe titulo="Alocações">
        <Tabela
          linhas={alocacoes}
          vazio="Sem alocação de obra"
          colunas={[
            { rotulo: "Obra", celula: (a) => a.centroCustoNome },
            { rotulo: "Percentual", direita: true, celula: (a) => formatarPercentual(a.percentual, 4) },
            { rotulo: "Litros", direita: true, celula: (a) => formatarLitros(a.litros) },
          ]}
        />
      </SecaoDetalhe>
    </div>
  );
}

export interface AbastecimentoDetalheViewProps {
  abastecimento: AbastecimentoCompleto;
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Fotos e arquivos da saída, lidos no servidor. */
  anexos: AnexoDoDocumento[];
  /** Carregadas só quando dá para editar. */
  opcoes: OpcoesAbastecimento;
}

/**
 * Detalhe do abastecimento: os dados com as 4 casas, as camadas do PEPS que ele
 * consumiu, os movimentos que gerou na conta corrente da transportadora e as
 * alocações. Tudo vem do banco; a tela não soma preço nem valor para gravar.
 */
export function AbastecimentoDetalheView({
  abastecimento,
  podeEditar,
  podeExcluir,
  anexos,
  opcoes,
}: AbastecimentoDetalheViewProps) {
  const router = useRouter();
  const { saida } = abastecimento;
  const [editando, setEditando] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState(false);

  async function aoExcluir(motivo?: string) {
    const resultado = await excluirAbastecimento(saida.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Abastecimento excluído");
    setExcluindo(false);
    semDerrubarSucesso("combustivel.saidas.excluir", () => router.push(ROTA_LISTA));
  }

  return (
    <>
      <PageHeader
        modulo="Combustível"
        titulo={saida.consumidor || "Abastecimento"}
        descricao={`${formatarDataHoraRioBranco(saida.data)} · ${formatarLitros(saida.litros)} de ${saida.insumoNome}`}
        voltarPara={{ rota: ROTA_LISTA, rotulo: "Abastecimentos" }}
        acoes={
          <>
            {podeEditar ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
                <Pencil />
                Editar abastecimento
              </Button>
            ) : null}
            {podeExcluir ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setExcluindo(true)}>
                <Trash2 />
                Excluir abastecimento
              </Button>
            ) : null}
          </>
        }
      />

      <AbastecimentoDetalheConteudo abastecimento={abastecimento} />

      <div className="mt-6">
        <SecaoDetalhe titulo="Anexos">
          <AnexosCombustivel
            entidade="combustivel_saida"
            entidadeId={saida.id}
            anexos={anexos}
            podeEditar={podeEditar}
            onMudou={() => semDerrubarSucesso("combustivel.saidas.anexos", () => router.refresh())}
          />
        </SecaoDetalhe>
      </div>

      {podeEditar ? (
        <AbastecimentoFormDrawer
          aberto={editando}
          onAbertoChange={setEditando}
          abastecimento={abastecimento}
          opcoes={opcoes}
          onSalvo={() => semDerrubarSucesso("combustivel.saidas.editar", () => router.refresh())}
        />
      ) : null}

      <ConfirmDialog
        aberto={excluindo}
        onAbertoChange={setExcluindo}
        titulo="Excluir abastecimento"
        descricao={`O abastecimento de ${formatarLitros(saida.litros)} sai do tanque e da conta corrente, e o PEPS do tanque é refeito. Se for de ciclo fechado, a exclusão é recusada.`}
        textoConfirmar="Excluir abastecimento"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoExcluir}
      />
    </>
  );
}
