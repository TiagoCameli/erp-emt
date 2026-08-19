/**
 * Logo da EMT Construtora.
 *
 * SVG inline, e nao <img> de /public, por dois motivos que valem mais que a
 * economia de bytes: (1) o espelho e o holerite vao pra IMPRESSORA, e imagem
 * externa pode nao ter chegado quando o navegador monta a folha, o que sai como
 * um retangulo vazio no lugar da marca num documento que vai pra contador e
 * processo; (2) `mono` recolore a marca inteira com `currentColor`, o que
 * arquivo raster nao faz.
 *
 * Os dois `path` sao tracados do arquivo de marca
 * (personal-os/brand/images/emt-logo.jpg) com as cores medidas nele: verde
 * #3E7744, asfalto #45464B, eixo #CF943A, texto #1D1D1F. A pista e geometria, e
 * nao traco, porque ela e retangulo puro e traco de retangulo so carrega a
 * serrilha do JPEG.
 *
 * Coordenadas: viewBox recortado no desenho (932 x 742). O wordmark
 * "Construtora Ltda" ocupa y 0..66, as letras EMT y 150..557 e a pista
 * y 579..742 — e por isso que a variante `simbolo` so muda o viewBox, sem
 * mexer em path nenhum.
 */
import { cn } from "@/lib/utils";

const VERDE = "#3E7744";
const ASFALTO = "#45464B";
const EIXO = "#CF943A";
const TRACEJADO = "#A3A4A8";
const TEXTO = "#1D1D1F";

/** "Construtora Ltda". */
const D_WORDMARK =
  "M367 63 L365 63 L364 60 L362 59 L361 52 L360 52 L360 18 L373 18 L373 49 L374 49 L374 53 L377 56 L385 56 L390 49 L390 18 L404 18 L405 65 L391 65 L391 59 L389 59 L389 61 L382 66 L371 66 L371 65 L368 65Z M45 11 L47 15 L47 22 L35 22 L34 14 L31 11 L23 10 L17 13 L14 19 L14 23 L13 23 L13 43 L14 43 L14 48 L16 52 L22 56 L29 56 L34 52 L36 44 L48 44 L48 50 L43 60 L31 66 L19 66 L19 65 L15 65 L11 63 L10 61 L8 61 L2 52 L1 42 L0 42 L0 24 L1 24 L1 18 L2 18 L2 15 L5 9 L10 4 L17 2 L17 1 L34 1 L34 2 L39 3 L44 8Z M259 58 L259 28 L244 28 L244 18 L259 18 L258 6 L265 5 L265 4 L271 4 L271 18 L288 18 L288 28 L271 28 L271 52 L275 56 L288 56 L288 65 L264 65 L260 62Z M430 61 L429 60 L429 28 L414 28 L414 18 L429 18 L429 7 L428 6 L435 5 L435 4 L441 4 L441 18 L458 18 L458 28 L441 28 L441 52 L445 56 L458 56 L458 65 L434 65Z M511 25 L514 27 L516 34 L517 34 L517 49 L516 49 L516 53 L514 57 L508 63 L504 65 L500 65 L500 66 L488 66 L488 65 L485 65 L479 62 L474 56 L473 51 L472 51 L472 46 L471 46 L471 37 L472 37 L472 33 L476 25 L480 21 L487 19 L487 18 L501 18 L501 19 L508 21Z M624 23 L628 26 L628 29 L629 29 L629 55 L634 57 L634 65 L622 65 L619 60 L616 63 L612 65 L608 65 L608 66 L598 66 L598 65 L591 63 L587 57 L587 47 L589 43 L595 39 L602 38 L602 37 L617 37 L619 33 L618 33 L617 28 L613 26 L604 26 L600 29 L599 32 L588 32 L589 25 L593 21 L599 18 L604 18 L604 17 L617 18 L623 21Z M913 18 L923 21 L929 29 L929 56 L933 57 L933 65 L922 65 L919 62 L919 60 L917 60 L914 64 L911 64 L908 66 L898 66 L898 65 L892 64 L887 59 L886 48 L892 40 L897 39 L897 38 L902 38 L902 37 L917 37 L918 36 L918 30 L913 26 L904 26 L899 30 L899 32 L887 32 L889 25 L893 21 L900 19 L900 18 L905 18 L905 17Z M226 32 L215 32 L214 29 L209 25 L201 26 L198 29 L198 32 L201 35 L217 37 L217 38 L224 40 L227 43 L228 56 L222 63 L213 65 L213 66 L200 66 L200 65 L196 65 L192 63 L186 57 L185 51 L198 51 L198 53 L202 57 L206 57 L206 58 L213 57 L216 54 L216 50 L212 47 L200 46 L200 45 L196 45 L188 41 L186 37 L186 28 L187 28 L187 25 L191 21 L198 19 L198 18 L205 18 L205 17 L214 18 L214 19 L221 21 L225 25 L227 29 L227 32Z M301 27 L301 18 L319 18 L318 26 L320 26 L320 24 L327 18 L338 18 L345 23 L347 27 L347 37 L346 38 L336 38 L335 31 L332 28 L324 28 L320 32 L320 56 L331 56 L331 65 L301 65 L301 56 L308 56 L308 28 L301 28Z M138 39 L138 65 L125 65 L125 18 L138 18 L137 24 L142 19 L145 19 L145 18 L159 18 L159 19 L164 20 L168 24 L169 30 L170 30 L170 65 L158 65 L158 35 L157 35 L157 31 L154 28 L151 28 L151 27 L143 28 L139 33Z M811 24 L811 28 L795 28 L795 53 L799 56 L812 56 L812 65 L788 65 L786 64 L782 57 L782 28 L768 28 L768 18 L782 18 L782 5 L788 5 L788 4 L795 3 L795 18 L811 18Z M552 29 L550 31 L550 56 L561 56 L561 65 L530 65 L530 56 L538 56 L538 28 L537 27 L530 28 L530 18 L548 18 L548 25 L550 25 L551 22 L557 18 L561 18 L561 17 L567 18 L571 20 L576 26 L576 38 L565 38 L565 32 L562 28 L556 27Z M859 38 L858 32 L856 31 L855 28 L843 27 L839 31 L839 34 L838 34 L838 49 L841 55 L845 57 L851 57 L855 55 L859 48Z M607 58 L612 57 L617 53 L618 51 L617 44 L604 44 L598 48 L599 55Z M737 65 L713 65 L713 1 L727 1 L727 56 L755 56 L755 65Z M870 0 L871 0 L871 65 L858 65 L858 60 L849 66 L839 66 L839 65 L832 63 L827 56 L826 48 L825 48 L825 35 L826 35 L828 26 L830 25 L832 21 L838 18 L850 18 L856 21 L857 24 L859 24 L859 0Z M72 62 L66 57 L64 53 L64 49 L63 49 L63 35 L64 35 L64 31 L66 27 L69 25 L69 23 L71 23 L72 21 L78 18 L93 18 L95 20 L98 20 L100 23 L103 24 L103 26 L106 28 L107 33 L108 33 L109 45 L108 45 L106 56 L101 62 L95 65 L92 65 L92 66 L79 66Z M77 31 L76 37 L75 37 L75 46 L76 46 L77 53 L83 57 L91 56 L94 53 L95 48 L96 48 L96 35 L95 35 L94 30 L90 27 L81 27Z M495 57 L502 54 L504 47 L505 47 L505 37 L504 37 L503 31 L500 28 L490 27 L486 30 L485 35 L484 35 L484 49 L485 49 L485 52 L489 56Z M903 45 L899 46 L898 48 L898 53 L900 56 L909 58 L909 57 L914 56 L917 53 L917 50 L918 50 L917 44 L904 44Z";

