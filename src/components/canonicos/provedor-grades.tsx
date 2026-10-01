"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Check, LayoutDashboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  chaveLayoutGrade,
  layoutGradeEhPadrao,
  type LayoutGrade,
} from "@/components/canonicos/layout-grade";
import {
  limparPreferenciaTabela,
  salvarPreferenciaTabela,
} from "@/modules/_shared/preferencias-tabela/actions";

/** Espera depois do último ajuste antes de gravar: arrastar gera dezenas de mudanças. */
const ESPERA_GRAVAR_MS = 600;

interface ContextoGrades {
  /** Layout bruto salvo da grade (ainda não saneado), ou undefined. */
  layoutBruto: (idGrade: string) => unknown;
  salvar: (idGrade: string, layout: LayoutGrade) => void;
  editando: boolean;
  setEditando: (editando: boolean) => void;
  /** A grade avisa que está na tela; é isso que faz o botão aparecer. */
  registrar: () => () => void;
}

const Contexto = React.createContext<ContextoGrades | null>(null);

/** Null fora do provedor: aí a grade se comporta como grade fixa. */
export function useGrades(): ContextoGrades | null {
  return React.useContext(Contexto);
}

export interface ProvedorGradesProps {
  /**
   * Layouts já salvos da pessoa, chave `painel.<idGrade>`. Vem do layout do app,
   * no servidor, para a grade nascer arrumada: buscar no cliente depois de montar
   * faria todo painel abrir no padrão e pular para o layout da pessoa.
   */
  inicial: Record<string, unknown>;
  children: React.ReactNode;
}

/**
 * Guarda como cada pessoa arrumou cada grade de cards e gráficos e liga o modo
 * de personalização. Fica no layout do app, então sobrevive à navegação: o que
 * a pessoa mudou numa tela já está certo quando ela volta, sem nova ida ao banco.
 */
export function ProvedorGrades({ inicial, children }: ProvedorGradesProps) {
  const [layouts, setLayouts] = React.useState<Record<string, unknown>>(inicial);
  const caminho = usePathname() ?? "";
  // O modo de edição vale para a tela em que foi ligado: navegar para outra
  // desliga sozinho, sem efeito nenhum, porque a comparação muda de resultado.
  const [editandoEm, setEditandoEm] = React.useState<string | null>(null);
  const [grades, setGrades] = React.useState(0);
  const editando = grades > 0 && editandoEm === caminho;
  const setEditando = React.useCallback(
    (ligar: boolean) => setEditandoEm(ligar ? caminho : null),
    [caminho],
  );
  const temporizadores = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const layoutBruto = React.useCallback(
    (idGrade: string) => layouts[chaveLayoutGrade(idGrade)],
    [layouts],
  );

  const salvar = React.useCallback((idGrade: string, layout: LayoutGrade) => {
    const chave = chaveLayoutGrade(idGrade);
    const padrao = layoutGradeEhPadrao(layout);
    setLayouts((atual) => {
      const novo = { ...atual };
      if (padrao) delete novo[chave];
      else novo[chave] = layout;
      return novo;
    });
    const pendente = temporizadores.current.get(chave);
    if (pendente) clearTimeout(pendente);
    temporizadores.current.set(
      chave,
      setTimeout(() => {
        temporizadores.current.delete(chave);
        // Preferência é conforto, não trabalho: falha fica no log do servidor
        // (a action já registra) e não interrompe quem está arrumando a tela.
        const gravacao = padrao
          ? limparPreferenciaTabela(chave)
          : salvarPreferenciaTabela(chave, JSON.stringify(layout));
        gravacao.catch(() => {});
      }, ESPERA_GRAVAR_MS),
    );
  }, []);

  const registrar = React.useCallback(() => {
    setGrades((n) => n + 1);
    return () => setGrades((n) => n - 1);
  }, []);

  React.useEffect(() => {
    if (!editando) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape" && !evento.defaultPrevented) setEditandoEm(null);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [editando]);

  const valor = React.useMemo<ContextoGrades>(
    () => ({ layoutBruto, salvar, editando, setEditando, registrar }),
    [layoutBruto, salvar, editando, setEditando, registrar],
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      {grades > 0 ? (
        // Aba pendurada na borda de cima, no canto direito, dentro do respiro de
        // 24px que o <main> tem acima do cabeçalho: ali não cobre nada. No canto
        // de baixo ela tapava o ⋮ da última linha da tabela. Fora da edição é
        // `absolute` (sobe junto ao rolar); na edição fica `fixed`, para o
        // "Concluir" estar à mão em qualquer altura da página. Só no desktop: no
        // celular o respiro é de 16px e a tela é a versão reduzida.
        <div
          className={cn(
            "top-0 right-6 z-40 hidden print:hidden md:block",
            editando ? "fixed" : "absolute",
          )}
        >
          {editando ? (
            <Button
              type="button"
              size="xs"
              className="h-6 rounded-t-none shadow-md"
              onClick={() => setEditando(false)}
            >
              <Check />
              Concluir
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="h-6 rounded-t-none border-t-0 bg-background text-muted-foreground hover:text-foreground"
              onClick={() => setEditando(true)}
            >
              <LayoutDashboard />
              Personalizar tela
            </Button>
          )}
        </div>
      ) : null}
    </Contexto.Provider>
  );
}
