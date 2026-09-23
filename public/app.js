function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let mapa = null;
let marcadorUsuario = null;
let precisaoUsuario = null;
let sosAtivo = false;


document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .catch((erro) => {
        console.warn('Offline indisponível:', erro);
      });
  }

  document.querySelectorAll('.menu-card').forEach((card) => {
    card.addEventListener('click', () => {
      navegarParaModulo(card.dataset.page);
    });
  });

  document.querySelectorAll('[data-bottom-page]').forEach((button) => {
    button.addEventListener('click', () => {
      const page = button.dataset.bottomPage;
      if (page === 'home') {
        history.pushState({}, '', '/');
        mostrarHome();
      } else if (page === 'perfil') {
        abrirPerfilCompleto();
      } else {
        navegarParaModulo(page);
      }
    });
  });

  document.getElementById('heroProfile')?.addEventListener('click', () => abrirPerfilCompleto());

  document.getElementById('heroNotifications')?.addEventListener('click', () => {
    mostrarNotificacoes();
  });

  document.getElementById('voltarHome')?.addEventListener('click', () => {
    history.pushState({}, '', '/');
    mostrarHome();
  });

  window.addEventListener('popstate', carregarRotaDaInterface);
  carregarRotaDaInterface();

  const loginButton = document.getElementById('loginButton');

  if (loginButton) {
    loginButton.addEventListener('click', () => {
      window.location.href = '/auth.html';
    });
  }

  const locationButton = document.getElementById('locationButton');

  if (locationButton) {
    locationButton.addEventListener('click', solicitarLocalizacao);
  }

  const sosButton = document.getElementById('sosButton');

  if (sosButton) {
    sosButton.addEventListener('click', ativarSOS);
  }

  const segurancaButton = document.getElementById('segurancaButton');

  if (segurancaButton) {
    segurancaButton.addEventListener('click', () => {
      window.location.href = '/segurança.html';
    });
  }

  verificarUsuarioLogado();
  atualizarNotificacoes();
  iniciarNotificacoesTempoReal();
});

async function verificarUsuarioLogado() {
  const loginButton = document.getElementById('loginButton');

  try {
    const resposta = await fetch('/api/auth/me', {
      cache: 'no-store'
    });

    const dados = await resposta.json();

    if (!dados.authenticated) {
      if (loginButton) {
        loginButton.style.display = '';
      }

      const avatarExistente = document.getElementById('avatarUsuario');
      const menuExistente = document.getElementById('menuUsuario');

      if (avatarExistente) avatarExistente.remove();
      if (menuExistente) menuExistente.remove();

      return;
    }

    if (loginButton) {
      loginButton.style.display = 'none';
    }

    criarAvatarUsuario(dados.user);
  } catch (erro) {
    console.error('Erro ao verificar usuário:', erro);
  }
}

function criarAvatarUsuario(user) {
  const loginButton = document.getElementById('loginButton');

  if (document.getElementById('avatarUsuario')) {
    return;
  }

  const avatar = document.createElement('button');
  avatar.id = 'avatarUsuario';
  avatar.type = 'button';

  const inicial = user.name ? user.name.trim().charAt(0).toUpperCase() : 'U';
  avatar.textContent = inicial;
  avatar.title = `${user.name} — ${user.email}`;

  avatar.style.width = '44px';
  avatar.style.height = '44px';
  avatar.style.borderRadius = '50%';
  avatar.style.border = 'none';
  avatar.style.background = '#e53935';
  avatar.style.color = '#fff';
  avatar.style.fontSize = '18px';
  avatar.style.fontWeight = 'bold';
  avatar.style.cursor = 'pointer';

  avatar.style.display = 'none';
  document.body.appendChild(avatar);

  avatar.addEventListener('click', () => {
    mostrarMenuUsuario(user);
  });
}

let notificacoesAtuais = [];
let notificacoesEventos = null;

function iniciarNotificacoesTempoReal() {
  if (typeof EventSource === 'undefined' || notificacoesEventos) return;
  notificacoesEventos = new EventSource('/api/notificacoes/eventos');
  notificacoesEventos.addEventListener('notificacoes_atualizadas', atualizarNotificacoes);
  notificacoesEventos.onerror = () => {
    // EventSource reconecta automaticamente quando a rede volta.
  };
}

