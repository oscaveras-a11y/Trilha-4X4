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
 * OPENAI
 * =========================================================
 */

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

  if (
    texto.includes('olá') ||
    texto.includes('oi')
  ) {
    return 'Olá! Sou o assistente do Movimento 4x4. Como posso ajudar?';
  }

  if (
    texto.includes('4x4') ||
    texto.includes('movimento')
  ) {
    return 'O Movimento 4x4 é uma metodologia de rotina, disciplina e foco, com quatro pilares e quatro ações principais para manter progresso consistente.';
  }

  if (
    texto.includes('como funciona') ||
    texto.includes('funciona')
  ) {
    return 'Ele funciona como uma rotina simples e consistente: definir prioridades, executar de forma disciplinada, revisar resultados e manter continuidade.';
  }

  if (
    texto.includes('objetivo') ||
    texto.includes('para que serve')
  ) {
    return 'O objetivo do 4x4 é fortalecer hábitos, organização e execução prática para atingir metas com mais clareza e consistência.';
  }

  return 'Posso ajudar com informações sobre rotina, objetivos, disciplina e aplicação do Movimento 4x4 no dia a dia.';
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
      `trilha4x4_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`
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
      `trilha4x4_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`
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
      'trilha4x4_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
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


      /*
       * Criador entra automaticamente
       * como administrador.
       */

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
            trail_members.role
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
        trails,
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
 * SSE global antigo.
 */

app.get(
  '/api/sos/stream',
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
 * CHAT / OPENAI
 * =========================================================
 */

app.post(
  '/api/chat',
  async (req, res) => {

    try {

      const mensagem =
        typeof req.body?.message ===
        'string'
          ? req.body.message.trim()
          : '';


      if (!mensagem) {
        return res.status(400).json({
          ok: false,
          error:
            'Informe uma mensagem.',
        });
      }


      /*
       * Se não houver chave da OpenAI,
       * utiliza o fallback local.
       */

      if (
        !process.env.OPENAI_API_KEY
      ) {

        return res.json({
          ok: true,
          reply:
            gerarRespostaLocal(
              mensagem
            ),
          source:
            'local',
        });
      }


      const resposta =
        await openai.responses.create({
          model:
            process.env.OPENAI_MODEL ||
            'gpt-4o-mini',

          input:
            mensagem,
        });


      return res.json({
        ok: true,

        reply:
          resposta.output_text ||
          gerarRespostaLocal(
            mensagem
          ),

        source:
          'openai',
      });

    } catch (error) {

      console.error(
        'Erro na API da OpenAI:',
        error
      );


      /*
       * Mesmo se a OpenAI falhar,
       * o aplicativo continua respondendo.
       */

      return res.json({
        ok: true,

        reply:
          gerarRespostaLocal(
            req.body?.message || ''
          ),

        source:
          'local-fallback',
      });
    }
  }
);


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

