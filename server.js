require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');

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

app.set('trust proxy', 1);

const limites = new Map();
function limitarRequisicoes({ janelaMs, max, prefixo }) {
  return (req, res, next) => {
    const agora = Date.now();
    const chave = prefixo + ':' + (req.ip || req.socket.remoteAddress || 'desconhecido');
    const atual = limites.get(chave);
    if (!atual || atual.resetAt <= agora) {
      limites.set(chave, { count: 1, resetAt: agora + janelaMs });
      return next();
    }
    atual.count += 1;
    if (atual.count > max) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((atual.resetAt - agora) / 1000)));
      return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde um pouco e tente novamente.' });
    }
    next();
  };
}

const limitarAuth = limitarRequisicoes({ janelaMs: 15 * 60 * 1000, max: 40, prefixo: 'auth' });
const limitarChat = limitarRequisicoes({ janelaMs: 60 * 1000, max: 30, prefixo: 'chat' });

setInterval(() => {
  const agora = Date.now();
  for (const [chave, valor] of limites) {
    if (valor.resetAt <= agora) limites.delete(chave);
  }
}, 10 * 60 * 1000).unref();

function cookieSessao(req, token, maxAge = 2592000) {
  const protocoloEncaminhado = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const seguro = req.secure || protocoloEncaminhado === 'https';
  return 'trilha4x4_session=' + encodeURIComponent(token || '') +
    '; HttpOnly; Path=/; SameSite=Lax; Max-Age=' + maxAge +
    (seguro ? '; Secure' : '');
}

const MAX_ALERTAS = 100;
const LIMITE_MOTIVO = 120;

const alertasSOS = [];
const clientesSOS = new Set();

/*
 * Clientes conectados ao tempo real de cada trilha.
 *
 * Estrutura:
 *
 * clientesTrilhas
 *   └── trilhaId
 *       └── Set de conexões SSE
 */
const clientesTrilhas = new Map();
const clientesGrupos = new Map();
const clientesNotificacoes = new Map();

function emitirEventoNotificacao(userId, payload = {}) {
  const clientes = clientesNotificacoes.get(userId);
  if (!clientes) return;
  const mensagem = `event: notificacoes_atualizadas\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const cliente of clientes) {
    try { cliente.res.write(mensagem); } catch {}
  }
}

setInterval(() => {
  const heartbeat = ': heartbeat\n\n';
  for (const grupo of clientesGrupos.values()) {
    for (const cliente of grupo) {
      try { cliente.res.write(heartbeat); } catch {}
    }
  }
  for (const trilha of clientesTrilhas.values()) {
    for (const cliente of trilha) {
      try { cliente.res.write(heartbeat); } catch {}
    }
  }
  for (const cliente of clientesSOS) {
    try { cliente.res.write(heartbeat); } catch {}
  }
  for (const usuarios of clientesNotificacoes.values()) {
    for (const cliente of usuarios) {
      try { cliente.res.write(heartbeat); } catch {}
    }
  }
}, 25000).unref();

function emitirEventoGrupo(groupId, tipo, payload = {}) {
  const clientes = clientesGrupos.get(groupId);
  if (!clientes) return;
  const mensagem = `event: ${tipo}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const cliente of clientes) {
    try { cliente.res.write(mensagem); } catch {}
  }
}

/*
 * Última localização conhecida de cada participante
 * em cada trilha.
 *
 * Estrutura:
 *
 * localizacoesTrilha
 *   └── trilhaId
 *       └── userId
 *           └── localização
 */
const localizacoesTrilha = new Map();


/*
 * =========================================================
 * IA 4X4 GRATUITA / PESQUISA WEB
 * =========================================================
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TAVILY_API_URL = 'https://api.tavily.com/search';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

if (!process.env.GROQ_API_KEY) {
  console.warn('Aviso: GROQ_API_KEY não definida. /api/chat usará fallback local.');
}
if (!process.env.TAVILY_API_KEY) {
  console.warn('Aviso: TAVILY_API_KEY não definida. A IA funcionará sem pesquisa web.');
}

function gerarRespostaLocal(mensagem) {
  const texto = String(mensagem || '').toLowerCase().trim();
  if (!texto) return 'Escreva uma mensagem para que eu possa te ajudar.';
  if (texto.includes('olá') || texto === 'oi') {
    return 'Olá! Sou a IA 4x4 do Trilha 4X4. Posso ajudar com trilhas, veículos, preparação, pneus, recuperação, navegação e segurança off-road.';
  }
  if (texto.includes('como funciona') || texto.includes('para que serve')) {
    return 'O Trilha 4X4 ajuda a organizar passeios off-road, grupos, veículos, rotas, localização e recursos de segurança durante o percurso.';
  }
  return 'No momento a IA 4x4 está sem acesso ao modelo online. Ainda posso ajudar com recursos do Trilha 4X4; tente novamente em alguns instantes para dúvidas técnicas ou pesquisas atuais.';
}

function devePesquisarWeb(mensagem) {
  const texto = String(mensagem || '').toLowerCase();
  return /\b(atual|hoje|preço|onde|comprar|trilha|estrada|bloqueio|interdição|clima|chuva|peça|pneu|óleo|manual|especifica|torque|pressão|calibr|defeito|problema|prepar|guincho|4x4|off.?road|jeep|s10|troller|suzuki|toyota|mitsubishi|ford|chevrolet)\b/.test(texto);
}

async function pesquisarOffRoad(mensagem) {
  if (!process.env.TAVILY_API_KEY || !devePesquisarWeb(mensagem)) return [];
  const resposta = await fetch(TAVILY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query: `${mensagem} off-road 4x4`,
      search_depth: 'basic',
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(9000),
  });
  if (!resposta.ok) throw new Error(`Tavily HTTP ${resposta.status}`);
  const dados = await resposta.json();
  return Array.isArray(dados.results)
    ? dados.results.slice(0, 5).map((item) => ({
        title: String(item.title || '').slice(0, 180),
        url: String(item.url || '').slice(0, 1000),
        content: String(item.content || '').slice(0, 1200),
      }))
    : [];
}

async function responderComGroq(mensagem, contextoTexto, fontes) {
  if (!process.env.GROQ_API_KEY) return null;
  const pesquisa = fontes.length
    ? fontes.map((f, i) => `[${i + 1}] ${f.title}\n${f.content}\nFonte: ${f.url}`).join('\n\n')
    : 'Nenhuma pesquisa web foi usada nesta pergunta.';

  const resposta = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.25,
      max_tokens: 900,
      messages: [
        {
          role: 'system',
          content: 'Você é a IA 4x4 do aplicativo Trilha 4X4. Responda em português do Brasil. Especialidades: veículos 4x4, mecânica, preparação off-road, pneus, guincho, recuperação, navegação, trilhas e segurança. Seja prático e técnico. Não invente especificações. Quando houver fontes web, use-as para fatos atuais e indique no texto [1], [2] etc. Em procedimentos com risco mecânico ou de segurança, destaque verificações críticas e incertezas.',
        },
        {
          role: 'user',
          content: `Contexto do app: ${contextoTexto || 'nenhum'}\n\nPesquisa web:\n${pesquisa}\n\nPergunta: ${mensagem}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resposta.ok) throw new Error(`Groq HTTP ${resposta.status}`);
  const dados = await resposta.json();
  return dados.choices?.[0]?.message?.content?.trim() || null;
}

/*
 * =========================================================
 * FUNÇÕES AUXILIARES
 * =========================================================
 */

function validarNumeroCoordenada(
  valor,
  minimo,
  maximo
) {
  return (
    typeof valor === 'number' &&
    Number.isFinite(valor) &&
    valor >= minimo &&
    valor <= maximo
  );
}


function limparTexto(
  valor,
  limite,
  valorPadrao
) {
  if (typeof valor !== 'string') {
    return valorPadrao;
  }

  const texto = valor.trim();

  if (!texto) {
    return valorPadrao;
  }

  return texto.substring(0, limite);
}


/*
 * =========================================================
 * COOKIE / AUTENTICAÇÃO
 * =========================================================
 */

function obterCookie(req, nome) {
  const cookies = req.headers.cookie;

  if (!cookies) {
    return null;
  }

  const partes = cookies.split(';');

  for (const parte of partes) {
    const [chave, ...resto] =
      parte.trim().split('=');

    if (chave === nome) {
      return decodeURIComponent(
        resto.join('=')
      );
    }
  }

  return null;
}


function usuarioAtual(req) {
  const token = obterCookie(
    req,
    'trilha4x4_session'
  );

  if (!token) {
    return null;
  }

  return getUserBySession(token);
}


function exigirLogin(
  req,
  res,
  next
) {
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


/*
 * =========================================================
 * EXPRESS
 * =========================================================
 */

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.setHeader('X-Frame-Options', 'DENY');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

app.use(
  express.json({
    limit: '32kb',
  })
);

app.use(
  express.static(
    path.join(
      __dirname,
      'public'
    )
  )
);


app.get('/', (_req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      'public',
      'index.html'
    )
  );
});


app.get(
  '/segurança.html',
  (_req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        'public',
        'segurança.html'
      )
    );
  }
);


app.get(
  '/seguranca.html',
  (_req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        'public',
        'segurança.html'
      )
    );
  }
);


/*
 * =========================================================
 * AUTENTICAÇÃO
 * =========================================================
 */


/*
 * Verifica sessão atual.
 */

app.get(
  '/api/auth/me',
  (req, res) => {
    const user =
      usuarioAtual(req);

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
  }
);


/*
 * CADASTRO
 */

app.post(
  '/api/auth/register',
  limitarAuth,
  (req, res) => {
    const name =
      typeof req.body?.name === 'string'
        ? req.body.name.trim()
        : '';

    const email =
      normalizeEmail(
        req.body?.email
      );

    const password =
      typeof req.body?.password === 'string'
        ? req.body.password
        : '';

    const termsAccepted =
      req.body?.termsAccepted === true;


    if (name.length < 2) {
      return res.status(400).json({
        ok: false,
        error:
          'Informe seu nome ou apelido.',
      });
    }


    if (
      !email ||
      !email.includes('@')
    ) {
      return res.status(400).json({
        ok: false,
        error:
          'Informe um e-mail válido.',
      });
    }


    if (password.length < 8) {
      return res.status(400).json({
        ok: false,
        error:
          'A senha precisa ter pelo menos 8 caracteres.',
      });
    }


    if (!termsAccepted) {
      return res.status(400).json({
        ok: false,
        error:
          'É necessário aceitar os termos de uso.',
      });
    }


    const usuarioExistente =
      db.prepare(`
        SELECT id
        FROM users
        WHERE email = ?
      `).get(email);


    if (usuarioExistente) {
      return res.status(409).json({
        ok: false,
        error:
          'Este e-mail já está cadastrado.',
      });
    }


    const userId =
      createId('usr');

    const agora =
      new Date().toISOString();

    const passwordHash =
      hashPassword(password);


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


    const token =
      createSession(userId);


    res.setHeader(
      'Set-Cookie',
      cookieSessao(req, token)
    );


    return res.status(201).json({
      ok: true,
      message:
        'Cadastro realizado com sucesso.',
      user: {
        id: userId,
        name,
        email,
      },
    });
  }
);


/*
 * LOGIN
 */

app.post(
  '/api/auth/login',
  limitarAuth,
  (req, res) => {
    const email =
      normalizeEmail(
        req.body?.email
      );

    const password =
      typeof req.body?.password === 'string'
        ? req.body.password
        : '';


    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        error:
          'Informe e-mail e senha.',
      });
    }


    const user =
      db.prepare(`
        SELECT
          id,
          name,
          email,
          password_hash,
          created_at
        FROM users
        WHERE email = ?
      `).get(email);


    if (
      !user ||
      !verifyPassword(
        password,
        user.password_hash
      )
    ) {
      return res.status(401).json({
        ok: false,
        error:
          'E-mail ou senha incorretos.',
      });
    }


    const token =
      createSession(user.id);


    res.setHeader(
      'Set-Cookie',
      cookieSessao(req, token)
    );


    return res.json({
      ok: true,
      message:
        'Login realizado com sucesso.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at:
          user.created_at,
      },
    });
  }
);