async function atualizarNotificacoes() {
  const dot = document.getElementById('notificationDot');
  try {
    const resposta = await fetch('/api/notificacoes', { cache: 'no-store' });
    if (resposta.status === 401) {
      notificacoesAtuais = [];
      if (dot) dot.hidden = true;
      return;
    }
    const dados = await resposta.json();
    notificacoesAtuais = dados.ok && Array.isArray(dados.notifications) ? dados.notifications : [];
    if (dot) dot.hidden = notificacoesAtuais.length === 0;
    const painel = document.getElementById('painelNotificacoes');
    if (painel) renderizarNotificacoes(painel);
  } catch (erro) {
    console.warn('Não foi possível atualizar notificações:', erro);
  }
}

function renderizarNotificacoes(painel) {
  const itens = notificacoesAtuais.length
    ? notificacoesAtuais.map((n, i) => `
      <button type="button" class="notification-item" data-notification-index="${i}">
        <span class="notification-item-icon">${n.icon || '🔔'}</span>
        <span><strong>${escaparHtml(n.title || 'Notificação')}</strong><small>${escaparHtml(n.message || '')}</small></span>
        <span class="notification-chevron">›</span>
      </button>`).join('')
    : '<div class="notification-empty">Nenhuma nova notificação no momento.</div>';

  painel.innerHTML = `
    <div class="floating-panel-title"><strong>🔔 Notificações</strong><button type="button" class="notification-close" aria-label="Fechar">×</button></div>
    <div class="notification-list">${itens}</div>
  `;
  painel.querySelector('.notification-close')?.addEventListener('click', () => painel.remove());
  painel.querySelectorAll('[data-notification-index]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const n = notificacoesAtuais[Number(botao.dataset.notificationIndex)];
      painel.remove();
      if (!n?.action) return;
      if (n.action.href) {
        window.location.href = n.action.href;
        return;
      }
      if (n.action.page) navegarParaModulo(n.action.page);
    });
  });
}

async function mostrarNotificacoes() {
  const existente = document.getElementById('painelNotificacoes');
  if (existente) {
    existente.remove();
    return;
  }
  const painel = document.createElement('div');
  painel.id = 'painelNotificacoes';
  painel.className = 'floating-top-panel notification-panel';
  painel.innerHTML = '<div class="notification-empty">Carregando notificações...</div>';
  document.body.appendChild(painel);
  await atualizarNotificacoes();
  renderizarNotificacoes(painel);
}

