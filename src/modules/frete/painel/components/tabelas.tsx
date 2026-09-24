"use client";

import * as React from "react";

import { FiltroSelectMulti, MoneyText, SecaoDetalhe } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  METODO_LABEL,
  SEM_FILTRO_LOCAL,
  type FiltrosLocais,
  type NomesPainel,
  type OpcaoPainel,
  type TabelaSaldoPedreira,
} from "@/modules/frete/painel/calculo";
import type {
  abastecimentosPorEmpresa,
  custoMaterialFrete,
  gastoTransportePorPedreira,
  materialTransportado,
  pagamentosEmpresaMetodo,
  pagamentosPorEmpresa,
  resumoPorTransportadora,
  ultimoPrecoPorMaterial,
} from "@/modules/frete/painel/calculo";

const TH = "px-3 py-2 font-medium";
const TD = "px-3 py-1.5";
const SEM_DADOS = <p className="py-4 text-detalhe text-muted-foreground">Sem dados no recorte</p>;

export function numero(valor: number, casas = 2): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function diaBR(dia: string): string {
  return dia ? dia.split("-").reverse().join("/") : "";
}

/** Saldo na pedreira: negativo vermelho, zero cinza, positivo verde (cores da origem). */
function corSaldo(valor: number): string {
  return valor < 0 ? "text-status-rejeitado" : valor === 0 ? "text-muted-foreground" : "text-status-aprovado";
}

/** R$ ou "Sem valor" (a origem mostrava "-"). */
function dinheiroOuVazio(valor: number, mostrar: boolean) {
  return mostrar ? <MoneyText valor={valor} /> : <span className="text-muted-foreground">Sem valor</span>;
}

function Tabela({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full text-detalhe">{children}</table>
    </div>
  );
}

function Cabecalho({ colunas }: { colunas: { rotulo: string; direita?: boolean }[] }) {
  return (
    <thead>
      <tr className="border-b border-border text-legenda text-muted-foreground">
        {colunas.map((c) => (
          <th key={c.rotulo} className={cn(TH, c.direita ? "text-right" : "text-left")}>
            {c.rotulo}
          </th>
        ))}
      </tr>
    </thead>
  );
}

const LINHA_GRUPO = "border-t border-border bg-surface font-semibold";
const LINHA_ITEM = "border-t border-border";
const RODAPE = "border-t-2 border-border bg-surface font-semibold";

// ---------------------------------------------------------------------------
// Filtros locais (FilterMultiSelect da origem)
// ---------------------------------------------------------------------------

function FiltrosDaTabela({
  valor,
  onChange,
  pedreiras,
  materiais,
  destinos,
  rotuloPedreira = "Todas as pedreiras",
}: {
  valor: FiltrosLocais;
  onChange: (f: FiltrosLocais) => void;
  pedreiras: OpcaoPainel[];
  materiais: OpcaoPainel[];
  destinos: OpcaoPainel[];
  rotuloPedreira?: string;
}) {
  const algum = valor.pedreiras.length + valor.materiais.length + valor.destinos.length > 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FiltroSelectMulti valores={valor.pedreiras} onValoresChange={(v) => onChange({ ...valor, pedreiras: v })} opcoes={pedreiras} todosRotulo={rotuloPedreira} />
      <FiltroSelectMulti valores={valor.materiais} onValoresChange={(v) => onChange({ ...valor, materiais: v })} opcoes={materiais} todosRotulo="Todos os materiais" />
      <FiltroSelectMulti valores={valor.destinos} onValoresChange={(v) => onChange({ ...valor, destinos: v })} opcoes={destinos} todosRotulo="Todos os locais" />
      {algum ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(SEM_FILTRO_LOCAL)}>
          Limpar
        </Button>
      ) : null}
    </div>
  );
}

function useFiltroLocal(): [FiltrosLocais, (f: FiltrosLocais) => void] {
  return React.useState<FiltrosLocais>(SEM_FILTRO_LOCAL);
}

export interface OpcoesLocais {
  pedreiras: OpcaoPainel[];
  materiais: OpcaoPainel[];
  destinos: OpcaoPainel[];
}

// ---------------------------------------------------------------------------
// 1. Resumo por Transportadora
// ---------------------------------------------------------------------------