/*
 * LOGOUT
 */

app.post(
  '/api/auth/logout',
  (req, res) => {
    const token =
      obterCookie(
        req,
        'trilha4x4_session'
      );

    if (token) {
      deleteSession(token);
    }


    res.setHeader(
      'Set-Cookie',
      cookieSessao(req, '', 0)
    );


    return res.json({
      ok: true,
      message:
        'Logout realizado com sucesso.',
    });
  }
);


/*
 * ROTA PROTEGIDA DE TESTE
 */

app.get(
  '/api/auth/protected-test',
  exigirLogin,
  (req, res) => {
    return res.json({
      ok: true,
      message:
        'Você está autenticado.',
      user: req.user,
    });
  }
);


/*
 * =========================================================
 * STATUS
 * =========================================================
 */

app.get(
  '/health',
  (_req, res) => {
    res.json({
      ok: true,
      projeto:
        'Trilha-4X4',
      servidor:
        'online',
      alertasAtivos:
        alertasSOS.length,
      clientesSOS:
        clientesSOS.size,
      trilhasTempoReal:
        clientesTrilhas.size,
    });
  }
);


/*
 * =========================================================
 * TRILHAS
 * =========================================================
 */


/*
 * Gera código no formato:
 *
 * 4X4-F8K2P
 */

function gerarCodigoTrilha() {
  const caracteres =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let codigo;

  do {
    let parte = '';

    for (let i = 0; i < 5; i++) {
      parte +=
        caracteres[
          crypto.randomInt(
            0,
            caracteres.length
          )
        ];
    }

    codigo =
      `4X4-${parte}`;

  } while (
    db.prepare(
      'SELECT id FROM trails WHERE code = ?'
    ).get(codigo)
  );

  return codigo;
}


/*
 * Verifica se usuário participa da trilha.
 */

function usuarioEhMembroDaTrilha(
  trilhaId,
  userId
) {
  return db.prepare(`
    SELECT
      trail_members.role,
      trail_members.status
    FROM trail_members
    WHERE trail_members.trail_id = ?
      AND trail_members.user_id = ?
      AND trail_members.status = 'active'
  `).get(
    trilhaId,
    userId
  );
}


/*
 * Criação da trilha.
 */

