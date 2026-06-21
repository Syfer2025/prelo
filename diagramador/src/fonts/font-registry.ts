import opentype from 'opentype.js';

class FontRegistry {
  private fonts: Record<string, opentype.Font> = {};
  private loading: Record<string, Promise<opentype.Font>> = {};

  /**
   * Carrega uma fonte de forma assíncrona e a coloca no cache.
   */
  public async loadFont(name: string, url: string): Promise<opentype.Font> {
    if (this.fonts[name]) {
      return this.fonts[name];
    }
    if (this.loading[name]) {
      return this.loading[name];
    }

    const promise = fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Erro ao carregar fonte ${name}: HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((buffer) => this.registerFont(name, opentype.parse(buffer)));

    this.loading[name] = promise;
    try {
      return await promise;
    } finally {
      delete this.loading[name];
    }
  }

  /**
   * Registra uma fonte já parseada. Útil para testes e para caminhos em que
   * o binário da fonte já foi buscado por outro componente.
   */
  public registerFont(name: string, font: opentype.Font): opentype.Font {
    this.fonts[name] = font;
    return font;
  }

  /**
   * Retorna a fonte do cache de forma síncrona.
   */
  public getFont(name: string): opentype.Font | null {
    return this.fonts[name] || null;
  }

  /**
   * Verifica se a fonte já está carregada.
   */
  public isFontLoaded(name: string): boolean {
    return !!this.fonts[name];
  }
}

export const fontRegistry = new FontRegistry();
