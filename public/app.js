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
  setInterval(atualizarNotificacoes, 60000);
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

function abrirIA() {
  const existente = document.getElementById('iaOverlay');
  if (existente) {
    existente.remove();
    return;
  }

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

  topo.appendChild(titulo);
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
          },
        }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.error || 'Não foi possível obter a resposta.');
      }

      addMensagem(dados.reply || 'Sem resposta', 'bot');
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

async function editarMeuVeiculo(veiculo) {
  const type = prompt('Tipo do veículo:', veiculo.type || '');
  if (type === null) return;
  const brand = prompt('Marca:', veiculo.brand || '');
  if (brand === null) return;
  const model = prompt('Modelo:', veiculo.model || '');
  if (model === null) return;
  const year = prompt('Ano (opcional):', veiculo.year || '');
  if (year === null) return;
  const color = prompt('Cor (opcional):', veiculo.color || '');
  if (color === null) return;
  const plate = prompt('Placa (opcional):', veiculo.plate || '');
  if (plate === null) return;
  const notes = prompt('Observações (opcional):', veiculo.notes || '');
  if (notes === null) return;

  const resposta = await fetch('/api/veiculos/' + encodeURIComponent(veiculo.id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: type.trim(),
      brand: brand.trim(),
      model: model.trim(),
      year: year.trim(),
      color: color.trim(),
      plate: plate.trim().toUpperCase(),
      notes: notes.trim(),
    }),
  });

  const dados = await resposta.json();
  if (!resposta.ok) {
    alert(dados.error || 'Não foi possível editar o veículo.');
    return;
  }

  alert('Veículo atualizado com sucesso.');
  document.getElementById('solicitacoesAdminOverlay')?.remove();
  abrirMeu4x4();
}

async function abrirMeu4x4() {
  try {
    const resposta = await fetch('/api/veiculos', {
      cache: 'no-store'
    });
    const dados = await resposta.json();

    if (!resposta.ok) {
      alert(dados.error || 'Não foi possível carregar seus veículos.');
      return;
    }

    document.getElementById('solicitacoesAdminOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'solicitacoesAdminOverlay';
    overlay.style.cssText = `
      position:fixed;
      inset:0;
      background:rgba(0,0,0,0.72);
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:99999;
      padding:20px;
      box-sizing:border-box;
    `;

    const veiculos = Array.isArray(dados.vehicles)
      ? dados.vehicles
      : [];

    overlay.innerHTML = `
      <div style="background:#151c17;color:#f5f7f5;border:1px solid rgba(255,255,255,.11);width:100%;max-width:620px;max-height:90vh;overflow-y:auto;border-radius:18px;padding:24px;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;">🚙 Meu 4x4</h2>
          <button id="fecharMeu4x4" type="button" style="border:0;background:#252e27;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;">✕</button>
        </div>
        <div id="listaMeusVeiculos" style="margin:18px 0;">
          ${veiculos.length ? veiculos.map((veiculo) => `
            <div style="border:1px solid rgba(255,255,255,.11);border-radius:12px;padding:14px;margin-bottom:10px;line-height:1.6;">
              <strong>${escaparTextoTrilha(veiculo.brand)} ${escaparTextoTrilha(veiculo.model)}</strong><br>
              Tipo: ${escaparTextoTrilha(veiculo.type)}<br>
              Ano: ${veiculo.year || '-'} | Cor: ${escaparTextoTrilha(veiculo.color) || '-'}<br>
              Placa: ${escaparTextoTrilha(veiculo.plate) || 'não informada'}
              <button type="button"
                onclick="editarMeuVeiculoSeguro('${encodeURIComponent(JSON.stringify(veiculo))}')"
                style="display:block;margin-top:10px;padding:8px 11px;border:1px solid #222;border-radius:8px;background:#202821;color:#fff;cursor:pointer;font-weight:bold;">
                ✏️ Editar veículo
              </button>
            </div>
          `).join('') : '<p>Nenhum veículo cadastrado ainda.</p>'}
        </div>
        <h3>Adicionar veículo</h3>
        <div style="display:grid;gap:10px;">
          <input id="meuVeiculoTipo" placeholder="Tipo (4x4, UTV...)" style="padding:11px;">
          <input id="meuVeiculoMarca" placeholder="Marca" style="padding:11px;">
          <input id="meuVeiculoModelo" placeholder="Modelo" style="padding:11px;">
          <input id="meuVeiculoAno" type="number" placeholder="Ano" style="padding:11px;">
          <input id="meuVeiculoCor" placeholder="Cor" style="padding:11px;">
          <input id="meuVeiculoPlaca" placeholder="Placa (opcional)" style="padding:11px;text-transform:uppercase;">
          <textarea id="meuVeiculoObservacoes" placeholder="Observações" style="padding:11px;min-height:70px;"></textarea>
          <button id="salvarMeuVeiculo" type="button" style="padding:12px;border:0;border-radius:9px;background:#222;color:#fff;cursor:pointer;font-weight:bold;">Salvar veículo</button>
        </div>
      </div>
    `;

    if (!anexarPainelAoModulo(overlay)) {
    document.body.appendChild(overlay);
  }
    document.getElementById('fecharMeu4x4').addEventListener('click', () => {
      overlay.remove();
      history.pushState({}, '', '/');
      mostrarHome();
    });
    document.getElementById('salvarMeuVeiculo').addEventListener('click', async () => {
      const vehicle = {
        type: document.getElementById('meuVeiculoTipo').value.trim(),
        brand: document.getElementById('meuVeiculoMarca').value.trim(),
        model: document.getElementById('meuVeiculoModelo').value.trim(),
        year: document.getElementById('meuVeiculoAno').value,
        color: document.getElementById('meuVeiculoCor').value.trim(),
        plate: document.getElementById('meuVeiculoPlaca').value.trim(),
        notes: document.getElementById('meuVeiculoObservacoes').value.trim()
      };

      if (!vehicle.type || !vehicle.brand || !vehicle.model) {
        alert('Informe tipo, marca e modelo.');
        return;
      }

      const salvar = await fetch('/api/veiculos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicle)
      });
      const resultado = await salvar.json();

      if (!salvar.ok) {
        alert(resultado.error || 'Não foi possível cadastrar o veículo.');
        return;
      }

      alert('Veículo cadastrado com sucesso.');
      overlay.remove();
      abrirMeu4x4();
    });
  } catch (error) {
    console.error('Erro ao carregar veículos:', error);
    alert('Não foi possível conectar ao servidor.');
  }
}

function editarMeuVeiculoSeguro(payload) {
  try {
    editarMeuVeiculo(JSON.parse(decodeURIComponent(payload)));
  } catch (erro) {
    console.error('Dados do veículo inválidos:', erro);
    alert('Não foi possível abrir a edição deste veículo.');
  }
}

async function editarGrupo(groupId, nomeAtual) {
  const novoNome = prompt('Novo nome do grupo:', nomeAtual || '');

  if (novoNome === null) {
    return;
  }

  const name = novoNome.trim();

  if (name.length < 2) {
    alert('Informe um nome válido para o grupo.');
    return;
  }

  try {
    const resposta = await fetch(
      '/api/grupos/' + encodeURIComponent(groupId),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      alert(dados.error || 'Não foi possível editar o grupo.');
      return;
    }

    alert('Grupo atualizado com sucesso.');
    document.querySelectorAll('[data-grupos-overlay]').forEach((elemento) => elemento.remove());
    abrirGrupos();
  } catch (error) {
    console.error('Erro ao editar grupo:', error);
    alert('Não foi possível conectar ao servidor.');
  }
}

async function alterarFuncaoMembroGrupo(groupId, userId, role) {
  const texto = role === 'admin' ? 'promover este amigo a administrador' : 'tornar este administrador um participante';
  if (!confirm('Deseja ' + texto + '?')) return;

  const resposta = await fetch(
    '/api/grupos/' + encodeURIComponent(groupId) + '/membros/' + encodeURIComponent(userId),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }
  );
  const dados = await resposta.json();
  if (!resposta.ok) {
    alert(dados.error || 'Não foi possível alterar o participante.');
    return;
  }
  document.querySelectorAll('[data-grupos-overlay]').forEach((el) => el.remove());
  abrirDetalhesGrupo(groupId);
}

async function removerMembroGrupo(groupId, userId, name) {
  if (!confirm('Remover ' + name + ' do grupo?')) return;
  const resposta = await fetch(
    '/api/grupos/' + encodeURIComponent(groupId) + '/membros/' + encodeURIComponent(userId),
    { method: 'DELETE' }
  );
  const dados = await resposta.json();
  if (!resposta.ok) {
    alert(dados.error || 'Não foi possível remover o participante.');
    return;
  }
  document.querySelectorAll('[data-grupos-overlay]').forEach((el) => el.remove());
  abrirDetalhesGrupo(groupId);
}