async function abrirPerfilCompleto() {
  try {
    const auth = await fetch('/api/auth/me', { cache: 'no-store' });
    const authData = await auth.json();
    if (!authData.authenticated) {
      window.location.href = '/auth.html';
      return;
    }

    const [veiculosResp, gruposResp, trilhasResp] = await Promise.all([
      fetch('/api/veiculos', { cache: 'no-store' }),
      fetch('/api/grupos', { cache: 'no-store' }),
      fetch('/api/trilhas', { cache: 'no-store' }),
    ]);
    const [veiculosData, gruposData, trilhasData] = await Promise.all([
      veiculosResp.json(), gruposResp.json(), trilhasResp.json()
    ]);
    const veiculos = veiculosData.vehicles || [];
    const grupos = gruposData.groups || [];
    const trilhas = trilhasData.trails || [];
    const user = authData.user;
    const inicial = escaparHtml((user.name || 'U').trim().charAt(0).toUpperCase());

    document.body.classList.add('module-open');
    document.getElementById('homeHero').style.display = 'none';
    document.getElementById('homeMenu').style.display = 'none';
    document.querySelectorAll('[data-home-only="1"]').forEach((el) => el.style.display = 'none');
    const pagina = document.getElementById('paginaModulo');
    pagina.style.display = 'block';
    document.getElementById('tituloModulo').textContent = 'Meu perfil';
    const destino = document.getElementById('conteudoModulo');

    destino.innerHTML = `
      <section class="profile-page">
        <div class="profile-identity">
          <div class="profile-avatar-large">${inicial}</div>
          <div><span class="profile-kicker">TRILHA 4X4</span><h2>${escaparHtml(user.name || 'Usuário')}</h2><p>${escaparHtml(user.email || '')}</p></div>
        </div>
        <div class="profile-stats">
          <button type="button" data-profile-go="meu-4x4"><strong>${veiculos.length}</strong><span>Veículos</span></button>
          <button type="button" data-profile-go="grupos"><strong>${grupos.length}</strong><span>Grupos</span></button>
          <button type="button" data-profile-go="trilhas"><strong>${trilhas.length}</strong><span>Trilhas</span></button>
        </div>
        <div class="profile-section">
          <div class="profile-section-head"><h3>🚙 Meus veículos</h3><button type="button" data-profile-go="meu-4x4">Ver todos</button></div>
          <div class="profile-preview">${veiculos.length ? veiculos.slice(0,3).map(v => `<div><strong>${escaparHtml(v.brand)} ${escaparHtml(v.model)}</strong><small>${escaparHtml(v.type)}${v.year ? ' · '+v.year : ''}</small></div>`).join('') : '<p>Nenhum veículo cadastrado.</p>'}</div>
        </div>
        <div class="profile-section">
          <div class="profile-section-head"><h3>👥 Meus grupos</h3><button type="button" data-profile-go="grupos">Ver todos</button></div>
          <div class="profile-preview">${grupos.length ? grupos.slice(0,3).map(g => `<div><strong>${escaparHtml(g.name)}</strong><small>${g.memberCount || 0} membros · ${g.role === 'admin' ? 'Administrador' : 'Membro'}</small></div>`).join('') : '<p>Você ainda não participa de grupos.</p>'}</div>
        </div>
        <div class="profile-section">
          <div class="profile-section-head"><h3>🛣️ Minhas trilhas</h3><button type="button" data-profile-go="trilhas">Ver todas</button></div>
          <div class="profile-preview">${trilhas.length ? trilhas.slice(0,3).map(t => `<div><strong>${escaparHtml(t.name)}</strong><small>${escaparHtml(t.code || '')} · ${t.role === 'admin' ? 'Administrador' : 'Participante'}</small></div>`).join('') : '<p>Nenhuma trilha vinculada ao seu perfil.</p>'}</div>
        </div>
        <button type="button" class="profile-logout" id="profileLogout">Sair da conta</button>
      </section>
    `;

    destino.querySelectorAll('[data-profile-go]').forEach((btn) =>
      btn.addEventListener('click', () => navegarParaModulo(btn.dataset.profileGo))
    );
    document.getElementById('profileLogout')?.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      window.location.href = '/';
    });
    document.querySelectorAll('[data-bottom-page]').forEach((b) =>
      b.classList.toggle('active', b.dataset.bottomPage === 'perfil'));
  } catch (erro) {
    console.error('Erro ao abrir perfil:', erro);
    alert('Não foi possível carregar seu perfil.');
  }
}

function mostrarMenuUsuario(user) {
  const menuExistente = document.getElementById('menuUsuario');

  if (menuExistente) {
    menuExistente.remove();
    return;
  }

  const menu = document.createElement('div');
  menu.id = 'menuUsuario';
  menu.style.position = 'absolute';
  menu.style.right = '20px';
  menu.style.top = '70px';
  menu.style.background = '#1c1c1c';
  menu.style.color = '#fff';
  menu.style.padding = '18px';
  menu.style.borderRadius = '12px';
  menu.style.boxShadow = '0 8px 25px rgba(0,0,0,0.4)';
  menu.style.zIndex = '9999';
  menu.style.minWidth = '220px';

  const nome = document.createElement('strong');
  nome.textContent = user.name;

  const email = document.createElement('small');
  email.textContent = user.email;

  const separador = document.createElement('hr');
  separador.style.border = '0';
  separador.style.borderTop = '1px solid #444';
  separador.style.margin = '12px 0';

  const botaoSair = document.createElement('button');
  botaoSair.id = 'botaoSair';
  botaoSair.type = 'button';
  botaoSair.textContent = 'Sair';
  botaoSair.style.width = '100%';
  botaoSair.style.padding = '10px';
  botaoSair.style.border = '0';
  botaoSair.style.borderRadius = '8px';
  botaoSair.style.background = '#333';
  botaoSair.style.color = '#fff';
  botaoSair.style.cursor = 'pointer';

  menu.appendChild(nome);
  menu.appendChild(document.createElement('br'));
  menu.appendChild(email);
  menu.appendChild(separador);
  menu.appendChild(botaoSair);

  document.body.appendChild(menu);

  botaoSair.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      });
    } catch (erro) {
      console.error('Erro ao sair:', erro);
    }

    const avatar = document.getElementById('avatarUsuario');
    if (avatar) avatar.remove();

    menu.remove();

    const loginButton = document.getElementById('loginButton');
    if (loginButton) loginButton.style.display = '';

    window.location.reload();
  });
}

