/**
 * editor-layout — preset de COMPOSIÇÃO do editor do produto.
 *
 * Fonte única do algoritmo de quebra usado pelo editor. O `EditorShell` consome esta
 * constante TANTO no preview (paginação) QUANTO na exportação PDF, garantindo que o
 * que se vê na tela e o que sai no PDF passam pelo mesmo caminho de layout.
 *
 * `kp` = Knuth-Plass: habilita a hifenização pt-BR e a justificação editorial do motor.
 * (greedy não justifica e não aproveita os pontos de hifenização → margem direita irregular.)
 */
export const EDITOR_LAYOUT_ALGORITHM = 'kp' as const;