export function ResumoTransportadoraTabela({
  calcular,
  opcoes,
}: {
  calcular: (f: FiltrosLocais) => ReturnType<typeof resumoPorTransportadora>;
  opcoes: OpcoesLocais;
}) {
  const [filtro, setFiltro] = useFiltroLocal();
  const r = calcular(filtro);
  return (
    <SecaoDetalhe titulo="Resumo por transportadora" acao={<FiltrosDaTabela valor={filtro} onChange={setFiltro} {...opcoes} />}>
      {r.linhas.length === 0 ? (
        SEM_DADOS
      ) : (
        <Tabela>
          <Cabecalho colunas={[{ rotulo: "Transportadora" }, { rotulo: "Total TKM", direita: true }, { rotulo: "Valor médio do TKM", direita: true }, { rotulo: "Fretes", direita: true }]} />
          <tbody>
            {r.linhas.map((l) => (
              <tr key={l.id} className={LINHA_ITEM}>
                <td className={cn(TD, "font-medium")}>{l.nome}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{l.totalTkm > 0 ? numero(l.totalTkm) : "Sem TKM"}</td>
                <td className={cn(TD, "text-right")}>{dinheiroOuVazio(l.tkmMedio, l.tkmMedio > 0)}</td>
                <td className={cn(TD, "text-right")}>
                  <MoneyText valor={l.valor} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={RODAPE}>
              <td className={TD}>Total</td>
              <td className={cn(TD, "text-right tabular-nums")}>{numero(r.total.totalTkm)}</td>
              <td className={cn(TD, "text-right")}>{dinheiroOuVazio(r.total.tkmMedio, r.linhas.length > 0)}</td>
              <td className={cn(TD, "text-right")}>
                <MoneyText valor={r.total.valor} />
              </td>
            </tr>
          </tfoot>
        </Tabela>
      )}
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 2. Pagamentos por Empresa e Método
// ---------------------------------------------------------------------------

export function EmpresaMetodoTabela({ dados }: { dados: ReturnType<typeof pagamentosEmpresaMetodo> }) {
  if (dados.linhas.length === 0) return null;
  return (
    <SecaoDetalhe titulo="Pagamentos por empresa e método">
      <Tabela>
        <Cabecalho colunas={[{ rotulo: "Empresa" }, ...dados.colunas.map((m) => ({ rotulo: METODO_LABEL[m] ?? m, direita: true })), { rotulo: "Total", direita: true }]} />
        <tbody>
          {dados.linhas.map((l) => (
            <tr key={l.empresa} className={LINHA_ITEM}>
              <td className={cn(TD, "font-medium")}>{l.empresa}</td>
              {dados.colunas.map((m) => (
                <td key={m} className={cn(TD, "text-right")}>
                  {(l.porMetodo[m] ?? 0) > 0 ? <MoneyText valor={l.porMetodo[m]} /> : <span className="text-muted-foreground">Sem pagamento</span>}
                </td>
              ))}
              <td className={cn(TD, "text-right font-semibold")}>
                <MoneyText valor={l.total} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={RODAPE}>
            <td className={TD}>Total</td>
            {dados.colunas.map((m) => (
              <td key={m} className={cn(TD, "text-right")}>
                <MoneyText valor={dados.totalPorMetodo[m] ?? 0} />
              </td>
            ))}
            <td className={cn(TD, "text-right")}>
              <MoneyText valor={dados.total} />
            </td>
          </tr>
        </tfoot>
      </Tabela>
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 3. Abastecimentos em Tanque Externo
// ---------------------------------------------------------------------------

export function AbastecimentosTabela({ dados, semPermissao }: { dados: ReturnType<typeof abastecimentosPorEmpresa>; semPermissao: boolean }) {
  if (semPermissao) {
    return (
      <SecaoDetalhe titulo="Abastecimentos em tanque externo">
        <p className="py-4 text-detalhe text-muted-foreground">
          Os abastecimentos de carreta só aparecem para quem vê o Combustível ou a conta corrente do Frete.
        </p>
      </SecaoDetalhe>
    );
  }
  if (dados.empresas.length === 0) return null;
  return (
    <SecaoDetalhe titulo="Abastecimentos em tanque externo">
      <Tabela>
        <Cabecalho colunas={[{ rotulo: "Empresa / placa" }, { rotulo: "Abastecimentos", direita: true }, { rotulo: "Litros", direita: true }, { rotulo: "Valor", direita: true }]} />
        <tbody>
          {dados.empresas.map((e) => (
            <React.Fragment key={e.empresa}>
              <tr className={LINHA_GRUPO}>
                <td className={TD}>{e.empresa}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{e.count}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{numero(e.litros)}</td>
                <td className={cn(TD, "text-right")}>
                  <MoneyText valor={e.valor} />
                </td>
              </tr>
              {e.placas.map((p) => (
                <tr key={`${e.empresa}-${p.placa}`} className={LINHA_ITEM}>
                  <td className={cn(TD, "pl-8 font-mono")}>{p.placa}</td>
                  <td className={cn(TD, "text-right tabular-nums")}>{p.count}</td>
                  <td className={cn(TD, "text-right tabular-nums")}>{numero(p.litros)}</td>
                  <td className={cn(TD, "text-right")}>
                    <MoneyText valor={p.valor} />
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className={RODAPE}>
            <td className={TD}>Total geral</td>
            <td className={cn(TD, "text-right tabular-nums")}>{dados.total.count}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{numero(dados.total.litros)}</td>
            <td className={cn(TD, "text-right")}>
              <MoneyText valor={dados.total.valor} />
            </td>
          </tr>
        </tfoot>
      </Tabela>
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 4. Pedidos de Material por Fornecedor (saldo na pedreira)
// ---------------------------------------------------------------------------

export interface FiltroSaldo {
  fornecedores: string[];
  materiais: string[];
  destinos: string[];
}

export function SaldoPedreiraTabela({
  calcular,
  destinos,
  nomes,
}: {
  calcular: (f: FiltroSaldo) => TabelaSaldoPedreira;
  destinos: OpcaoPainel[];
  nomes: NomesPainel;
}) {
  const [filtro, setFiltro] = React.useState<FiltroSaldo>({ fornecedores: [], materiais: [], destinos: [] });
  const t = calcular(filtro);
  const algum = filtro.fornecedores.length + filtro.materiais.length + filtro.destinos.length > 0;
  const custoTotal = (material: number, frete: number) => (frete > 0 ? material + frete : material);
  return (
    <SecaoDetalhe
      titulo="Pedidos de material por fornecedor"
      acao={
        <div className="flex flex-wrap items-center gap-2">
          <FiltroSelectMulti valores={filtro.fornecedores} onValoresChange={(v) => setFiltro({ ...filtro, fornecedores: v })} opcoes={t.opcoesFornecedores} todosRotulo="Todos os fornecedores" />
          <FiltroSelectMulti valores={filtro.materiais} onValoresChange={(v) => setFiltro({ ...filtro, materiais: v })} opcoes={t.opcoesMateriais} todosRotulo="Todos os materiais" />
          <FiltroSelectMulti valores={filtro.destinos} onValoresChange={(v) => setFiltro({ ...filtro, destinos: v })} opcoes={destinos} todosRotulo="Todos os locais" />
          {algum ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setFiltro({ fornecedores: [], materiais: [], destinos: [] })}>
              Limpar
            </Button>
          ) : null}
        </div>
      }
    >
      {t.grupos.length === 0 ? (
        SEM_DADOS
      ) : (
        <Tabela>
          <thead>
            <tr className="border-b border-border text-legenda text-muted-foreground">
              <th rowSpan={2} className={cn(TH, "text-left align-bottom")}>
                Material
              </th>
              <th colSpan={2} className={cn(TH, "text-center")}>Pedido</th>
              <th colSpan={2} className={cn(TH, "text-center")}>Transportado</th>
              <th colSpan={2} className={cn(TH, "text-center")}>Saldo na pedreira</th>
              <th colSpan={3} className={cn(TH, "text-center")}>Custo R$/t</th>
            </tr>
            <tr className="border-b border-border text-legenda text-muted-foreground">
              {["Qtd (t)", "Valor", "Qtd (t)", "Valor", "Qtd (t)", "Valor", "Material", "Frete", "Total"].map((c, i) => (
                <th key={i} className={cn(TH, "text-right")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.grupos.map((g) => {
              const cmm = g.totalQtd > 0 ? g.totalValor / g.totalQtd : 0;
              const cmf = g.totalQtdTransp > 0 ? g.totalFreteValor / g.totalQtdTransp : 0;
              return (
                <React.Fragment key={g.fornecedorId}>
                  <tr className={LINHA_GRUPO}>
                    <td className={TD}>{nomes.fornecedor[g.fornecedorId] ?? g.fornecedorId}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{numero(g.totalQtd)}</td>
                    <td className={cn(TD, "text-right")}><MoneyText valor={g.totalValor} /></td>
                    <td className={cn(TD, "text-right tabular-nums")}>{numero(g.totalQtdTransp)}</td>
                    <td className={cn(TD, "text-right")}><MoneyText valor={g.totalValorMaterialTransp} /></td>
                    <td className={cn(TD, "text-right tabular-nums", corSaldo(g.saldoQtd))}>{numero(g.saldoQtd)}</td>
                    <td className={cn(TD, "text-right", corSaldo(g.totalSaldoValor))}><MoneyText valor={g.totalSaldoValor} /></td>
                    <td className={cn(TD, "text-right")}><MoneyText valor={cmm} /></td>
                    <td className={cn(TD, "text-right")}>{dinheiroOuVazio(cmf, cmf > 0)}</td>
                    <td className={cn(TD, "text-right")}><MoneyText valor={custoTotal(cmm, cmf)} /></td>
                  </tr>
                  {g.linhas.map((l) => (
                    <tr key={l.insumoId} className={LINHA_ITEM}>
                      <td className={cn(TD, "pl-6")}>{nomes.insumo[l.insumoId] ?? l.insumoId}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>{numero(l.qtd)}</td>
                      <td className={cn(TD, "text-right")}><MoneyText valor={l.valor} /></td>
                      <td className={cn(TD, "text-right tabular-nums")}>{numero(l.qtdTransportada)}</td>
                      <td className={cn(TD, "text-right")}><MoneyText valor={l.valorMaterialTransp} /></td>
                      <td className={cn(TD, "text-right tabular-nums font-medium", corSaldo(l.saldoQtd))}>{numero(l.saldoQtd)}</td>
                      <td className={cn(TD, "text-right font-medium", corSaldo(l.saldoValor))}><MoneyText valor={l.saldoValor} /></td>
                      <td className={cn(TD, "text-right")}><MoneyText valor={l.vlrMedio} /></td>
                      <td className={cn(TD, "text-right")}>{dinheiroOuVazio(l.custoMedioFrete, l.custoMedioFrete > 0)}</td>
                      <td className={cn(TD, "text-right")}><MoneyText valor={custoTotal(l.vlrMedio, l.custoMedioFrete)} /></td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className={RODAPE}>
              <td className={TD}>Total geral</td>
              <td className={cn(TD, "text-right tabular-nums")}>{numero(t.total.qtd)}</td>
              <td className={cn(TD, "text-right")}><MoneyText valor={t.total.valor} /></td>
              <td className={cn(TD, "text-right tabular-nums")}>{numero(t.total.qtdTransp)}</td>
              <td className={cn(TD, "text-right")}><MoneyText valor={t.total.valorMaterialTransp} /></td>
              <td className={cn(TD, "text-right tabular-nums", corSaldo(t.total.saldoQtd))}>{numero(t.total.saldoQtd)}</td>
              <td className={cn(TD, "text-right", corSaldo(t.total.saldoValor))}><MoneyText valor={t.total.saldoValor} /></td>
              <td className={cn(TD, "text-right")}>{dinheiroOuVazio(t.total.qtd > 0 ? t.total.valor / t.total.qtd : 0, t.total.qtd > 0)}</td>
              <td className={cn(TD, "text-right")}>
                {dinheiroOuVazio(t.total.qtdTransp > 0 ? t.total.freteValor / t.total.qtdTransp : 0, t.total.qtdTransp > 0)}
              </td>
              <td className={cn(TD, "text-right")}>
                {dinheiroOuVazio(
                  (t.total.qtd > 0 ? t.total.valor / t.total.qtd : 0) + (t.total.qtdTransp > 0 ? t.total.freteValor / t.total.qtdTransp : 0),
                  t.total.qtd > 0,
                )}
              </td>
            </tr>
          </tfoot>
        </Tabela>
      )}
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 5. Custo Material + Frete por Pedreira e Local de Entrega
// ---------------------------------------------------------------------------

export function CustoMaterialFreteTabela({
  calcular,
  nomes,
}: {
  calcular: (f: FiltrosLocais) => ReturnType<typeof custoMaterialFrete>;
  nomes: NomesPainel;
}) {
  const [filtro, setFiltro] = useFiltroLocal();
  const r = calcular(filtro);
  const porTon = (valor: number, ton: number) => dinheiroOuVazio(ton > 0 ? valor / ton : 0, ton > 0);
  const semValor = <span className="text-muted-foreground">Sem valor</span>;
  const nomeLocal = (id: string) => nomes.localidade[id] ?? id;
  return (
    <SecaoDetalhe
      titulo="Custo material + frete por pedreira e local de entrega"
      acao={<FiltrosDaTabela valor={filtro} onChange={setFiltro} pedreiras={r.opcoesPedreiras} materiais={r.opcoesMateriais} destinos={r.opcoesDestinos} />}
    >
      {r.pedreiras.length === 0 ? (
        SEM_DADOS
      ) : (
        <Tabela>
          <Cabecalho
            colunas={[
              { rotulo: "Pedreira / local / material" },
              { rotulo: "Qtd (t)", direita: true },
              { rotulo: "Material R$/t", direita: true },
              { rotulo: "Frete R$/t", direita: true },
              { rotulo: "Total R$/t", direita: true },
              { rotulo: "Total material", direita: true },
              { rotulo: "Total frete", direita: true },
              { rotulo: "Total", direita: true },
            ]}
          />
          <tbody>
            {r.pedreiras.map((p) => (
              <React.Fragment key={p.origemId}>
                <tr className={LINHA_GRUPO}>
                  <td className={TD}>{nomeLocal(p.origemId)}</td>
                  <td className={cn(TD, "text-right tabular-nums")}>{numero(p.totais.qtdTon)}</td>
                  <td className={cn(TD, "text-right")}>{semValor}</td>
                  <td className={cn(TD, "text-right")}>{porTon(p.totais.custoFrete, p.totais.qtdTon)}</td>
                  <td className={cn(TD, "text-right")}>{porTon(p.totais.custoTotal, p.totais.qtdTon)}</td>
                  <td className={cn(TD, "text-right")}><MoneyText valor={p.totais.custoMaterial} /></td>
                  <td className={cn(TD, "text-right")}><MoneyText valor={p.totais.custoFrete} /></td>
                  <td className={cn(TD, "text-right")}><MoneyText valor={p.totais.custoTotal} /></td>
                </tr>
                {p.destinos.map((d) => (
                  <React.Fragment key={`${p.origemId}-${d.destinoId}`}>
                    <tr className="border-t border-border font-medium">
                      <td className={cn(TD, "pl-6")}>{nomeLocal(d.destinoId)}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>{numero(d.totais.qtdTon)}</td>
                      <td className={cn(TD, "text-right")}>{semValor}</td>
                      <td className={cn(TD, "text-right")}>{porTon(d.totais.custoFrete, d.totais.qtdTon)}</td>
                      <td className={cn(TD, "text-right")}>{porTon(d.totais.custoTotal, d.totais.qtdTon)}</td>
                      <td className={cn(TD, "text-right")}><MoneyText valor={d.totais.custoMaterial} /></td>
                      <td className={cn(TD, "text-right")}><MoneyText valor={d.totais.custoFrete} /></td>
                      <td className={cn(TD, "text-right")}><MoneyText valor={d.totais.custoTotal} /></td>
                    </tr>
                    {d.linhas.map((l) => (
                      <tr key={l.insumoId} className={LINHA_ITEM}>
                        <td className={cn(TD, "pl-10 text-muted-foreground")}>{nomes.insumo[l.insumoId] ?? l.insumoId}</td>
                        <td className={cn(TD, "text-right tabular-nums")}>{numero(l.qtdTon)}</td>
                        <td className={cn(TD, "text-right")}>{dinheiroOuVazio(l.custoUnitMaterial, l.custoUnitMaterial > 0)}</td>
                        <td className={cn(TD, "text-right")}><MoneyText valor={l.custoFretePorTon} /></td>
                        <td className={cn(TD, "text-right")}><MoneyText valor={l.custoUnitMaterial + l.custoFretePorTon} /></td>
                        <td className={cn(TD, "text-right")}>{dinheiroOuVazio(l.custoTotalMaterial, l.custoTotalMaterial > 0)}</td>
                        <td className={cn(TD, "text-right")}><MoneyText valor={l.custoFrete} /></td>
                        <td className={cn(TD, "text-right")}><MoneyText valor={l.custoTotal} /></td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className={RODAPE}>
              <td className={TD}>Total geral</td>
              <td className={cn(TD, "text-right tabular-nums")}>{numero(r.total.qtdTon)}</td>
              <td className={cn(TD, "text-right")}>{semValor}</td>
              <td className={cn(TD, "text-right")}>{porTon(r.total.custoFrete, r.total.qtdTon)}</td>
              <td className={cn(TD, "text-right")}>{porTon(r.total.custoTotal, r.total.qtdTon)}</td>
              <td className={cn(TD, "text-right")}><MoneyText valor={r.total.custoMaterial} /></td>
              <td className={cn(TD, "text-right")}><MoneyText valor={r.total.custoFrete} /></td>
              <td className={cn(TD, "text-right")}><MoneyText valor={r.total.custoTotal} /></td>
            </tr>
          </tfoot>
        </Tabela>
      )}
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 6. Gasto com Transporte por Material e Pedreira
// ---------------------------------------------------------------------------

export function GastoTransporteTabela({
  calcular,
  opcoes,
  nomes,
}: {
  calcular: (f: FiltrosLocais) => ReturnType<typeof gastoTransportePorPedreira>;
  opcoes: OpcoesLocais;
  nomes: NomesPainel;
}) {
  const [filtro, setFiltro] = useFiltroLocal();
  const r = calcular(filtro);
  return (
    <SecaoDetalhe titulo="Gasto com transporte por material e pedreira" acao={<FiltrosDaTabela valor={filtro} onChange={setFiltro} {...opcoes} />}>
      {r.pedreiras.length === 0 ? (
        SEM_DADOS
      ) : (
        <Tabela>
          <Cabecalho colunas={[{ rotulo: "Pedreira / material" }, { rotulo: "Peso (t)", direita: true }, { rotulo: "Custo frete", direita: true }, { rotulo: "Custo R$/t", direita: true }]} />
          <tbody>
            {r.pedreiras.map((p) => (
              <React.Fragment key={p.origemId}>
                <tr className={LINHA_GRUPO}>
                  <td className={TD}>{nomes.localidade[p.origemId] ?? p.origemId}</td>
                  <td className={cn(TD, "text-right tabular-nums")}>{numero(p.peso)}</td>
                  <td className={cn(TD, "text-right")}><MoneyText valor={p.valor} /></td>
                  <td className={cn(TD, "text-right")}><MoneyText valor={p.custoMedioTon} /></td>
                </tr>
                {p.linhas.map((l) => (
                  <tr key={l.insumoId} className={LINHA_ITEM}>
                    <td className={cn(TD, "pl-6")}>{nomes.insumo[l.insumoId] ?? l.insumoId}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{numero(l.peso)}</td>
                    <td className={cn(TD, "text-right")}><MoneyText valor={l.valor} /></td>
                    <td className={cn(TD, "text-right")}><MoneyText valor={l.custoMedioTon} /></td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className={RODAPE}>
              <td className={TD}>Total geral</td>
              <td className={cn(TD, "text-right tabular-nums")}>{numero(r.total.peso)}</td>
              <td className={cn(TD, "text-right")}><MoneyText valor={r.total.valor} /></td>
              <td className={cn(TD, "text-right")}>{dinheiroOuVazio(r.total.custoMedioTon, r.total.peso > 0)}</td>
            </tr>
          </tfoot>
        </Tabela>
      )}
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 7. Material Transportado
// ---------------------------------------------------------------------------

export function MaterialTransportadoTabela({
  calcular,
  opcoes,
  nomes,
}: {
  calcular: (f: FiltrosLocais) => ReturnType<typeof materialTransportado>;
  opcoes: OpcoesLocais;
  nomes: NomesPainel;
}) {
  const [filtro, setFiltro] = useFiltroLocal();
  const r = calcular(filtro);
  const vazio = <span className="text-muted-foreground">Nenhum</span>;
  return (
    <SecaoDetalhe titulo="Material transportado" acao={<FiltrosDaTabela valor={filtro} onChange={setFiltro} {...opcoes} />}>
      {r.linhas.length === 0 ? (
        SEM_DADOS
      ) : (
        <Tabela>
          <Cabecalho
            colunas={[
              { rotulo: "Material" },
              { rotulo: "Viagens entregues", direita: true },
              { rotulo: "Peso entregue (t)", direita: true },
              { rotulo: "Em trânsito", direita: true },
              { rotulo: "Peso em trânsito (t)", direita: true },
              { rotulo: "Total (t)", direita: true },
            ]}
          />
          <tbody>
            {r.linhas.map((l) => (
              <tr key={l.insumoId} className={LINHA_ITEM}>
                <td className={cn(TD, "font-medium")}>{nomes.insumo[l.insumoId] ?? l.insumoId}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{l.entregue}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{numero(l.pesoEntregue)}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{l.transito || vazio}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{l.transito > 0 ? numero(l.pesoTransito) : vazio}</td>
                <td className={cn(TD, "text-right tabular-nums font-semibold")}>{numero(l.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={RODAPE}>
              <td className={TD}>Total</td>
              <td className={cn(TD, "text-right tabular-nums")}>{r.total.entregue}</td>
              <td className={cn(TD, "text-right tabular-nums")}>{numero(r.total.pesoEntregue)}</td>
              <td className={cn(TD, "text-right tabular-nums")}>{r.total.transito || vazio}</td>
              <td className={cn(TD, "text-right tabular-nums")}>{r.total.pesoTransito > 0 ? numero(r.total.pesoTransito) : vazio}</td>
              <td className={cn(TD, "text-right tabular-nums")}>{numero(r.total.total)}</td>
            </tr>
          </tfoot>
        </Tabela>
      )}
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 8. Pagamentos por Empresa
// ---------------------------------------------------------------------------

export function PagamentosEmpresaTabela({ dados }: { dados: ReturnType<typeof pagamentosPorEmpresa> }) {
  if (dados.linhas.length === 0) return null;
  return (
    <SecaoDetalhe titulo="Pagamentos por empresa">
      <Tabela>
        <Cabecalho colunas={[{ rotulo: "Empresa" }, { rotulo: "Pagamentos", direita: true }, { rotulo: "Total", direita: true }]} />
        <tbody>
          {dados.linhas.map((l) => (
            <tr key={l.empresa} className={LINHA_ITEM}>
              <td className={cn(TD, "font-medium")}>{l.empresa}</td>
              <td className={cn(TD, "text-right tabular-nums")}>{l.count}</td>
              <td className={cn(TD, "text-right font-semibold")}><MoneyText valor={l.valor} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={RODAPE}>
            <td className={TD}>Total</td>
            <td className={cn(TD, "text-right tabular-nums")}>{dados.total.count}</td>
            <td className={cn(TD, "text-right")}><MoneyText valor={dados.total.valor} /></td>
          </tr>
        </tfoot>
      </Tabela>
    </SecaoDetalhe>
  );
}

// ---------------------------------------------------------------------------
// 10. Último Preço por Material
// ---------------------------------------------------------------------------

export function UltimoPrecoTabela({ linhas }: { linhas: ReturnType<typeof ultimoPrecoPorMaterial> }) {
  const vazio = <span className="text-muted-foreground">Sem frete</span>;
  return (
    <SecaoDetalhe titulo="Último preço por material">
      {linhas.length === 0 ? (
        <p className="py-4 text-detalhe text-muted-foreground">Sem dados de pedidos</p>
      ) : (
        <Tabela>
          <Cabecalho
            colunas={[
              { rotulo: "Material" },
              { rotulo: "Fornecedor" },
              { rotulo: "Preço material (R$/t)", direita: true },
              { rotulo: "Data pedido", direita: true },
              { rotulo: "Preço frete (R$/t)", direita: true },
              { rotulo: "Transportadora" },
              { rotulo: "Data frete", direita: true },
            ]}
          />
          <tbody>
            {linhas.map((l) => (
              <tr key={l.insumoId} className={LINHA_ITEM}>
                <td className={cn(TD, "font-medium")}>{l.material}</td>
                <td className={TD}>{l.fornecedor}</td>
                <td className={cn(TD, "text-right")}><MoneyText valor={l.valorUnitario} /></td>
                <td className={cn(TD, "text-right tabular-nums")}>{diaBR(l.data)}</td>
                <td className={cn(TD, "text-right")}>{l.fretePorTon > 0 ? <MoneyText valor={l.fretePorTon} /> : vazio}</td>
                <td className={TD}>{l.freteTransportadora || vazio}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{l.freteData ? diaBR(l.freteData) : vazio}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </SecaoDetalhe>
  );
}