const MODULOS_APP = {
  'entrar-trilha': { titulo: 'Entrar em uma trilha', acao: () => abrirEntrarTrilha() },
  'mapa': { titulo: 'Mapas', acao: () => abrirMapa() },
  'trilhas': { titulo: 'Trilhas', acao: () => abrirListaTrilhas() },
  'navegacao': { titulo: 'Navegação', acao: () => abrirNavegacao() },
  'ia': { titulo: 'IA 4x4', acao: () => abrirIA() },
  'grupos': { titulo: 'Grupos', acao: () => abrirGrupos() },
  'seguranca': { titulo: 'Segurança', href: '/segurança.html' },
  'criar-trilha': { titulo: 'Criar trilha', acao: () => abrirCriarTrilha() },
  'meu-4x4': { titulo: 'Meu 4x4', acao: () => abrirMeu4x4() },
};

function navegarParaModulo(page) {
  const modulo = MODULOS_APP[page];
  if (!modulo) return;
  if (modulo.href) {
    window.location.href = modulo.href;
    return;
  }
  history.pushState({ page }, '', '/?page=' + encodeURIComponent(page));
  abrirPaginaModulo(page);
}

function mostrarHome() {
  document.body.classList.remove('module-open');
  document.getElementById('homeHero').style.display = '';
  document.getElementById('homeMenu').style.display = '';
  document.querySelectorAll('[data-home-only="1"]').forEach((el) => el.style.display = '');
  document.getElementById('paginaModulo').style.display = 'none';
  document.getElementById('conteudoModulo').innerHTML = '';
  document.querySelectorAll('[data-bottom-page]').forEach((b) =>
    b.classList.toggle('active', b.dataset.bottomPage === 'home'));
}

function abrirPaginaModulo(page) {
  const modulo = MODULOS_APP[page];
  if (!modulo) return mostrarHome();

  document.body.classList.add('module-open');
  document.getElementById('homeHero').style.display = 'none';
  document.getElementById('homeMenu').style.display = 'none';
  document.querySelectorAll('[data-home-only="1"]').forEach((el) => el.style.display = 'none');

  const pagina = document.getElementById('paginaModulo');
  const conteudo = document.getElementById('conteudoModulo');
  document.getElementById('tituloModulo').textContent = modulo.titulo;
  pagina.style.display = 'block';
  conteudo.innerHTML = '';

  document.querySelectorAll('[data-bottom-page]').forEach((b) =>
    b.classList.toggle('active', b.dataset.bottomPage === page));

  modulo.acao?.();
}

function carregarRotaDaInterface() {
  const page = new URLSearchParams(window.location.search).get('page');
  if (page && MODULOS_APP[page]) abrirPaginaModulo(page);
  else mostrarHome();
}

function anexarPainelAoModulo(elemento) {
  const destino = document.getElementById('conteudoModulo');
  if (!destino || !document.body.classList.contains('module-open') || !elemento) {
    return false;
  }

  elemento.classList.add('painel-modulo-embutido');
  elemento.style.position = 'relative';
  elemento.style.inset = 'auto';
  elemento.style.zIndex = '1';
  elemento.style.background = 'transparent';
  elemento.style.padding = '0';
  elemento.style.display = 'block';
  elemento.style.width = '100%';
  elemento.style.minHeight = '0';

  destino.appendChild(elemento);

  const painel = elemento.firstElementChild;
  if (painel) {
    painel.style.maxWidth = 'none';
    painel.style.width = '100%';
    painel.style.maxHeight = 'none';
    painel.style.margin = '0';
    painel.style.borderRadius = '18px';
  }

  return true;
}

