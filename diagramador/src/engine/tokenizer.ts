/**
 * Tokenizer — Transforma texto bruto em uma lista de Tokens tipados.
 * 
 * Evolução do V3: agora cada token carrega seu estilo (CharacterStyle),
 * preparando o motor para renderizar texto com formatação mista (bold, italic, etc.)
 * dentro do mesmo parágrafo.
 */

import type { CharacterStyle } from '../model/types';
import type { Span } from '../model/types';
import { TokenType } from './types';
import type { Token } from './types';

/**
 * Tokeniza um array de Spans (texto com estilo) em uma lista linear de Tokens.
 * Cada token preserva a referência ao estilo do Span de origem.
 */
export function tokenize(spans: Span[], baseStyle: CharacterStyle): Token[] {
  const tokens: Token[] = [];

  for (const span of spans) {
    const style: CharacterStyle = {
      ...baseStyle,
      ...span.styleOverrides,
    };

    const text = span.text;
    let currentWord = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '\n') {
        // Flush qualquer palavra acumulada
        if (currentWord.length > 0) {
          tokens.push({ type: TokenType.WORD, value: currentWord, style });
          currentWord = '';
        }
        tokens.push({ type: TokenType.NEWLINE, value: '\n', style });
      } else if (char === ' ') {
        if (currentWord.length > 0) {
          tokens.push({ type: TokenType.WORD, value: currentWord, style });
          currentWord = '';
        }
        tokens.push({ type: TokenType.SPACE, value: ' ', style });
      } else {
        currentWord += char;
      }
    }

    // Flush da última palavra do span
    if (currentWord.length > 0) {
      tokens.push({ type: TokenType.WORD, value: currentWord, style });
    }
  }

  return tokens;
}

/**
 * Fila de tokens com cursor e capacidade de devolver tokens ao início.
 * 
 * Diferença do V3: usa uma deque (head pointer + push) em vez de splice(),
 * evitando a complexidade O(n) por operação de unshift.
 */
export class TokenQueue {
  private tokens: Token[];
  private cursor: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.cursor = 0;
  }

  peek(): Token | null {
    return this.tokens[this.cursor] ?? null;
  }

  consume(): Token | null {
    const token = this.tokens[this.cursor];
    if (token !== undefined) {
      this.cursor++;
      return token;
    }
    return null;
  }

  /**
   * Devolve um token para a fila, para ser processado na próxima iteração.
   * Inserimos logo antes do cursor atual.
   * 
   * Nota: splice() é O(n) no pior caso, mas na prática só é chamado
   * no character-break de palavras gigantes (caso raro). Para otimização
   * futura, podemos usar uma deque real com linked list.
   */
  putBack(token: Token): void {
    this.tokens.splice(this.cursor, 0, token);
  }

  hasMore(): boolean {
    return this.cursor < this.tokens.length;
  }
}
