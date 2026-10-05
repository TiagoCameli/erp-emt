"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Save } from "lucide-react";

import { CampoFormulario, Combobox, SeletorCentroCusto } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { salvarRegra } from "@/modules/financeiro/conciliacao/actions";
import type { ContaBancariaOpcao } from "@/modules/financeiro/conciliacao/queries";
import {
  normalizarHistorico,
  type RegraConciliacao,
} from "@/modules/financeiro/conciliacao/regras";
import type {
  CategoriaOpcao,
  FornecedorOpcao,
} from "@/modules/financeiro/lancamentos/queries";

export interface OpcoesRegra {
  contas: ContaBancariaOpcao[];
  centros: CentroCustoOpcao[];
  categorias: CategoriaOpcao[];
  fornecedores: FornecedorOpcao[];
}

/** O que abre o diálogo: uma regra para editar ou um rascunho para criar. */
export type RegraEmEdicao = Partial<RegraConciliacao> & {
  /** Histórico do movimento de onde a regra nasceu, para conferir o texto. */
  historicoDeOrigem?: string | null;
};

export interface RegraDialogProps {
  /** Null fecha. O pai remonta o diálogo a cada abertura (key). */
  regra: RegraEmEdicao | null;
  onFechar: () => void;
  opcoes: OpcoesRegra;
}

const TODAS = "todas";
const AMBOS = "ambos";

/**
 * Cria ou edita uma regra de conciliação por histórico (Bloco H): o texto do
 * histórico, o sentido, e o que fazer (transferência com outra conta, ou
 * lançar com categoria e centro de custo). Só a automática aplica sozinha na
 * importação; as outras aparecem como "Regra: <nome>" para aplicar com um
 * clique.
 */