async function abrirNavegacao() {
  const destino = document.getElementById('conteudoModulo');
  if (!destino) return;

  destino.innerHTML = `
    <div style="display:grid;gap:14px;">
      <div style="padding:20px;border:1px solid var(--border);border-radius:18px;background:var(--surface);">
        <h2 style="margin-bottom:8px;">🧭 Navegação 4x4</h2>
        <p style="color:var(--text-secondary);line-height:1.6;">
          Escolha uma trilha da qual você já participa para abrir a rota planejada,
          localização dos participantes e modo de navegação.
        </p>
      </div>
      <div id="navegacaoTrilhas" style="display:grid;gap:12px;"></div>
    </div>
  `;

  const lista = document.getElementById('navegacaoTrilhas');

  try {
    const resposta = await fetch('/api/trilhas', { cache: 'no-store' });
    const dados = await resposta.json();

    if (!resposta.ok) {
      lista.innerHTML = '<p>Entre na sua conta para usar a navegação.</p>';
      return;
    }

    const trilhas = Array.isArray(dados.trails) ? dados.trails : [];

    if (!trilhas.length) {
      lista.innerHTML = '<p style="color:var(--text-secondary);">Você ainda não participa de nenhuma trilha aprovada.</p>';
      return;
    }

    lista.innerHTML = trilhas.map((trilha) => `
      <button type="button"
        onclick="window.location.href='/trilha.html?id=${encodeURIComponent(trilha.id)}'"
        style="width:100%;text-align:left;padding:18px;border:1px solid var(--border);border-radius:16px;background:var(--surface);color:var(--text);cursor:pointer;">
        <strong style="font-size:18px;">🛣️ ${escaparTextoTrilha(trilha.name)}</strong>
        <span style="display:block;margin-top:7px;color:var(--text-secondary);">
          ${escaparTextoTrilha(trilha.code)} · Abrir rota e navegação →
        </span>
      </button>
    `).join('');
  } catch (erro) {
    console.error('Erro na navegação:', erro);
    lista.innerHTML = '<p>Não foi possível carregar suas trilhas.</p>';
  }
}

function abrirFuncao(page) {
  switch (page) {
    case 'mapa':
      abrirMapa();
      break;

    case 'criar-trilha':
      abrirCriarTrilha();
      break;

    case 'trilhas':
      abrirListaTrilhas();
      break;

    case 'entrar-trilha':
      abrirEntrarTrilha();
      break;

    case 'navegacao':
      alert('🧭 A navegação será criada aqui.');
      break;

    case 'ia':
      abrirIA();
      break;

    case 'grupos':
      abrirGrupos();
      break;

    case 'seguranca':
      window.location.href = '/segurança.html';
      break;

    case 'meu-4x4':
      abrirMeu4x4();
      break;
  }
}

const IA_MEMORY_DB = 'trilha4x4-ia';
const IA_MEMORY_STORE = 'memorias';
const IA_MEMORY_MAX = 30;
const IA_MEMORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const IA_MEMORY_SENSITIVE = /\\b(senha|password|passwd|token|cookie|api[ _-]?key|chave[ _-]?de[ _-]?api|authorization|bearer|secret|segredo|credencial)\\b/i;

function abrirBancoMemoriaIA() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IA_MEMORY_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IA_MEMORY_STORE)) {
        const store = db.createObjectStore(IA_MEMORY_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function usuarioMemoriaIA() {
  try {
    const r = await fetch('/api/auth/me', { cache: 'no-store' });
    const d = await r.json();
    return d.authenticated && d.user?.id ? String(d.user.id) : null;
  } catch { return null; }
}

async function listarMemoriasIA(userId, limite = 12) {
  if (!userId) return [];
  const db = await abrirBancoMemoriaIA();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IA_MEMORY_STORE, 'readonly');
    const req = tx.objectStore(IA_MEMORY_STORE).index('userId').getAll(userId);
    req.onsuccess = () => { const agora=Date.now(); resolve((req.result || []).filter(m => !m.expiresAt || Date.parse(m.expiresAt) > agora).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limite)); };
    req.onerror = () => reject(req.error);
  });
}

