"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
  MoneyText,
  SecaoFormulario,
  SeletorCentroCusto,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatarData } from "@/lib/formatadores";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { lancarMovimentos } from "@/modules/financeiro/conciliacao/actions";
import { palavrasEmComum } from "@/modules/financeiro/conciliacao/casamento";
import { somar, type TransacaoPainel } from "@/modules/financeiro/conciliacao/painel";
import type {
  CategoriaOpcao,
  ClienteOpcao,
  FornecedorOpcao,
} from "@/modules/financeiro/lancamentos/queries";
import { ValorMovimento } from "./valor-movimento";

export interface OpcoesLancamento {
  centros: CentroCustoOpcao[];
  categorias: CategoriaOpcao[];
  fornecedores: FornecedorOpcao[];
  clientes: ClienteOpcao[];
}

export interface LancarDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Um ou vários movimentos do MESMO sentido (todos débito ou todos crédito). */
  transacoes: TransacaoPainel[];
  opcoes: OpcoesLancamento;
}

/** "2026-09-15" → "2026-09", o valor do input type="month". */
function mesDoDia(dia: string): string {
  return dia.slice(0, 7);
}

/**
 * Quem o banco pagou, adivinhado pelo histórico: o cadastro com mais palavras
 * em comum. Só sugere com folga sobre o segundo colocado, senão "JOSE" casaria
 * com qualquer José.
 */
function adivinharPeloNome(
  memo: string | null,
  cadastros: readonly { id: string; nome: string }[],
): string {
  let melhor = { id: "", pontos: 0 };
  let segundo = 0;
  for (const cadastro of cadastros) {
    const pontos = palavrasEmComum(memo, [cadastro.nome]);
    if (pontos > melhor.pontos) {
      segundo = melhor.pontos;
      melhor = { id: cadastro.id, pontos };
    } else if (pontos > segundo) {
      segundo = pontos;
    }
  }
  return melhor.pontos >= 1 && melhor.pontos > segundo ? melhor.id : "";
}

/**
 * Lança no app o que saiu (ou entrou) no banco e não estava lançado. Nasce
 * pago nesta conta e já conciliado, sem passar pela aprovação: o dinheiro já
 * se moveu. O que o extrato não sabe, a pessoa completa: centro de custo (com
 * a etapa, quando o centro tem), mês de referência, categoria e favorecido.
 *
 * Com vários movimentos (as tarifas do mês, os PIX de uma obra) os mesmos
 * dados valem para todos, e cada lançamento leva o histórico do banco como
 * descrição.
 */
