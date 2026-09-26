"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, FileSearch, LoaderCircle, Save } from "lucide-react";

import {
  CampoFormulario,
  Combobox,
  DataTable,
  FiltroSelect,
  GradeKpis,
  KPICard,
  SecaoDetalhe,
  StatusBadge,
} from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { Anexos } from "@/components/canonicos/anexos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { gravarImportacao, lerAbasDaVersao, previaDaImportacao, type Previa } from "@/modules/medicao/planilha/actions";
import type { LinhaAnterior, Situacao } from "@/modules/medicao/planilha/casamento";
import { decimalPtBr } from "@/modules/medicao/planilha/formato";
import type { AbaPrevia, Mapeamento } from "@/modules/medicao/planilha/ler-arquivo";
import { enderecoCelula } from "@/modules/medicao/planilha/leitor";
import type { Alerta, Ambiguidade, TipoAlerta } from "@/modules/medicao/planilha/montagem";
import type { Escolhas } from "@/modules/medicao/planilha/schemas";

const ESCOLHAS_VAZIAS: Escolhas = { paiPorOrdem: {}, itemPorOrdem: {}, duplicadosConfirmados: false, alertasLidos: false };
const ITEM_NOVO = "__novo__";
const SEM_VALOR = "__sem_valor__";

const ROTULO_ALERTA: Record<TipoAlerta, string> = {
  codigo_como_numero: "Código gravado como número",
  numero_como_texto: "Texto em coluna de número",
  formula_sem_valor: "Fórmula sem valor calculado",
  erro_de_formula: "Erro de fórmula",
  linha_sem_codigo: "Linha sem código",
  codigo_duplicado: "Código repetido",
  hierarquia_ambigua: "Pai ambíguo",
  codigo_sem_pai: "Código sem grupo acima",
  sem_preco: "Serviço sem preço",
  vazio_vira_zero: "Serviço sem quantidade",
  unidade_com_espaco: "Unidade com espaço sobrando",
  linha_oculta: "Linha oculta importada",
  codigo_termina_com_ponto: "Código terminado em ponto",
};

const SITUACAO: Record<Situacao, { status: string; rotulo: string }> = {
  igual: { status: "aprovado", rotulo: "Igual" },
  mudou_quantidade: { status: "pendente_aprovacao", rotulo: "Mudou a quantidade" },
  mudou_preco: { status: "pendente_aprovacao", rotulo: "Mudou o preço" },
  mudou_quantidade_e_preco: { status: "pendente_aprovacao", rotulo: "Mudou quantidade e preço" },
  mudou_tipo: { status: "rejeitado", rotulo: "Mudou o tipo" },
  novo: { status: "executado", rotulo: "Item novo" },
  ambiguo: { status: "rejeitado", rotulo: "Ambíguo" },
};

const letra = (coluna: number) => enderecoCelula(1, coluna).replace(/\d+$/, "");

function mapaPadrao(aba: AbaPrevia): Mapeamento {
  return aba.sugestao ?? {
    aba: aba.nome,
    linhaCabecalho: 1,
    colunas: { codigo: 1, descricao: 2, unidade: 3, preco: 4, quantidade: 5, valor: null },
  };
}

function rotuloAnterior(a: LinhaAnterior): string {
  return `${a.codigo} · ${a.descricao} · ${a.unidade ?? "sem unidade"} · preço ${decimalPtBr(a.precoUnitario) || "0"} · qtd ${decimalPtBr(a.quantidadePrevista) || "0"}`;
}

export interface ImportarPlanilhaProps {
  versaoId: string;
  numeroVersao: number;
  anexos: AnexoDoDocumento[];
}

/**
 * Importação do xlsx oficial para o rascunho, em quatro passos: anexar o arquivo, escolher aba e
 * colunas, conferir a prévia (alertas, pais ambíguos, códigos repetidos, diagnóstico da coluna de
 * valor e, no aditivo, o casamento com a versão anterior) e gravar. O navegador NUNCA manda
 * número: cada prévia e a gravação releem o arquivo guardado no servidor.
 */