async function salvarMemoriaIA(userId, texto, categoria = 'pergunta') {
  const limpo = String(texto || '').trim().slice(0, 400);
  if (!['preferencia','fato_usuario','pergunta'].includes(categoria)) return false;
  if (!userId || !limpo || IA_MEMORY_SENSITIVE.test(limpo)) return false;
  const db = await abrirBancoMemoriaIA();
  const existentes = await listarMemoriasIA(userId, IA_MEMORY_MAX + 20);
  if (existentes.some((m) => m.texto.toLowerCase() === limpo.toLowerCase())) return true;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IA_MEMORY_STORE, 'readwrite');
    const createdAt = new Date(); tx.objectStore(IA_MEMORY_STORE).add({ userId, texto: limpo, categoria, confianca: categoria === 'pergunta' ? 'baixa' : 'usuario', createdAt: createdAt.toISOString(), expiresAt: new Date(createdAt.getTime()+IA_MEMORY_TTL_MS).toISOString(), origem: 'dispositivo' });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  const todos = await listarMemoriasIA(userId, IA_MEMORY_MAX + 20);
  if (todos.length > IA_MEMORY_MAX) {
    const apagar = todos.slice(IA_MEMORY_MAX);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IA_MEMORY_STORE, 'readwrite');
      apagar.forEach((m) => tx.objectStore(IA_MEMORY_STORE).delete(m.id));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  return true;
}

