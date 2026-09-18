require('dotenv').config();

const express = require('express');
const OpenAI = require('openai');

const app = express();
const port = Number(process.env.PORT || 3000);

if (!process.env.OPENAI_API_KEY) {
  console.warn('Aviso: OPENAI_API_KEY não foi definida. Configure o arquivo .env antes de usar /api/chat.');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json({ limit: '32kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/chat', async (req, res) => {
  const message = typeof req.body?.message === 'string'
    ? req.body.message.trim()
    : '';

  if (!message) {
    return res.status(400).json({ error: 'Envie uma mensagem no campo "message".' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'A variável OPENAI_API_KEY não está configurada.' });
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
    return res.status(502).json({ error: 'Não foi possível obter uma resposta do ChatGPT.' });
  }
});

app.listen(port, () => {
  console.log(`Servidor do Trilha-4X4 rodando em http://localhost:${port}`);
});
