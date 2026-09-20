let mapa = null;
let marcadorUsuario = null;
let precisaoUsuario = null;
let sosAtivo = false;


document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.menu-card').forEach((card) => {
    card.addEventListener('click', () => {
      abrirFuncao(card.dataset.page);
    });
  });

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

  if (loginButton && loginButton.parentElement) {
    loginButton.parentElement.appendChild(avatar);
  } else {
    document.body.appendChild(avatar);
  }

  avatar.addEventListener('click', () => {
    mostrarMenuUsuario(user);
  });
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

    case 'navegacao':
      alert('🧭 A navegação será criada aqui.');
      break;

    case 'ia':
      alert('🤖 O assistente IA 4x4 será aberto aqui.');
      break;

    case 'grupos':
      alert('👥 Os grupos serão criados aqui.');
      break;

    case 'seguranca':
      window.location.href = '/segurança.html';
      break;

    case 'meu-4x4':
      alert('🚙 O cadastro do seu 4x4 será criado aqui.');
      break;
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
    color:#000;
    width:100%;
    max-width:520px;
    max-height:90vh;
    overflow-y:auto;
    border-radius:18px;
    padding:24px;
    box-sizing:border-box;
  ">

    <h2 style="
      color:#000;
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
        color:#000;
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
        color:#000;
        background:#fff;
        border:1px solid #999;
        border-radius:8px;
      "
    >

    <label
      for="novaTrilhaTipo"
      style="
        display:block;
        color:#000;
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
        color:#000;
        background:#fff;
        border:1px solid #999;
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
        color:#000;
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
        color:#000;
        background:#fff;
        border:1px solid #999;
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
        color:#000;
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
        color:#000;
        background:#fff;
        border:1px solid #999;
        border-radius:8px;
      "
    >

    <label
      for="novaTrilhaFim"
      style="
        display:block;
        color:#000;
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
        color:#000;
        background:#fff;
        border:1px solid #999;
        border-radius:8px;
      "
    >

    <label
      for="novaTrilhaLiberacao"
      style="
        display:block;
        color:#000;
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
        color:#000;
        background:#fff;
        border:1px solid #999;
        border-radius:8px;
      "
    >

    <div style="
      background:#eef6ff;
      color:#000;
      padding:14px;
      border-radius:10px;
      margin-top:18px;
      line-height:1.5;
      border:1px solid #b7d7f5;
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
          border:1px solid #999;
          border-radius:8px;
          background:#fff;
          color:#000;
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
  document.body.appendChild(overlay);

  document
    .getElementById('fecharCriarTrilha')
    .addEventListener('click', () => {
      overlay.remove();
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
      } catch (error) {
        console.error(error);

        alert(
          'Não foi possível conectar ao servidor.'
        );
      }
    });
}

function abrirTrilha(trilhaId) {
  alert(
    `🛣️ Trilha selecionada!\n\nID da trilha: ${trilhaId}\n\nA tela da trilha será aberta nesta próxima etapa.`
  );
}

function abrirTrilha(trilhaId) {
  alert(
    `🛣️ Trilha selecionada!\n\nID da trilha: ${trilhaId}\n\nA tela da trilha será aberta nesta próxima etapa.`
  );
}

async function abrirListaTrilhas() {
  try {
    const resposta = await fetch('/api/trilhas');

    const dados = await resposta.json();

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
          border:1px solid #dbe3ea;
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
              background:#e2e8f0;
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
          </div>
        </div>
      `).join('');
    }

    overlay.innerHTML = `
      <div style="
        background:white;
        color:#000;
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
            color:#000;
          ">
            🛣️ Minhas trilhas
          </h2>

          <button
            id="fecharListaTrilhas"
            style="
              border:0;
              background:#e2e8f0;
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

    document.body.appendChild(overlay);

    document
      .getElementById('fecharListaTrilhas')
      .addEventListener('click', () => {
        overlay.remove();
      });

    document
      .getElementById('fecharListaTrilhasRodape')
      .addEventListener('click', () => {
        overlay.remove();
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