app.post(
  '/api/trilhas',
  exigirLogin,
  (req, res) => {
    try {
      const {
        name,
        type,
        visibility,
        startAt,
        plannedEndAt,
        releaseAt,
        groupId,
        outingId,
      } = req.body || {};


      if (
        !name ||
        String(name).trim().length < 3
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'Informe um nome válido para a trilha.',
        });
      }


      if (
        ![
          'passeio',
          'privada',
          'evento'
        ].includes(type)
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'Tipo de trilha inválido.',
        });
      }


      if (
        ![
          'publica',
          'privada',
          'convite'
        ].includes(visibility)
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'Tipo de acesso inválido.',
        });
      }


      const inicio =
        new Date(startAt);

      const fim =
        new Date(plannedEndAt);


      if (
        Number.isNaN(
          inicio.getTime()
        ) ||
        Number.isNaN(
          fim.getTime()
        )
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'Informe datas válidas.',
        });
      }


      if (fim <= inicio) {
        return res.status(400).json({
          ok: false,
          error:
            'O término deve ser depois do início.',
        });
      }


      let liberacao = null;


      if (releaseAt) {
        const dataLiberacao =
          new Date(releaseAt);


        if (
          Number.isNaN(
            dataLiberacao.getTime()
          ) ||
          dataLiberacao < inicio
        ) {
          return res.status(400).json({
            ok: false,
            error:
              'A liberação da rota não pode ser antes do início da trilha.',
          });
        }


        liberacao =
          dataLiberacao.toISOString();
      }


      const id =
        crypto.randomUUID();

      const code =
        gerarCodigoTrilha();

      const agora =
        new Date().toISOString();


      /*
       * Janela de segurança:
       * mínimo de 24 horas depois
       * do término previsto.
       */

      const safetyEndAt =
        new Date(
          fim.getTime() +
          24 * 60 * 60 * 1000
        ).toISOString();


      const criarTrilha = db.transaction(() => {
        if (groupId || outingId) {
          if (!groupId || !outingId) {
            throw new Error('GROUP_OUTING_CONTEXT_INVALID');
          }
          const membroGrupo = db.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
          ).get(groupId, req.user.id);
          const outing = db.prepare(
            "SELECT trail_id AS trailId FROM group_outings WHERE id = ? AND group_id = ? AND status = 'confirmed'"
          ).get(outingId, groupId);
          if (!membroGrupo || membroGrupo.role !== 'admin') throw new Error('GROUP_ADMIN_REQUIRED');
          if (!outing) throw new Error('OUTING_NOT_CONFIRMED');
          if (outing.trailId) throw new Error('OUTING_ALREADY_LINKED');
        }

        db.prepare(`
          INSERT INTO trails (
            id, code, name, type, visibility, creator_id, start_at,
            planned_end_at, release_at, safety_end_at, status, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
        `).run(
          id, code, String(name).trim(), type, visibility, req.user.id,
          inicio.toISOString(), fim.toISOString(), liberacao, safetyEndAt, agora
        );

        db.prepare(`
          INSERT INTO trail_members (trail_id, user_id, role, status, joined_at)
          VALUES (?, ?, 'admin', 'active', ?)
        `).run(id, req.user.id, agora);

        if (groupId && outingId) {
          db.prepare('UPDATE group_outings SET trail_id = ? WHERE id = ? AND group_id = ?')
            .run(id, outingId, groupId);
          db.prepare('INSERT OR IGNORE INTO group_trails (group_id, trail_id, added_at) VALUES (?, ?, ?)')
            .run(groupId, id, agora);
        }
      });

      try {
        criarTrilha();
      } catch (erroFluxo) {
        const mensagens = {
          GROUP_OUTING_CONTEXT_INVALID: 'O contexto do passeio está incompleto.',
          GROUP_ADMIN_REQUIRED: 'Somente o administrador do grupo pode criar a trilha deste passeio.',
          OUTING_NOT_CONFIRMED: 'Confirme o passeio antes de criar a trilha.',
          OUTING_ALREADY_LINKED: 'Este passeio já possui uma trilha vinculada.',
        };
        if (mensagens[erroFluxo.message]) {
          return res.status(400).json({ ok: false, error: mensagens[erroFluxo.message] });
        }
        throw erroFluxo;
      }


      if (groupId) {
        emitirEventoGrupo(groupId, 'grupo_atualizado', { motivo: 'trilha_criada', trailId: id, outingId });
      }

      return res.status(201).json({
        ok: true,
        trail: {
          id,
          code,
          name:
            String(name).trim(),
          type,
          visibility,
          startAt:
            inicio.toISOString(),
          plannedEndAt:
            fim.toISOString(),
          releaseAt:
            liberacao,
          safetyEndAt,
          status:
            'open',
          role:
            'admin',
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
  }
);


/*
 * Lista somente as trilhas
 * das quais o usuário participa.
 */

app.get(
  '/api/trilhas',
  exigirLogin,
  (req, res) => {
    try {

      const trilhas =
        db.prepare(`
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
            trail_members.role,
            CASE
              WHEN trail_members.role = 'admin'
              THEN (
                SELECT COUNT(*)
                FROM trail_join_requests
                WHERE trail_join_requests.trail_id = trails.id
                  AND trail_join_requests.status = 'pending'
              )
              ELSE 0
            END AS pendingRequestCount
          FROM trail_members
          INNER JOIN trails
            ON trails.id =
              trail_members.trail_id
          WHERE
            trail_members.user_id = ?
            AND trail_members.status = 'active'
          ORDER BY
            trails.start_at DESC
        `).all(
          req.user.id
        );


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
  }
);


/*
 * Solicitações do usuário para acompanhar aprovação.
 * Mantém apenas a solicitação mais recente de cada trilha.
 */
app.get(
  '/api/trilhas/solicitacoes/minhas',
  exigirLogin,
  (req, res) => {
    try {
      const requests = db.prepare(`
        SELECT
          r.id,
          r.status,
          r.created_at AS createdAt,
          r.decided_at AS decidedAt,
          t.id AS trailId,
          t.code,
          t.name,
          t.type,
          t.visibility,
          t.start_at AS startAt
        FROM trail_join_requests r
        INNER JOIN trails t ON t.id = r.trail_id
        WHERE r.user_id = ?
          AND r.created_at = (
            SELECT MAX(r2.created_at)
            FROM trail_join_requests r2
            WHERE r2.user_id = r.user_id
              AND r2.trail_id = r.trail_id
          )
        ORDER BY r.created_at DESC
      `).all(req.user.id);

      return res.json({ ok: true, requests });
    } catch (error) {
      console.error('Erro ao listar solicitações do usuário:', error);
      return res.status(500).json({
        ok: false,
        error: 'Não foi possível carregar suas solicitações.',
      });
    }
  }
);


/*
 * Consulta uma trilha pelo código antes da solicitação.
 */
app.get(
  '/api/trilhas/consulta/:code',
  exigirLogin,
  (req, res) => {
    const codigo = normalizarCodigoTrilha(req.params.code);

    const trilha = db.prepare(`
      SELECT
        id,
        code,
        name,
        type,
        visibility,
        start_at AS startAt,
        planned_end_at AS plannedEndAt,
        safety_end_at AS safetyEndAt,
        status
      FROM trails
      WHERE code = ?
    `).get(codigo);

    if (!trilha) {
      return res.status(404).json({
        ok: false,
        error: 'Trilha não encontrada.',
      });
    }

    const solicitacao = db.prepare(`
      SELECT status
      FROM trail_join_requests
      WHERE trail_id = ?
        AND user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(trilha.id, req.user.id);

    const membro = db.prepare(`
      SELECT role, status
      FROM trail_members
      WHERE trail_id = ?
        AND user_id = ?
    `).get(trilha.id, req.user.id);

    return res.json({
      ok: true,
      trail: trilha,
      participation: membro || solicitacao || null,
    });
  }
);


/*
 * =========================================================
 * NOTIFICAÇÕES
 * =========================================================
 */

app.get('/api/notificacoes/eventos', exigirLogin, (req, res) => {
  const userId = req.user.id;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  if (!clientesNotificacoes.has(userId)) clientesNotificacoes.set(userId, new Set());
  const cliente = { res };
  clientesNotificacoes.get(userId).add(cliente);
  res.write('event: conectado\ndata: {}\n\n');

  req.on('close', () => {
    const clientes = clientesNotificacoes.get(userId);
    if (!clientes) return;
    clientes.delete(cliente);
    if (!clientes.size) clientesNotificacoes.delete(userId);
  });
});

app.get('/api/notificacoes', exigirLogin, (req, res) => {
  try {
    const notificacoes = [];

    const pendentesAdmin = db.prepare(`
      SELECT r.id, r.created_at AS createdAt, t.id AS trailId, t.name AS trailName,
             u.name AS userName
      FROM trail_join_requests r
      INNER JOIN trails t ON t.id = r.trail_id
      INNER JOIN users u ON u.id = r.user_id
      INNER JOIN trail_members tm ON tm.trail_id = t.id
        AND tm.user_id = ? AND tm.role = 'admin' AND tm.status = 'active'
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC
      LIMIT 30
    `).all(req.user.id);

    pendentesAdmin.forEach((item) => notificacoes.push({
      id: 'join-admin-' + item.id,
      type: 'trail_request',
      icon: '🙋',
      title: 'Nova solicitação de participação',
      message: item.userName + ' quer entrar em ' + item.trailName + '.',
      createdAt: item.createdAt,
      action: { page: 'trilhas', trailId: item.trailId },
      unread: true,
    }));

    const minhasDecisoes = db.prepare(`
      SELECT r.id, r.status, r.created_at AS createdAt, r.decided_at AS decidedAt,
             t.id AS trailId, t.name AS trailName
      FROM trail_join_requests r
      INNER JOIN trails t ON t.id = r.trail_id
      WHERE r.user_id = ? AND r.status IN ('accepted','rejected')
        AND r.created_at = (
          SELECT MAX(r2.created_at) FROM trail_join_requests r2
          WHERE r2.user_id = r.user_id AND r2.trail_id = r.trail_id
        )
      ORDER BY COALESCE(r.decided_at, r.created_at) DESC
      LIMIT 20
    `).all(req.user.id);

    minhasDecisoes.forEach((item) => notificacoes.push({
      id: 'join-user-' + item.id,
      type: 'trail_decision',
      icon: item.status === 'accepted' ? '✅' : '❌',
      title: item.status === 'accepted' ? 'Participação aprovada' : 'Participação não aprovada',
      message: item.status === 'accepted'
        ? 'Você foi aprovado para participar de ' + item.trailName + '.'
        : 'Sua solicitação para ' + item.trailName + ' não foi aprovada.',
      createdAt: item.decidedAt || item.createdAt,
      action: item.status === 'accepted'
        ? { href: '/trilha.html?id=' + encodeURIComponent(item.trailId) }
        : { page: 'trilhas' },
      unread: true,
    }));

    const roles = db.prepare(`
      SELECT o.id, o.title, o.starts_at AS startsAt, o.status, o.created_at AS createdAt,
             g.id AS groupId, g.name AS groupName, r.response AS myResponse
      FROM group_outings o
      INNER JOIN groups g ON g.id = o.group_id
      INNER JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
      LEFT JOIN group_outing_responses r ON r.outing_id = o.id AND r.user_id = ?
      WHERE o.status != 'cancelled'
        AND datetime(o.starts_at) >= datetime('now', '-1 day')
      ORDER BY o.starts_at ASC
      LIMIT 20
    `).all(req.user.id, req.user.id);

    roles.forEach((item) => {
      if (!item.myResponse) notificacoes.push({
        id: 'outing-' + item.id,
        type: 'group_outing',
        icon: '👥',
        title: 'Passeio no grupo ' + item.groupName,
        message: item.title + ' — confirme se você vai participar.',
        createdAt: item.createdAt,
        action: { page: 'grupos', groupId: item.groupId },
        unread: true,
      });
    });

    notificacoes.sort((a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    return res.json({ ok: true, notifications: notificacoes.slice(0, 50) });
  } catch (error) {
    console.error('Erro ao montar notificações:', error);
    return res.status(500).json({ ok: false, error: 'Não foi possível carregar as notificações.' });
  }
});


/*
 * =========================================================
 * ABRIR UMA TRILHA
 * =========================================================
 */

app.get(
  '/api/trilhas/:id',
  exigirLogin,
  (req, res) => {
    try {

      const trilhaId =
        req.params.id;


      const membro =
        usuarioEhMembroDaTrilha(
          trilhaId,
          req.user.id
        );


      if (!membro) {
        return res.status(403).json({
          ok: false,
          error:
            'Você não participa desta trilha.',
        });
      }


      const trilha =
        db.prepare(`
          SELECT
            id,
            code,
            name,
            type,
            visibility,
            creator_id AS creatorId,
            start_at AS startAt,
            planned_end_at AS plannedEndAt,
            release_at AS releaseAt,
            safety_end_at AS safetyEndAt,
            status,
            created_at AS createdAt
          FROM trails
          WHERE id = ?
        `).get(trilhaId);


      if (!trilha) {
        return res.status(404).json({
          ok: false,
          error:
            'Trilha não encontrada.',
        });
      }


      const participantes =
        db.prepare(`
          SELECT
            users.id,
            users.name,
            trail_members.role
          FROM trail_members
          INNER JOIN users
            ON users.id =
              trail_members.user_id
          WHERE
            trail_members.trail_id = ?
            AND trail_members.status = 'active'
          ORDER BY
            CASE
              WHEN trail_members.role = 'admin'
              THEN 0
              ELSE 1
            END,
            users.name
        `).all(trilhaId);


      return res.json({
        ok: true,

        trail: {
          ...trilha,

          role:
            membro.role,

          participants:
            participantes,

          participantCount:
            participantes.length,
        },
      });

    } catch (error) {

      console.error(
        'Erro ao abrir trilha:',
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          'Não foi possível carregar a trilha.',
      });
    }
  }
);


/*
 * =========================================================
 * EDITAR DADOS DA TRILHA
 * =========================================================
 */
app.put(
  '/api/trilhas/:id',
  exigirLogin,
  (req, res) => {
    const trilhaId = req.params.id;

    if (!usuarioEhAdminDaTrilha(trilhaId, req.user.id)) {
      return res.status(403).json({
        ok: false,
        error: 'Somente o criador/administrador pode editar a trilha.',
      });
    }

    const atual = db.prepare('SELECT * FROM trails WHERE id = ?').get(trilhaId);
    if (!atual) {
      return res.status(404).json({ ok: false, error: 'Trilha não encontrada.' });
    }

    const name = limparTexto(req.body?.name ?? atual.name, 120, '');
    const type = req.body?.type ?? atual.type;
    const visibility = req.body?.visibility ?? atual.visibility;
    const status = req.body?.status ?? atual.status;

    if (name.length < 3) {
      return res.status(400).json({ ok: false, error: 'Informe um nome válido para a trilha.' });
    }
    if (!['passeio', 'privada', 'evento'].includes(type)) {
      return res.status(400).json({ ok: false, error: 'Tipo de trilha inválido.' });
    }
    if (!['publica', 'privada', 'convite'].includes(visibility)) {
      return res.status(400).json({ ok: false, error: 'Tipo de acesso inválido.' });
    }
    if (!['open', 'closed'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Status da trilha inválido.' });
    }

    const inicio = new Date(req.body?.startAt ?? atual.start_at);
    const fim = new Date(req.body?.plannedEndAt ?? atual.planned_end_at);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || fim <= inicio) {
      return res.status(400).json({ ok: false, error: 'Confira as datas da trilha.' });
    }

    let releaseAt = atual.release_at;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'releaseAt')) {
      if (!req.body.releaseAt) {
        releaseAt = null;
      } else {
        const dataLiberacao = new Date(req.body.releaseAt);
        if (Number.isNaN(dataLiberacao.getTime())) {
          return res.status(400).json({ ok: false, error: 'Data de liberação inválida.' });
        }
        if (dataLiberacao < inicio) {
          return res.status(400).json({ ok: false, error: 'A liberação da rota não pode ser antes do início da trilha.' });
        }
        releaseAt = dataLiberacao.toISOString();
      }
    }

    const safetyEndAt = new Date(fim.getTime() + 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE trails
      SET name = ?, type = ?, visibility = ?, start_at = ?,
          planned_end_at = ?, release_at = ?, safety_end_at = ?, status = ?
      WHERE id = ?
    `).run(
      name, type, visibility, inicio.toISOString(), fim.toISOString(),
      releaseAt, safetyEndAt, status, trilhaId
    );

    return res.json({
      ok: true,
      message: 'Trilha atualizada com sucesso.',
    });
  }
);


/*
 * =========================================================
 * ROTA PLANEJADA DA TRILHA
 * =========================================================
 */

app.get(
  '/api/trilhas/:id/rota-planejada',
  exigirLogin,
  (req, res) => {
    const trilhaId = req.params.id;
    const membro = usuarioEhMembroDaTrilha(trilhaId, req.user.id);

    if (!membro) {
      return res.status(403).json({
        ok: false,
        error: 'Você não participa desta trilha.',
      });
    }

    const trilha = db.prepare(`
      SELECT release_at AS releaseAt
      FROM trails
      WHERE id = ?
    `).get(trilhaId);

    if (!trilha) {
      return res.status(404).json({
        ok: false,
        error: 'Trilha não encontrada.',
      });
    }

    const liberada =
      membro.role === 'admin' ||
      !trilha.releaseAt ||
      new Date(trilha.releaseAt).getTime() <= Date.now();

    if (!liberada) {
      return res.json({
        ok: true,
        released: false,
        releaseAt: trilha.releaseAt,
        points: [],
      });
    }

    const points = db.prepare(`
      SELECT
        id,
        position,
        latitude,
        longitude,
        name,
        notes
      FROM trail_route_points
      WHERE trail_id = ?
      ORDER BY position ASC
    `).all(trilhaId);

    return res.json({
      ok: true,
      released: true,
      releaseAt: trilha.releaseAt,
      points,
    });
  }
);

app.put(
  '/api/trilhas/:id/rota-planejada',
  exigirLogin,
  (req, res) => {
    const trilhaId = req.params.id;

    if (!usuarioEhAdminDaTrilha(trilhaId, req.user.id)) {
      return res.status(403).json({
        ok: false,
        error: 'Somente o criador/administrador pode editar a rota.',
      });
    }

    const points = Array.isArray(req.body?.points)
      ? req.body.points
      : null;

    if (!points || points.length < 2 || points.length > 500) {
      return res.status(400).json({
        ok: false,
        error: 'A rota precisa ter entre 2 e 500 pontos.',
      });
    }

    const normalized = [];

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const latitude = Number(point?.latitude);
      const longitude = Number(point?.longitude);

      if (
        !validarNumeroCoordenada(latitude, -90, 90) ||
        !validarNumeroCoordenada(longitude, -180, 180)
      ) {
        return res.status(400).json({
          ok: false,
          error: `Coordenadas inválidas no ponto ${index + 1}.`,
        });
      }

      normalized.push({
        id: crypto.randomUUID(),
        position: index,
        latitude,
        longitude,
        name: limparTexto(point?.name, 100, null),
        notes: limparTexto(point?.notes, 300, null),
      });
    }

    const agora = new Date().toISOString();
    const salvar = db.transaction(() => {
      db.prepare(
        'DELETE FROM trail_route_points WHERE trail_id = ?'
      ).run(trilhaId);

      const insert = db.prepare(`
        INSERT INTO trail_route_points (
          id, trail_id, position, latitude, longitude,
          name, notes, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      normalized.forEach((point) => {
        insert.run(
          point.id,
          trilhaId,
          point.position,
          point.latitude,
          point.longitude,
          point.name,
          point.notes,
          agora
        );
      });
    });

    salvar();

    transmitirEventoTrilha(trilhaId, 'rota_atualizada', { pointCount: normalized.length });
    return res.json({
      ok: true,
      message: 'Rota planejada salva com sucesso.',
      pointCount: normalized.length,
    });
  }
);

app.delete(
  '/api/trilhas/:id/rota-planejada',
  exigirLogin,
  (req, res) => {
    const trilhaId = req.params.id;

    if (!usuarioEhAdminDaTrilha(trilhaId, req.user.id)) {
      return res.status(403).json({
        ok: false,
        error: 'Somente o criador/administrador pode apagar a rota.',
      });
    }

    db.prepare(
      'DELETE FROM trail_route_points WHERE trail_id = ?'
    ).run(trilhaId);

    transmitirEventoTrilha(trilhaId, 'rota_atualizada', { pointCount: 0 });
    return res.json({
      ok: true,
      message: 'Rota planejada removida.',
    });
  }
);


/*
 * =========================================================
 * SEGURANÇA E EXTENSÃO DA TRILHA
 * =========================================================
 */

app.get(
  '/api/trilhas/:id/seguranca',
  exigirLogin,
  (req, res) => {
    const trilhaId = req.params.id;

    if (!usuarioEhMembroDaTrilha(trilhaId, req.user.id)) {
      return res.status(403).json({
        ok: false,
        error: 'Você não participa desta trilha.',
      });
    }

    const trilha = db.prepare(`
      SELECT
        planned_end_at AS plannedEndAt,
        safety_end_at AS safetyEndAt
      FROM trails
      WHERE id = ?
    `).get(trilhaId);

    const eventos = db.prepare(`
      SELECT
        trail_safety_events.action,
        trail_safety_events.extension_hours AS extensionHours,
        trail_safety_events.created_at AS createdAt,
        users.name AS userName
      FROM trail_safety_events
      INNER JOIN users
        ON users.id = trail_safety_events.user_id
      WHERE trail_safety_events.trail_id = ?
      ORDER BY trail_safety_events.created_at DESC
      LIMIT 50
    `).all(trilhaId);

    return res.json({
      ok: true,
      trail: trilha,
      events: eventos,
    });
  }
);

app.post(
  '/api/trilhas/:id/seguranca',
  exigirLogin,
  (req, res) => {
    const trilhaId = req.params.id;
    const membro = usuarioEhMembroDaTrilha(trilhaId, req.user.id);

    if (!membro) {
      return res.status(403).json({
        ok: false,
        error: 'Você não participa desta trilha.',
      });
    }

    const action = typeof req.body?.action === 'string'
      ? req.body.action.trim()
      : '';
    const extensionHours = Number(req.body?.extensionHours || 0);

    if (!['safe', 'still_on_trail', 'extend'].includes(action)) {
      return res.status(400).json({
        ok: false,
        error: 'Ação de segurança inválida.',
      });
    }

    if (
      action === 'extend' &&
      ![6, 12, 24].includes(extensionHours)
    ) {
      return res.status(400).json({
        ok: false,
        error: 'A extensão deve ser de 6, 12 ou 24 horas.',
      });
    }

    const agora = new Date().toISOString();

    if (action === 'extend') {
      const trilha = db.prepare(`
        SELECT planned_end_at AS plannedEndAt
        FROM trails
        WHERE id = ?
      `).get(trilhaId);

      const novoFim = new Date(
        new Date(trilha.plannedEndAt).getTime() +
        extensionHours * 60 * 60 * 1000
      );
      const novaSeguranca = new Date(
        novoFim.getTime() + 24 * 60 * 60 * 1000
      );

      db.prepare(`
        UPDATE trails
        SET planned_end_at = ?, safety_end_at = ?
        WHERE id = ?
      `).run(
        novoFim.toISOString(),
        novaSeguranca.toISOString(),
        trilhaId
      );
    }

    db.prepare(`
      INSERT INTO trail_safety_events (
        id,
        trail_id,
        user_id,
        action,
        extension_hours,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      trilhaId,
      req.user.id,
      action,
      action === 'extend' ? extensionHours : null,
      agora
    );

    return res.json({
      ok: true,
      message: action === 'safe'
        ? 'Chegada em segurança registrada.'
        : action === 'still_on_trail'
          ? 'A permanência na trilha foi registrada.'
          : `Prazo estendido por ${extensionHours} horas.`,
    });
  }
);


/*
 * =========================================================
 * TEMPO REAL DA TRILHA
 * =========================================================
 */


/*
 * Envia evento somente para
 * usuários conectados naquela trilha.
 */

function transmitirEventoTrilha(
  trilhaId,
  tipo,
  dados
) {
  const clientes =
    clientesTrilhas.get(
      trilhaId
    );

  if (!clientes) {
    return;
  }


  const mensagem =
    `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`;


  for (const cliente of clientes) {
    try {

      cliente.res.write(
        mensagem
      );

    } catch (erro) {

      console.error(
        'Erro ao transmitir evento da trilha:',
        erro
      );

      clientes.delete(
        cliente
      );
    }
  }
}


/*
 * =========================================================
 * MODO TRILHA — ENVIAR LOCALIZAÇÃO
 * =========================================================
 */

app.post(
  '/api/trilhas/:id/localizacao',
  exigirLogin,
  (req, res) => {
    try {

      const trilhaId =
        req.params.id;


      const membro =
        usuarioEhMembroDaTrilha(
          trilhaId,
          req.user.id
        );


      if (!membro) {
        return res.status(403).json({
          ok: false,
          error:
            'Você não participa desta trilha.',
        });
      }


      const {
        latitude,
        longitude,
        accuracy,
      } = req.body || {};


      if (
        !validarNumeroCoordenada(
          latitude,
          -90,
          90
        ) ||
        !validarNumeroCoordenada(
          longitude,
          -180,
          180
        )
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'Coordenadas inválidas.',
        });
      }


      const agora =
        new Date().toISOString();


      if (
        !localizacoesTrilha.has(
          trilhaId
        )
      ) {
        localizacoesTrilha.set(
          trilhaId,
          new Map()
        );
      }


      const localizacao = {
        userId:
          req.user.id,

        name:
          req.user.name,

        latitude,

        longitude,

        accuracy:
          validarNumeroCoordenada(
            accuracy,
            0,
            100000
          )
            ? accuracy
            : null,

        updatedAt:
          agora,
      };


      localizacoesTrilha
        .get(trilhaId)
        .set(
          req.user.id,
          localizacao
        );

      db.prepare(`
        INSERT INTO trail_location_points (
          id,
          trail_id,
          user_id,
          latitude,
          longitude,
          accuracy,
          recorded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        trilhaId,
        req.user.id,
        latitude,
        longitude,
        localizacao.accuracy,
        agora
      );


      transmitirEventoTrilha(
        trilhaId,
        'localizacao',
        localizacao
      );


      return res.json({
        ok: true,
        location:
          localizacao,
      });

    } catch (error) {

      console.error(
        'Erro ao atualizar localização:',
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          'Não foi possível atualizar sua localização.',
      });
    }
  }
);


/*
 * Retorna os pontos gravados da trilha.
 */
app.get(
  '/api/trilhas/:id/rota',
  exigirLogin,
  (req, res) => {
    const trilhaId = req.params.id;

    if (!usuarioEhMembroDaTrilha(trilhaId, req.user.id)) {
      return res.status(403).json({
        ok: false,
        error: 'Você não participa desta trilha.',
      });
    }

    const pontos = db.prepare(`
      SELECT
        trail_location_points.id,
        trail_location_points.user_id AS userId,
        users.name,
        trail_location_points.latitude,
        trail_location_points.longitude,
        trail_location_points.accuracy,
        trail_location_points.recorded_at AS recordedAt
      FROM trail_location_points
      INNER JOIN users
        ON users.id = trail_location_points.user_id
      WHERE trail_location_points.trail_id = ?
      ORDER BY trail_location_points.recorded_at ASC
    `).all(trilhaId);

    return res.json({
      ok: true,
      points: pontos,
    });
  }
);


/*
 * =========================================================
 * MODO TRILHA — ENCERRAR LOCALIZAÇÃO
 * =========================================================
 */

app.delete(
  '/api/trilhas/:id/localizacao',
  exigirLogin,
  (req, res) => {

    const trilhaId =
      req.params.id;


    if (
      !usuarioEhMembroDaTrilha(
        trilhaId,
        req.user.id
      )
    ) {
      return res.status(403).json({
        ok: false,
        error:
          'Você não participa desta trilha.',
      });
    }


    const localizacoes =
      localizacoesTrilha.get(
        trilhaId
      );


    if (localizacoes) {

      localizacoes.delete(
        req.user.id
      );


      transmitirEventoTrilha(
        trilhaId,
        'localizacao_removida',
        {
          userId:
            req.user.id,
        }
      );


      if (
        localizacoes.size === 0
      ) {
        localizacoesTrilha.delete(
          trilhaId
        );
      }
    }


    return res.json({
      ok: true,
      message:
        'Modo Trilha encerrado e localização removida.',
    });
  }
);


/*
 * =========================================================
 * MODO TRILHA — CONEXÃO EM TEMPO REAL
 * =========================================================
 */

app.get(
  '/api/trilhas/:id/localizacoes',
  exigirLogin,
  (req, res) => {

    const trilhaId =
      req.params.id;


    if (
      !usuarioEhMembroDaTrilha(
        trilhaId,
        req.user.id
      )
    ) {
      return res.status(403).json({
        ok: false,
        error:
          'Você não participa desta trilha.',
      });
    }


    res.setHeader(
      'Content-Type',
      'text/event-stream'
    );

    res.setHeader(
      'Cache-Control',
      'no-cache'
    );

    res.setHeader(
      'Connection',
      'keep-alive'
    );
    res.setHeader('X-Accel-Buffering', 'no');


    if (
      typeof res.flushHeaders ===
      'function'
    ) {
      res.flushHeaders();
    }


    if (
      !clientesTrilhas.has(
        trilhaId
      )
    ) {
      clientesTrilhas.set(
        trilhaId,
        new Set()
      );
    }


    const cliente = {
      res,
    };


    clientesTrilhas
      .get(trilhaId)
      .add(cliente);


    /*
     * Envia imediatamente
     * as posições já existentes.
     */

    const existentes =
      Array.from(
        localizacoesTrilha
          .get(trilhaId)
          ?.values() || []
      );


    res.write(
      `event: estado\ndata: ${JSON.stringify(existentes)}\n\n`
    );


    req.on(
      'close',
      () => {

        const clientes =
          clientesTrilhas.get(
            trilhaId
          );


        if (!clientes) {
          return;
        }


        clientes.delete(
          cliente
        );


        if (
          clientes.size === 0
        ) {
          clientesTrilhas.delete(
            trilhaId
          );
        }
      }
    );
  }
);


/*
 * =========================================================
 * SOS DA TRILHA
 * =========================================================
 */


/*
 * ATIVAR SOS
 */

app.post(
  '/api/trilhas/:id/sos',
  exigirLogin,
  (req, res) => {
    try {

      const trilhaId =
        req.params.id;


      if (
        !usuarioEhMembroDaTrilha(
          trilhaId,
          req.user.id
        )
      ) {
        return res.status(403).json({
          ok: false,
          error:
            'Você não participa desta trilha.',
        });
      }


      const {
        latitude,
        longitude,
        accuracy,
        motivo,
      } = req.body || {};


      if (
        !validarNumeroCoordenada(
          latitude,
          -90,
          90
        ) ||
        !validarNumeroCoordenada(
          longitude,
          -180,
          180
        )
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'Informe uma localização válida para o SOS.',
        });
      }


      const alerta = {
        id:
          crypto.randomUUID(),

        trailId:
          trilhaId,

        userId:
          req.user.id,

        userName:
          req.user.name,

        latitude,

        longitude,

        accuracy:
          validarNumeroCoordenada(
            accuracy,
            0,
            100000
          )
            ? accuracy
            : null,

        motivo:
          limparTexto(
            motivo,
            LIMITE_MOTIVO,
            'Preciso de ajuda'
          ),

        createdAt:
          new Date().toISOString(),

        active:
          true,
      };


      alertasSOS.push(
        alerta
      );


      while (
        alertasSOS.length >
        MAX_ALERTAS
      ) {
        alertasSOS.shift();
      }


      /*
       * O SOS é enviado somente
       * aos participantes da mesma trilha.
       */

      transmitirEventoTrilha(
        trilhaId,
        'sos',
        alerta
      );


      return res.status(201).json({
        ok: true,
        alert:
          alerta,
      });

    } catch (error) {

      console.error(
        'Erro ao ativar SOS:',
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          'Não foi possível ativar o SOS.',
      });
    }
  }
);


/*
 * LISTAR SOS ATIVOS DA TRILHA
 */

app.get(
  '/api/trilhas/:id/sos',
  exigirLogin,
  (req, res) => {

    const trilhaId =
      req.params.id;


    if (
      !usuarioEhMembroDaTrilha(
        trilhaId,
        req.user.id
      )
    ) {
      return res.status(403).json({
        ok: false,
        error:
          'Você não participa desta trilha.',
      });
    }


    return res.json({
      ok: true,

      alerts:
        alertasSOS.filter(
          (alerta) =>
            alerta.trailId ===
              trilhaId &&
            alerta.active
        ),
    });
  }
);


/*
 * ENCERRAR SOS
 */

app.delete(
  '/api/trilhas/:id/sos/:alertId',
  exigirLogin,
  (req, res) => {

    const trilhaId =
      req.params.id;

    const alertId =
      req.params.alertId;


    const membro =
      usuarioEhMembroDaTrilha(
        trilhaId,
        req.user.id
      );


    if (!membro) {
      return res.status(403).json({
        ok: false,
        error:
          'Você não participa desta trilha.',
      });
    }


    const alerta =
      alertasSOS.find(
        (item) =>
          item.id === alertId &&
          item.trailId === trilhaId
      );


    if (!alerta) {
      return res.status(404).json({
        ok: false,
        error:
          'Alerta SOS não encontrado.',
      });
    }


    /*
     * Somente:
     *
     * - quem criou o SOS
     * - administrador da trilha
     *
     * pode encerrá-lo.
     */

    if (
      alerta.userId !==
      req.user.id &&
      membro.role !== 'admin'
    ) {
      return res.status(403).json({
        ok: false,
        error:
          'Somente o autor ou administrador pode encerrar este SOS.',
      });
    }


    alerta.active =
      false;

    alerta.closedAt =
      new Date().toISOString();

    alerta.closedBy =
      req.user.id;


    transmitirEventoTrilha(
      trilhaId,
      'sos_encerrado',
      {
        alertId,
        userId:
          alerta.userId,
      }
    );


    return res.json({
      ok: true,
      message:
        'SOS encerrado.',
    });
  }
);


/*
 * =========================================================
 * SOS LEGADO / COMPATIBILIDADE
 * =========================================================
 *
 * Mantemos estas rotas para não quebrar
 * alguma parte antiga da aplicação que ainda
 * utilize /api/sos.
 *
 * A nova página da trilha utiliza
 * exclusivamente as rotas /api/trilhas/:id/sos.
 */
/*
 * =========================================================
 * GRUPOS
 * =========================================================
 */

app.post(
  '/api/grupos',
  exigirLogin,
  (req, res) => {
    const name = limparTexto(req.body?.name, 100, '');

    if (name.length < 2) {
      return res.status(400).json({
        ok: false,
        error: 'Informe um nome válido para o grupo.',
      });
    }

    const id = crypto.randomUUID();
    const agora = new Date().toISOString();

    db.prepare(`
      INSERT INTO groups (id, name, creator_id, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, name, req.user.id, agora);

    db.prepare(`
      INSERT INTO group_members (group_id, user_id, role, joined_at)
      VALUES (?, ?, 'admin', ?)
    `).run(id, req.user.id, agora);

    return res.status(201).json({
      ok: true,
      group: { id, name, role: 'admin' },
    });
  }
);

app.post(
  '/api/grupos/:id/convite',
  exigirLogin,
  (req, res) => {
    const groupId = req.params.id;
    const member = db.prepare(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, req.user.id);

    if (!member || member.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Somente o administrador pode gerar convites.' });
    }

    let code;
    do {
      code = 'G4X4-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    } while (db.prepare('SELECT 1 FROM group_invites WHERE code = ?').get(code));

    db.prepare('UPDATE group_invites SET active = 0 WHERE group_id = ?').run(groupId);
    db.prepare(`
      INSERT INTO group_invites (code, group_id, created_by, created_at, active)
      VALUES (?, ?, ?, ?, 1)
    `).run(code, groupId, req.user.id, new Date().toISOString());

    emitirEventoGrupo(groupId, 'grupo_atualizado', { motivo: 'convite_atualizado' });
    return res.status(201).json({ ok: true, code });
  }
);

app.post(
  '/api/grupos/entrar',
  exigirLogin,
  (req, res) => {
    const code = limparTexto(req.body?.code, 30, '').trim().toUpperCase();
    const invite = db.prepare(`
      SELECT gi.group_id AS groupId, g.name
      FROM group_invites gi
      INNER JOIN groups g ON g.id = gi.group_id
      WHERE gi.code = ? AND gi.active = 1
    `).get(code);

    if (!invite) {
      return res.status(404).json({ ok: false, error: 'Código de convite inválido ou desativado.' });
    }

    db.prepare(`
      INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', ?)
    `).run(invite.groupId, req.user.id, new Date().toISOString());

    emitirEventoGrupo(invite.groupId, 'grupo_atualizado', { motivo: 'membro_entrou', userId: req.user.id });
    return res.json({
      ok: true,
      group: { id: invite.groupId, name: invite.name },
      message: 'Você entrou no grupo.',
    });
  }
);

app.get(
  '/api/grupos',
  exigirLogin,
  (req, res) => {
    const groups = db.prepare(`
      SELECT
        groups.id,
        groups.name,
        group_members.role,
        COUNT(all_members.user_id) AS memberCount
      FROM group_members
      INNER JOIN groups
        ON groups.id = group_members.group_id
      INNER JOIN group_members AS all_members
        ON all_members.group_id = groups.id
      WHERE group_members.user_id = ?
      GROUP BY groups.id, groups.name, group_members.role
      ORDER BY groups.created_at DESC
    `).all(req.user.id);

    return res.json({ ok: true, groups });
  }
);

app.get(
  '/api/grupos/:id',
  exigirLogin,
  (req, res) => {
    const groupId = req.params.id;
    const membership = db.prepare(`
      SELECT gm.role, g.name
      FROM group_members gm
      INNER JOIN groups g ON g.id = gm.group_id
      WHERE gm.group_id = ? AND gm.user_id = ?
    `).get(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({
        ok: false,
        error: 'Você não participa deste grupo.',
      });
    }

    const members = db.prepare(`
      SELECT u.id, u.name, gm.role, gm.joined_at AS joinedAt
      FROM group_members gm
      INNER JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY CASE WHEN gm.role = 'admin' THEN 0 ELSE 1 END, u.name
    `).all(groupId);

    const trails = db.prepare(`
      SELECT t.id, t.code, t.name, t.type, t.visibility,
             t.start_at AS startAt, t.status
      FROM group_trails gt
      INNER JOIN trails t ON t.id = gt.trail_id
      WHERE gt.group_id = ?
      ORDER BY gt.added_at DESC
    `).all(groupId);

    const availableTrails = membership.role === 'admin'
      ? db.prepare(`
          SELECT t.id, t.code, t.name, t.start_at AS startAt
          FROM trail_members tm
          INNER JOIN trails t ON t.id = tm.trail_id
          WHERE tm.user_id = ?
            AND tm.role = 'admin'
            AND tm.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM group_trails gt
              WHERE gt.group_id = ? AND gt.trail_id = t.id
            )
          ORDER BY t.created_at DESC
        `).all(req.user.id, groupId)
      : [];

    const outings = db.prepare(`
      SELECT o.id, o.title, o.description, o.meeting_point AS meetingPoint,
             o.starts_at AS startsAt, o.status, o.trail_id AS trailId, o.creator_id AS creatorId, u.name AS creatorName,
             r.response AS myResponse,
             SUM(CASE WHEN all_r.response = 'going' THEN 1 ELSE 0 END) AS goingCount,
             SUM(CASE WHEN all_r.response = 'maybe' THEN 1 ELSE 0 END) AS maybeCount
      FROM group_outings o
      INNER JOIN users u ON u.id = o.creator_id
      LEFT JOIN group_outing_responses r
        ON r.outing_id = o.id AND r.user_id = ?
      LEFT JOIN group_outing_responses all_r ON all_r.outing_id = o.id
      WHERE o.group_id = ?
      GROUP BY o.id, r.response
      ORDER BY o.starts_at ASC
    `).all(req.user.id, groupId);

    const activeInvite = membership.role === 'admin'
      ? db.prepare('SELECT code FROM group_invites WHERE group_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1').get(groupId)
      : null;

    return res.json({
      ok: true,
      group: {
        id: groupId,
        name: membership.name,
        role: membership.role,
        currentUserId: req.user.id,
        members,
        trails,
        availableTrails,
        outings,
        inviteCode: activeInvite?.code || null,
      },
    });
  }
);

app.get(
  '/api/grupos/:id/eventos',
  exigirLogin,
  (req, res) => {
    const groupId = req.params.id;
    const member = db.prepare(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, req.user.id);
    if (!member) return res.status(403).json({ ok: false, error: 'Você não participa deste grupo.' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    if (!clientesGrupos.has(groupId)) clientesGrupos.set(groupId, new Set());
    const cliente = { res, userId: req.user.id };
    clientesGrupos.get(groupId).add(cliente);
    res.write('event: conectado\\ndata: {}\\n\\n');

    req.on('close', () => {
      const clientes = clientesGrupos.get(groupId);
      if (!clientes) return;
      clientes.delete(cliente);
      if (!clientes.size) clientesGrupos.delete(groupId);
    });
  }
);

app.get(
  '/api/grupos/:id/mensagens',
  exigirLogin,
  (req, res) => {
    const groupId = req.params.id;
    const member = db.prepare(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, req.user.id);
    if (!member) return res.status(403).json({ ok: false, error: 'Você não participa deste grupo.' });

    const messages = db.prepare(`
      SELECT gm.id, gm.message, gm.created_at AS createdAt,
             u.id AS userId, u.name AS userName
      FROM group_messages gm
      INNER JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY gm.created_at DESC
      LIMIT 100
    `).all(groupId).reverse();

    return res.json({ ok: true, messages });
  }
);

app.post(
  '/api/grupos/:id/mensagens',
  exigirLogin,
  (req, res) => {
    const groupId = req.params.id;
    const member = db.prepare(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, req.user.id);
    if (!member) return res.status(403).json({ ok: false, error: 'Você não participa deste grupo.' });

    const message = limparTexto(req.body?.message, 1000, '');
    if (!message) return res.status(400).json({ ok: false, error: 'Escreva uma mensagem.' });

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO group_messages (id, group_id, user_id, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, groupId, req.user.id, message, createdAt);
    emitirEventoGrupo(groupId, 'mensagem', { id, userId: req.user.id, createdAt });

    return res.status(201).json({
      ok: true,
      message: { id, message, createdAt, userId: req.user.id, userName: req.user.name },
    });
  }
);

app.post(
  '/api/grupos/:id/roles',
  exigirLogin,
  (req, res) => {
    const groupId = req.params.id;
    const member = db.prepare(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, req.user.id);
    if (!member) return res.status(403).json({ ok: false, error: 'Você não participa deste grupo.' });

    const title = limparTexto(req.body?.title, 100, '');
    const description = limparTexto(req.body?.description, 500, null);
    const meetingPoint = limparTexto(req.body?.meetingPoint, 160, null);
    const startsAt = limparTexto(req.body?.startsAt, 40, '');

    if (title.length < 2 || !startsAt || Number.isNaN(new Date(startsAt).getTime())) {
      return res.status(400).json({ ok: false, error: 'Informe nome e data válidos para o rolê.' });
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO group_outings
        (id, group_id, creator_id, title, description, meeting_point, starts_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'planning', ?)
    `).run(id, groupId, req.user.id, title, description, meetingPoint, new Date(startsAt).toISOString(), createdAt);

    db.prepare(`
      INSERT INTO group_outing_responses (outing_id, user_id, response, updated_at)
      VALUES (?, ?, 'going', ?)
    `).run(id, req.user.id, createdAt);

    emitirEventoGrupo(groupId, 'grupo_atualizado', { motivo: 'passeio_criado', outingId: id });
    const membrosGrupo = db.prepare(
      'SELECT user_id AS userId FROM group_members WHERE group_id = ? AND user_id <> ?'
    ).all(groupId, req.user.id);
    membrosGrupo.forEach((membroGrupo) =>
      emitirEventoNotificacao(membroGrupo.userId, { motivo: 'passeio_criado', groupId, outingId: id })
    );
    return res.status(201).json({ ok: true, outing: { id, title } });
  }
);

app.put(
  '/api/grupos/:groupId/roles/:outingId',
  exigirLogin,
  (req, res) => {
    const { groupId, outingId } = req.params;
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
      .get(groupId, req.user.id);
    const outing = db.prepare('SELECT creator_id AS creatorId, status FROM group_outings WHERE id = ? AND group_id = ?')
      .get(outingId, groupId);
    if (!member || !outing) return res.status(404).json({ ok: false, error: 'Rolê não encontrado.' });
    if (member.role !== 'admin' && outing.creatorId !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Somente quem criou o rolê ou um administrador pode editá-lo.' });
    }
    if (outing.status === 'cancelled') return res.status(400).json({ ok: false, error: 'Este rolê foi cancelado.' });

    const title = limparTexto(req.body?.title, 100, '');
    const description = limparTexto(req.body?.description, 500, null);
    const meetingPoint = limparTexto(req.body?.meetingPoint, 160, null);
    const startsAt = limparTexto(req.body?.startsAt, 40, '');
    if (title.length < 2 || !startsAt || Number.isNaN(new Date(startsAt).getTime())) {
      return res.status(400).json({ ok: false, error: 'Informe nome e data válidos para o rolê.' });
    }

    db.prepare(`
      UPDATE group_outings
      SET title = ?, description = ?, meeting_point = ?, starts_at = ?
      WHERE id = ? AND group_id = ?
    `).run(title, description, meetingPoint, new Date(startsAt).toISOString(), outingId, groupId);
    emitirEventoGrupo(groupId, 'grupo_atualizado', { motivo: 'passeio_editado', outingId });
    return res.json({ ok: true });
  }
);

app.post(
  '/api/grupos/:groupId/roles/:outingId/vincular-trilha',
  exigirLogin,
  (req, res) => {
    const { groupId, outingId } = req.params;
    const trailId = req.body?.trailId;
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
      .get(groupId, req.user.id);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Somente administradores podem vincular a trilha.' });
    }

    const outing = db.prepare(
      "SELECT trail_id AS trailId FROM group_outings WHERE id = ? AND group_id = ? AND status = 'confirmed'"
    ).get(outingId, groupId);
    if (!outing) return res.status(400).json({ ok: false, error: 'Confirme o passeio antes de criar a trilha.' });
    if (outing.trailId) return res.status(409).json({ ok: false, error: 'Este passeio já possui uma trilha.' });

    const trailAdmin = db.prepare(`
      SELECT 1 FROM trail_members
      WHERE trail_id = ? AND user_id = ? AND role = 'admin' AND status = 'active'
    `).get(trailId, req.user.id);
    if (!trailAdmin) return res.status(403).json({ ok: false, error: 'Você precisa ser administrador da trilha.' });

    const agora = new Date().toISOString();
    const transaction = db.transaction(() => {
      db.prepare('UPDATE group_outings SET trail_id = ? WHERE id = ? AND group_id = ?')
        .run(trailId, outingId, groupId);
      db.prepare('INSERT OR IGNORE INTO group_trails (group_id, trail_id, added_at) VALUES (?, ?, ?)')
        .run(groupId, trailId, agora);
    });
    transaction();
    emitirEventoGrupo(groupId, 'grupo_atualizado', { motivo: 'trilha_vinculada', outingId, trailId });
    return res.json({ ok: true });
  }
);

app.post(
  '/api/grupos/:groupId/roles/:outingId/status',
  exigirLogin,
  (req, res) => {
    const { groupId, outingId } = req.params;
    const status = req.body?.status;
    if (!['planning', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Status inválido.' });
    }
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
      .get(groupId, req.user.id);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Somente administradores podem confirmar ou cancelar o passeio.' });
    }
    const result = db.prepare('UPDATE group_outings SET status = ? WHERE id = ? AND group_id = ?')
      .run(status, outingId, groupId);
    if (!result.changes) return res.status(404).json({ ok: false, error: 'Rolê não encontrado.' });
    emitirEventoGrupo(groupId, 'grupo_atualizado', { motivo: 'status_passeio', outingId, status });
    return res.json({ ok: true, status });
  }
);

app.post(
  '/api/grupos/:groupId/roles/:outingId/resposta',
  exigirLogin,
  (req, res) => {
    const { groupId, outingId } = req.params;
    const response = req.body?.response;
    if (!['going', 'maybe', 'not_going'].includes(response)) {
      return res.status(400).json({ ok: false, error: 'Resposta inválida.' });
    }

    const member = db.prepare(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, req.user.id);
    const outing = db.prepare(
      'SELECT 1 FROM group_outings WHERE id = ? AND group_id = ?'
    ).get(outingId, groupId);
    if (!member || !outing) return res.status(403).json({ ok: false, error: 'Rolê indisponível.' });

    db.prepare(`
      INSERT INTO group_outing_responses (outing_id, user_id, response, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(outing_id, user_id)
      DO UPDATE SET response = excluded.response, updated_at = excluded.updated_at
    `).run(outingId, req.user.id, response, new Date().toISOString());
    emitirEventoGrupo(groupId, 'grupo_atualizado', { motivo: 'resposta_passeio', outingId });
    emitirEventoNotificacao(req.user.id, { motivo: 'resposta_passeio', groupId, outingId });

    return res.json({ ok: true });
  }
);

app.put(
  '/api/grupos/:groupId/membros/:userId',
  exigirLogin,
  (req, res) => {
    const { groupId, userId } = req.params;
    const role = req.body?.role;

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'Função inválida.' });
    }

    const requester = db.prepare(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, req.user.id);
    const target = db.prepare(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, userId);

    if (!requester || requester.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Somente administradores podem alterar membros.' });
    }
    if (!target) return res.status(404).json({ ok: false, error: 'Membro não encontrado.' });

    if (target.role === 'admin' && role === 'member') {
      const admins = db.prepare(
        "SELECT COUNT(*) AS total FROM group_members WHERE group_id = ? AND role = 'admin'"
      ).get(groupId).total;
      if (admins <= 1) {
        return res.status(400).json({ ok: false, error: 'O grupo precisa ter pelo menos um administrador.' });
      }
    }

    db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?')
      .run(role, groupId, userId);
    emitirEventoGrupo(groupId, 'grupo_atualizado', { motivo: 'papel_membro', userId, role });
    return res.json({ ok: true });
  }
);

app.delete(
  '/api/grupos/:groupId/membros/:userId',
  exigirLogin,
  (req, res) => {
    const { groupId, userId } = req.params;
    const requester = db.prepare(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, req.user.id);
    const target = db.prepare(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, userId);

    if (!requester || requester.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Somente administradores podem remover membros.' });
    }
    if (!target) return res.status(404).json({ ok: false, error: 'Membro não encontrado.' });
    if (userId === req.user.id) {
      return res.status(400).json({ ok: false, error: 'Use a opção Sair do grupo para remover sua própria participação.' });
    }

    if (target.role === 'admin') {
      const admins = db.prepare(
        "SELECT COUNT(*) AS total FROM group_members WHERE group_id = ? AND role = 'admin'"
      ).get(groupId).total;
      if (admins <= 1) {
        return res.status(400).json({ ok: false, error: 'Não é possível remover o único administrador.' });
      }
    }

    const remover = db.transaction(() => {
      db.prepare(`
        DELETE FROM group_outing_responses
        WHERE user_id = ?
          AND outing_id IN (SELECT id FROM group_outings WHERE group_id = ?)
      `).run(userId, groupId);
      db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
    });
    remover();
    emitirEventoGrupo(groupId, 'grupo_atualizado', { motivo: 'membro_removido', userId });
    return res.json({ ok: true });
  }
);

app.delete(
  '/api/grupos/:id/sair',
  exigirLogin,
  (req, res) => {
    const groupId = req.params.id;
    const member = db.prepare(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, req.user.id);

    if (!member) return res.status(404).json({ ok: false, error: 'Você não participa deste grupo.' });

    if (member.role === 'admin') {
      const admins = db.prepare(
        "SELECT COUNT(*) AS total FROM group_members WHERE group_id = ? AND role = 'admin'"
      ).get(groupId).total;
      if (admins <= 1) {
        return res.status(400).json({
          ok: false,
          error: 'Promova outro membro a administrador antes de sair do grupo.',
        });
      }
    }

    const sair = db.transaction(() => {
      db.prepare(`
        DELETE FROM group_outing_responses
        WHERE user_id = ?
          AND outing_id IN (SELECT id FROM group_outings WHERE group_id = ?)
      `).run(req.user.id, groupId);
      db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, req.user.id);
    });
    sair();
    emitirEventoGrupo(groupId, 'grupo_atualizado', { motivo: 'membro_saiu', userId: req.user.id });
    return res.json({ ok: true, message: 'Você saiu do grupo.' });
  }
);

app.put(
  '/api/grupos/:id',
  exigirLogin,
  (req, res) => {
    const groupId = req.params.id;
    const name = limparTexto(req.body?.name, 100, '');

    if (name.length < 2) {
      return res.status(400).json({
        ok: false,
        error: 'Informe um nome válido para o grupo.',
      });
    }

    const grupo = db.prepare(`
      SELECT role
      FROM group_members
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, req.user.id);

    if (!grupo || grupo.role !== 'admin') {
      return res.status(403).json({
        ok: false,
        error: 'Somente o criador/administrador pode editar o grupo.',
      });
    }

    const resultado = db.prepare(`
      UPDATE groups
      SET name = ?
      WHERE id = ?
    `).run(name, groupId);

    if (!resultado.changes) {
      return res.status(404).json({
        ok: false,
        error: 'Grupo não encontrado.',
      });
    }

    emitirEventoGrupo(groupId, 'grupo_atualizado', { motivo: 'grupo_editado' });
    return res.json({
      ok: true,
      group: { id: groupId, name },
      message: 'Grupo atualizado com sucesso.',
    });
  }
);

app.post(
  '/api/grupos/:id/trilhas',
  exigirLogin,
  (req, res) => {
    const groupId = req.params.id;
    const trailId = req.body?.trailId;
    const grupo = db.prepare(`
      SELECT role FROM group_members
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, req.user.id);

    if (!grupo || grupo.role !== 'admin') {
      return res.status(403).json({
        ok: false,
        error: 'Somente o administrador do grupo pode adicionar trilhas.',
      });
    }

    if (!db.prepare('SELECT id FROM trails WHERE id = ?').get(trailId)) {
      return res.status(404).json({
        ok: false,
        error: 'Trilha não encontrada.',
      });
    }

    db.prepare(`
      INSERT OR IGNORE INTO group_trails (group_id, trail_id, added_at)
      VALUES (?, ?, ?)
    `).run(groupId, trailId, new Date().toISOString());

    emitirEventoGrupo(groupId, 'grupo_atualizado', { motivo: 'trilha_adicionada', trailId });
    return res.json({ ok: true, message: 'Trilha adicionada ao grupo.' });
  }
);


/*
 * =========================================================
 * PARTICIPAÇÃO / CONVITES / VEÍCULOS
 * =========================================================
 */


/*
 * Normaliza o código da trilha.
 *
 * Aceita:
 *
 * 4X4-F8K2P
 * 4x4-f8k2p
 *
 * e transforma em:
 *
 * 4X4-F8K2P
 */
function normalizarCodigoTrilha(codigo) {
  if (typeof codigo !== 'string') {
    return '';
  }

  const compacto = codigo
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/-/g, '');

  const sufixo = compacto.startsWith('4X4')
    ? compacto.slice(3)
    : compacto;

  if (!/^[A-Z0-9]{5}$/.test(sufixo)) {
    return '';
  }

  return `4X4-${sufixo}`;
}


/*
 * Verifica se o usuário é administrador
 * da trilha.
 */
function usuarioEhAdminDaTrilha(
  trilhaId,
  userId
) {
  const membro = db.prepare(`
    SELECT role
    FROM trail_members
    WHERE trail_id = ?
      AND user_id = ?
      AND status = 'active'
  `).get(
    trilhaId,
    userId
  );

  return Boolean(
    membro &&
    membro.role === 'admin'
  );
}


/*
 * =========================================================
 * CADASTRAR VEÍCULO
 * =========================================================
 */

app.post(
  '/api/veiculos',
  exigirLogin,
  (req, res) => {
    try {

      const {
        type,
        brand,
        model,
        year,
        color,
        plate,
        notes,
      } = req.body || {};


      const tipo = limparTexto(
        type,
        40,
        ''
      );

      const marca = limparTexto(
        brand,
        80,
        ''
      );

      const modelo = limparTexto(
        model,
        80,
        ''
      );


      if (!tipo) {
        return res.status(400).json({
          ok: false,
          error:
            'Informe o tipo do veículo.',
        });
      }


      if (!marca) {
        return res.status(400).json({
          ok: false,
          error:
            'Informe a marca do veículo.',
        });
      }


      if (!modelo) {
        return res.status(400).json({
          ok: false,
          error:
            'Informe o modelo do veículo.',
        });
      }


      let ano = null;

      if (
        year !== undefined &&
        year !== null &&
        year !== ''
      ) {
        const numeroAno =
          Number(year);

        if (
          !Number.isInteger(numeroAno) ||
          numeroAno < 1900 ||
          numeroAno > 2100
        ) {
          return res.status(400).json({
            ok: false,
            error:
              'Ano do veículo inválido.',
          });
        }

        ano = numeroAno;
      }


      const id =
        crypto.randomUUID();

      const agora =
        new Date().toISOString();


      db.prepare(`
        INSERT INTO vehicles (
          id,
          user_id,
          type,
          brand,
          model,
          year,
          color,
          plate,
          notes,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        req.user.id,
        tipo,
        marca,
        modelo,
        ano,
        limparTexto(
          color,
          40,
          null
        ),
        limparTexto(
          plate,
          20,
          null
        ),
        limparTexto(
          notes,
          300,
          null
        ),
        agora
      );


      return res.status(201).json({
        ok: true,

        vehicle: {
          id,
          type: tipo,
          brand: marca,
          model: modelo,
          year: ano,
          color:
            limparTexto(
              color,
              40,
              null
            ),
          plate:
            limparTexto(
              plate,
              20,
              null
            ),
          notes:
            limparTexto(
              notes,
              300,
              null
            ),
        },
      });

    } catch (error) {

      console.error(
        'Erro ao cadastrar veículo:',
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          'Não foi possível cadastrar o veículo.',
      });
    }
  }
);


/*
 * =========================================================
 * LISTAR VEÍCULOS DO USUÁRIO
 * =========================================================
 */

app.get(
  '/api/veiculos',
  exigirLogin,
  (req, res) => {

    const vehicles =
      db.prepare(`
        SELECT
          id,
          type,
          brand,
          model,
          year,
          color,
          plate,
          notes,
          created_at AS createdAt
        FROM vehicles
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(
        req.user.id
      );


    return res.json({
      ok: true,
      vehicles,
    });
  }
);


/*
 * =========================================================
 * EDITAR VEÍCULO DO USUÁRIO
 * =========================================================
 */
app.put(
  '/api/veiculos/:id',
  exigirLogin,
  (req, res) => {
    const atual = db.prepare(`
      SELECT id
      FROM vehicles
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!atual) {
      return res.status(404).json({
        ok: false,
        error: 'Veículo não encontrado.',
      });
    }

    const type = limparTexto(req.body?.type, 40, '');
    const brand = limparTexto(req.body?.brand, 80, '');
    const model = limparTexto(req.body?.model, 80, '');

    if (!type || !brand || !model) {
      return res.status(400).json({
        ok: false,
        error: 'Informe tipo, marca e modelo.',
      });
    }

    let year = null;
    if (req.body?.year !== undefined && req.body?.year !== null && req.body?.year !== '') {
      year = Number(req.body.year);
      const anoMaximo = new Date().getFullYear() + 1;
      if (!Number.isInteger(year) || year < 1900 || year > anoMaximo) {
        return res.status(400).json({
          ok: false,
          error: 'Informe um ano válido.',
        });
      }
    }

    const color = limparTexto(req.body?.color, 40, null);
    const plate = limparTexto(req.body?.plate, 20, null);
    const notes = limparTexto(req.body?.notes, 300, null);

    db.prepare(`
      UPDATE vehicles
      SET type = ?, brand = ?, model = ?, year = ?, color = ?, plate = ?, notes = ?
      WHERE id = ? AND user_id = ?
    `).run(
      type, brand, model, year, color, plate, notes,
      req.params.id, req.user.id
    );

    return res.json({
      ok: true,
      message: 'Veículo atualizado com sucesso.',
      vehicle: {
        id: req.params.id,
        type, brand, model, year, color, plate, notes,
      },
    });
  }
);


/*
 * =========================================================
 * SOLICITAR PARTICIPAÇÃO POR CÓDIGO
 * =========================================================
 */

app.post(
  '/api/trilhas/entrar',
  exigirLogin,
  (req, res) => {
    try {

      const {
        code,
        vehicleId,
        vehicle,
      } = req.body || {};


      const codigo =
        normalizarCodigoTrilha(
          code
        );


      if (!codigo) {
        return res.status(400).json({
          ok: false,
          error:
            'Informe o ID da trilha.',
        });
      }


      const trilha =
        db.prepare(`
          SELECT
            id,
            code,
            name,
            type,
            visibility,
            status,
            creator_id AS creatorId
          FROM trails
          WHERE code = ?
        `).get(codigo);


      if (!trilha) {
        return res.status(404).json({
          ok: false,
          error:
            'Trilha não encontrada.',
        });
      }


      if (
        trilha.status !== 'open'
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'Esta trilha não está aberta para novas participações.',
        });
      }


      const membro =
        db.prepare(`
          SELECT
            role,
            status
          FROM trail_members
          WHERE trail_id = ?
            AND user_id = ?
        `).get(
          trilha.id,
          req.user.id
        );


      if (
        membro &&
        membro.status === 'active'
      ) {
        return res.status(409).json({
          ok: false,
          error:
            'Você já participa desta trilha.',
        });
      }


      const solicitacaoExistente =
        db.prepare(`
          SELECT
            id,
            status
          FROM trail_join_requests
          WHERE trail_id = ?
            AND user_id = ?
            AND status = 'pending'
        `).get(
          trilha.id,
          req.user.id
        );


      if (solicitacaoExistente) {
        return res.status(409).json({
          ok: false,
          error:
            'Você já possui uma solicitação pendente para esta trilha.',
        });
      }


      /*
       * Primeiro tentamos utilizar
       * um veículo já cadastrado.
       */

      let dadosVeiculo = null;


      if (vehicleId) {

        dadosVeiculo =
          db.prepare(`
            SELECT
              id,
              type,
              brand,
              model,
              year,
              color,
              plate,
              notes
            FROM vehicles
            WHERE id = ?
              AND user_id = ?
          `).get(
            vehicleId,
            req.user.id
          );


        if (!dadosVeiculo) {
          return res.status(400).json({
            ok: false,
            error:
              'Veículo não encontrado.',
          });
        }
      }


      /*
       * Também permitimos enviar
       * o veículo diretamente.
       */

      if (!dadosVeiculo && vehicle) {

        const tipo =
          limparTexto(
            vehicle.type,
            40,
            ''
          );

        const marca =
          limparTexto(
            vehicle.brand,
            80,
            ''
          );

        const modelo =
          limparTexto(
            vehicle.model,
            80,
            ''
          );


        if (
          !tipo ||
          !marca ||
          !modelo
        ) {
          return res.status(400).json({
            ok: false,
            error:
              'Informe tipo, marca e modelo do veículo.',
          });
        }


        let ano = null;

        if (
          vehicle.year !== undefined &&
          vehicle.year !== null &&
          vehicle.year !== ''
        ) {
          const numeroAno =
            Number(vehicle.year);

          if (
            !Number.isInteger(numeroAno) ||
            numeroAno < 1900 ||
            numeroAno > 2100
          ) {
            return res.status(400).json({
              ok: false,
              error:
                'Ano do veículo inválido.',
            });
          }

          ano = numeroAno;
        }


        dadosVeiculo = {
          type: tipo,
          brand: marca,
          model: modelo,
          year: ano,
          color:
            limparTexto(
              vehicle.color,
              40,
              null
            ),
          plate:
            limparTexto(
              vehicle.plate,
              20,
              null
            ),
          notes:
            limparTexto(
              vehicle.notes,
              300,
              null
            ),
        };
      }


      if (!dadosVeiculo) {
        return res.status(400).json({
          ok: false,
          error:
            'Informe o veículo que será utilizado na trilha.',
        });
      }


      const agora =
        new Date().toISOString();


      const requestId =
        crypto.randomUUID();

      // Toda entrada precisa ser aprovada pelo criador/administrador,
      // inclusive quando a trilha é pública.
      const statusInicial = 'pending';


      db.prepare(`
        INSERT INTO trail_join_requests (
          id,
          trail_id,
          user_id,
          vehicle_type,
          vehicle_brand,
          vehicle_model,
          vehicle_year,
          vehicle_color,
          vehicle_plate,
          vehicle_notes,
          status,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        requestId,
        trilha.id,
        req.user.id,
        dadosVeiculo.type,
        dadosVeiculo.brand,
        dadosVeiculo.model,
        dadosVeiculo.year,
        dadosVeiculo.color,
        dadosVeiculo.plate,
        dadosVeiculo.notes,
        statusInicial,
        agora
      );

      const adminsTrilha = db.prepare(
        "SELECT user_id AS userId FROM trail_members WHERE trail_id = ? AND role = 'admin' AND status = 'active'"
      ).all(trilha.id);
      adminsTrilha.forEach((admin) =>
        emitirEventoNotificacao(admin.userId, { motivo: 'solicitacao_trilha', trailId: trilha.id })
      );

      return res.status(201).json({
        ok: true,

        message:
          'Solicitação enviada ao administrador da trilha. Aguarde a aprovação para participar.',

        request: {
          id: requestId,
          trailId: trilha.id,
          code: trilha.code,
          trailName: trilha.name,
          status: statusInicial,
        },
      });

    } catch (error) {

      console.error(
        'Erro ao solicitar entrada na trilha:',
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          'Não foi possível enviar a solicitação.',
      });
    }
  }
);


app.post(
  '/api/grupos/:groupId/roles/:outingId/entrar-trilha',
  exigirLogin,
  (req, res) => {
    const { groupId, outingId } = req.params;
    const vehicleId = req.body?.vehicleId;

    const membroGrupo = db.prepare(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, req.user.id);
    const outing = db.prepare(`
      SELECT trail_id AS trailId, status
      FROM group_outings
      WHERE id = ? AND group_id = ?
    `).get(outingId, groupId);

    if (!membroGrupo || !outing || outing.status !== 'confirmed' || !outing.trailId) {
      return res.status(400).json({ ok: false, error: 'Este passeio ainda não possui uma trilha disponível.' });
    }

    const ativo = db.prepare(
      "SELECT 1 FROM trail_members WHERE trail_id = ? AND user_id = ? AND status = 'active'"
    ).get(outing.trailId, req.user.id);
    if (ativo) return res.json({ ok: true, alreadyMember: true, trailId: outing.trailId });

    const pendente = db.prepare(
      "SELECT id FROM trail_join_requests WHERE trail_id = ? AND user_id = ? AND status = 'pending'"
    ).get(outing.trailId, req.user.id);
    if (pendente) return res.json({ ok: true, pending: true, trailId: outing.trailId });

    const veiculo = db.prepare(`
      SELECT id, type, brand, model, year, color, plate, notes
      FROM vehicles WHERE id = ? AND user_id = ?
    `).get(vehicleId, req.user.id);
    if (!veiculo) {
      return res.status(400).json({ ok: false, error: 'Escolha um veículo cadastrado para participar.' });
    }

    const requestId = crypto.randomUUID();
    const agora = new Date().toISOString();
    db.prepare(`
      INSERT INTO trail_join_requests (
        id, trail_id, user_id, vehicle_type, vehicle_brand, vehicle_model,
        vehicle_year, vehicle_color, vehicle_plate, vehicle_notes, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      requestId, outing.trailId, req.user.id, veiculo.type, veiculo.brand,
      veiculo.model, veiculo.year, veiculo.color, veiculo.plate, veiculo.notes, agora
    );

    const adminsTrilha = db.prepare(
      "SELECT user_id AS userId FROM trail_members WHERE trail_id = ? AND role = 'admin' AND status = 'active'"
    ).all(outing.trailId);
    adminsTrilha.forEach((admin) =>
      emitirEventoNotificacao(admin.userId, { motivo: 'solicitacao_trilha', trailId: outing.trailId })
    );

    return res.status(201).json({
      ok: true,
      pending: true,
      trailId: outing.trailId,
      message: 'Solicitação enviada ao administrador da trilha.',
    });
  }
);


/*
 * =========================================================
 * ADMINISTRADOR — LISTAR SOLICITAÇÕES
 * =========================================================
 */

app.get(
  '/api/trilhas/:id/solicitacoes',
  exigirLogin,
  (req, res) => {

    const trilhaId =
      req.params.id;


    if (
      !usuarioEhAdminDaTrilha(
        trilhaId,
        req.user.id
      )
    ) {
      return res.status(403).json({
        ok: false,
        error:
          'Somente o administrador da trilha pode ver as solicitações.',
      });
    }


    const solicitacoes =
      db.prepare(`
        SELECT
          trail_join_requests.id,
          trail_join_requests.status,
          trail_join_requests.created_at AS createdAt,

          users.id AS userId,
          users.name AS userName,
          users.email AS userEmail,

          trail_join_requests.vehicle_type AS vehicleType,
          trail_join_requests.vehicle_brand AS vehicleBrand,
          trail_join_requests.vehicle_model AS vehicleModel,
          trail_join_requests.vehicle_year AS vehicleYear,
          trail_join_requests.vehicle_color AS vehicleColor,
          trail_join_requests.vehicle_plate AS vehiclePlate,
          trail_join_requests.vehicle_notes AS vehicleNotes

        FROM trail_join_requests

        INNER JOIN users
          ON users.id =
            trail_join_requests.user_id

        WHERE
          trail_join_requests.trail_id = ?

        ORDER BY
          CASE
            WHEN trail_join_requests.status = 'pending'
            THEN 0
            ELSE 1
          END,
          trail_join_requests.created_at DESC
      `).all(
        trilhaId
      );


    return res.json({
      ok: true,
      requests:
        solicitacoes,
    });
  }
);


/*
 * =========================================================
 * ADMINISTRADOR — ACEITAR OU RECUSAR
 * =========================================================
 */

app.post(
  '/api/trilhas/:id/solicitacoes/:requestId',
  exigirLogin,
  (req, res) => {
    try {

      const trilhaId =
        req.params.id;

      const requestId =
        req.params.requestId;

      const acao =
        typeof req.body?.action === 'string'
          ? req.body.action
              .trim()
              .toLowerCase()
          : '';


      if (
        ![
          'aceitar',
          'recusar'
        ].includes(acao)
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'Ação inválida.',
        });
      }


      if (
        !usuarioEhAdminDaTrilha(
          trilhaId,
          req.user.id
        )
      ) {
        return res.status(403).json({
          ok: false,
          error:
            'Somente o administrador pode analisar solicitações.',
        });
      }


      const solicitacao =
        db.prepare(`
          SELECT
            *
          FROM trail_join_requests
          WHERE id = ?
            AND trail_id = ?
        `).get(
          requestId,
          trilhaId
        );


      if (!solicitacao) {
        return res.status(404).json({
          ok: false,
          error:
            'Solicitação não encontrada.',
        });
      }


      if (
        solicitacao.status !==
        'pending'
      ) {
        return res.status(409).json({
          ok: false,
          error:
            'Esta solicitação já foi analisada.',
        });
      }


      const agora =
        new Date().toISOString();


      if (
        acao === 'recusar'
      ) {

        db.prepare(`
          UPDATE trail_join_requests
          SET
            status = 'rejected',
            reviewed_at = ?,
            reviewed_by = ?
          WHERE id = ?
        `).run(
          agora,
          req.user.id,
          requestId
        );


        emitirEventoNotificacao(solicitacao.user_id, {
          motivo: 'solicitacao_trilha_analisada',
          trailId: trilhaId,
          status: 'rejected',
        });

        return res.json({
          ok: true,
          message:
            'Solicitação recusada.',
        });
      }


      /*
       * ACEITAR
       *
       * O participante entra na trilha
       * somente depois da aprovação.
       */

      const aceitarSolicitacao = db.transaction(() => {
        db.prepare(`
          INSERT INTO trail_members (
            trail_id, user_id, role, status, joined_at
          )
          VALUES (?, ?, 'member', 'active', ?)
          ON CONFLICT(trail_id, user_id)
          DO UPDATE SET role = 'member', status = 'active', joined_at = excluded.joined_at
        `).run(trilhaId, solicitacao.user_id, agora);

        db.prepare(`
          UPDATE trail_join_requests
          SET status = 'accepted', reviewed_at = ?, reviewed_by = ?
          WHERE id = ?
        `).run(agora, req.user.id, requestId);

        db.prepare(`
          UPDATE trail_join_requests
          SET status = 'rejected', reviewed_at = ?, reviewed_by = ?
          WHERE trail_id = ? AND user_id = ? AND status = 'pending' AND id <> ?
        `).run(agora, req.user.id, trilhaId, solicitacao.user_id, requestId);
      });
      aceitarSolicitacao();

      emitirEventoNotificacao(solicitacao.user_id, {
        motivo: 'solicitacao_trilha_analisada',
        trailId: trilhaId,
        status: 'accepted',
      });


      return res.json({
        ok: true,
        message:
          'Participante aceito na trilha.',
      });

    } catch (error) {

      console.error(
        'Erro ao analisar solicitação:',
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          'Não foi possível analisar a solicitação.',
      });
    }
  }
);

/*
 * SSE global antigo.
 */

app.get(
  '/api/sos/stream',
  exigirLogin,
  (req, res) => {

    res.setHeader(
      'Content-Type',
      'text/event-stream'
    );

    res.setHeader(
      'Cache-Control',
      'no-cache'
    );

    res.setHeader(
      'Connection',
      'keep-alive'
    );
    res.setHeader('X-Accel-Buffering', 'no');


    if (
      typeof res.flushHeaders ===
      'function'
    ) {
      res.flushHeaders();
    }


    const cliente = {
      res,
    };


    clientesSOS.add(
      cliente
    );


    /*
     * Envia estado atual.
     */

    res.write(
      `event: estado\ndata: ${JSON.stringify(alertasSOS.filter(a => a.active))}\n\n`
    );


    req.on(
      'close',
      () => {
        clientesSOS.delete(
          cliente
        );
      }
    );
  }
);


/*
 * Criar SOS legado.
 */

app.post(
  '/api/sos',
  exigirLogin,
  (req, res) => {

    const {
      latitude,
      longitude,
      accuracy,
      motivo,
    } = req.body || {};


    if (
      !validarNumeroCoordenada(
        latitude,
        -90,
        90
      ) ||
      !validarNumeroCoordenada(
        longitude,
        -180,
        180
      )
    ) {
      return res.status(400).json({
        ok: false,
        error:
          'Informe uma localização válida.',
      });
    }


    const alerta = {
      id:
        crypto.randomUUID(),

      userId:
        req.user.id,

      userName:
        req.user.name,

      latitude,

      longitude,

      accuracy:
        validarNumeroCoordenada(
          accuracy,
          0,
          100000
        )
          ? accuracy
          : null,

      motivo:
        limparTexto(
          motivo,
          LIMITE_MOTIVO,
          'Preciso de ajuda'
        ),

      createdAt:
        new Date().toISOString(),

      active:
        true,
    };


    alertasSOS.push(
      alerta
    );


    while (
      alertasSOS.length >
      MAX_ALERTAS
    ) {
      alertasSOS.shift();
    }


    transmitirEvento(
      'sos',
      alerta
    );


    return res.status(201).json({
      ok: true,
      alert:
        alerta,
    });
  }
);


/*
 * Listar SOS legado.
 */

app.get(
  '/api/sos',
  exigirLogin,
  (_req, res) => {

    return res.json({
      ok: true,

      alerts:
        alertasSOS.filter(
          (alerta) =>
            alerta.active
        ),
    });
  }
);


/*
 * Encerrar SOS legado.
 */

app.delete(
  '/api/sos/:id',
  exigirLogin,
  (req, res) => {

    const alerta =
      alertasSOS.find(
        (item) =>
          item.id ===
          req.params.id
      );


    if (!alerta) {
      return res.status(404).json({
        ok: false,
        error:
          'Alerta SOS não encontrado.',
      });
    }


    if (
      alerta.userId !==
      req.user.id
    ) {
      return res.status(403).json({
        ok: false,
        error:
          'Somente o autor pode encerrar este SOS.',
      });
    }


    alerta.active =
      false;

    alerta.closedAt =
      new Date().toISOString();

    alerta.closedBy =
      req.user.id;


    transmitirEvento(
      'sos_encerrado',
      {
        alertId:
          alerta.id,

        userId:
          alerta.userId,
      }
    );


    return res.json({
      ok: true,
      message:
        'SOS encerrado.',
    });
  }
);


/*
 * =========================================================
 * IA 4X4
 * =========================================================
 */

app.post('/api/chat', exigirLogin, limitarChat, async (req, res) => {
  const mensagem = typeof req.body?.message === 'string'
    ? req.body.message.trim().slice(0, 2000)
    : '';
  if (!mensagem) {
    return res.status(400).json({ ok: false, error: 'Informe uma mensagem.' });
  }

  const usuario = usuarioAtual(req);
  const veiculo = usuario
    ? db.prepare(`
        SELECT type, brand, model, year, color, plate
        FROM vehicles
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(usuario.id)
    : null;
  const contexto = req.body?.context || {};
  const contextoTexto = [
    usuario ? `Usuário: ${usuario.name}.` : '',
    veiculo ? `Veículo: ${veiculo.type} ${veiculo.brand} ${veiculo.model}${veiculo.year ? `, ${veiculo.year}` : ''}.` : '',
    contexto.trailName ? `Trilha atual: ${String(contexto.trailName).slice(0, 120)}.` : '',
    contexto.trailStatus ? `Status da trilha: ${String(contexto.trailStatus).slice(0, 40)}.` : '',
  ].filter(Boolean).join(' ');

  let fontes = [];
  try {
    fontes = await pesquisarOffRoad(mensagem);
  } catch (error) {
    console.warn('Pesquisa off-road indisponível:', error.message);
  }

  try {
    const reply = await responderComGroq(mensagem, contextoTexto, fontes);
    if (reply) {
      return res.json({
        ok: true,
        reply,
        source: fontes.length ? 'groq+tavily' : 'groq',
        sources: fontes.map(({ title, url }) => ({ title, url })),
      });
    }
  } catch (error) {
    console.warn('IA Groq indisponível:', error.message);
  }

  return res.json({
    ok: true,
    reply: gerarRespostaLocal(mensagem),
    source: 'local-fallback',
    sources: fontes.map(({ title, url }) => ({ title, url })),
  });
});


/*
 * =========================================================
 * TRATAMENTO DE ERROS
 * =========================================================
 */

app.use(
  (error, _req, res, _next) => {

    console.error(
      'Erro interno:',
      error
    );


    return res.status(500).json({
      ok: false,
      error:
        'Erro interno do servidor.',
    });
  }
);


/*
 * =========================================================
 * INICIAR SERVIDOR
 * =========================================================
 */

app.listen(
  port,
  () => {

    console.log(
      `Servidor Trilha 4x4 rodando em http://localhost:${port}`
    );

  }
);