async function editarRoleGrupo(groupId, outingId, titleEncoded, meetingEncoded, descriptionEncoded, startsAt) {
  const title = prompt('Nome do passeio:', decodeURIComponent(titleEncoded));
  if (title === null) return;
  const dataAtual = new Date(startsAt);
  const valorData = Number.isNaN(dataAtual.getTime()) ? '' : dataAtual.toISOString().slice(0, 16);
  const novaData = prompt('Data e hora (AAAA-MM-DDTHH:MM):', valorData);
  if (novaData === null) return;
  const meetingPoint = prompt('Ponto de encontro:', decodeURIComponent(meetingEncoded));
  if (meetingPoint === null) return;
  const description = prompt('Observações:', decodeURIComponent(descriptionEncoded));
  if (description === null) return;

  const resposta = await fetch('/api/grupos/' + encodeURIComponent(groupId) + '/roles/' + encodeURIComponent(outingId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, startsAt: novaData, meetingPoint, description }),
  });
  const dados = await resposta.json();
  if (!resposta.ok) return alert(dados.error || 'Não foi possível editar o passeio.');
  document.querySelectorAll('[data-grupos-overlay]').forEach((el) => el.remove());
  abrirDetalhesGrupo(groupId);
}

async function alterarStatusRoleGrupo(groupId, outingId, status) {
  const texto = status === 'confirmed' ? 'confirmar este passeio' : 'cancelar este passeio';
  if (!confirm('Deseja ' + texto + '?')) return;
  const resposta = await fetch('/api/grupos/' + encodeURIComponent(groupId) + '/roles/' + encodeURIComponent(outingId) + '/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const dados = await resposta.json();
  if (!resposta.ok) return alert(dados.error || 'Não foi possível atualizar o passeio.');
  document.querySelectorAll('[data-grupos-overlay]').forEach((el) => el.remove());
  abrirDetalhesGrupo(groupId);
}

let participacaoRolePendente = null;

function solicitarTrilhaDoRole(groupId, outingId) {
  const box = document.getElementById('participarTrilhaRoleBox');
  if (!box) return;
  participacaoRolePendente = { groupId, outingId };
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function criarTrilhaDoRole(groupId, outingId, titleEncoded, startsAt) {
  const titulo = decodeURIComponent(titleEncoded);
  const params = new URLSearchParams({
    page: 'criar-trilha',
    nome: titulo,
    inicio: startsAt,
    grupo: groupId,
    role: outingId,
  });
  window.location.href = '/?' + params.toString();
}

async function responderRoleGrupo(groupId, outingId, response) {
  try {
    const resposta = await fetch(
      '/api/grupos/' + encodeURIComponent(groupId) +
      '/roles/' + encodeURIComponent(outingId) + '/resposta',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      }
    );
    const dados = await resposta.json();
    if (!resposta.ok) {
      alert(dados.error || 'Não foi possível registrar sua resposta.');
      return;
    }
    document.querySelectorAll('[data-grupos-overlay]').forEach((el) => el.remove());
    abrirDetalhesGrupo(groupId);
  } catch (error) {
    console.error(error);
    alert('Não foi possível conectar ao servidor.');
  }
}

async function abrirDetalhesGrupo(groupId) {
  try {
    const resposta = await fetch(
      '/api/grupos/' + encodeURIComponent(groupId),
      { cache: 'no-store' }
    );
    const dados = await resposta.json();

    if (!resposta.ok) {
      alert(dados.error || 'Não foi possível abrir o grupo.');
      return;
    }

    const grupo = dados.group;
    let meusVeiculosGrupo = [];
    try {
      const respostaVeiculosGrupo = await fetch('/api/veiculos', { cache: 'no-store' });
      const dadosVeiculosGrupo = await respostaVeiculosGrupo.json();
      if (respostaVeiculosGrupo.ok) meusVeiculosGrupo = dadosVeiculosGrupo.vehicles || [];
    } catch {}
    const agora = Date.now();
    const rolesAtivos = (grupo.outings || []).filter((o) =>
      o.status !== 'cancelled' && new Date(o.startsAt).getTime() >= agora
    );
    const rolesHistorico = (grupo.outings || []).filter((o) =>
      o.status === 'cancelled' || new Date(o.startsAt).getTime() < agora
    );
    document.querySelectorAll('[data-grupos-overlay]').forEach((el) => el.remove());

    const overlay = document.createElement('div');
    overlay.dataset.gruposOverlay = '1';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;box-sizing:border-box;';

    const opcoesTrilha = (grupo.availableTrails || []).map((item) =>
      '<option value="' + escaparTextoTrilha(item.id) + '">' +
      escaparTextoTrilha(item.name) + ' · ' + escaparTextoTrilha(item.code) +
      '</option>'
    ).join('');

    overlay.innerHTML = `
      <div style="background:#151c17;color:#f5f7f5;border:1px solid rgba(255,255,255,.11);width:100%;max-width:680px;max-height:90vh;overflow:auto;border-radius:18px;padding:24px;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
          <div><small>GRUPO 4X4</small><h2 style="margin:4px 0 0;">${escaparTextoTrilha(grupo.name)}</h2></div>
          <button id="voltarListaGrupos" type="button">← Voltar</button>
        </div>

        ${grupo.role === 'admin' ? `
          <div style="margin:18px 0;padding:14px;border:1px solid rgba(255,255,255,.11);border-radius:12px;">
            <strong>🔗 Convidar amigos</strong>
            <p style="margin:8px 0;">${grupo.inviteCode ? 'Código atual: <b>' + escaparTextoTrilha(grupo.inviteCode) + '</b>' : 'Gere um código privado para seus amigos entrarem.'}</p>
            <div style="display:flex;gap:7px;flex-wrap:wrap;">
              ${grupo.inviteCode ? '<button id="copiarConviteGrupo" type="button">📋 Copiar código</button><button id="compartilharConviteGrupo" type="button">📤 Compartilhar</button>' : ''}
              <button id="gerarConviteGrupo" type="button">${grupo.inviteCode ? 'Gerar novo código' : 'Gerar código de convite'}</button>
            </div>
          </div>
        ` : ''}
        <h3>👥 Participantes</h3>
        <div>
          ${(grupo.members || []).map((m) => `
            <div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.11);">
              <strong>${escaparTextoTrilha(m.name)}</strong> ·
              ${m.role === 'admin' ? 'Administrador' : 'Participante'}
              ${grupo.role === 'admin' ? `
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;">
                  <button type="button" onclick="alterarFuncaoMembroGrupo('${grupo.id}','${m.id}','${m.role === 'admin' ? 'member' : 'admin'}')">
                    ${m.role === 'admin' ? 'Tornar participante' : '⭐ Tornar administrador'}
                  </button>
                  <button type="button" onclick="removerMembroGrupo('${grupo.id}','${m.id}',decodeURIComponent('${encodeURIComponent(m.name)}'))">Remover</button>
                </div>
              ` : ''}
            </div>
          `).join('') || '<p>Nenhum participante.</p>'}
        </div>

        <button id="sairDoGrupo" type="button" style="margin-top:12px;">🚪 Sair do grupo</button>

        <h3 style="margin-top:22px;">💬 Conversa do grupo</h3>
        <div id="mensagensGrupo" style="height:230px;overflow:auto;border:1px solid rgba(255,255,255,.11);border-radius:12px;padding:10px;background:#0b100d;">
          Carregando conversa...
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <input id="mensagemGrupoInput" maxlength="1000" placeholder="Escreva para a turma..." style="flex:1;padding:11px;">
          <button id="enviarMensagemGrupo" type="button">Enviar</button>
        </div>

        <h3 style="margin-top:22px;">🗓️ Próximos rolês</h3>
        <div>
          ${rolesAtivos.map((o) => `
            <div style="padding:14px;margin:8px 0;border:1px solid rgba(255,255,255,.11);border-radius:12px;">
              <strong>${escaparTextoTrilha(o.title)}</strong><br>
              <small>${new Date(o.startsAt).toLocaleString('pt-BR')} · por ${escaparTextoTrilha(o.creatorName)}</small>
              ${o.meetingPoint ? '<p>📍 ' + escaparTextoTrilha(o.meetingPoint) + '</p>' : ''}
              ${o.description ? '<p>' + escaparTextoTrilha(o.description) + '</p>' : ''}
              <p><b>${o.status === 'confirmed' ? '✅ Passeio confirmado' : o.status === 'cancelled' ? '🚫 Passeio cancelado' : '🟡 Combinando'}</b></p>
              ${o.status !== 'cancelled' ? `
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button type="button" style="${o.myResponse === 'going' ? 'font-weight:bold;outline:2px solid #222;' : ''}" onclick="responderRoleGrupo('${grupo.id}','${o.id}','going')">✅ Vou (${o.goingCount || 0})</button>
                  <button type="button" style="${o.myResponse === 'maybe' ? 'font-weight:bold;outline:2px solid #222;' : ''}" onclick="responderRoleGrupo('${grupo.id}','${o.id}','maybe')">🤔 Talvez (${o.maybeCount || 0})</button>
                  <button type="button" style="${o.myResponse === 'not_going' ? 'font-weight:bold;outline:2px solid #222;' : ''}" onclick="responderRoleGrupo('${grupo.id}','${o.id}','not_going')">❌ Não vou</button>
                </div>
              ` : ''}
              ${o.status !== 'cancelled' ? `
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
                  ${grupo.role === 'admin' || o.creatorId === grupo.currentUserId ? `<button type="button" onclick="editarRoleGrupo('${grupo.id}','${o.id}','${encodeURIComponent(o.title)}','${encodeURIComponent(o.meetingPoint || '')}','${encodeURIComponent(o.description || '')}','${o.startsAt}')">✏️ Editar</button>` : ''}
                  ${grupo.role === 'admin' && o.status !== 'confirmed' ? `<button type="button" onclick="alterarStatusRoleGrupo('${grupo.id}','${o.id}','confirmed')">✅ Confirmar passeio</button>` : ''}
                  ${grupo.role === 'admin' ? `<button type="button" onclick="alterarStatusRoleGrupo('${grupo.id}','${o.id}','cancelled')">Cancelar</button>` : ''}
                  ${o.trailId ? `
                    <button type="button" onclick="abrirTrilha('${o.trailId}')">🛻 Abrir trilha</button>
                    ${grupo.role !== 'admin' && o.myResponse === 'going' ? `
                      <button type="button" onclick="solicitarTrilhaDoRole('${grupo.id}','${o.id}')">🙋 Solicitar participação na trilha</button>
                    ` : ''}
                  ` : grupo.role === 'admin' && o.status === 'confirmed' ? `<button type="button" onclick="criarTrilhaDoRole('${grupo.id}','${o.id}','${encodeURIComponent(o.title)}','${o.startsAt}')">🛻 Criar trilha</button>` : ''}
                </div>
              ` : ''}
            </div>
          `).join('') || '<p>Nenhum próximo rolê combinado.</p>'}
        </div>

        <button id="novoRoleGrupo" type="button" style="margin-top:10px;padding:11px;border:0;border-radius:8px;background:#222;color:#fff;">＋ Combinar novo rolê</button>

        <div id="participarTrilhaRoleBox" style="display:none;margin-top:14px;padding:14px;border:1px solid rgba(255,255,255,.11);border-radius:12px;">
          <strong>🚙 Escolha o veículo para a trilha</strong>
          <select id="veiculoRoleSelect" style="width:100%;padding:10px;margin:9px 0;">
            ${meusVeiculosGrupo.map((v) => `<option value="${escaparTextoTrilha(v.id)}">${escaparTextoTrilha(v.brand)} ${escaparTextoTrilha(v.model)}</option>`).join('')}
          </select>
          <div style="display:flex;gap:8px;">
            <button id="confirmarParticipacaoRole" type="button">Enviar solicitação</button>
            <button id="cancelarParticipacaoRole" type="button">Cancelar</button>
          </div>
          ${meusVeiculosGrupo.length ? '' : '<p>Cadastre um veículo em Meu 4x4 antes de solicitar participação.</p>'}
        </div>

        <h3 style="margin-top:22px;">📚 Histórico de rolês</h3>
        <div>
          ${rolesHistorico.map((o) => `
            <div style="padding:12px;margin:8px 0;border:1px solid rgba(255,255,255,.11);border-radius:12px;opacity:.85;">
              <strong>${escaparTextoTrilha(o.title)}</strong><br>
              <small>${new Date(o.startsAt).toLocaleString('pt-BR')} · ${o.status === 'cancelled' ? '🚫 Cancelado' : '🏁 Realizado'}</small>
              ${o.trailId ? `<div style="margin-top:7px;"><button type="button" onclick="abrirTrilha('${o.trailId}')">🛻 Abrir trilha</button></div>` : ''}
            </div>
          `).join('') || '<p>Nenhum rolê no histórico.</p>'}
        </div>

        <h3 style="margin-top:22px;">🛣️ Trilhas do grupo</h3>
        <div>
          ${(grupo.trails || []).map((t) =>
            '<button type="button" onclick="abrirTrilha(\'' + t.id + '\')" ' +
            'style="display:block;width:100%;text-align:left;margin:8px 0;padding:12px;border:1px solid rgba(255,255,255,.11);border-radius:10px;background:#151c17;cursor:pointer;">' +
            '<strong>' + escaparTextoTrilha(t.name) + '</strong><br>' +
            escaparTextoTrilha(t.code) + '</button>'
          ).join('') || '<p>Nenhuma trilha vinculada ao grupo.</p>'}
        </div>

        ${grupo.role === 'admin' ? `
          <h3 style="margin-top:22px;">Adicionar uma trilha</h3>
          ${opcoesTrilha ? `
            <div style="display:flex;gap:8px;">
              <select id="trilhaParaGrupo" style="flex:1;padding:11px;">${opcoesTrilha}</select>
              <button id="adicionarTrilhaGrupo" type="button" style="padding:11px;border:0;border-radius:8px;background:#222;color:#fff;">Adicionar</button>
            </div>
          ` : '<p>Suas trilhas administradas já estão vinculadas ou você ainda não administra nenhuma.</p>'}
        ` : ''}
      </div>
    `;

    if (!anexarPainelAoModulo(overlay)) document.body.appendChild(overlay);

    const copiarConvite = document.getElementById('copiarConviteGrupo');
    if (copiarConvite) {
      copiarConvite.onclick = async () => {
        try {
          await navigator.clipboard.writeText(grupo.inviteCode);
          copiarConvite.textContent = '✅ Copiado';
          setTimeout(() => { copiarConvite.textContent = '📋 Copiar código'; }, 1500);
        } catch {
          prompt('Copie o código do grupo:', grupo.inviteCode);
        }
      };
    }

    const compartilharConvite = document.getElementById('compartilharConviteGrupo');
    if (compartilharConvite) {
      compartilharConvite.onclick = async () => {
        const texto = 'Entre no grupo ' + grupo.name + ' no Trilha 4X4. Código: ' + grupo.inviteCode;
        if (navigator.share) {
          try { await navigator.share({ title: 'Convite Trilha 4X4', text: texto }); } catch {}
        } else {
          try {
            await navigator.clipboard.writeText(texto);
            alert('Convite copiado para compartilhar.');
          } catch {
            prompt('Copie o convite:', texto);
          }
        }
      };
    }

    const gerarConvite = document.getElementById('gerarConviteGrupo');
    if (gerarConvite) {
      gerarConvite.onclick = async () => {
        const respostaConvite = await fetch(
          '/api/grupos/' + encodeURIComponent(groupId) + '/convite',
          { method: 'POST' }
        );
        const dadosConvite = await respostaConvite.json();
        if (!respostaConvite.ok) {
          alert(dadosConvite.error || 'Não foi possível gerar o convite.');
          return;
        }
        alert('Código do grupo: ' + dadosConvite.code);
        overlay.remove();
        abrirDetalhesGrupo(groupId);
      };
    }

    document.getElementById('voltarListaGrupos').onclick = () => {
      overlay.remove();
      abrirGrupos();
    };

    let chatGrupoTimer = null;

    async function atualizarChatGrupo() {
      const caixa = document.getElementById('mensagensGrupo');
      if (!caixa || !document.body.contains(caixa)) {
        if (chatGrupoTimer) clearInterval(chatGrupoTimer);
        return;
      }

      try {
        const respostaChat = await fetch(
          '/api/grupos/' + encodeURIComponent(groupId) + '/mensagens',
          { cache: 'no-store' }
        );
        const dadosChat = await respostaChat.json();
        if (!respostaChat.ok) {
          caixa.textContent = dadosChat.error || 'Não foi possível carregar a conversa.';
          return;
        }

        caixa.innerHTML = (dadosChat.messages || []).map((m) =>
          '<div style="margin-bottom:10px;"><strong>' +
          escaparTextoTrilha(m.userName) + '</strong> <small>' +
          new Date(m.createdAt).toLocaleString('pt-BR') + '</small><br>' +
          escaparTextoTrilha(m.message) + '</div>'
        ).join('') || '<p>A conversa ainda está vazia. Mande a primeira mensagem.</p>';
        caixa.scrollTop = caixa.scrollHeight;
      } catch (erro) {
        console.warn('Chat do grupo indisponível:', erro);
      }
    }

    document.getElementById('enviarMensagemGrupo').onclick = async () => {
      const input = document.getElementById('mensagemGrupoInput');
      const message = input.value.trim();
      if (!message) return;

      const respostaMensagem = await fetch(
        '/api/grupos/' + encodeURIComponent(groupId) + '/mensagens',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        }
      );
      const dadosMensagem = await respostaMensagem.json();
      if (!respostaMensagem.ok) {
        alert(dadosMensagem.error || 'Não foi possível enviar a mensagem.');
        return;
      }
      input.value = '';
      atualizarChatGrupo();
    };

    document.getElementById('mensagemGrupoInput').addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter' && !evento.shiftKey) {
        evento.preventDefault();
        document.getElementById('enviarMensagemGrupo').click();
      }
    });

    atualizarChatGrupo();
    chatGrupoTimer = setInterval(atualizarChatGrupo, 5000);

    const confirmarParticipacaoRole = document.getElementById('confirmarParticipacaoRole');
    const cancelarParticipacaoRole = document.getElementById('cancelarParticipacaoRole');
    if (cancelarParticipacaoRole) cancelarParticipacaoRole.onclick = () => {
      participacaoRolePendente = null;
      document.getElementById('participarTrilhaRoleBox').style.display = 'none';
    };
    if (confirmarParticipacaoRole) confirmarParticipacaoRole.onclick = async () => {
      if (!participacaoRolePendente) return;
      const select = document.getElementById('veiculoRoleSelect');
      const vehicleId = select?.value;
      if (!vehicleId) {
        alert('Cadastre e escolha um veículo antes de continuar.');
        return;
      }
      const { groupId: grupoIdRole, outingId: passeioIdRole } = participacaoRolePendente;
      const respostaParticipacao = await fetch(
        '/api/grupos/' + encodeURIComponent(grupoIdRole) + '/roles/' +
        encodeURIComponent(passeioIdRole) + '/entrar-trilha',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId }),
        }
      );
      const dadosParticipacao = await respostaParticipacao.json();
      if (!respostaParticipacao.ok) {
        alert(dadosParticipacao.error || 'Não foi possível solicitar participação.');
        return;
      }
      alert(dadosParticipacao.alreadyMember
        ? 'Você já participa desta trilha.'
        : dadosParticipacao.pending && !dadosParticipacao.message
          ? 'Sua solicitação já está aguardando aprovação.'
          : (dadosParticipacao.message || 'Solicitação enviada.'));
      participacaoRolePendente = null;
      document.getElementById('participarTrilhaRoleBox').style.display = 'none';
    };

    document.getElementById('sairDoGrupo').onclick = async () => {
      if (!confirm('Tem certeza que deseja sair deste grupo?')) return;
      const respostaSair = await fetch('/api/grupos/' + encodeURIComponent(groupId) + '/sair', { method: 'DELETE' });
      const dadosSair = await respostaSair.json();
      if (!respostaSair.ok) {
        alert(dadosSair.error || 'Não foi possível sair do grupo.');
        return;
      }
      overlay.remove();
      abrirGrupos();
    };

    document.getElementById('novoRoleGrupo').onclick = async () => {
      const title = prompt('Nome do rolê:');
      if (!title) return;
      const startsAt = prompt('Data e hora (AAAA-MM-DDTHH:MM):');
      if (!startsAt) return;
      const meetingPoint = prompt('Ponto de encontro:') || '';
      const description = prompt('Observações (opcional):') || '';

      const respostaRole = await fetch(
        '/api/grupos/' + encodeURIComponent(groupId) + '/roles',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, startsAt, meetingPoint, description }),
        }
      );
      const resultadoRole = await respostaRole.json();
      if (!respostaRole.ok) {
        alert(resultadoRole.error || 'Não foi possível criar o rolê.');
        return;
      }
      overlay.remove();
      abrirDetalhesGrupo(groupId);
    };

    const adicionar = document.getElementById('adicionarTrilhaGrupo');
    if (adicionar) {
      adicionar.onclick = async () => {
        const trailId = document.getElementById('trilhaParaGrupo').value;
        const salvar = await fetch(
          '/api/grupos/' + encodeURIComponent(groupId) + '/trilhas',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trailId }),
          }
        );
        const resultado = await salvar.json();
        if (!salvar.ok) {
          alert(resultado.error || 'Não foi possível adicionar a trilha.');
          return;
        }
        overlay.remove();
        abrirDetalhesGrupo(groupId);
      };
    }
  } catch (error) {
    console.error('Erro ao abrir grupo:', error);
    alert('Não foi possível conectar ao servidor.');
  }
}

