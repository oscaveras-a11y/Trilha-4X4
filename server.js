require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');

const db = require('./lib/db');

const {
  createId,
  normalizeEmail,
  hashPassword,
  verifyPassword,
  createSession,
  getUserBySession,
  deleteSession,
} = require('./lib/auth');

const app = express();
const port = Number(process.env.PORT || 3000);

const MAX_ALERTAS = 100;
const LIMITE_MOTIVO = 120;
const LIMITE_USUARIO = 100;

const alertasSOS = [];
const clientesSOS = new Set();

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    'Aviso: OPENAI_API_KEY não foi definida. Usando resposta local de fallback em /api/chat.'
  );
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
  return (
    typeof valor === 'number' &&
    Number.isFinite(valor) &&
    valor >= minimo &&
    valor <= maximo
  );
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

/*
 * Lê o cookie da sessão sem precisar instalar outro pacote.
 */
function obterCookie(req, nome) {
  const cookies = req.headers.cookie;

  if (!cookies) {
    return null;
  }

  const partes = cookies.split(';');

  for (const parte of partes) {
    const [chave, ...resto] = parte.trim().split('=');

    if (chave === nome) {
      return decodeURIComponent(resto.join('='));
    }
  }

  return null;
}

/*
 * Descobre o usuário atualmente conectado.
 */
function usuarioAtual(req) {
  const token = obterCookie(req, 'trilha4x4_session');

  if (!token) {
    return null;
  }

  return getUserBySession(token);
}

/*
 * Protege uma rota que exige login.
 */
function exigirLogin(req, res, next) {
  const user = usuarioAtual(req);

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: 'Você precisa estar logado.',
    });
  }

  req.user = user;

  next();
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

/*
 * =========================================================
 * AUTENTICAÇÃO
 * =========================================================
 */

/*
 * Verifica se existe uma sessão válida.
 */
app.get('/api/auth/me', (req, res) => {
  const user = usuarioAtual(req);

  if (!user) {
    return res.json({
      ok: true,
      authenticated: false,
      user: null,
    });
  }

  return res.json({
    ok: true,
    authenticated: true,
    user,
  });
});

/*
 * CADASTRO
 */