async function limparMemoriaIA(userId) {
  if (!userId) return;
  const db = await abrirBancoMemoriaIA();
  const itens = await listarMemoriasIA(userId, IA_MEMORY_MAX + 100);
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IA_MEMORY_STORE, 'readwrite');
    itens.forEach((m) => tx.objectStore(IA_MEMORY_STORE).delete(m.id));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function abrirIA() {
  const existente = document.getElementById('iaOverlay');
  if (existente) {
    existente.remove();
    return;
  }

  const memoryUserId = await usuarioMemoriaIA();
  const overlay = document.createElement('div');
  overlay.id = 'iaOverlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(15, 23, 42, 0.75)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '20px';
  overlay.style.zIndex = '99999';

  const painel = document.createElement('div');
  painel.style.width = 'min(560px, 100%)';
  painel.style.maxHeight = '80vh';
  painel.style.background = '#fff';
  painel.style.borderRadius = '20px';
  painel.style.boxShadow = '0 24px 50px rgba(0,0,0,0.25)';
  painel.style.display = 'flex';
  painel.style.flexDirection = 'column';
  painel.style.overflow = 'hidden';

  const topo = document.createElement('div');
  topo.style.display = 'flex';
  topo.style.alignItems = 'center';
  topo.style.justifyContent = 'space-between';
  topo.style.padding = '18px 20px';
  topo.style.background = '#111827';
  topo.style.color = '#fff';

  const titulo = document.createElement('strong');
  titulo.textContent = '🤖 Assistente 4x4';

  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.textContent = '✕';
  fechar.style.border = 'none';
  fechar.style.background = 'transparent';
  fechar.style.color = '#fff';
  fechar.style.cursor = 'pointer';
  fechar.style.fontSize = '18px';
  fechar.addEventListener('click', () => {
    overlay.remove();
    history.pushState({}, '', '/');
    mostrarHome();
  });

  const limparMemoria = document.createElement('button');
  limparMemoria.type = 'button';
  limparMemoria.textContent = 'Limpar memória';
  limparMemoria.style.marginLeft = 'auto';
  limparMemoria.style.marginRight = '12px';
  limparMemoria.style.border = '1px solid #475569';
  limparMemoria.style.background = 'transparent';
  limparMemoria.style.color = '#fff';
  limparMemoria.style.borderRadius = '8px';
  limparMemoria.style.padding = '6px 9px';
  limparMemoria.style.cursor = 'pointer';
  limparMemoria.addEventListener('click', async () => {
    if (!memoryUserId || !confirm('Apagar a memória local da IA 4X4 deste usuário neste aparelho?')) return;
    await limparMemoriaIA(memoryUserId);
    alert('Memória local da IA apagada deste aparelho.');
  });

  topo.appendChild(titulo);
  topo.appendChild(limparMemoria);
  topo.appendChild(fechar);

  const chat = document.createElement('div');
  chat.id = 'iaChat';
  chat.style.padding = '18px';
  chat.style.background = '#f8fafc';
  chat.style.display = 'flex';
  chat.style.flexDirection = 'column';
  chat.style.gap = '10px';
  chat.style.overflowY = 'auto';
  chat.style.maxHeight = '380px';

  const addMensagem = (texto, tipo = 'bot') => {
    const msg = document.createElement('div');
    msg.style.maxWidth = '85%';
    msg.style.padding = '10px 12px';
    msg.style.borderRadius = '12px';
    msg.style.lineHeight = '1.5';
    msg.style.whiteSpace = 'pre-wrap';
    msg.style.wordBreak = 'break-word';

    if (tipo === 'user') {
      msg.style.alignSelf = 'flex-end';
      msg.style.background = '#dcfce7';
      msg.style.color = '#14532d';
    } else {
      msg.style.alignSelf = 'flex-start';
      msg.style.background = '#e5e7eb';
      msg.style.color = '#111827';
    }

    msg.textContent = texto;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
  };

  addMensagem('Olá! Sou o assistente do Trilha 4X4. Posso te ajudar com planejamento, segurança, rotina e orientação da trilha.', 'bot');

  const formulario = document.createElement('form');
  formulario.style.display = 'flex';
  formulario.style.gap = '10px';
  formulario.style.padding = '16px 18px 18px';
  formulario.style.borderTop = '1px solid #e5e7eb';
  formulario.style.background = '#fff';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Digite sua pergunta...';
  input.style.flex = '1';
  input.style.padding = '12px 14px';
  input.style.border = '1px solid #d1d5db';
  input.style.borderRadius = '10px';
  input.style.fontSize = '15px';

  const enviar = document.createElement('button');
  enviar.type = 'submit';
  enviar.textContent = 'Enviar';
  enviar.style.border = 'none';
  enviar.style.background = '#dc2626';
  enviar.style.color = '#fff';
  enviar.style.borderRadius = '10px';
  enviar.style.padding = '0 16px';
  enviar.style.fontWeight = 'bold';
  enviar.style.cursor = 'pointer';

  formulario.appendChild(input);
  formulario.appendChild(enviar);

  formulario.addEventListener('submit', async (event) => {
    event.preventDefault();

    const mensagem = input.value.trim();
    if (!mensagem) return;

    addMensagem(mensagem, 'user');
    input.value = '';
    enviar.disabled = true;
    enviar.textContent = '...';

    try {
      const resposta = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: mensagem,
          context: {
            trailName: document.getElementById('nomeTrilha')?.textContent || 'Trilha 4X4',
            trailStatus: document.getElementById('modoStatus')?.textContent || 'N/A',
            localMemory: (await listarMemoriasIA(memoryUserId, 6)).map((m) => ({ texto: m.texto, categoria: m.categoria })),
          },
        }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.error || 'Não foi possível obter a resposta.');
      }

      addMensagem(dados.reply || 'Sem resposta', 'bot');
      if (dados.source !== 'safety' && memoryUserId) {
        await salvarMemoriaIA(memoryUserId, mensagem, 'pergunta');
      }
    } catch (erro) {
      addMensagem(erro.message || 'Não foi possível conectar com a IA.', 'bot');
    } finally {
      enviar.disabled = false;
      enviar.textContent = 'Enviar';
      input.focus();
    }
  });

  painel.appendChild(topo);
  painel.appendChild(chat);
  painel.appendChild(formulario);
  overlay.appendChild(painel);
  if (!anexarPainelAoModulo(overlay)) {
    document.body.appendChild(overlay);
  }
  input.focus();
}
