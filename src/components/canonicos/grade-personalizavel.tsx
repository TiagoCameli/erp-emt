"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Ellipsis,
  EyeOff,
  GripVertical,
  Plus,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ALTURAS_GRADE,
  LARGURAS_GRADE,
  baseDaLargura,
  colunasDaLargura,
  layoutGradeEhPadrao,
  layoutGradeVazio,
  lerLayoutGrade,
  limitarAltura,
  moverNaOrdem,
  moverUmPasso,
  ordemDaGrade,
  preservarForaDaTela,
  type LayoutGrade,
  type TamanhoItemGrade,
} from "@/components/canonicos/layout-grade";
import { useGrades } from "@/components/canonicos/provedor-grades";
import { cn } from "@/lib/utils";

export interface ItemGradeDados {
  id: string;
  /** Nome do card no menu de "Adicionar card" e nos rótulos de acessibilidade. */
  titulo: string;
  /** Colunas de 12 quando a pessoa não escolheu. Ausente = automática (divide a linha). */
  larguraPadrao?: number;
  conteudo: React.ReactNode;
}

export type VaoGrade = "compacto" | "amplo";

const VAOS: Record<VaoGrade, string> = { compacto: "0.75rem", amplo: "1rem" };

export interface GradePersonalizavelProps {
  idGrade: string;
  itens: ItemGradeDados[];
  /** Nome da área na barra de edição, ex. "Saldos". */
  titulo?: string;
  vao?: VaoGrade;
  className?: string;
}

type Borda = "direita" | "baixo" | "canto";

/**
 * Verdadeiro dentro do card de outra grade personalizável. Grade aninhada não
 * entra em edição: o card de fora fica `inert` no modo de edição, e os controles
 * dela ficariam visíveis e mortos. Ela anda junto com o card que a contém.
 */
const DentroDeGrade = React.createContext(false);

interface Previa {
  id: string;
  tamanho: TamanhoItemGrade;
}

/**
 * Grade de cards e gráficos que cada pessoa arruma do seu jeito: muda a ordem
 * arrastando, muda o tamanho puxando a borda (ou pelo menu), tira card da tela
 * e coloca de volta. O layout é da pessoa e segue ela em qualquer máquina.
 *
 * Fora do ProvedorGrades (teste, tela isolada) vira uma grade fixa na ordem
 * padrão, sem botão nenhum.
 *
 * Largura escolhida só vale com a grade larga (container de 48rem ou mais):
 * em tela estreita "1/4 da linha" seria um card de 80px, então lá todo card
 * escolhido ocupa a linha e o automático continua dividindo a linha como antes.
 */
