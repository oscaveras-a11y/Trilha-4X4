require('dotenv').config();

const express = require('express');
const OpenAI = require('openai');

const app = express();
const port = Number(process.env.PORT || 3000);

function gerarRespostaLocal(mensagem) {
  const texto = mensagem.toLowerCase().trim();

  if (!texto) {
    return 'Escreva uma mensagem para que eu possa te ajudar.';
  }

  if (texto.includes('olá') || texto.includes('oi')) {
    return 'Olá! Sou o assistente do Movimento 4x4. Como posso ajudar?';
  }

  if (texto.includes('4x4') || texto.includes('movimento')) {
    return 'O Movimento 4x4 é uma metodologia de rotina, disciplina e foco, com quatro pilares e quatro ações principais para manter progresso consistente.';
  }

  if (texto.includes('como funciona') || texto.includes('funciona')) {
    return 'Ele funciona como uma rotina simples e consistente: definir prioridades, executar de forma disciplinada, revisar resultados e manter continuidade.';
  }

  if (texto.includes('objetivo') || texto.includes('para que serve')) {
    return 'O objetivo do 4x4 é fortalecer hábitos, organização e execução prática para atingir metas com mais clareza e consistência.';
  }

  return 'Posso ajudar com informações sobre rotina, objetivos, disciplina e aplicação do Movimento 4x4 no dia a dia.';
}

app.use(express.static('public'));

if (!process.env.OPENAI_API_KEY) {
  console.warn('Aviso: OPENAI_API_KEY não foi definida. Usando resposta local de fallback em /api/chat.');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json({ limit: '32kb' }));

app.get('/', (_req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'index.html'));
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    projeto: 'Trilha-4X4'
  });
});

app.post('/api/chat', async (req, res) => {
  const message = typeof req.body?.message === 'string'
    ? req.body.message.trim()
    : '';

  if (!message) {
    return res.status(400).json({ error: 'Envie uma mensagem no campo "message".' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.json({
      reply: gerarRespostaLocal(message),
      fallback: true,
      source: 'local'
    });
  }

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      instructions: 'Você é o assistente virtual do projeto Movimento 4x4. Responda em português do Brasil de forma clara e objetiva.',
      input: message,
    });

    return res.json({ reply: response.output_text });
  } catch (error) {
    console.error('Erro ao chamar a API da OpenAI:', error);
    return res.json({
      reply: gerarRespostaLocal(message),
      fallback: true,
      source: 'local'
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor do Trilha-4X4 rodando em http://localhost:${port}`);
});