export function LancarDrawer({
  aberto,
  onAbertoChange,
  transacoes,
  opcoes,
}: LancarDrawerProps) {
  const router = useRouter();
  const unico = transacoes.length === 1 ? transacoes[0] : null;
  const credito = (transacoes[0]?.valor ?? 0) >= 0;

  const cadastros = credito ? opcoes.clientes : opcoes.fornecedores;

  // O pai remonta o drawer a cada abertura (key), então o formulário já nasce
  // com o que dá para tirar do extrato: descrição, mês do movimento e o
  // favorecido pelo nome.
  const [descricao, setDescricao] = React.useState(unico?.memo ?? "");
  const [centroCustoId, setCentroCustoId] = React.useState("");
  const [mes, setMes] = React.useState(
    transacoes[0] ? mesDoDia(transacoes[0].dataMovimento) : "",
  );
  const [categoriaId, setCategoriaId] = React.useState("");
  const [favorecidoId, setFavorecidoId] = React.useState(() =>
    unico ? adivinharPeloNome(unico.memo, cadastros) : "",
  );
  const [numeroDocumento, setNumeroDocumento] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [erros, setErros] = React.useState<{ centro?: string; mes?: string }>({});
  const [enviando, setEnviando] = React.useState(false);

  const centros = React.useMemo(() => {
    // Aplicação e resgate são transferência para a subconta, não custo: o
    // centro de investimentos fica fora daqui.
    const investimento = new Set(
      opcoes.centros.filter((c) => c.tipo === "investimento").map((c) => c.id),
    );
    return opcoes.centros.filter(
      (c) => !investimento.has(c.id) && !(c.paiId && investimento.has(c.paiId)),
    );
  }, [opcoes.centros]);

  const opcoesCategoria = React.useMemo(
    () =>
      opcoes.categorias
        .filter((c) => c.tipo === (credito ? "receita" : "despesa"))
        .map((c) => ({ valor: c.id, rotulo: c.nome })),
    [opcoes.categorias, credito],
  );

  const total = somar(transacoes.map((t) => t.valor));

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const novosErros: typeof erros = {};
    if (!centroCustoId) novosErros.centro = "Escolha o centro de custo";
    if (!/^\d{4}-\d{2}$/.test(mes)) novosErros.mes = "Informe o mês de referência";
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setEnviando(true);
    const resposta = await lancarMovimentos({
      transacaoIds: transacoes.map((t) => t.id),
      descricao: unico ? descricao || undefined : undefined,
      centroCustoId,
      mesCompetencia: `${mes}-01`,
      categoriaId: categoriaId || undefined,
      fornecedorId: !credito && favorecidoId ? favorecidoId : undefined,
      clienteId: credito && favorecidoId ? favorecidoId : undefined,
      numeroDocumento: numeroDocumento || undefined,
      observacoes: observacoes || undefined,
    });
    setEnviando(false);

    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    if (resposta.falhas.length > 0) {
      toast.error(
        `${resposta.feitos} lançado(s), ${resposta.falhas.length} com erro: ${resposta.falhas[0]?.erro}`,
      );
    } else {
      toast.success(
        resposta.feitos === 1 ? "Lançado e conciliado" : `${resposta.feitos} lançados e conciliados`,
      );
    }
    onAbertoChange(false);
    router.refresh();
  }

  const ID_FORM = "conciliacao-lancar";

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={(novo) => {
        if (!enviando) onAbertoChange(novo);
      }}
      titulo={
        transacoes.length > 1
          ? `Lançar ${transacoes.length} movimentos`
          : credito
            ? "Lançar recebimento do extrato"
            : "Lançar pagamento do extrato"
      }
      descricao="Entra no app já pago nesta conta e conciliado. Complete o que o extrato não diz."
      rodape={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={enviando || transacoes.length === 0}>
            {enviando ? <LoaderCircle className="animate-spin" /> : null}
            {transacoes.length > 1 ? `Lançar ${transacoes.length}` : "Lançar e conciliar"}
          </Button>
        </div>
      }
    >
      <form id={ID_FORM} onSubmit={(e) => void enviar(e)} className={classesFormulario} noValidate>
        <SecaoFormulario titulo={transacoes.length > 1 ? "Movimentos" : "Movimento"}>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
            {transacoes.map((t) => (
              <li key={t.id} className="flex items-baseline gap-3">
                <span className="tabular-nums text-muted-foreground">
                  {formatarData(t.dataMovimento)}
                </span>
                <span className="min-w-0 flex-1 truncate" title={t.memo ?? ""}>
                  {t.memo ?? "-"}
                </span>
                <ValorMovimento valor={t.valor} />
              </li>
            ))}
          </ul>
          {transacoes.length > 1 ? (
            <p className="text-sm text-muted-foreground">
              Total <MoneyText valor={Math.abs(total)} />. Cada lançamento leva o histórico do banco
              como descrição.
            </p>
          ) : null}
        </SecaoFormulario>

        <SecaoFormulario titulo="O que o extrato não diz">
          {unico ? (
            <CampoFormulario id="conc-descricao" rotulo="Descrição" largura="cheio">
              <Input
                id="conc-descricao"
                value={descricao}
                maxLength={500}
                onChange={(e) => setDescricao(e.target.value)}
                disabled={enviando}
              />
            </CampoFormulario>
          ) : null}

          <LinhaCampos>
            <SeletorCentroCusto
              centros={centros}
              valor={centroCustoId}
              onValorChange={(valor) => {
                setCentroCustoId(valor);
                setErros((atual) => ({ ...atual, centro: undefined }));
              }}
              idBase="conc-centro"
              obrigatorio
              erro={erros.centro}
              disabled={enviando}
            />
          </LinhaCampos>

          <LinhaCampos>
            <CampoFormulario
              id="conc-mes"
              rotulo="Mês de referência"
              obrigatorio
              ajuda="Em qual mês este valor entra nos relatórios"
              erro={erros.mes}
            >
              <Input
                id="conc-mes"
                type="month"
                className="tabular-nums"
                value={mes}
                onChange={(e) => {
                  setMes(e.target.value);
                  setErros((atual) => ({ ...atual, mes: undefined }));
                }}
                disabled={enviando}
              />
            </CampoFormulario>

            <CampoFormulario id="conc-categoria" rotulo="Categoria">
              <Combobox
                id="conc-categoria"
                valor={categoriaId}
                onValorChange={setCategoriaId}
                opcoes={opcoesCategoria}
                placeholder="Escolha a categoria"
                limpavel
                disabled={enviando}
              />
            </CampoFormulario>
          </LinhaCampos>

          <LinhaCampos>
            <CampoFormulario
              id="conc-favorecido"
              rotulo={credito ? "Cliente" : "Fornecedor"}
              ajuda={unico && favorecidoId ? "Sugerido pelo nome no extrato" : undefined}
            >
              <Combobox
                id="conc-favorecido"
                valor={favorecidoId}
                onValorChange={setFavorecidoId}
                opcoes={cadastros.map((c) => ({ valor: c.id, rotulo: c.nome }))}
                placeholder={credito ? "Quem pagou" : "Quem recebeu"}
                limpavel
                disabled={enviando}
              />
            </CampoFormulario>

            <CampoFormulario id="conc-documento" rotulo="Nº do documento">
              <Input
                id="conc-documento"
                value={numeroDocumento}
                maxLength={60}
                onChange={(e) => setNumeroDocumento(e.target.value)}
                disabled={enviando}
              />
            </CampoFormulario>
          </LinhaCampos>

          <CampoFormulario id="conc-observacoes" rotulo="Observações" largura="cheio">
            <Textarea
              id="conc-observacoes"
              value={observacoes}
              maxLength={2000}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Se ficar vazio, grava o histórico do banco"
              disabled={enviando}
            />
          </CampoFormulario>
        </SecaoFormulario>
      </form>
    </FormDrawer>
  );
}