export function GradePersonalizavel({
  idGrade,
  itens,
  titulo,
  vao = "compacto",
  className,
}: GradePersonalizavelProps) {
  const contexto = useGrades();
  const aninhada = React.useContext(DentroDeGrade);
  const editando = !aninhada && (contexto?.editando ?? false);
  const registrar = aninhada ? undefined : contexto?.registrar;
  const idsPadrao = React.useMemo(() => itens.map((i) => i.id), [itens]);

  React.useEffect(() => registrar?.(), [registrar]);

  const layout = React.useMemo(
    () => (contexto ? lerLayoutGrade(contexto.layoutBruto(idGrade), idsPadrao) : layoutGradeVazio()),
    [contexto, idGrade, idsPadrao],
  );

  const [ordemArrasto, setOrdemArrasto] = React.useState<string[] | null>(null);
  const [arrastando, setArrastando] = React.useState<string | null>(null);
  const [previa, setPrevia] = React.useState<Previa | null>(null);
  const gradeRef = React.useRef<HTMLDivElement>(null);

  const ordem = ordemArrasto ?? ordemDaGrade(idsPadrao, layout.ordem);
  const ocultos = new Set(layout.ocultos);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const visiveis = ordem.filter((id) => !ocultos.has(id));
  const idsVisiveis = new Set(visiveis);
  const escondidos = itens.filter((i) => ocultos.has(i.id));

  function gravar(mudar: (atual: LayoutGrade) => LayoutGrade) {
    if (!contexto) return;
    contexto.salvar(
      idGrade,
      preservarForaDaTela(mudar(layout), contexto.layoutBruto(idGrade), idsPadrao),
    );
  }

  function mudarTamanho(id: string, tamanho: TamanhoItemGrade) {
    gravar((atual) => {
      const tamanhos = { ...atual.tamanhos };
      const novo = { ...tamanhos[id], ...tamanho };
      if (novo.largura === undefined) delete novo.largura;
      if (novo.altura === undefined) delete novo.altura;
      if (novo.largura === undefined && novo.altura === undefined) delete tamanhos[id];
      else tamanhos[id] = novo;
      return { ...atual, tamanhos };
    });
  }

  function mudarOrdem(nova: string[]) {
    gravar((atual) => ({ ...atual, ordem: nova }));
  }

  function ocultar(id: string) {
    gravar((atual) => ({ ...atual, ocultos: [...atual.ocultos, id] }));
  }

  function mostrar(id: string) {
    gravar((atual) => ({ ...atual, ocultos: atual.ocultos.filter((x) => x !== id) }));
  }

  // ---- redimensionar pela borda --------------------------------------------

  function iniciarRedimensionar(evento: React.PointerEvent<HTMLElement>, id: string, borda: Borda) {
    const item = evento.currentTarget.closest<HTMLElement>("[data-item-grade]");
    const grade = gradeRef.current;
    if (!item || !grade) return;
    evento.preventDefault();
    evento.stopPropagation();
    const alca = evento.currentTarget;
    alca.setPointerCapture(evento.pointerId);

    const inicioX = evento.clientX;
    const inicioY = evento.clientY;
    const caixa = item.getBoundingClientRect();
    const larguraGrade = grade.getBoundingClientRect().width;
    const vaoPx = Number.parseFloat(getComputedStyle(grade).columnGap) || 12;
    const atual = layout.tamanhos[id] ?? {};
    let ultimo: TamanhoItemGrade = { ...atual };

    function aoMover(e: PointerEvent) {
      const tamanho: TamanhoItemGrade = { ...atual };
      if (borda !== "baixo") {
        tamanho.largura = colunasDaLargura(caixa.width + e.clientX - inicioX, larguraGrade, vaoPx);
      }
      if (borda !== "direita") {
        tamanho.altura = limitarAltura(Math.round((caixa.height + e.clientY - inicioY) / 8) * 8);
      }
      ultimo = tamanho;
      setPrevia({ id, tamanho });
    }

    function aoSoltar() {
      alca.removeEventListener("pointermove", aoMover);
      alca.removeEventListener("pointerup", aoSoltar);
      alca.removeEventListener("pointercancel", aoSoltar);
      alca.removeEventListener("lostpointercapture", aoSoltar);
      setPrevia(null);
      if (ultimo.largura !== atual.largura || ultimo.altura !== atual.altura) {
        mudarTamanho(id, ultimo);
      }
    }

    alca.addEventListener("pointermove", aoMover);
    alca.addEventListener("pointerup", aoSoltar);
    alca.addEventListener("pointercancel", aoSoltar);
    alca.addEventListener("lostpointercapture", aoSoltar);
  }

  // ---- arrastar para reordenar --------------------------------------------

  function aoComecarArrasto(evento: React.DragEvent<HTMLElement>, id: string) {
    const item = evento.currentTarget.closest<HTMLElement>("[data-item-grade]");
    evento.dataTransfer.effectAllowed = "move";
    evento.dataTransfer.setData("text/plain", id);
    if (item) {
      const caixa = item.getBoundingClientRect();
      evento.dataTransfer.setDragImage(item, evento.clientX - caixa.left, evento.clientY - caixa.top);
    }
    setArrastando(id);
    setOrdemArrasto(ordem);
  }

  function aoPassarPorCima(evento: React.DragEvent<HTMLElement>, alvo: string) {
    if (!arrastando) return;
    evento.preventDefault();
    evento.dataTransfer.dropEffect = "move";
    if (alvo === arrastando) return;
    const caixa = evento.currentTarget.getBoundingClientRect();
    const larguraGrade = gradeRef.current?.getBoundingClientRect().width ?? 0;
    // Card de linha inteira não tem vizinho dos lados: antes/depois é em cima/embaixo.
    const linhaInteira = larguraGrade > 0 && caixa.width > larguraGrade * 0.9;
    const depois = linhaInteira
      ? evento.clientY > caixa.top + caixa.height / 2
      : evento.clientX > caixa.left + caixa.width / 2;
    setOrdemArrasto((atual) => {
      const base = atual ?? ordem;
      const nova = moverNaOrdem(base, arrastando, alvo, depois);
      return nova.join() === base.join() ? atual : nova;
    });
  }

  function aoSoltarArrasto(evento: React.DragEvent<HTMLElement>) {
    if (!arrastando) return;
    evento.preventDefault();
    if (ordemArrasto) mudarOrdem(ordemArrasto);
    setArrastando(null);
    setOrdemArrasto(null);
  }

  function aoTerminarArrasto() {
    setArrastando(null);
    setOrdemArrasto(null);
  }

  const padrao = layoutGradeEhPadrao(layout);

  return (
    <div className={cn("@container", className)}>
      {editando ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border bg-surface px-3 py-2 print:hidden">
          <p className="text-legenda text-muted-foreground">
            {titulo ? <span className="font-medium text-foreground">{titulo}: </span> : null}
            arraste pelo <GripVertical className="inline size-3.5 align-text-bottom" aria-hidden /> para
            mudar a ordem e puxe a borda direita ou de baixo para mudar o tamanho.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="xs" disabled={escondidos.length === 0}>
                  <Plus />
                  {escondidos.length === 0
                    ? "Nenhum card fora da tela"
                    : `Colocar de volta (${escondidos.length})`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Cards fora da tela</DropdownMenuLabel>
                {escondidos.map((item) => (
                  <DropdownMenuItem key={item.id} onSelect={() => mostrar(item.id)}>
                    {item.titulo}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={padrao}
              onClick={() => contexto?.salvar(idGrade, layoutGradeVazio())}
            >
              <RotateCcw />
              Restaurar padrão
            </Button>
          </div>
        </div>
      ) : null}

      <div
        ref={gradeRef}
        // Na edição as fileiras se afastam para a barra de cada card (montada na
        // borda de cima) não encostar no card de cima. Só o vão vertical muda: o
        // horizontal entra na conta das larguras.
        className={cn("flex flex-wrap gap-(--vao-grade)", editando && "gap-y-7")}
        style={{ "--vao-grade": VAOS[vao] } as React.CSSProperties}
        onDragOver={arrastando ? (e) => e.preventDefault() : undefined}
        onDrop={aoSoltarArrasto}
      >
        {visiveis.map((id) => {
          const item = porId.get(id);
          if (!item) return null;
          const salvo = layout.tamanhos[id] ?? {};
          const tamanho = editando && previa?.id === id ? previa.tamanho : salvo;
          const largura = tamanho.largura ?? item.larguraPadrao;
          const altura = tamanho.altura;
          return (
            <div
              key={id}
              data-item-grade={id}
              className={cn(
                "relative flex min-w-0 flex-col",
                largura === undefined
                  ? "flex-1 basis-64"
                  : "shrink grow-0 basis-full @3xl:basis-(--base-item)",
                editando && "rounded-lg outline-1 outline-offset-2 outline-muted-foreground/50 outline-dashed",
                arrastando === id && "opacity-50",
              )}
              style={
                {
                  "--base-item": largura === undefined ? undefined : baseDaLargura(largura),
                  height: altura,
                  // Deixa o gráfico (AreaGrafico) encolher junto com o card.
                  "--altura-grafico-min": altura === undefined ? undefined : "6rem",
                } as React.CSSProperties
              }
              onDragOver={editando ? (e) => aoPassarPorCima(e, id) : undefined}
            >
              <div
                inert={editando}
                className={cn(
                  "flex min-h-0 flex-1 flex-col [&>*]:flex-1",
                  altura !== undefined && "overflow-hidden [&>*]:min-h-0 [&>*]:overflow-hidden",
                  editando && "select-none",
                )}
              >
                <DentroDeGrade.Provider value={true}>{item.conteudo}</DentroDeGrade.Provider>
              </div>

              {editando ? (
                <>
                  <BarraDoItem
                    titulo={item.titulo}
                    largura={salvo.largura}
                    altura={salvo.altura}
                    podeAntes={moverUmPasso(ordem, idsVisiveis, id, -1) !== ordem}
                    podeDepois={moverUmPasso(ordem, idsVisiveis, id, 1) !== ordem}
                    aoComecarArrasto={(e) => aoComecarArrasto(e, id)}
                    aoTerminarArrasto={aoTerminarArrasto}
                    aoMudarLargura={(colunas) => mudarTamanho(id, { largura: colunas })}
                    aoMudarAltura={(px) => mudarTamanho(id, { altura: px })}
                    aoMover={(passo) => mudarOrdem(moverUmPasso(ordem, idsVisiveis, id, passo))}
                    aoOcultar={() => ocultar(id)}
                  />
                  <span
                    aria-hidden
                    className="absolute top-2 -right-2 bottom-4 w-3 cursor-ew-resize rounded-sm hover:bg-ring/30"
                    onPointerDown={(e) => iniciarRedimensionar(e, id, "direita")}
                  />
                  <span
                    aria-hidden
                    className="absolute right-4 -bottom-2 left-2 h-3 cursor-ns-resize rounded-sm hover:bg-ring/30"
                    onPointerDown={(e) => iniciarRedimensionar(e, id, "baixo")}
                  />
                  <span
                    aria-hidden
                    className="absolute -right-2 -bottom-2 size-4 cursor-nwse-resize rounded-sm border-r-2 border-b-2 border-muted-foreground hover:border-ring"
                    onPointerDown={(e) => iniciarRedimensionar(e, id, "canto")}
                  />
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface BarraDoItemProps {
  titulo: string;
  largura?: number;
  altura?: number;
  podeAntes: boolean;
  podeDepois: boolean;
  aoComecarArrasto: (evento: React.DragEvent<HTMLElement>) => void;
  aoTerminarArrasto: () => void;
  aoMudarLargura: (colunas: number | undefined) => void;
  aoMudarAltura: (px: number | undefined) => void;
  aoMover: (passo: -1 | 1) => void;
  aoOcultar: () => void;
}

/**
 * Os controles de um card no modo de edição. O menu repete o que o arrasto faz
 * porque arrasto não existe no teclado nem no toque: mover e redimensionar têm
 * que dar para fazer só com o menu.
 */
function BarraDoItem({
  titulo,
  largura,
  altura,
  podeAntes,
  podeDepois,
  aoComecarArrasto,
  aoTerminarArrasto,
  aoMudarLargura,
  aoMudarAltura,
  aoMover,
  aoOcultar,
}: BarraDoItemProps) {
  // A largura salva pode ter vindo do arrasto (5 colunas, por exemplo), que não
  // está entre as opções prontas: aí nenhuma fica marcada, o que é verdade.
  const valorLargura = largura === undefined ? "padrao" : String(largura);
  const valorAltura = altura === undefined ? "auto" : String(altura);

  return (
    // Montada em cima da borda de cima (metade fora do card) para não cobrir o
    // título: dentro do card ela tapava o fim de "Pagamentos a aprovar".
    <div className="absolute -top-3.5 right-2 z-10 flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 shadow-sm print:hidden">
      <span
        role="button"
        tabIndex={-1}
        draggable
        title={`Arrastar ${titulo}`}
        aria-label={`Arrastar ${titulo}`}
        className="flex size-6 cursor-grab items-center justify-center rounded-sm text-muted-foreground hover:bg-surface hover:text-foreground active:cursor-grabbing"
        onDragStart={aoComecarArrasto}
        onDragEnd={aoTerminarArrasto}
      >
        <GripVertical className="size-4" />
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" className="size-6" aria-label={`Tamanho e posição de ${titulo}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="truncate">{titulo}</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Largura</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={valorLargura}
                onValueChange={(v) => aoMudarLargura(v === "padrao" ? undefined : Number(v))}
              >
                <DropdownMenuRadioItem value="padrao">Padrão da tela</DropdownMenuRadioItem>
                {LARGURAS_GRADE.map((opcao) => (
                  <DropdownMenuRadioItem key={opcao.colunas} value={String(opcao.colunas)}>
                    {opcao.rotulo}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Altura</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={valorAltura}
                onValueChange={(v) => aoMudarAltura(v === "auto" ? undefined : Number(v))}
              >
                <DropdownMenuRadioItem value="auto">Automática</DropdownMenuRadioItem>
                {ALTURAS_GRADE.map((opcao) => (
                  <DropdownMenuRadioItem key={opcao.px} value={String(opcao.px)}>
                    {opcao.rotulo}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!podeAntes} onSelect={() => aoMover(-1)}>
            <ArrowLeft />
            Mover para antes
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!podeDepois} onSelect={() => aoMover(1)}>
            <ArrowRight />
            Mover para depois
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={aoOcultar}>
            <EyeOff />
            Tirar da tela
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-6"
        aria-label={`Tirar ${titulo} da tela`}
        title="Tirar da tela"
        onClick={aoOcultar}
      >
        <EyeOff />
      </Button>
    </div>
  );
}
