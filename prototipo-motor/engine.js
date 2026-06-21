// O "cérebro" matemático do projeto. Arquitetura Máquina de Estados (Google Docs Style).
// Tokeniza o texto e consome a largura pedaço por pedaço.

class Tokenizer {
  constructor(text, measureFn) {
    this.text = text;
    this.measureFn = measureFn;
    this.tokens = this.tokenize(text);
    this.cursor = 0;
  }

  tokenize(text) {
    const tokens = [];
    let currentWord = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '\n') {
        if (currentWord.length > 0) {
          tokens.push({ type: 'word', value: currentWord, width: this.measureFn(currentWord) });
          currentWord = '';
        }
        tokens.push({ type: 'newline', value: '\n', width: 0 });
      } else if (char === ' ') {
        if (currentWord.length > 0) {
          tokens.push({ type: 'word', value: currentWord, width: this.measureFn(currentWord) });
          currentWord = '';
        }
        tokens.push({ type: 'space', value: ' ', width: this.measureFn(' ') });
      } else {
        currentWord += char;
      }
    }
    
    if (currentWord.length > 0) {
      tokens.push({ type: 'word', value: currentWord, width: this.measureFn(currentWord) });
    }
    return tokens;
  }

  peek() {
    return this.tokens[this.cursor] || null;
  }

  consume() {
    return this.tokens[this.cursor++];
  }

  // Devolve algo para o começo da fila (usado para "fatiar" palavras que não cabem)
  unshift(token) {
    this.tokens.splice(this.cursor, 0, token);
  }
}

class TextEngine {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = Object.assign({
      fontSize: 16,
      fontFamily: 'sans-serif',
      lineHeight: 1.4
    }, config);
  }

  setupContext() {
    this.ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`;
    this.ctx.textBaseline = 'top';
  }

  flowText(text, frames) {
    this.setupContext();
    const result = frames.map(f => ({ frame: f, lines: [] }));
    if (!text || frames.length === 0) return result;

    const measureFn = (t) => {
      this.setupContext(); // Segurança extra
      return this.ctx.measureText(t).width;
    };
    
    const tokenizer = new Tokenizer(text, measureFn);
    
    let frameIdx = 0;
    let currentY = 0;
    const lineHeightPx = this.config.fontSize * this.config.lineHeight;

    let currentLineTokens = [];
    let currentLineWidth = 0;

    // Helper: Desenha a linha calculada no frame atual e desce o cursor Y
    const pushLine = () => {
      if (currentLineTokens.length > 0) {
        const lineText = currentLineTokens.map(t => t.value).join('');
        result[frameIdx].lines.push({ text: lineText, y: currentY });
        currentLineTokens = [];
        currentLineWidth = 0;
        currentY += lineHeightPx;
      }
    };

    while (tokenizer.peek()) {
      // 1. CHECAGEM DE Y (Limite Vertical Estrito)
      // Se não houver altura para mais NENHUMA linha, pula para o próximo frame
      if (currentY + lineHeightPx > frames[frameIdx].height) {
        frameIdx++;
        currentY = 0;
        if (frameIdx >= frames.length) break; // Estourou tudo, acabou a página
        continue; // Recomeça a leitura na nova coordenada
      }

      // 2. CHECAGEM DE LARGURA
      // Toda vez que iteramos, conferimos qual é a largura permitida AGORA.
      const availableWidth = frames[frameIdx].width;
      const token = tokenizer.peek();

      if (token.type === 'newline') {
        tokenizer.consume();
        pushLine(); 
        if (currentLineTokens.length === 0) {
          // Se demos push em uma linha vazia, garante que pulemos o espaço
          currentY += lineHeightPx;
        }
        continue;
      }

      if (token.type === 'space') {
        // Regra de tipografia: Ignora espaços no início de uma linha nova
        if (currentLineTokens.length === 0) {
          tokenizer.consume();
          continue;
        }
        
        if (currentLineWidth + token.width <= availableWidth) {
          currentLineTokens.push(tokenizer.consume());
          currentLineWidth += token.width;
        } else {
          // O espaço extrapolou a linha. Apenas consome o espaço e fecha a linha.
          tokenizer.consume();
          pushLine();
        }
        continue;
      }

      if (token.type === 'word') {
        if (currentLineWidth + token.width <= availableWidth) {
          // Palavra inteira cabe livremente!
          currentLineTokens.push(tokenizer.consume());
          currentLineWidth += token.width;
        } else {
          // A palavra NÃO cabe.
          
          // Se já temos outras palavras nesta linha, vamos fechar a linha agora
          // e tentar empurrar essa mesma palavra para a linha debaixo.
          if (currentLineTokens.length > 0) {
            pushLine();
            continue; // Re-tenta a mesma palavra no próximo ciclo (na linha limpa)
          }

          // Se o código chegou aqui: a linha está VAZIA e a palavra não coube.
          // Conclusão: a palavra é GIGANTE e maior que o próprio Frame.
          // Solução: Fatiamento de palavra (Character Wrapping).
          tokenizer.consume(); // Retiramos a palavra gigante da fila
          
          let chunk = '';
          let chunkWidth = 0;
          let remaining = '';

          // Quebramos a palavra pedaço por pedaço até onde der
          for (let i = 0; i < token.value.length; i++) {
            const char = token.value[i];
            const charWidth = measureFn(char);
            if (chunkWidth + charWidth <= availableWidth) {
              chunk += char;
              chunkWidth += charWidth;
            } else {
              remaining = token.value.substring(i);
              break;
            }
          }

          // Failsafe: se o frame for tão pequeno que nem 1 letra cabe, force ao menos 1 para não travar
          if (chunk.length === 0 && token.value.length > 0) {
             chunk = token.value[0];
             remaining = token.value.substring(1);
          }

          // Injeta a fatia que coube na linha e fecha a linha
          currentLineTokens.push({ type: 'word', value: chunk, width: measureFn(chunk) });
          pushLine();

          // Devolvemos o que sobrou da palavra para ser consumido na próxima linha!
          if (remaining.length > 0) {
            tokenizer.unshift({ type: 'word', value: remaining, width: measureFn(remaining) });
          }
        }
      }
    }

    // Fecha a última linha se sobrar algo
    if (currentLineTokens.length > 0 && frameIdx < frames.length) {
      if (currentY + lineHeightPx <= frames[frameIdx].height) {
        pushLine();
      } else {
        frameIdx++;
        currentY = 0;
        if (frameIdx < frames.length) {
           pushLine();
        }
      }
    }

    return result;
  }
}