async function abrirGrupos() {
  try {
    const resposta = await fetch('/api/grupos', { cache: 'no-store' });
    const dados = await resposta.json();

    if (!resposta.ok) {
      alert(dados.error || 'Não foi possível carregar os grupos.');
      return;
    }

    const overlay = document.createElement('div');
    overlay.dataset.gruposOverlay = '1';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.72);
      display:flex;align-items:center;justify-content:center;
      z-index:99999;padding:20px;box-sizing:border-box;
    `;
    const grupos = Array.isArray(dados.groups) ? dados.groups : [];

    overlay.innerHTML = `
      <div style="background:#151c17;color:#f5f7f5;border:1px solid rgba(255,255,255,.11);width:100%;max-width:560px;max-height:90vh;overflow:auto;border-radius:18px;padding:24px;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;">👥 Meus grupos</h2>
          <button id="fecharGrupos" type="button" style="border:0;background:#252e27;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;">✕</button>
        </div>
        <div style="margin:18px 0;">
          ${grupos.length ? grupos.map((grupo) => `
            <div style="border:1px solid rgba(255,255,255,.11);border-radius:12px;padding:14px;margin-bottom:10px;">
              <strong>${escaparTextoTrilha(grupo.name)}</strong><br>
              ${grupo.memberCount} participante(s) · ${escaparTextoTrilha(grupo.role)}
              <button
                type="button"
                onclick="abrirDetalhesGrupo('${grupo.id}')"
                style="display:block;margin-top:10px;padding:9px 12px;border:0;border-radius:8px;background:#222;color:#fff;cursor:pointer;font-weight:bold;"
              >Abrir grupo →</button>
              ${grupo.role === 'admin' ? `
                <button
                  type="button"
                  onclick="editarGrupo('${grupo.id}', decodeURIComponent('${encodeURIComponent(grupo.name)}'))"
                  style="display:block;margin-top:10px;padding:9px 12px;border:1px solid #222;border-radius:8px;background:#202821;color:#fff;cursor:pointer;font-weight:bold;"
                >✏️ Editar grupo</button>
              ` : ''}
            </div>
          `).join('') : '<p>Você ainda não participa de grupos.</p>'}
        </div>
        <h3>Entrar em um grupo</h3>
        <div style="display:flex;gap:8px;margin-bottom:22px;">
          <input id="codigoConviteGrupo" placeholder="Código G4X4-..." style="flex:1;padding:11px;text-transform:uppercase;">
          <button id="entrarGrupoCodigo" type="button" style="padding:11px 14px;border:0;border-radius:8px;background:#222;color:#fff;cursor:pointer;">Entrar</button>
        </div>
        <h3>Criar grupo</h3>
        <div style="display:flex;gap:8px;">
          <input id="nomeNovoGrupo" placeholder="Nome do grupo" style="flex:1;padding:11px;">
          <button id="criarNovoGrupo" type="button" style="padding:11px 14px;border:0;border-radius:8px;background:#222;color:#fff;cursor:pointer;">Criar</button>
        </div>
      </div>
    `;

    if (!anexarPainelAoModulo(overlay)) {
    document.body.appendChild(overlay);
  }
    document.getElementById('fecharGrupos').addEventListener('click', () => {
      overlay.remove();
      history.pushState({}, '', '/');
      mostrarHome();
    });
    document.getElementById('entrarGrupoCodigo').addEventListener('click', async () => {
      const code = document.getElementById('codigoConviteGrupo').value.trim().toUpperCase();
      if (!code) {
        alert('Informe o código de convite.');
        return;
      }
      const entrar = await fetch('/api/grupos/entrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const resultado = await entrar.json();
      if (!entrar.ok) {
        alert(resultado.error || 'Não foi possível entrar no grupo.');
        return;
      }
      overlay.remove();
      abrirDetalhesGrupo(resultado.group.id);
    });
    document.getElementById('criarNovoGrupo').addEventListener('click', async () => {
      const name = document.getElementById('nomeNovoGrupo').value.trim();
      if (!name) {
        alert('Informe o nome do grupo.');
        return;
      }

      const criar = await fetch('/api/grupos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const resultado = await criar.json();

      if (!criar.ok) {
        alert(resultado.error || 'Não foi possível criar o grupo.');
        return;
      }

      overlay.remove();
      abrirGrupos();
    });
  } catch (error) {
    console.error('Erro ao carregar grupos:', error);
    alert('Não foi possível conectar ao servidor.');
  }
}

function abrirMapa() {
  const elementoMapa = document.getElementById('mapa');

  if (!elementoMapa) {
    alert('Mapa não encontrado.');
    return;
  }

  elementoMapa.style.display = 'block';

  if (mapa) {
    mapa.invalidateSize();
    return;
  }

  if (typeof L === 'undefined') {
    alert('O sistema de mapas não foi carregado.');
    console.error('Leaflet não carregado.');
    return;
  }

  mapa = L.map('mapa');

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapa);

  mapa.setView([-28.2975, -51.7875], 13);
  solicitarLocalizacao();
}

function solicitarLocalizacao() {
  const botao = document.getElementById('locationButton');

  if (!navigator.geolocation) {
    alert('Seu dispositivo não suporta localização GPS.');
    return;
  }

  if (botao) {
    botao.textContent = 'Obtendo localização...';
    botao.disabled = true;
  }

  navigator.geolocation.getCurrentPosition(
    function (position) {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const precisao = position.coords.accuracy;
      const posicao = [latitude, longitude];

      console.log('Localização:', latitude, longitude);

      if (!mapa) {
        abrirMapa();
      }

      if (!mapa) {
        return;
      }

      mapa.setView(posicao, 16);

      if (!marcadorUsuario) {
        marcadorUsuario = L.marker(posicao)
          .addTo(mapa)
          .bindPopup('📍 Você está aqui!');
      } else {
        marcadorUsuario.setLatLng(posicao);
      }

      if (!precisaoUsuario) {
        precisaoUsuario = L.circle(posicao, {
          radius: precisao
        }).addTo(mapa);
      } else {
        precisaoUsuario.setLatLng(posicao);
        precisaoUsuario.setRadius(precisao);
      }

      if (botao) {
        botao.textContent = '📍 Localização ativa';
        botao.disabled = false;
      }
    },
    function (error) {
      console.error('Erro de localização:', error);

      if (botao) {
        botao.textContent = 'Permitir localização';
        botao.disabled = false;
      }

      if (error.code === 1) {
        alert(
          '📍 Permissão de localização recusada.\n\n' +
          'Permita o acesso à localização para utilizar o mapa.'
        );
      } else {
        alert('Não foi possível obter sua localização.');
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000
    }
  );
}

function ativarSOS() {
  if (sosAtivo) {
    cancelarSOS();
    return;
  }

  if (!navigator.geolocation) {
    alert('Seu dispositivo não suporta localização.');
    return;
  }

  const confirmar = confirm(
    '🆘 ATIVAR SOS?\n\n' +
    'Sua localização será enviada como alerta aos membros do Trilha-4X4.'
  );

  if (!confirmar) {
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (position) {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      sosAtivo = true;

      const status = document.getElementById('sosStatus');
      const botao = document.getElementById('sosButton');

      if (botao) {
        botao.textContent = '🛑 CANCELAR SOS';
      }

      if (status) {
        status.innerHTML =
          '<strong>🚨 SOS ATIVO</strong><br>' +
          'Sua localização foi identificada.<br>' +
          'O alerta será preparado para os membros do Trilha-4X4.<br><br>' +
          '📍 Latitude: ' + latitude.toFixed(6) +
          '<br>📍 Longitude: ' + longitude.toFixed(6);
      }

      console.log('SOS:', latitude, longitude);
    },
    function (error) {
      console.error('Erro no SOS:', error);
      alert('Não foi possível obter sua localização para o SOS.');
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

function cancelarSOS() {
  sosAtivo = false;

  const status = document.getElementById('sosStatus');
  const botao = document.getElementById('sosButton');

  if (botao) {
    botao.textContent = '🆘 PRECISO DE AJUDA';
  }

  if (status) {
    status.innerHTML = 'SOS encerrado.';
  }
}

function abrirSeguranca() {
  const seguranca = document.getElementById('seguranca');

  if (!seguranca) {
    alert('Área de segurança não encontrada.');
    return;
  }

  seguranca.style.display = 'block';

  seguranca.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function abrirCriarTrilha() {
  const contexto = new URLSearchParams(window.location.search);
  const nomePrefill = contexto.get('nome') || '';
  const inicioPrefill = contexto.get('inicio') || '';
  const grupoPrefill = contexto.get('grupo') || '';
  const rolePrefill = contexto.get('role') || '';

  const overlay = document.createElement('div');

  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
  `;

 overlay.innerHTML = `
  <div style="
    background:white;
    color:#f5f7f5;
    width:100%;
    max-width:520px;
    max-height:90vh;
    overflow-y:auto;
    border-radius:18px;
    padding:24px;
    box-sizing:border-box;
  ">

    <h2 style="
      color:#f5f7f5;
      margin-top:0;
    ">
      🛣️ Criar nova trilha
    </h2>

    <p style="
      color:#333;
      line-height:1.5;
    ">
      Preencha os dados abaixo para criar sua trilha.
      Você será o administrador dela.
    </p>

    <label
      for="novaTrilhaNome"
      style="
        display:block;
        color:#f5f7f5;
        font-weight:bold;
        margin-top:16px;
        margin-bottom:6px;
      "
    >
      Nome da trilha
    </label>

    <input
      id="novaTrilhaNome"
      type="text"
      placeholder="Ex.: Trilha Serra 4X4"
      style="
        width:100%;
        box-sizing:border-box;
        padding:12px;
        color:#f5f7f5;
        background:#151c17;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
      "
    >

    <label
      for="novaTrilhaTipo"
      style="
        display:block;
        color:#f5f7f5;
        font-weight:bold;
        margin-top:16px;
        margin-bottom:6px;
      "
    >
      Tipo de trilha
    </label>

    <select
      id="novaTrilhaTipo"
      style="
        width:100%;
        box-sizing:border-box;
        padding:12px;
        color:#f5f7f5;
        background:#151c17;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
      "
    >
      <option value="passeio">
        Passeio
      </option>

      <option value="privada">
        Privada
      </option>

      <option value="evento">
        Evento
      </option>
    </select>

    <label
      for="novaTrilhaAcesso"
      style="
        display:block;
        color:#f5f7f5;
        font-weight:bold;
        margin-top:16px;
        margin-bottom:6px;
      "
    >
      Tipo de acesso
    </label>

    <select
      id="novaTrilhaAcesso"
      style="
        width:100%;
        box-sizing:border-box;
        padding:12px;
        color:#f5f7f5;
        background:#151c17;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
      "
    >
      <option value="publica">
        Pública — qualquer usuário poderá solicitar participação
      </option>

      <option value="privada">
        Privada — acesso controlado
      </option>

      <option value="convite">
        Somente por convite
      </option>
    </select>

    <label
      for="novaTrilhaInicio"
      style="
        display:block;
        color:#f5f7f5;
        font-weight:bold;
        margin-top:16px;
        margin-bottom:6px;
      "
    >
      Data e hora de início
    </label>

    <input
      id="novaTrilhaInicio"
      type="datetime-local"
      style="
        width:100%;
        box-sizing:border-box;
        padding:12px;
        color:#f5f7f5;
        background:#151c17;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
      "
    >

    <label
      for="novaTrilhaFim"
      style="
        display:block;
        color:#f5f7f5;
        font-weight:bold;
        margin-top:16px;
        margin-bottom:6px;
      "
    >
      Data e hora do término previsto
    </label>

    <input
      id="novaTrilhaFim"
      type="datetime-local"
      style="
        width:100%;
        box-sizing:border-box;
        padding:12px;
        color:#f5f7f5;
        background:#151c17;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
      "
    >

    <label
      for="novaTrilhaLiberacao"
      style="
        display:block;
        color:#f5f7f5;
        font-weight:bold;
        margin-top:16px;
        margin-bottom:6px;
      "
    >
      Liberação da rota
      <span style="
        font-weight:normal;
        color:#555;
      ">
        (opcional)
      </span>
    </label>

    <input
      id="novaTrilhaLiberacao"
      type="datetime-local"
      style="
        width:100%;
        box-sizing:border-box;
        padding:12px;
        color:#f5f7f5;
        background:#151c17;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
      "
    >

    <div style="
      background:#17231a;
      color:#f5f7f5;
      padding:14px;
      border-radius:10px;
      margin-top:18px;
      line-height:1.5;
      border:1px solid rgba(105,211,55,.25);
    ">
      🛡️ <strong>Segurança da trilha</strong><br>
      Após o término previsto, a janela de segurança
      continuará ativa por mais <strong>24 horas</strong>.
    </div>

    <div style="
      display:flex;
      gap:10px;
      justify-content:flex-end;
      margin-top:20px;
    ">

      <button
        id="fecharCriarTrilha"
        style="
          padding:12px 18px;
          border:1px solid rgba(255,255,255,.14);
          border-radius:8px;
          background:#151c17;
          color:#f5f7f5;
          cursor:pointer;
        "
      >
        Cancelar
      </button>

      <button
        id="salvarNovaTrilha"
        style="
          padding:12px 18px;
          border:0;
          border-radius:8px;
          background:#222;
          color:#fff;
          cursor:pointer;
        "
      >
        Criar trilha
      </button>

    </div>

  </div>
`;
  if (!anexarPainelAoModulo(overlay)) {
    document.body.appendChild(overlay);
  }

  if (nomePrefill) document.getElementById('novaTrilhaNome').value = nomePrefill;
  if (inicioPrefill) {
    const dataInicio = new Date(inicioPrefill);
    if (!Number.isNaN(dataInicio.getTime())) {
      const local = new Date(dataInicio.getTime() - dataInicio.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16);
      document.getElementById('novaTrilhaInicio').value = local;
    }
  }

  document
    .getElementById('fecharCriarTrilha')
    .addEventListener('click', () => {
      overlay.remove();
        history.pushState({}, '', '/');
        mostrarHome();
    });

  document
    .getElementById('salvarNovaTrilha')
    .addEventListener('click', async () => {
      const name =
        document.getElementById(
          'novaTrilhaNome'
        ).value.trim();

      const type =
        document.getElementById(
          'novaTrilhaTipo'
        ).value;

      const visibility =
        document.getElementById(
          'novaTrilhaAcesso'
        ).value;

      const startAt =
        document.getElementById(
          'novaTrilhaInicio'
        ).value;

      const plannedEndAt =
        document.getElementById(
          'novaTrilhaFim'
        ).value;

      const releaseAt =
        document.getElementById(
          'novaTrilhaLiberacao'
        ).value;

      if (!name || !startAt || !plannedEndAt) {
        alert(
          'Preencha o nome, início e término da trilha.'
        );
        return;
      }

      try {
        const resposta = await fetch(
          '/api/trilhas',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              name,
              type,
              visibility,
              startAt,
              plannedEndAt,
              releaseAt:
                releaseAt || null,
            }),
          }
        );

        const dados = await resposta.json();

        if (!resposta.ok) {
          alert(
            dados.error ||
              'Não foi possível criar a trilha.'
          );
          return;
        }

        alert(
          `✅ Trilha criada com sucesso!

Código da trilha:
${dados.trail.code}

Você é o administrador desta trilha.`
        );

        overlay.remove();

        if (dados.trail?.id && grupoPrefill && rolePrefill) {
          try {
            const vinculo = await fetch(
              '/api/grupos/' + encodeURIComponent(grupoPrefill) +
              '/roles/' + encodeURIComponent(rolePrefill) + '/vincular-trilha',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trailId: dados.trail.id }),
              }
            );
            const dadosVinculo = await vinculo.json();
            if (!vinculo.ok) {
              alert(dadosVinculo.error || 'A trilha foi criada, mas não foi possível vinculá-la ao passeio.');
            }
          } catch (erroVinculo) {
            console.warn('Falha ao vincular trilha ao passeio:', erroVinculo);
          }
        }

        if (dados.trail?.id) {
          window.location.href =
            '/trilha.html?id=' +
            encodeURIComponent(dados.trail.id);
        }
      } catch (error) {
        console.error(error);

        alert(
          'Não foi possível conectar ao servidor.'
        );
      }
    });
}