export function RegraDialog({ regra, onFechar, opcoes }: RegraDialogProps) {
  const router = useRouter();
  const [nome, setNome] = React.useState(regra?.nome ?? "");
  const [contaId, setContaId] = React.useState(regra?.contaBancariaId ?? TODAS);
  const [padrao, setPadrao] = React.useState(regra?.padrao ?? "");
  const [sentido, setSentido] = React.useState<string>(regra?.sentido ?? AMBOS);
  const [acao, setAcao] = React.useState<"transferencia" | "lancar">(
    regra?.acao === "transferencia" ? "transferencia" : "lancar",
  );
  const [contraparteId, setContraparteId] = React.useState(regra?.contaContraparteId ?? "");
  const [fornecedorId, setFornecedorId] = React.useState(regra?.fornecedorId ?? "");
  const [categoriaId, setCategoriaId] = React.useState(regra?.categoriaId ?? "");
  const [centroCustoId, setCentroCustoId] = React.useState(regra?.centroCustoId ?? "");
  const [automatica, setAutomatica] = React.useState(regra?.automatica ?? false);
  const [ativa, setAtiva] = React.useState(regra?.ativa ?? true);
  const [enviando, setEnviando] = React.useState(false);

  const contraparte = opcoes.contas.find((c) => c.id === contraparteId);
  const envolveInvestimento = acao === "transferencia" && contraparte?.tipo === "investimento";

  const aplicacoes = React.useMemo(() => {
    const raizes = new Set(
      opcoes.centros.filter((c) => c.tipo === "investimento" && !c.paiId).map((c) => c.id),
    );
    return opcoes.centros
      .filter((c) => c.paiId && raizes.has(c.paiId))
      .map((c) => ({ valor: c.id, rotulo: c.nome }));
  }, [opcoes.centros]);

  const opcoesCategoria = React.useMemo(
    () =>
      opcoes.categorias
        .filter((c) =>
          sentido === "credito" ? c.tipo === "receita" : sentido === "debito" ? c.tipo === "despesa" : true,
        )
        .map((c) => ({ valor: c.id, rotulo: c.tipo === "receita" ? `${c.nome} (receita)` : c.nome })),
    [opcoes.categorias, sentido],
  );

  const padraoNormalizado = normalizarHistorico(padrao);
  const confereComOrigem =
    !regra?.historicoDeOrigem ||
    normalizarHistorico(regra.historicoDeOrigem).includes(padraoNormalizado);

  const podeSalvar =
    nome.trim() !== "" &&
    padraoNormalizado.length >= 3 &&
    (acao === "transferencia" ? !!contraparteId : !!categoriaId && !!centroCustoId);

  async function salvar() {
    setEnviando(true);
    const resposta = await salvarRegra({
      id: regra?.id ?? null,
      contaBancariaId: contaId === TODAS ? null : contaId,
      nome,
      padrao,
      sentido: sentido === AMBOS ? null : (sentido as "credito" | "debito"),
      acao,
      contaContraparteId: acao === "transferencia" ? contraparteId || null : null,
      fornecedorId: acao === "lancar" ? fornecedorId || null : null,
      categoriaId: acao === "lancar" ? categoriaId || null : null,
      centroCustoId: centroCustoId || null,
      automatica,
      ativa,
    });
    setEnviando(false);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    toast.success(regra?.id ? "Regra salva" : "Regra criada");
    onFechar();
    router.refresh();
  }

  const contasCorrentes = opcoes.contas.filter((c) => !c.contaPaiId);

  return (
    <Dialog open={regra !== null} onOpenChange={(aberto) => !aberto && !enviando && onFechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{regra?.id ? "Editar regra" : "Nova regra de conciliação"}</DialogTitle>
          <DialogDescription>
            Quando o histórico do banco tiver este texto, o app faz a mesma coisa sempre.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto">
          <CampoFormulario id="regra-nome" rotulo="Nome" obrigatorio>
            <Input
              id="regra-nome"
              value={nome}
              maxLength={120}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Tarifa pacote de serviços"
              disabled={enviando}
            />
          </CampoFormulario>

          <CampoFormulario
            id="regra-padrao"
            rotulo="Texto do histórico"
            obrigatorio
            ajuda={
              confereComOrigem
                ? `Compara sem acento e sem diferença de maiúscula: ${padraoNormalizado || "-"}`
                : "Este texto não aparece no histórico do movimento de origem"
            }
          >
            <Input
              id="regra-padrao"
              value={padrao}
              maxLength={200}
              onChange={(e) => setPadrao(e.target.value)}
              disabled={enviando}
            />
          </CampoFormulario>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoFormulario id="regra-conta" rotulo="Conta">
              <Combobox
                id="regra-conta"
                valor={contaId}
                onValorChange={(v) => setContaId(v || TODAS)}
                opcoes={[
                  { valor: TODAS, rotulo: "Todas as contas" },
                  ...contasCorrentes.map((c) => ({ valor: c.id, rotulo: c.nome })),
                ]}
                disabled={enviando}
              />
            </CampoFormulario>
            <CampoFormulario id="regra-sentido" rotulo="Sentido">
              <Combobox
                id="regra-sentido"
                valor={sentido}
                onValorChange={(v) => setSentido(v || AMBOS)}
                opcoes={[
                  { valor: AMBOS, rotulo: "Saída e entrada" },
                  { valor: "debito", rotulo: "Só saída (débito)" },
                  { valor: "credito", rotulo: "Só entrada (crédito)" },
                ]}
                disabled={enviando}
              />
            </CampoFormulario>
          </div>

          <CampoFormulario id="regra-acao" rotulo="O que fazer" obrigatorio>
            <Combobox
              id="regra-acao"
              valor={acao}
              onValorChange={(v) => {
                setAcao(v === "transferencia" ? "transferencia" : "lancar");
                setCentroCustoId("");
              }}
              opcoes={[
                { valor: "lancar", rotulo: "Lançar já pago (despesa ou receita)" },
                { valor: "transferencia", rotulo: "Transferência com outra conta" },
              ]}
              disabled={enviando}
            />
          </CampoFormulario>

          {acao === "transferencia" ? (
            <>
              <CampoFormulario
                id="regra-contraparte"
                rotulo="Outra conta"
                obrigatorio
                ajuda="Saída vai para ela; entrada vem dela"
              >
                <Combobox
                  id="regra-contraparte"
                  valor={contraparteId}
                  onValorChange={setContraparteId}
                  opcoes={opcoes.contas
                    .filter((c) => c.id !== contaId)
                    .map((c) => ({ valor: c.id, rotulo: c.nome }))}
                  placeholder="Escolha a conta"
                  disabled={enviando}
                />
              </CampoFormulario>
              {envolveInvestimento ? (
                <CampoFormulario
                  id="regra-aplicacao"
                  rotulo="Aplicação"
                  ajuda="Sem aplicação, usa a única cadastrada para a subconta"
                >
                  <Combobox
                    id="regra-aplicacao"
                    valor={centroCustoId}
                    onValorChange={setCentroCustoId}
                    opcoes={aplicacoes}
                    placeholder="Escolha a aplicação"
                    limpavel
                    disabled={enviando}
                  />
                </CampoFormulario>
              ) : null}
            </>
          ) : (
            <>
              <SeletorCentroCusto
                centros={opcoes.centros}
                valor={centroCustoId}
                onValorChange={setCentroCustoId}
                idBase="regra-centro"
                obrigatorio
                disabled={enviando}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoFormulario id="regra-categoria" rotulo="Categoria" obrigatorio>
                  <Combobox
                    id="regra-categoria"
                    valor={categoriaId}
                    onValorChange={setCategoriaId}
                    opcoes={opcoesCategoria}
                    placeholder="Escolha a categoria"
                    disabled={enviando}
                  />
                </CampoFormulario>
                <CampoFormulario id="regra-fornecedor" rotulo="Fornecedor">
                  <Combobox
                    id="regra-fornecedor"
                    valor={fornecedorId}
                    onValorChange={setFornecedorId}
                    opcoes={opcoes.fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome }))}
                    placeholder="Opcional"
                    limpavel
                    disabled={enviando}
                  />
                </CampoFormulario>
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label className="flex items-start gap-2 font-normal">
              <Checkbox
                checked={automatica}
                onCheckedChange={(v) => setAutomatica(v === true)}
                disabled={enviando}
              />
              <span>
                Automática
                <span className="block text-legenda text-muted-foreground">
                  Aplica sozinha na importação e no Casar automaticamente. Sem marcar, aparece
                  como sugestão para aplicar com um clique.
                </span>
              </span>
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={ativa} onCheckedChange={(v) => setAtiva(v === true)} disabled={enviando} />
              Ativa
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void salvar()} disabled={enviando || !podeSalvar}>
            {enviando ? <LoaderCircle className="animate-spin" /> : <Save />}
            Salvar regra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
