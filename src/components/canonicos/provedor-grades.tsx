"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Check, LayoutDashboard } from "lucide-react";

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
  /** Há grade ou barra de filtros personalizável na tela agora. */
  temGrades: boolean;
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
    () => ({ layoutBruto, salvar, editando, setEditando, registrar, temGrades: grades > 0 }),
    [layoutBruto, salvar, editando, setEditando, registrar, grades],
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
    </Contexto.Provider>
  );
}

/**
 * Liga e desliga o "Personalizar tela". Só o ícone, no rodapé da sidebar ao lado
 * do botão de tema, com o mesmo desenho dele: fica à vista em toda tela e nunca
 * cobre o conteúdo (flutuando, tapava o ⋮ das tabelas). Some em tela sem nada
 * personalizável. Ligado, vira o ✓ de concluir, destacado.
 */
export function BotaoPersonalizar({ className }: { className?: string }) {
  const contexto = useGrades();
  if (!contexto?.temGrades) return null;
  const { editando, setEditando } = contexto;
  const rotulo = editando ? "Concluir a personalização da tela" : "Personalizar tela";
  const Icone = editando ? Check : LayoutDashboard;
  return (
    <button
      type="button"
      aria-label={rotulo}
      aria-pressed={editando}
      title={rotulo}
      onClick={() => setEditando(!editando)}
      className={cn(
        "inline-flex items-center justify-center transition-colors",
        editando
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Icone className="size-5" aria-hidden="true" />
    </button>
  );
}