function abrirTrilha(trilhaId) {
  if (!trilhaId) {
    alert('ID da trilha não encontrado.');
    return;
  }

  window.location.href =
    '/trilha.html?id=' +
    encodeURIComponent(trilhaId);
}

function escaparTextoTrilha(valor) {
  return String(valor || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function abrirSolicitacoesAdmin(trilhaId) {
  try {
    const resposta = await fetch(
      '/api/trilhas/' +
      encodeURIComponent(trilhaId) +
      '/solicitacoes',
      { cache: 'no-store' }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      alert(
        dados.error ||
        'Não foi possível carregar as solicitações.'
      );
      return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;
      inset:0;
      background:rgba(0,0,0,0.75);
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:99999;
      padding:20px;
      box-sizing:border-box;
    `;

    const solicitacoes = Array.isArray(dados.requests)
      ? dados.requests
      : [];

    const lista = solicitacoes.length
      ? solicitacoes.map((solicitacao) => `
        <div style="border:1px solid rgba(255,255,255,.11);border-radius:14px;padding:16px;margin-bottom:12px;">
          <strong>${escaparTextoTrilha(solicitacao.userName)}</strong><br>
          <small>${escaparTextoTrilha(solicitacao.userEmail)}</small>
          <p style="line-height:1.6;margin:10px 0;">
            <strong>Veículo:</strong>
            ${escaparTextoTrilha(solicitacao.vehicleType)} /
            ${escaparTextoTrilha(solicitacao.vehicleBrand)}
            ${escaparTextoTrilha(solicitacao.vehicleModel)}<br>
            <strong>Ano:</strong> ${solicitacao.vehicleYear || '-'}<br>
            <strong>Cor:</strong> ${escaparTextoTrilha(solicitacao.vehicleColor) || '-'}<br>
            <strong>Placa:</strong> ${escaparTextoTrilha(solicitacao.vehiclePlate) || '-'}<br>
            <strong>Status:</strong> ${escaparTextoTrilha(solicitacao.status)}
          </p>
          ${solicitacao.status === 'pending' ? `
            <div style="display:flex;gap:8px;">
              <button type="button" onclick="analisarSolicitacao('${trilhaId}', '${solicitacao.id}', 'aceitar', this)" style="flex:1;padding:10px;border:0;border-radius:8px;background:#166534;color:#fff;cursor:pointer;">
                Aprovar
              </button>
              <button type="button" onclick="analisarSolicitacao('${trilhaId}', '${solicitacao.id}', 'recusar', this)" style="flex:1;padding:10px;border:0;border-radius:8px;background:#b91c1c;color:#fff;cursor:pointer;">
                Rejeitar
              </button>
            </div>
          ` : ''}
        </div>
      `).join('')
      : '<p>Nenhuma solicitação encontrada.</p>';

    overlay.innerHTML = `
      <div style="background:#151c17;color:#f5f7f5;border:1px solid rgba(255,255,255,.11);width:100%;max-width:620px;max-height:90vh;overflow-y:auto;border-radius:18px;padding:24px;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h2 style="margin:0;">Solicitações de entrada</h2>
          <button id="fecharSolicitacoesAdmin" type="button" style="border:0;background:#252e27;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;">✕</button>
        </div>
        ${lista}
      </div>
    `;

    if (!anexarPainelAoModulo(overlay)) {
    document.body.appendChild(overlay);
  }
    document
      .getElementById('fecharSolicitacoesAdmin')
      .addEventListener('click', () => overlay.remove());
  } catch (error) {
    console.error('Erro ao carregar solicitações:', error);
    alert('Não foi possível conectar ao servidor.');
  }
}

async function analisarSolicitacao(
  trilhaId,
  solicitacaoId,
  acao,
  botao
) {
  botao.disabled = true;

  try {
    const resposta = await fetch(
      '/api/trilhas/' +
      encodeURIComponent(trilhaId) +
      '/solicitacoes/' +
      encodeURIComponent(solicitacaoId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: acao }),
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      alert(dados.error || 'Não foi possível analisar a solicitação.');
      botao.disabled = false;
      return;
    }

    alert(dados.message || 'Solicitação atualizada.');
    document.getElementById('solicitacoesAdminOverlay')?.remove();
    document.getElementById('listaTrilhasOverlay')?.remove();
    await abrirSolicitacoesAdmin(trilhaId);
  } catch (error) {
    console.error('Erro ao analisar solicitação:', error);
    alert('Não foi possível conectar ao servidor.');
    botao.disabled = false;
  }
}

async function abrirListaTrilhas() {
  try {
    const [resposta, respostaSolicitacoes] = await Promise.all([
      fetch('/api/trilhas', { cache: 'no-store' }),
      fetch('/api/trilhas/solicitacoes/minhas', { cache: 'no-store' }),
    ]);

    const dados = await resposta.json();
    const dadosSolicitacoes = respostaSolicitacoes.ok
      ? await respostaSolicitacoes.json()
      : { requests: [] };

    if (!resposta.ok) {
      alert(
        dados.error ||
        'Não foi possível carregar as trilhas.'
      );
      return;
    }

    const trilhas = Array.isArray(dados.trails)
      ? dados.trails
      : [];

    const idsAtivos = new Set(trilhas.map((trilha) => trilha.id));
    const solicitacoes = Array.isArray(dadosSolicitacoes.requests)
      ? dadosSolicitacoes.requests.filter((item) => !idsAtivos.has(item.trailId))
      : [];

    const statusSolicitacao = {
      pending: ['⏳ Aguardando aprovação', '#92400e', '#fef3c7'],
      accepted: ['✅ Aprovado', '#166534', '#dcfce7'],
      rejected: ['❌ Recusado', '#991b1b', '#fee2e2'],
    };

    const solicitacoesHtml = solicitacoes.length
      ? `
        <h3 style="margin:22px 0 10px;">Minhas solicitações</h3>
        ${solicitacoes.map((item) => {
          const visual = statusSolicitacao[item.status] || [item.status, '#334155', '#e2e8f0'];
          return `
            <div style="border:1px solid rgba(255,255,255,.11);border-radius:14px;padding:15px;margin-bottom:10px;background:#151c17;">
              <strong>${escaparTextoTrilha(item.name)}</strong>
              <div style="margin-top:5px;color:#a9b1ab;font-size:13px;">${escaparTextoTrilha(item.code)}</div>
              <div style="display:inline-block;margin-top:10px;padding:6px 9px;border-radius:9px;background:${visual[2]};color:${visual[1]};font-weight:bold;font-size:13px;">
                ${visual[0]}
              </div>
              ${item.status === 'rejected' ? `
                <button type="button" onclick="navegarParaModulo('entrar-trilha')" style="display:block;margin-top:10px;padding:9px 12px;border:0;border-radius:8px;cursor:pointer;">
                  Fazer nova solicitação
                </button>
              ` : ''}
            </div>
          `;
        }).join('')}
      `
      : '';

    const overlay = document.createElement('div');

    overlay.id = 'listaTrilhasOverlay';

    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      padding: 20px;
      box-sizing: border-box;
    `;

    let conteudo = '';

    if (trilhas.length === 0) {
      conteudo = `
        <div style="
          text-align:center;
          padding:30px 10px;
        ">
          <div style="font-size:50px;">🛣️</div>

          <h3>
            Nenhuma trilha encontrada
          </h3>

          <p>
            Você ainda não participa de nenhuma trilha.
          </p>
        </div>
      `;
    } else {
      conteudo = trilhas.map((trilha) => `
        <div style="
          background:#f8fafc;
          border:1px solid rgba(255,255,255,.11);
          border-radius:16px;
          padding:18px;
          margin-bottom:12px;
        ">

          <div style="
            display:flex;
            justify-content:space-between;
            gap:10px;
            align-items:center;
            margin-bottom:8px;
          ">

            <strong style="
              font-size:18px;
            ">
              🛣️ ${trilha.name}
            </strong>

            <span style="
              background:#252e27;color:#fff;
              padding:5px 8px;
              border-radius:8px;
              font-size:12px;
            ">
              ${trilha.role === 'admin'
                ? 'ADMIN'
                : 'MEMBRO'}
            </span>

          </div>

          <div style="
            line-height:1.8;
            font-size:14px;
          ">

            <div>
              <strong>Código:</strong>
              ${trilha.code}
            </div>

            <div>
              <strong>Tipo:</strong>
              ${trilha.type}
            </div>

            <div>
              <strong>Acesso:</strong>
              ${trilha.visibility}
            </div>

            <div>
              <strong>Início:</strong>
              ${new Date(
                trilha.startAt
              ).toLocaleString('pt-BR')}
            </div>

            <div>
              <strong>Término previsto:</strong>
              ${new Date(
                trilha.plannedEndAt
              ).toLocaleString('pt-BR')}
            </div>

            <div style="
              margin-top:8px;
              color:#166534;
            ">
              🛡️ Segurança ativa por 24 horas
              após o término previsto.
            </div>
          <button
  type="button"
  onclick="abrirTrilha('${trilha.id}')"
  style="
    width:100%;
    margin-top:16px;
    padding:12px;
    border:0;
    border-radius:10px;
    background:#222;
    color:#fff;
    font-weight:bold;
    cursor:pointer;
    font-size:15px;
  "
>
  ABRIR TRILHA
</button>
${trilha.role === 'admin' ? `
<button
  type="button"
  onclick="abrirSolicitacoesAdmin('${trilha.id}')"
  style="
    width:100%;
    margin-top:10px;
    padding:12px;
    border:1px solid #222;
    border-radius:10px;
    background:#151c17;
    color:#f5f7f5;
    font-weight:bold;
    cursor:pointer;
    font-size:15px;
  "
>
  ADMINISTRAR SOLICITAÇÕES${Number(trilha.pendingRequestCount || 0) > 0
    ? ` (${trilha.pendingRequestCount} PENDENTE${Number(trilha.pendingRequestCount) === 1 ? '' : 'S'})`
    : ''}
</button>
` : ''}
          </div>
        </div>
      `).join('');
    }

    overlay.innerHTML = `
      <div style="
        background:white;
        color:#f5f7f5;
        width:100%;
        max-width:650px;
        max-height:90vh;
        overflow-y:auto;
        border-radius:20px;
        padding:24px;
        box-sizing:border-box;
        box-shadow:0 20px 60px rgba(0,0,0,0.35);
      ">

        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          margin-bottom:20px;
        ">

          <h2 style="
            margin:0;
            color:#f5f7f5;
          ">
            🛣️ Minhas trilhas
          </h2>

          <button
            id="fecharListaTrilhas"
            style="
              border:0;
              background:#252e27;color:#fff;
              border-radius:10px;
              padding:8px 12px;
              cursor:pointer;
              font-size:18px;
            "
          >
            ✕
          </button>

        </div>

        ${conteudo}
        ${solicitacoesHtml}

        <button
          id="fecharListaTrilhasRodape"
          style="
            width:100%;
            padding:12px;
            border:0;
            border-radius:12px;
            cursor:pointer;
            margin-top:8px;
          "
        >
          Fechar
        </button>

      </div>
    `;

    if (!anexarPainelAoModulo(overlay)) {
    document.body.appendChild(overlay);
  }

    document
      .getElementById('fecharListaTrilhas')
      .addEventListener('click', () => {
        overlay.remove();
        history.pushState({}, '', '/');
        mostrarHome();
      });

    document
      .getElementById('fecharListaTrilhasRodape')
      .addEventListener('click', () => {
        overlay.remove();
        history.pushState({}, '', '/');
        mostrarHome();
      });

  } catch (error) {
    console.error(
      'Erro ao carregar trilhas:',
      error
    );

    alert(
      'Não foi possível carregar as trilhas.'
    );
  }
}
function abrirEntrarTrilha() {
  const overlay = document.createElement('div');

  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.70);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    padding: 20px;
    box-sizing: border-box;
  `;

  overlay.innerHTML = `
    <div style="
      background:white;
      color:#f5f7f5;
      width:100%;
      max-width:520px;
      border-radius:18px;
      padding:24px;
      box-sizing:border-box;
    ">

      <h2 style="
        margin-top:0;
        color:#f5f7f5;
      ">
        🚙 Entrar em uma trilha
      </h2>

      <p style="
        color:#333;
        line-height:1.5;
      ">
        Informe o ID da trilha recebido pelo administrador.
      </p>

      <label style="
        display:block;
        font-weight:bold;
        margin-top:16px;
        margin-bottom:6px;
      ">
        ID da trilha
      </label>

      <input
        id="codigoEntradaTrilha"
        type="text"
        placeholder="Ex.: 4X4-F8K2P"
        style="
          width:100%;
          box-sizing:border-box;
          padding:13px;
          border:1px solid rgba(255,255,255,.14);
          border-radius:8px;
          font-size:16px;
          text-transform:uppercase;
        "
      >

      <div style="
        background:#17231a;
        border:1px solid rgba(105,211,55,.25);
        border-radius:10px;
        padding:14px;
        margin-top:16px;
        line-height:1.5;
      ">
        🔐 Toda solicitação de entrada, inclusive em trilhas públicas,
        depende da aprovação do criador/administrador.
      </div>

      <div style="
        display:flex;
        gap:10px;
        justify-content:flex-end;
        margin-top:20px;
      ">

        <button
          id="fecharEntrarTrilha"
          type="button"
          style="
            padding:12px 18px;
            border:1px solid rgba(255,255,255,.14);
            border-radius:8px;
            background:#151c17;
            color:#f5f7f5;
            cursor:pointer;
          "
        >
          Cancelar
        </button>

        <button
          id="continuarEntrarTrilha"
          type="button"
          style="
            padding:12px 18px;
            border:0;
            border-radius:8px;
            background:#222;
            color:#fff;
            cursor:pointer;
            font-weight:bold;
          "
        >
          Continuar
        </button>

      </div>

    </div>
  `;

  if (!anexarPainelAoModulo(overlay)) {
    document.body.appendChild(overlay);
  }

  document
    .getElementById('fecharEntrarTrilha')
    .addEventListener('click', () => {
      overlay.remove();
        history.pushState({}, '', '/');
        mostrarHome();
    });

  document
    .getElementById('continuarEntrarTrilha')
    .addEventListener('click', async () => {

      const code =
        document
          .getElementById(
            'codigoEntradaTrilha'
          )
          .value
          .trim()
          .toUpperCase();

      if (!code) {
        alert(
          'Informe o ID da trilha.'
        );
        return;
      }

      /*
       * Primeiro localizamos a trilha
       * pelo código.
       */

      try {

        const resposta =
          await fetch(
            '/api/trilhas/consulta/' +
            encodeURIComponent(code),
            {
              cache: 'no-store'
            }
          );

        const dados =
          await resposta.json();

        if (!resposta.ok) {
          alert(
            dados.error ||
            'Não foi possível localizar a trilha.'
          );
          return;
        }

        if (
          dados.participation?.status === 'active'
        ) {
          alert('Você já participa desta trilha.');
          return;
        }

        if (
          dados.participation?.status === 'pending'
        ) {
          alert('Sua solicitação está pendente de aprovação.');
          return;
        }

        if (
          dados.participation?.status === 'rejected'
        ) {
          alert('Sua solicitação anterior foi rejeitada. Você pode enviar uma nova solicitação.');
        }

        mostrarFormularioVeiculo(
          overlay,
          code,
          dados.trail
        );

      } catch (error) {

        console.error(error);

        alert(
          'Não foi possível conectar ao servidor.'
        );
      }
    });
}
function mostrarFormularioVeiculo(
  overlay,
  code,
  trilha
) {
  const conteudo =
    overlay.querySelector('div');

  conteudo.innerHTML = `
    <h2 style="
      margin-top:0;
      color:#f5f7f5;
    ">
      🚙 Seu veículo
    </h2>

    <p style="
      color:#333;
      line-height:1.5;
    ">
      Informe o veículo que será utilizado
      nesta trilha.
    </p>

    <div style="
      background:#17231a;
      border:1px solid rgba(105,211,55,.25);
      border-radius:10px;
      padding:14px;
      margin:16px 0;
      line-height:1.6;
    ">
      <strong>${trilha.name}</strong><br>
      Código: ${trilha.code}<br>
      Tipo: ${trilha.type}<br>
      Acesso: ${trilha.visibility}<br>
      Início: ${new Date(trilha.startAt).toLocaleString('pt-BR')}<br>
      Término previsto: ${new Date(trilha.plannedEndAt).toLocaleString('pt-BR')}
    </div>

    <label style="
      display:block;
      font-weight:bold;
      margin-top:14px;
      margin-bottom:6px;
    ">
      Tipo *
    </label>

    <select
      id="veiculoTipo"
      style="
        width:100%;
        padding:12px;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
      "
    >
      <option value="">Selecione</option>
      <option value="4x4">4x4</option>
      <option value="UTV">UTV</option>
      <option value="Quadriciclo">Quadriciclo</option>
      <option value="Gaiola/Buggy">Gaiola / Buggy</option>
      <option value="Caminhonete">Caminhonete</option>
      <option value="SUV">SUV</option>
      <option value="Outro">Outro</option>
    </select>

    <label style="
      display:block;
      font-weight:bold;
      margin-top:14px;
      margin-bottom:6px;
    ">
      Marca *
    </label>

    <input
      id="veiculoMarca"
      type="text"
      placeholder="Ex.: Chevrolet"
      style="
        width:100%;
        padding:12px;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
        box-sizing:border-box;
      "
    >

    <label style="
      display:block;
      font-weight:bold;
      margin-top:14px;
      margin-bottom:6px;
    ">
      Modelo *
    </label>

    <input
      id="veiculoModelo"
      type="text"
      placeholder="Ex.: S10"
      style="
        width:100%;
        padding:12px;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
        box-sizing:border-box;
      "
    >

    <label style="
      display:block;
      font-weight:bold;
      margin-top:14px;
      margin-bottom:6px;
    ">
      Ano
    </label>

    <input
      id="veiculoAno"
      type="number"
      placeholder="Ex.: 2014"
      style="
        width:100%;
        padding:12px;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
        box-sizing:border-box;
      "
    >

    <label style="
      display:block;
      font-weight:bold;
      margin-top:14px;
      margin-bottom:6px;
    ">
      Cor
    </label>

    <input
      id="veiculoCor"
      type="text"
      placeholder="Ex.: vermelho"
      style="
        width:100%;
        padding:12px;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
        box-sizing:border-box;
      "
    >

    <label style="
      display:block;
      font-weight:bold;
      margin-top:14px;
      margin-bottom:6px;
    ">
      Placa
      <span style="
        font-weight:normal;
        color:#777;
      ">
        (opcional)
      </span>
    </label>

    <input
      id="veiculoPlaca"
      type="text"
      placeholder="Se possuir"
      style="
        width:100%;
        padding:12px;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
        box-sizing:border-box;
        text-transform:uppercase;
      "
    >

    <div style="
      background:#f1f5f9;
      padding:12px;
      border-radius:10px;
      margin-top:14px;
      line-height:1.5;
      color:#333;
    ">
      ℹ️ A placa não é obrigatória.
      UTVs, gaiolas, buggies e outros veículos
      sem placa também podem participar.
    </div>

    <label style="
      display:block;
      font-weight:bold;
      margin-top:14px;
      margin-bottom:6px;
    ">
      Observação
    </label>

    <textarea
      id="veiculoObservacao"
      placeholder="Alguma informação importante sobre o veículo"
      style="
        width:100%;
        min-height:80px;
        padding:12px;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
        box-sizing:border-box;
        resize:vertical;
      "
    ></textarea>

    <div style="
      display:flex;
      gap:10px;
      justify-content:flex-end;
      margin-top:20px;
    ">

      <button
        id="cancelarVeiculo"
        type="button"
        style="
          padding:12px 18px;
          border:1px solid rgba(255,255,255,.14);
          border-radius:8px;
          background:#151c17;
          cursor:pointer;
        "
      >
        Cancelar
      </button>

      <button
        id="enviarSolicitacaoVeiculo"
        type="button"
        style="
          padding:12px 18px;
          border:0;
          border-radius:8px;
          background:#222;
          color:#fff;
          cursor:pointer;
          font-weight:bold;
        "
      >
        Enviar solicitação
      </button>

    </div>
  `;

  document
    .getElementById('cancelarVeiculo')
    .addEventListener(
      'click',
      () => overlay.remove()
    );

  document
    .getElementById(
      'enviarSolicitacaoVeiculo'
    )
    .addEventListener(
      'click',
      async () => {

        const vehicle = {
          type:
            document
              .getElementById(
                'veiculoTipo'
              ).value,

          brand:
            document
              .getElementById(
                'veiculoMarca'
              ).value.trim(),

          model:
            document
              .getElementById(
                'veiculoModelo'
              ).value.trim(),

          year:
            document
              .getElementById(
                'veiculoAno'
              ).value,

          color:
            document
              .getElementById(
                'veiculoCor'
              ).value.trim(),

          plate:
            document
              .getElementById(
                'veiculoPlaca'
              ).value.trim(),

          notes:
            document
              .getElementById(
                'veiculoObservacao'
              ).value.trim()
        };


        if (
          !vehicle.type ||
          !vehicle.brand ||
          !vehicle.model
        ) {
          alert(
            'Preencha tipo, marca e modelo.'
          );
          return;
        }


        try {

          const resposta =
            await fetch(
              '/api/trilhas/entrar',
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/json'
                },
                body:
                  JSON.stringify({
                    code,
                    vehicle
                  })
              }
            );


          const dados =
            await resposta.json();


          if (!resposta.ok) {
            alert(
              dados.error ||
              'Não foi possível enviar a solicitação.'
            );
            return;
          }


          alert(
            '✅ Solicitação enviada!\n\n' +
            'O administrador da trilha receberá seus dados e deverá aprovar sua participação.'
          );


          overlay.remove();

        } catch (error) {

          console.error(error);

          alert(
            'Não foi possível conectar ao servidor.'
          );
        }
      }
    );
}