app.post('/api/auth/register', (req, res) => {
  const name = typeof req.body?.name === 'string'
    ? req.body.name.trim()
    : '';

  const email = normalizeEmail(req.body?.email);

  const password = typeof req.body?.password === 'string'
    ? req.body.password
    : '';

  const termsAccepted = req.body?.termsAccepted === true;

  if (name.length < 2) {
    return res.status(400).json({
      ok: false,
      error: 'Informe seu nome ou apelido.',
    });
  }

  if (!email || !email.includes('@')) {
    return res.status(400).json({
      ok: false,
      error: 'Informe um e-mail válido.',
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      ok: false,
      error: 'A senha precisa ter pelo menos 8 caracteres.',
    });
  }

  if (!termsAccepted) {
    return res.status(400).json({
      ok: false,
      error: 'É necessário aceitar os termos de uso.',
    });
  }

  const usuarioExistente = db.prepare(`
    SELECT id
    FROM users
    WHERE email = ?
  `).get(email);

  if (usuarioExistente) {
    return res.status(409).json({
      ok: false,
      error: 'Este e-mail já está cadastrado.',
    });
  }

  const userId = createId('usr');

  const agora = new Date().toISOString();

  const passwordHash = hashPassword(password);

  db.prepare(`
    INSERT INTO users (
      id,
      name,
      email,
      password_hash,
      terms_accepted_at,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    name,
    email,
    passwordHash,
    agora,
    agora
  );

  const token = createSession(userId);

  res.setHeader(
    'Set-Cookie',
    `trilha4x4_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`
  );

  return res.status(201).json({
    ok: true,
    message: 'Cadastro realizado com sucesso.',
    user: {
      id: userId,
      name,
      email,
    },
  });
});

/*
 * LOGIN
 */
app.post('/api/auth/login', (req, res) => {
  const email = normalizeEmail(req.body?.email);

  const password = typeof req.body?.password === 'string'
    ? req.body.password
    : '';

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      error: 'Informe e-mail e senha.',
    });
  }

  const user = db.prepare(`
    SELECT
      id,
      name,
      email,
      password_hash,
      created_at
    FROM users
    WHERE email = ?
  `).get(email);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({
      ok: false,
      error: 'E-mail ou senha incorretos.',
    });
  }

  const token = createSession(user.id);

  res.setHeader(
    'Set-Cookie',
    `trilha4x4_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`
  );

  return res.json({
    ok: true,
    message: 'Login realizado com sucesso.',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.created_at,
    },
  });
});

/*
 * LOGOUT
 */
app.post('/api/auth/logout', (req, res) => {
  const token = obterCookie(req, 'trilha4x4_session');

  if (token) {
    deleteSession(token);
  }

  res.setHeader(
    'Set-Cookie',
    'trilha4x4_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
  );

  return res.json({
    ok: true,
    message: 'Logout realizado com sucesso.',
  });
});

/*
 * Teste de rota protegida.
 */
app.get('/api/auth/protected-test', exigirLogin, (req, res) => {
  return res.json({
    ok: true,
    message: 'Você está autenticado.',
    user: req.user,
  });
});

/*
 * =========================================================
 * STATUS DO SERVIDOR
 * =========================================================
 */

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    projeto: 'Trilha-4X4',
    servidor: 'online',
    alertasAtivos: alertasSOS.length,
    clientesSOS: clientesSOS.size,
  });
});

/*
 * =========================================================
 * SOS
/*
 * =========================================================
 * TRILHAS
 * =========================================================
 */

function gerarCodigoTrilha() {
  const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo;

  do {
    let parte = '';

    for (let i = 0; i < 5; i++) {
      parte += caracteres[
        crypto.randomInt(0, caracteres.length)
      ];
    }

    codigo = `4X4-${parte}`;
  } while (
    db.prepare(
      'SELECT id FROM trails WHERE code = ?'
    ).get(codigo)
  );

  return codigo;
}

app.post('/api/trilhas', exigirLogin, (req, res) => {
  try {
    const {
      name,
      type,
      visibility,
      startAt,
      plannedEndAt,
      releaseAt,
    } = req.body || {};

    if (
      !name ||
      String(name).trim().length < 3
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Informe um nome válido para a trilha.',
      });
    }

    if (
      !['passeio', 'privada', 'evento'].includes(type)
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Tipo de trilha inválido.',
      });
    }

    if (
      !['publica', 'privada', 'convite'].includes(
        visibility
      )
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Tipo de acesso inválido.',
      });
    }

    const inicio = new Date(startAt);
    const fim = new Date(plannedEndAt);

    if (
      Number.isNaN(inicio.getTime()) ||
      Number.isNaN(fim.getTime())
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Informe datas válidas.',
      });
    }

    if (fim <= inicio) {
      return res.status(400).json({
        ok: false,
        error: 'O término deve ser depois do início.',
      });
    }

    let liberacao = null;

    if (releaseAt) {
      const dataLiberacao = new Date(releaseAt);

      if (
        Number.isNaN(dataLiberacao.getTime()) ||
        dataLiberacao < inicio
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'A liberação da rota não pode ser antes do início da trilha.',
        });
      }

      liberacao = dataLiberacao.toISOString();
    }

    const id = crypto.randomUUID();
    const code = gerarCodigoTrilha();
    const agora = new Date().toISOString();

    const safetyEndAt = new Date(
      fim.getTime() +
        24 * 60 * 60 * 1000
    ).toISOString();

    db.prepare(`
      INSERT INTO trails (
        id,
        code,
        name,
        type,
        visibility,
        creator_id,
        start_at,
        planned_end_at,
        release_at,
        safety_end_at,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
    `).run(
      id,
      code,
      String(name).trim(),
      type,
      visibility,
      req.user.id,
      inicio.toISOString(),
      fim.toISOString(),
      liberacao,
      safetyEndAt,
      agora
    );

    db.prepare(`
      INSERT INTO trail_members (
        trail_id,
        user_id,
        role,
        status,
        joined_at
      )
      VALUES (?, ?, 'admin', 'active', ?)
    `).run(
      id,
      req.user.id,
      agora
    );

    return res.status(201).json({
      ok: true,
      trail: {
        id,
        code,
        name: String(name).trim(),
        type,
        visibility,
        startAt: inicio.toISOString(),
        plannedEndAt: fim.toISOString(),
        releaseAt: liberacao,
        safetyEndAt,
        status: 'open',
        role: 'admin',
      },
    });
  } catch (error) {
    console.error(
      'Erro ao criar trilha:',
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        'Não foi possível criar a trilha.',
    });
  }
});

app.get('/api/trilhas', exigirLogin, (req, res) => {
  try {
    const trilhas = db.prepare(`
      SELECT
        trails.id,
        trails.code,
        trails.name,
        trails.type,
        trails.visibility,
        trails.start_at AS startAt,
        trails.planned_end_at AS plannedEndAt,
        trails.release_at AS releaseAt,
        trails.safety_end_at AS safetyEndAt,
        trails.status,
        trail_members.role
      FROM trail_members
      INNER JOIN trails
        ON trails.id = trail_members.trail_id
      WHERE trail_members.user_id = ?
        AND trail_members.status = 'active'
      ORDER BY trails.start_at DESC
    `).all(req.user.id);

    return res.json({
      ok: true,
      trails: trilhas,
    });
  } catch (error) {
    console.error(
      'Erro ao listar trilhas:',
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        'Não foi possível carregar as trilhas.',
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor Trilha 4x4 rodando em http://localhost:${port}`);
});