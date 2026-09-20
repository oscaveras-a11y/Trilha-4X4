require('dotenv').config();

const express = require('express');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const port = Number(process.env.PORT || 3000);

const MAX_ALERTAS = 100;
const LIMITE_MOTIVO = 120;
const LIMITE_USUARIO = 100;

const alertasSOS = [];
const clientesSOS = new Set();

if (!process.env.OPENAI_API_KEY) {
  console.warn('Aviso: OPENAI_API_KEY não foi definida. Usando resposta local de fallback em /api/chat.');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

function validarNumeroCoordenada(valor, minimo, maximo) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= minimo && valor <= maximo;
}

function limparTexto(valor, limite, valorPadrao) {
  if (typeof valor !== 'string') {
    return valorPadrao;
  }

  const texto = valor.trim();
  if (!texto) {
    return valorPadrao;
  }

  return texto.substring(0, limite);
}

function transmitirEvento(tipo, dados) {
  const mensagem = `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`;

  for (const cliente of clientesSOS) {
    try {
      cliente.res.write(mensagem);
    } catch (erro) {
      console.error('Erro ao transmitir alerta:', erro);
      clientesSOS.delete(cliente);
    }
  }
}

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/segurança.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'segurança.html'));
});

app.get('/seguranca.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'segurança.html'));
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    projeto: 'Trilha-4X4',
    servidor: 'online',
    alertasAtivos: alertasSOS.length,
    clientesSOS: clientesSOS.size,
  });
});

app.post('/api/sos', (req, res) => {
  const { latitude, longitude, motivo, usuario } = req.body || {};

  if (!validarNumeroCoordenada(latitude, -90, 90)) {
    return res.status(400).json({
      ok: false,
      error: 'Latitude inválida.',
    });
  }

  if (!validarNumeroCoordenada(longitude, -180, 180)) {
    return res.status(400).json({
      ok: false,
      error: 'Longitude inválida.',
    });
  }

  const motivoLimpo = limparTexto(motivo, LIMITE_MOTIVO, '');
  if (!motivoLimpo) {
    return res.status(400).json({
      ok: false,
      error: 'Motivo do SOS não informado.',
    });
  }

  const usuarioLimpo = limparTexto(usuario, LIMITE_USUARIO, 'Membro do Trilha-4X4');

  const alerta = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    latitude,
    longitude,
    motivo: motivoLimpo,
    usuario: usuarioLimpo,
    dataHora: new Date().toISOString(),
    status: 'ativo',
  };

  alertasSOS.unshift(alerta);

  if (alertasSOS.length > MAX_ALERTAS) {
    alertasSOS.splice(MAX_ALERTAS);
  }

  console.log('🚨 NOVO ALERTA SOS:', alerta);
  transmitirEvento('novo-alerta', alerta);

  return res.status(201).json({
    ok: true,
    mensagem: 'Alerta SOS recebido e distribuído aos clientes conectados.',
    alerta,
  });
});

app.get('/api/sos', (_req, res) => {
  return res.json({
    ok: true,
    total: alertasSOS.length,
    alertas: alertasSOS,
  });
});

app.get('/api/sos/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const cliente = {
    res,
    conectadoEm: new Date().toISOString(),
  };

  clientesSOS.add(cliente);
  console.log('📡 Cliente conectado ao SOS. Total:', clientesSOS.size);

  res.write(`event: inicial\ndata: ${JSON.stringify({ ok: true, alertas: alertasSOS })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (erro) {
      clearInterval(heartbeat);
      clientesSOS.delete(cliente);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clientesSOS.delete(cliente);
    console.log('📡 Cliente desconectado do SOS. Total:', clientesSOS.size);
  });
});

app.delete('/api/sos/:id', (req, res) => {
  const id = req.params.id;
  const indice = alertasSOS.findIndex((alerta) => String(alerta.id) === String(id));

  if (indice === -1) {
    return res.status(404).json({
      ok: false,
      error: 'Alerta SOS não encontrado.',
    });
  }

  const alerta = alertasSOS[indice];
  alertasSOS.splice(indice, 1);

  const alertaEncerrado = {
    ...alerta,
    status: 'encerrado',
    encerradoEm: new Date().toISOString(),
  };

  console.log('🛑 ALERTA SOS ENCERRADO:', alertaEncerrado);
  transmitirEvento('alerta-encerrado', alertaEncerrado);

  return res.json({
    ok: true,
    mensagem: 'Alerta SOS encerrado.',
    alerta: alertaEncerrado,
  });
});

app.post('/api/chat', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!message) {
    return res.status(400).json({
      error: 'Envie uma mensagem no campo "message".',
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.json({
      reply: gerarRespostaLocal(message),
      fallback: true,
      source: 'local',
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
      source: 'local',
    });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({
      ok: false,
      error: 'JSON inválido na requisição.',
    });
  }

  console.error('Erro interno:', error);
  return res.status(500).json({
    ok: false,
    error: 'Erro interno do servidor.',
  });
});

app.listen(port, () => {
  console.log(`Servidor do Trilha-4X4 rodando em http://localhost:${port}`);
  console.log('🆘 Sistema SOS preparado.');
  console.log('📡 Canal em tempo real: /api/sos/stream');
});
