/**
 * Meia-largura (eixo X, em metros de tamanho real) de cada modelo 3D do mapa, medida da caixa dos
 * vértices de `public/mapa-modelos/<chave>.glb` (17/10/2026). Os modelos têm a frente em +Y e são
 * simétricos em X, então a meia-largura é a distância do centro até a lateral. Serve para pôr o
 * boneco do operador encostado na lateral da máquina (pedido do Tiago: "bem ao lado mesmo").
 * GLB novo precisa entrar aqui: `medidas-modelos.test.ts` confere contra a pasta.
 */
export const MEIA_LARGURA_MODELO_M: Readonly<Record<string, number>> = {
  boneco: 0.37,
  caminhao_basculante: 1.71,
  caminhao_betoneira: 1.93,
  caminhao_carroceria: 1.85,
  caminhao_espargidor: 1.61,
  caminhao_munck: 1.5,
  caminhao_pipa: 1.57,
  caminhao_prancha: 1.85,
  caminhonete: 1.21,
  carreta_cavalo: 2.25,
  escavadeira: 2.07,
  generico: 1.0,
  manipulador_telescopico: 1.42,
  meloza: 1.7,
  minicarregadeira: 0.92,
  motoniveladora: 1.39,
  pa_carregadeira: 1.44,
  retroescavadeira: 1.39,
  rolo_liso: 0.89,
  rolo_pe_carneiro: 1.65,
  rolo_pneu: 0.92,
  trator_esteira: 1.43,
  trator_pneu: 1.29,
  usina_asfalto: 1.11,
  vibroacabadora: 1.35,
};

/** Folga entre a lateral da máquina e o boneco, em metros. */
const FOLGA_M = 0.5;

/**
 * Do centro da máquina ao centro do boneco do operador, em metros no terreno: a meia-largura da
 * máquina na escala dela, mais a meia-largura do boneco na dele, mais a folga. Modelo sem GLB
 * (desenhado pelo genérico) usa a medida do genérico.
 */
export function afastamentoDoOperadorM(
  modelo3d: string,
  escalaMaquina: number,
  escalaBoneco: number,
): number {
  const maquina =
    MEIA_LARGURA_MODELO_M[modelo3d] ?? MEIA_LARGURA_MODELO_M.generico!;
  return (
    maquina * escalaMaquina + MEIA_LARGURA_MODELO_M.boneco! * escalaBoneco + FOLGA_M
  );
}
