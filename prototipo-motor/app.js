// A "cola" do aplicativo. Conecta DOM, inputs e renderização no Canvas.

document.addEventListener('DOMContentLoaded', () => {
  const textInput = document.getElementById('textInput');
  const canvas = document.getElementById('renderCanvas');
  const ctx = canvas.getContext('2d');

  // Ajusta resolução do canvas para retina (para bordas e texto não ficarem borrados)
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  // Define os frames de teste (x, y, largura, altura)
  // Eles representam o encadeamento: 1 -> 2 -> 3
  const frames = [
    { id: 'caixa1', x: 40, y: 40, width: 200, height: 250 },
    { id: 'caixa2', x: 280, y: 40, width: 200, height: 400 },
    { id: 'caixa3', x: 520, y: 40, width: 140, height: 180 }
  ];

  // Instancia o motor
  const engine = new TextEngine(ctx, {
    fontSize: 15,
    fontFamily: 'Georgia, serif',
    lineHeight: 1.5
  });

  function render() {
    // 1. Limpa o canvas
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    // 2. Desenha os contornos dos frames (como se estivéssemos editando no InDesign)
    ctx.strokeStyle = '#38bdf8'; // Azul
    ctx.lineWidth = 1;
    frames.forEach((f, index) => {
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(f.x, f.y, f.width, f.height);
      
      // Rótulo discreto do frame
      ctx.setLineDash([]);
      ctx.fillStyle = '#aaa';
      ctx.font = '11px sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`Frame ${index + 1}`, f.x, f.y - 5);
      
      // Ponto de entrada/saída (decorativo, indica encadeamento)
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(f.x - 3, f.y - 3, 6, 6);
      ctx.fillRect(f.x + f.width - 3, f.y + f.height - 3, 6, 6);
    });

    // 3. Pede para a engine calcular o fluxo do texto digitado
    const text = textInput.value;
    const flowResult = engine.flowText(text, frames);

    // 4. Renderiza o texto nas posições calculadas
    engine.setupContext(); // Garante que a fonte do motor está ativa no ctx
    ctx.fillStyle = '#1f2d44'; // Cor da tinta (quase preto)
    
    flowResult.forEach(frameData => {
      const f = frameData.frame;
      frameData.lines.forEach(line => {
        // O engine retorna o 'y' local (relativo ao topo do frame)
        // Somamos a posição X e Y do frame para desenhar no lugar certo
        ctx.fillText(line.text, f.x, f.y + line.y);
      });
    });
  }

  // Preenche texto inicial explicativo
  textInput.value = "Bem-vindo ao protótipo da Fase 0!\n\nEste é um teste do \"Motor de Fluxo de Texto\". Tente adicionar ou remover palavras no meio das frases e observe.\n\nNote como o HTML parou de ditar o layout.\nQuando o texto atinge o limite inferior da Caixa 1 (o primeiro frame pontilhado), ele salta cirurgicamente para a Caixa 2, assim como o InDesign faz.\n\nE depois, se for longo o suficiente, ele encherá a pequena Caixa 3 à direita.\n\nTudo isso foi medido com JavaScript e desenhado livremente neste Canvas.";

  // Escuta os eventos de digitação
  textInput.addEventListener('input', () => {
    // Usamos requestAnimationFrame para garantir 60fps sem travar
    requestAnimationFrame(render);
  });

  // Dispara a primeira renderização
  render();
});