/** As letras EMT. */
const D_EMT =
  "M448 401 L454 440 L457 442 L459 438 L472 362 L517 151 L657 150 L658 557 L569 557 L574 224 L495 556 L412 555 L336 227 L342 557 L251 557 L250 151 L395 151Z M764 406 L764 223 L686 223 L685 151 L932 150 L931 222 L856 222 L856 557 L764 557Z M193 364 L192 385 L92 385 L92 483 L211 483 L212 557 L1 557 L1 150 L212 151 L211 223 L92 223 L92 313 L193 313Z";

/**
 * As duas fileiras de tracejado da pista, com a posicao e a largura medidas no
 * original. Retangulos explicitos, e nao `stroke-dasharray` numa linha: e o
 * mesmo desenho com metade dos caracteres, mas rasterizador fraco (o do
 * ImageMagick, por exemplo, que e quem gera o PNG da marca) ignora dasharray e
 * entrega a pista com dois riscos continuos no lugar do tracejado.
 */
const D_TRACEJADO =
  "M51 618h51v5h-51Z M142 618h49v5h-49Z M229 618h50v5h-50Z M316 618h51v5h-51Z M405 618h49v5h-49Z M492 618h51v5h-51Z M581 618h50v5h-50Z M668 618h50v5h-50Z M756 618h50v5h-50Z M841 618h49v5h-49Z M51 706h50v5h-50Z M141 706h52v5h-52Z M229 706h49v5h-49Z M316 706h50v5h-50Z M403 706h48v5h-48Z M491 706h51v5h-51Z M581 706h49v5h-49Z M670 706h45v5h-45Z M755 706h50v5h-50Z M840 706h47v5h-47Z";

/**
 * `completa` traz o wordmark; `simbolo` corta ele e deixa EMT sobre a pista,
 * que e o que caber em 28px de sidebar.
 */
const VIEWBOX = {
  completa: "0 0 932 742",
  simbolo: "0 150 932 592",
} as const;

export type VarianteLogoEmt = keyof typeof VIEWBOX;

export function LogoEmt({
  variante = "completa",
  mono = false,
  titulo,
  className,
}: {
  variante?: VarianteLogoEmt;
  /**
   * Marca inteira em `currentColor`, para uso sobre fundo colorido (barra verde
   * do cabecalho, por exemplo). O asfalto e o tracejado entram com opacidade
   * para a pista continuar legivel como pista numa cor so.
   */
  mono?: boolean;
  /**
   * Nome acessivel. Sem ele o SVG e decoracao (`aria-hidden`) — o que e o certo
   * quando o nome da empresa ja esta escrito em texto ao lado.
   */
  titulo?: string;
  className?: string;
}) {
  const corTexto = mono ? "currentColor" : TEXTO;
  const corLetras = mono ? "currentColor" : VERDE;
  return (
    <svg
      viewBox={VIEWBOX[variante]}
      className={cn("block h-auto", className)}
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      {variante === "completa" ? (
        <path d={D_WORDMARK} fill={corTexto} fillRule="evenodd" />
      ) : null}
      <path d={D_EMT} fill={corLetras} fillRule="evenodd" />
      {/* Pista: asfalto, duas fileiras de tracejado e o eixo amarelo. */}
      <rect
        x="0"
        y="579"
        width="932"
        height="163"
        fill={mono ? "currentColor" : ASFALTO}
        opacity={mono ? 0.24 : undefined}
      />
      <path
        d={D_TRACEJADO}
        fill={mono ? "currentColor" : TRACEJADO}
        opacity={mono ? 0.9 : undefined}
      />
      <rect
        x="1"
        y="656"
        width="929"
        height="11"
        fill={mono ? "currentColor" : EIXO}
      />
    </svg>
  );
}