export function ImportarPlanilha({ versaoId, numeroVersao, anexos }: ImportarPlanilhaProps) {
  const router = useRouter();
  const [abas, setAbas] = React.useState<AbaPrevia[] | null>(null);
  const [arquivoLido, setArquivoLido] = React.useState("");
  const [mapa, setMapa] = React.useState<Mapeamento | null>(null);
  const [escolhas, setEscolhas] = React.useState<Escolhas>(ESCOLHAS_VAZIAS);
  const [previa, setPrevia] = React.useState<Previa | null>(null);
  // Ambiguidades de pai já vistas: depois de escolhido, o pai some da lista da montagem, mas o
  // seletor continua na tela para o usuário poder mudar de ideia.
  const [ambiguidades, setAmbiguidades] = React.useState<Record<number, Ambiguidade>>({});
  const [ocupado, setOcupado] = React.useState<"lendo" | "previa" | "gravando" | null>(null);

  const xlsxAnexados = anexos.filter((a) => a.nome.toLowerCase().endsWith(".xlsx"));
  const ultimoXlsx = xlsxAnexados.length > 0 ? xlsxAnexados[xlsxAnexados.length - 1] : null;
  const abaAtual = abas?.find((a) => a.nome === mapa?.aba) ?? null;

  function mudarMapa(novo: Mapeamento) {
    setMapa(novo);
    setPrevia(null);
    setEscolhas(ESCOLHAS_VAZIAS);
    setAmbiguidades({});
  }

  async function lerPlanilha() {
    setOcupado("lendo");
    try {
      const r = await lerAbasDaVersao(versaoId);
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      setAbas(r.abas);
      setArquivoLido(r.arquivo);
      const inicial = r.abas.find((a) => a.sugestao) ?? r.abas[0];
      if (inicial) mudarMapa(mapaPadrao(inicial));
      if (!r.abas.some((a) => a.sugestao)) toast.info("Não achei a linha de cabeçalho. Escolha a aba e as colunas");
    } finally {
      setOcupado(null);
    }
  }

  async function atualizarPrevia(novas: Escolhas) {
    if (!mapa) return;
    setEscolhas(novas);
    setOcupado("previa");
    try {
      const r = await previaDaImportacao(versaoId, mapa, novas);
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      setPrevia(r.previa);
      setAmbiguidades((antes) => {
        const depois = { ...antes };
        for (const a of r.previa.ambiguidades) if (!(a.ordem in depois)) depois[a.ordem] = a;
        return depois;
      });
    } finally {
      setOcupado(null);
    }
  }

  async function gravar() {
    if (!mapa) return;
    setOcupado("gravando");
    try {
      const r = await gravarImportacao(versaoId, mapa, escolhas);
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      toast.success(`${r.linhas} linhas gravadas no rascunho da v${numeroVersao}`);
      router.push(`/medicao/planilha/${versaoId}`);
    } finally {
      setOcupado(null);
    }
  }

  const pendencias = previa ? pendenciasDaPrevia(previa, escolhas) : [];

  return (
    <div className="flex flex-col gap-6">
      <SecaoDetalhe titulo="1. Arquivo" card>
        <p className="mb-3 text-detalhe text-muted-foreground">
          Envie o xlsx oficial. O módulo lê os números do arquivo guardado, nunca do que aparece na tela
        </p>
        <Anexos
          entidade="mc_planilha_versao"
          entidadeId={versaoId}
          anexos={anexos}
          podeEditar
          aceitar=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          validarNovos={(arquivos) => {
            const aceitos = arquivos.filter((f) => f.name.toLowerCase().endsWith(".xlsx"));
            const recusados = arquivos.filter((f) => !aceitos.includes(f)).map((f) => `${f.name}: só o xlsx oficial entra aqui`);
            return { aceitos, recusados };
          }}
          onMudou={() => semDerrubarSucesso("medicao.planilha.anexos", () => router.refresh())}
          convite="Arraste o xlsx oficial da planilha contratual"
          legenda="Vale sempre o xlsx enviado por último"
          textoVazio="Nenhum xlsx anexado"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={lerPlanilha} disabled={!ultimoXlsx || ocupado !== null}>
            {ocupado === "lendo" ? <LoaderCircle className="animate-spin" /> : <FileSearch />}
            Ler planilha
          </Button>
          {ultimoXlsx ? (
            <span className="text-detalhe text-muted-foreground">
              Será lido: <span className="font-medium text-foreground">{ultimoXlsx.nome}</span>
            </span>
          ) : null}
        </div>
      </SecaoDetalhe>

      {abas && mapa && abaAtual ? (
        <PassoColunas
          abas={abas}
          aba={abaAtual}
          arquivo={arquivoLido}
          mapa={mapa}
          onMapa={mudarMapa}
          onPrevia={() => atualizarPrevia(escolhas)}
          ocupado={ocupado !== null}
          carregandoPrevia={ocupado === "previa" && previa === null}
        />
      ) : null}

      {previa ? (
        <PassoPrevia
          previa={previa}
          escolhas={escolhas}
          ambiguidades={Object.values(ambiguidades)}
          ocupado={ocupado !== null}
          onEscolhas={atualizarPrevia}
          onMarcar={(novas) => setEscolhas(novas)}
        />
      ) : null}

      {previa ? (
        <SecaoDetalhe titulo="4. Gravar" card>
          {pendencias.length > 0 ? (
            <ul className="mb-3 flex list-disc flex-col gap-1 pl-5 text-detalhe text-status-rejeitado">
              {pendencias.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-detalhe text-muted-foreground">
              As {previa.linhas.length} linhas substituem o que o rascunho tiver. A versão continua em rascunho até alguém torná-la vigente
            </p>
          )}
          <Button type="button" onClick={gravar} disabled={ocupado !== null || pendencias.length > 0}>
            {ocupado === "gravando" ? <LoaderCircle className="animate-spin" /> : <Save />}
            Gravar no rascunho
          </Button>
        </SecaoDetalhe>
      ) : null}
    </div>
  );
}

/** Mesmas recusas de `gravarImportacao`, na mesma ordem, para a tela dizer o que falta antes de clicar. */
function pendenciasDaPrevia(previa: Previa, escolhas: Escolhas): string[] {
  const p: string[] = [];
  if (previa.bloqueios > 0) {
    p.push(previa.bloqueios === 1 ? "A planilha tem 1 problema que impede a importação" : `A planilha tem ${previa.bloqueios} problemas que impedem a importação`);
  }
  if (previa.duplicados.length > 0 && !escolhas.duplicadosConfirmados) p.push("Confirme os códigos repetidos");
  if (previa.ambiguidades.length > 0) p.push("Escolha o pai das linhas com código ambíguo");
  if (previa.casamento?.linhas.some((c) => c.situacao === "ambiguo")) p.push("Resolva os itens ambíguos do aditivo");
  if (previa.alertas.length > 0 && !escolhas.alertasLidos) p.push("Marque que leu os alertas");
  return p;
}

function PassoColunas({
  abas,
  aba,
  arquivo,
  mapa,
  onMapa,
  onPrevia,
  ocupado,
  carregandoPrevia,
}: {
  abas: AbaPrevia[];
  aba: AbaPrevia;
  arquivo: string;
  mapa: Mapeamento;
  onMapa: (m: Mapeamento) => void;
  onPrevia: () => void;
  ocupado: boolean;
  carregandoPrevia: boolean;
}) {
  const totalColunas = Math.max(0, ...aba.linhas.map((l) => l.celulas.length));
  const cabecalho = aba.linhas.find((l) => l.numero === mapa.linhaCabecalho)?.celulas ?? [];
  const opcoesColuna = Array.from({ length: totalColunas }, (_, i) => ({
    valor: String(i + 1),
    rotulo: cabecalho[i] ? `${letra(i + 1)} · ${cabecalho[i]}` : letra(i + 1),
  }));
  const opcoesLinha = aba.linhas.map((l) => ({
    valor: String(l.numero),
    rotulo: `Linha ${l.numero}${l.celulas.some((c) => c) ? ` · ${l.celulas.filter((c) => c).slice(0, 3).join(" | ")}` : ""}`,
  }));
  const colunaMarcada = new Map<number, string>(
    (
      [
        [mapa.colunas.codigo, "Item"],
        [mapa.colunas.descricao, "Discriminação"],
        [mapa.colunas.unidade, "Unid."],
        [mapa.colunas.preco, "Preço"],
        [mapa.colunas.quantidade, "Quantidade"],
        [mapa.colunas.valor, "Valor"],
      ] as [number | null, string][]
    ).filter((c): c is [number, string] => c[0] !== null),
  );

  const campo = (chave: keyof Mapeamento["colunas"], rotulo: string, opcional = false) => (
    <CampoFormulario id={`coluna-${chave}`} rotulo={rotulo} obrigatorio={!opcional}>
      <Combobox
        id={`coluna-${chave}`}
        valor={mapa.colunas[chave] === null ? SEM_VALOR : String(mapa.colunas[chave])}
        onValorChange={(v) =>
          onMapa({ ...mapa, colunas: { ...mapa.colunas, [chave]: v === SEM_VALOR || v === "" ? (opcional ? null : mapa.colunas[chave]) : Number(v) } })
        }
        opcoes={opcional ? [{ valor: SEM_VALOR, rotulo: "Sem coluna de valor" }, ...opcoesColuna] : opcoesColuna}
        placeholder="Escolha a coluna"
        buscaPlaceholder="Buscar coluna"
        disabled={ocupado}
      />
    </CampoFormulario>
  );

  return (
    <SecaoDetalhe titulo="2. Colunas" card>
      <p className="mb-3 text-detalhe text-muted-foreground">
        Arquivo lido: <span className="font-medium text-foreground">{arquivo}</span>.{" "}
        {aba.sugestao ? "Aba e colunas preenchidas pela linha de cabeçalho. Confira" : "Não achei o cabeçalho nesta aba. Escolha as colunas"}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CampoFormulario id="coluna-aba" rotulo="Aba" obrigatorio>
          <Combobox
            id="coluna-aba"
            valor={mapa.aba}
            onValorChange={(v) => {
              const nova = abas.find((a) => a.nome === v);
              if (nova) onMapa(mapaPadrao(nova));
            }}
            opcoes={abas.map((a) => ({ valor: a.nome, rotulo: a.nome }))}
            placeholder="Escolha a aba"
            disabled={ocupado}
          />
        </CampoFormulario>
        <CampoFormulario id="coluna-cabecalho" rotulo="Linha do cabeçalho" obrigatorio>
          <Combobox
            id="coluna-cabecalho"
            valor={String(mapa.linhaCabecalho)}
            onValorChange={(v) => v && onMapa({ ...mapa, linhaCabecalho: Number(v) })}
            opcoes={opcoesLinha}
            placeholder="Escolha a linha"
            disabled={ocupado}
          />
        </CampoFormulario>
        {campo("codigo", "Item (código)")}
        {campo("descricao", "Discriminação")}
        {campo("unidade", "Unidade")}
        {campo("preco", "Preço unitário")}
        {campo("quantidade", "Quantidade prevista")}
        {campo("valor", "Valor previsto", true)}
      </div>

      <div className="mt-4 max-h-96 overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-right">#</TableHead>
              {Array.from({ length: totalColunas }, (_, i) => (
                <TableHead key={i} className="whitespace-nowrap">
                  {letra(i + 1)}
                  {colunaMarcada.has(i + 1) ? <span className="ml-1 text-legenda text-muted-foreground">({colunaMarcada.get(i + 1)})</span> : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {aba.linhas.map((l) => (
              <TableRow key={l.numero} className={cn(l.numero === mapa.linhaCabecalho && "bg-surface font-semibold")}>
                <TableCell className="text-right tabular-nums text-muted-foreground">{l.numero}</TableCell>
                {Array.from({ length: totalColunas }, (_, i) => (
                  <TableCell key={i} className="max-w-64 truncate" title={l.celulas[i]}>
                    {l.celulas[i]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3">
        <Button type="button" size="sm" onClick={onPrevia} disabled={ocupado}>
          {carregandoPrevia ? <LoaderCircle className="animate-spin" /> : <FileSearch />}
          Ver prévia da importação
        </Button>
      </div>
    </SecaoDetalhe>
  );
}

function PassoPrevia({
  previa,
  escolhas,
  ambiguidades,
  ocupado,
  onEscolhas,
  onMarcar,
}: {
  previa: Previa;
  escolhas: Escolhas;
  ambiguidades: Ambiguidade[];
  ocupado: boolean;
  /** Muda uma escolha que altera a montagem (pai, item): refaz a prévia no servidor. */
  onEscolhas: (e: Escolhas) => void;
  /** Muda só uma confirmação (caixas): não precisa reler o arquivo. */
  onMarcar: (e: Escolhas) => void;
}) {
  const porOrdem = new Map(previa.linhas.map((l) => [l.ordem, l]));
  const titulos = previa.linhas.filter((l) => l.tipo === "titulo").length;
  const grupos = agruparAlertas(previa.alertas);

  return (
    <SecaoDetalhe titulo="3. Prévia" card>
      <GradeKpis>
        <KPICard titulo="Linhas" valor={<span className="tabular-nums">{previa.linhas.length}</span>} />
        <KPICard titulo="Títulos" valor={<span className="tabular-nums">{titulos}</span>} />
        <KPICard titulo="Serviços" valor={<span className="tabular-nums">{previa.linhas.length - titulos}</span>} />
        <KPICard
          titulo="Bloqueios"
          valor={<span className={cn("tabular-nums", previa.bloqueios > 0 && "text-status-rejeitado")}>{previa.bloqueios}</span>}
          detalhe={previa.bloqueios > 0 ? "Corrija no Excel e envie de novo" : "Nenhum problema que impeça"}
        />
      </GradeKpis>

      {grupos.length > 0 ? (
        <div className="mt-5 flex flex-col gap-2">
          <h3 className="text-detalhe font-semibold">Alertas</h3>
          {grupos.map((g) => (
            <details key={g.tipo} open={g.bloqueia} className="rounded-md border border-border bg-surface px-3 py-2">
              <summary className={cn("cursor-pointer text-detalhe font-medium", g.bloqueia && "text-status-rejeitado")}>
                {g.bloqueia ? <AlertTriangle className="mr-1 inline size-4 align-text-bottom" aria-hidden /> : null}
                {ROTULO_ALERTA[g.tipo]} ({g.alertas.length}){g.bloqueia ? " · impede a importação" : ""}
              </summary>
              <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-auto text-detalhe">
                {g.alertas.map((a, i) => (
                  <li key={`${a.linhaOrigem}-${i}`} className={cn(a.bloqueia ? "text-status-rejeitado" : "text-muted-foreground")}>
                    {a.mensagem}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-detalhe text-muted-foreground">Nenhum alerta</p>
      )}

      {ambiguidades.length > 0 ? (
        <div className="mt-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-detalhe font-semibold">Pai das linhas com código ambíguo</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() =>
                onEscolhas({
                  ...escolhas,
                  paiPorOrdem: {
                    ...Object.fromEntries(ambiguidades.map((a) => [a.ordem, a.sugerido])),
                    ...escolhas.paiPorOrdem,
                  },
                })
              }
            >
              Usar os sugeridos
            </Button>
          </div>
          {ambiguidades.map((a) => {
            const linha = porOrdem.get(a.ordem);
            const escolhido = escolhas.paiPorOrdem[a.ordem];
            return (
              <CampoFormulario
                key={a.ordem}
                id={`pai-${a.ordem}`}
                rotulo={`${a.codigo} · ${linha?.descricao ?? ""} (linha ${linha?.linhaOrigem ?? "?"} do xlsx)`}
                erro={escolhido === undefined ? "Escolha o pai" : undefined}
              >
                <Combobox
                  id={`pai-${a.ordem}`}
                  valor={escolhido === undefined ? "" : String(escolhido)}
                  onValorChange={(v) => v && onEscolhas({ ...escolhas, paiPorOrdem: { ...escolhas.paiPorOrdem, [a.ordem]: Number(v) } })}
                  opcoes={a.candidatos.map((c) => {
                    const pai = porOrdem.get(c);
                    return {
                      valor: String(c),
                      rotulo: `${pai?.codigo ?? ""} · ${pai?.descricao ?? ""} · linha ${pai?.linhaOrigem ?? "?"}${c === a.sugerido ? " (sugerido)" : ""}`,
                    };
                  })}
                  placeholder="Escolha de qual linha ela é filha"
                  disabled={ocupado}
                />
              </CampoFormulario>
            );
          })}
        </div>
      ) : null}

      {previa.duplicados.length > 0 ? (
        <div className="mt-5 flex flex-col gap-2">
          <h3 className="text-detalhe font-semibold">Códigos repetidos</h3>
          <ul className="flex flex-col gap-1 text-detalhe">
            {previa.duplicados.map((d) => (
              <li key={d.codigo}>
                <span className="font-mono">{d.codigo}</span>:{" "}
                {d.ordens.map((o) => `${porOrdem.get(o)?.descricao ?? ""} (linha ${porOrdem.get(o)?.linhaOrigem ?? "?"})`).join("; ")}
              </li>
            ))}
          </ul>
          <Caixa
            id="confirma-duplicados"
            marcado={escolhas.duplicadosConfirmados}
            onMarcado={(v) => onMarcar({ ...escolhas, duplicadosConfirmados: v })}
            texto="Confirmo que são serviços distintos e entram como estão"
            disabled={ocupado}
          />
        </div>
      ) : null}

      <DiagnosticoValor previa={previa} />

      {previa.casamento && previa.anteriores ? (
        <CasamentoAditivo previa={previa} escolhas={escolhas} ocupado={ocupado} onEscolhas={onEscolhas} />
      ) : null}

      {previa.alertas.length > 0 ? (
        <div className="mt-5">
          <Caixa
            id="alertas-lidos"
            marcado={escolhas.alertasLidos}
            onMarcado={(v) => onMarcar({ ...escolhas, alertasLidos: v })}
            texto="Li os alertas"
            disabled={ocupado}
          />
        </div>
      ) : null}
    </SecaoDetalhe>
  );
}

function Caixa({ id, marcado, onMarcado, texto, disabled }: { id: string; marcado: boolean; onMarcado: (v: boolean) => void; texto: string; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={marcado} onCheckedChange={(v) => onMarcado(v === true)} disabled={disabled} />
      <Label htmlFor={id} className="text-detalhe">
        {texto}
      </Label>
    </div>
  );
}

function agruparAlertas(alertas: Alerta[]): { tipo: TipoAlerta; bloqueia: boolean; alertas: Alerta[] }[] {
  const grupos = new Map<string, { tipo: TipoAlerta; bloqueia: boolean; alertas: Alerta[] }>();
  for (const a of alertas) {
    const chave = `${a.bloqueia ? 0 : 1}|${a.tipo}`;
    const g = grupos.get(chave) ?? { tipo: a.tipo, bloqueia: a.bloqueia, alertas: [] };
    g.alertas.push(a);
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort((x, y) => Number(y.bloqueia) - Number(x.bloqueia));
}

function DiagnosticoValor({ previa }: { previa: Previa }) {
  const d = previa.diagnostico;
  if (!d) {
    return (
      <p className="mt-5 text-detalhe text-muted-foreground">
        Sem coluna de valor mapeada (ou vazia): não há diagnóstico do arredondamento da planilha
      </p>
    );
  }
  return (
    <div className="mt-5 flex flex-col gap-2">
      <h3 className="text-detalhe font-semibold">Diagnóstico da coluna de valor</h3>
      <p className="text-detalhe">
        Das <span className="tabular-nums">{d.comValor}</span> linhas com valor na planilha:{" "}
        <span className="tabular-nums">{d.arredondado}</span> batem com qtd × preço arredondado a 2 casas,{" "}
        <span className="tabular-nums">{d.exato}</span> batem com qtd × preço exato,{" "}
        <span className="tabular-nums">{d.indistinto}</span> dão o mesmo número nas duas leituras,{" "}
        <span className="tabular-nums">{d.diverge.length}</span> não fecham
      </p>
      {d.diverge.length > 0 ? (
        <div className="max-h-72 overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead className="text-right">Exato</TableHead>
                <TableHead className="text-right">Arredondado</TableHead>
                <TableHead className="text-right">Planilha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.diverge.map((l) => (
                <TableRow key={l.ordem}>
                  <TableCell className="font-mono">{l.codigo}</TableCell>
                  <TableCell className="text-right tabular-nums">{decimalPtBr(l.exato)}</TableCell>
                  <TableCell className="text-right tabular-nums">{decimalPtBr(l.arredondado)}</TableCell>
                  <TableCell className="text-right tabular-nums">{decimalPtBr(l.planilha)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <p className="text-detalhe text-muted-foreground">Isto não escolhe a regra do contrato. Leve para o Tiago decidir</p>
    </div>
  );
}

interface LinhaCasamento {
  ordem: number;
  codigo: string;
  descricao: string;
  unidade: string | null;
  precoUnitario: string | null;
  quantidadePrevista: string | null;
  situacao: Situacao;
  itemId: string | null;
  candidatos: string[];
}

function CasamentoAditivo({
  previa,
  escolhas,
  ocupado,
  onEscolhas,
}: {
  previa: Previa;
  escolhas: Escolhas;
  ocupado: boolean;
  onEscolhas: (e: Escolhas) => void;
}) {
  const [filtro, setFiltro] = React.useState("");
  const casamento = previa.casamento!;
  const anteriores = previa.anteriores ?? [];
  const porId = new Map(anteriores.map((a) => [a.itemId, a]));
  const porOrdem = new Map(previa.linhas.map((l) => [l.ordem, l]));

  const linhas: LinhaCasamento[] = casamento.linhas.map((c) => {
    const l = porOrdem.get(c.ordem);
    return {
      ordem: c.ordem,
      codigo: l?.codigo ?? "",
      descricao: l?.descricao ?? "",
      unidade: l?.unidade ?? null,
      precoUnitario: l?.precoUnitario ?? null,
      quantidadePrevista: l?.quantidadePrevista ?? null,
      situacao: c.situacao,
      itemId: c.itemId,
      candidatos: c.candidatos,
    };
  });
  const ocupadosPor = new Map<string, number>();
  for (const l of linhas) if (l.itemId) ocupadosPor.set(l.itemId, l.ordem);
  const contagem = (s: Situacao) => linhas.filter((l) => l.situacao === s).length;
  const visiveis = filtro ? linhas.filter((l) => l.situacao === filtro) : linhas;

  function escolher(ordem: number, valor: string) {
    if (!valor) return;
    onEscolhas({ ...escolhas, itemPorOrdem: { ...escolhas.itemPorOrdem, [ordem]: valor === ITEM_NOVO ? null : valor } });
  }

  const colunas: ColumnDef<LinhaCasamento, unknown>[] = [
    { accessorKey: "codigo", header: "Item", size: 130, cell: ({ row }) => <span className="font-mono">{row.original.codigo}</span> },
    { accessorKey: "descricao", header: "Discriminação", size: 260 },
    {
      accessorKey: "precoUnitario",
      header: "Preço unitário",
      size: 130,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <span className="tabular-nums">{decimalPtBr(row.original.precoUnitario)}</span>,
    },
    {
      accessorKey: "quantidadePrevista",
      header: "Quantidade",
      size: 130,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <span className="tabular-nums">{decimalPtBr(row.original.quantidadePrevista)}</span>,
    },
    {
      accessorKey: "situacao",
      header: "Situação",
      size: 170,
      meta: { naoTruncar: true },
      cell: ({ row }) => <StatusBadge status={SITUACAO[row.original.situacao].status} rotulo={SITUACAO[row.original.situacao].rotulo} />,
    },
    {
      id: "item",
      header: "Item da versão anterior",
      size: 360,
      meta: { naoTruncar: true },
      cell: ({ row }) => {
        const l = row.original;
        const escolhido = escolhas.itemPorOrdem[l.ordem];
        const valor = escolhido !== undefined ? (escolhido ?? ITEM_NOVO) : l.itemId ?? (l.situacao === "novo" ? ITEM_NOVO : "");
        // Candidatos da própria chave primeiro; depois qualquer item anterior ainda livre, para trocar.
        const livres = anteriores.filter((a) => !ocupadosPor.has(a.itemId) || ocupadosPor.get(a.itemId) === l.ordem);
        const ids = [...new Set([...l.candidatos, ...(l.itemId ? [l.itemId] : []), ...livres.map((a) => a.itemId)])];
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Combobox
              id={`item-${l.ordem}`}
              valor={valor}
              onValorChange={(v) => escolher(l.ordem, v)}
              opcoes={[
                { valor: ITEM_NOVO, rotulo: "Item novo (não existia na versão anterior)" },
                ...ids.map((id) => {
                  const a = porId.get(id);
                  return { valor: id, rotulo: a ? rotuloAnterior(a) : id };
                }),
              ]}
              placeholder={l.situacao === "ambiguo" ? "Escolha o item" : "Escolha"}
              buscaPlaceholder="Buscar item"
              size="sm"
              disabled={ocupado}
              ariaLabel={`Item da versão anterior para ${l.codigo}`}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div className="mt-5 flex flex-col gap-2">
      <h3 className="text-detalhe font-semibold">Casamento com a versão v{previa.numeroVersao - 1}</h3>
      <p className="text-detalhe text-muted-foreground">
        Cada linha do aditivo casa com um item da versão anterior pelo código, discriminação e unidade, para o acumulado
        atravessar o aditivo. <span className="tabular-nums">{contagem("igual")}</span> iguais,{" "}
        <span className="tabular-nums">{contagem("mudou_quantidade") + contagem("mudou_preco") + contagem("mudou_quantidade_e_preco")}</span> mudaram,{" "}
        <span className="tabular-nums">{contagem("novo")}</span> novos,{" "}
        <span className="tabular-nums">{contagem("mudou_tipo")}</span> mudaram de tipo e{" "}
        <span className={cn("tabular-nums", contagem("ambiguo") > 0 && "font-semibold text-status-rejeitado")}>{contagem("ambiguo")}</span> ambíguos
      </p>
      {contagem("mudou_tipo") > 0 ? (
        <p className="text-detalhe text-status-rejeitado">
          Linha que mudou de tipo era título e virou serviço (ou o contrário). Confira se é mesmo o mesmo item; se não for, marque como item novo
        </p>
      ) : null}
      <DataTable
        idTabela="medicao.planilha.casamento"
        columns={colunas}
        data={visiveis}
        pageSize={50}
        toolbar={
          <FiltroSelect
            valor={filtro}
            onValorChange={setFiltro}
            opcoes={(Object.keys(SITUACAO) as Situacao[]).map((s) => ({ valor: s, rotulo: `${SITUACAO[s].rotulo} (${contagem(s)})` }))}
            todosRotulo="Todas as situações"
          />
        }
      />
      {casamento.sairam.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-detalhe font-medium">Saíram da planilha ({casamento.sairam.length})</h4>
          <ul className="flex max-h-48 flex-col gap-0.5 overflow-auto text-detalhe text-muted-foreground">
            {casamento.sairam.map((a) => (
              <li key={a.itemId}>{rotuloAnterior(a)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
