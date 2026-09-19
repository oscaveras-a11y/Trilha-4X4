document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.menu-card');

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      const page = card.dataset.page;
      abrirFuncao(page);
    });
  });

  const loginButton = document.getElementById('loginButton');

  if (loginButton) {
    loginButton.addEventListener('click', () => {
      alert('Área de login será criada na próxima etapa.');
    });
  }

  const locationButton = document.getElementById('locationButton');

  if (locationButton) {
    locationButton.addEventListener('click', solicitarLocalizacao);
  }
});

function abrirFuncao(page) {
  switch (page) {
    case 'mapa':
      alert('🗺️ Mapa do Trilha-4X4 será aberto aqui.');
      break;

    case 'trilhas':
      alert('🛣️ Lista de trilhas será aberta aqui.');
      break;

    case 'navegacao':
      alert('🧭 Sistema de navegação será aberto aqui.');
      break;

    case 'ia':
      alert('🤖 Assistente IA 4x4 será aberto aqui.');
      break;

    case 'grupos':
      alert('👥 Área de grupos será aberta aqui.');
      break;

    case 'seguranca':
      alert('🚨 Sistema de segurança será aberto aqui.');
      break;

    case 'criar-trilha':
      alert('🏁 Criador de trilhas será aberto aqui.');
      break;

    case 'meu-4x4':
      alert('🚙 Cadastro do seu 4x4 será aberto aqui.');
      break;

    default:
      console.log('Função não encontrada:', page);
  }
}

function solicitarLocalizacao() {
  const botao = document.getElementById('locationButton');
  const caixa = document.getElementById('locationBox');

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
      const precisao = Math.round(position.coords.accuracy);

      console.log('Latitude:', latitude);
      console.log('Longitude:', longitude);
      console.log('Precisão:', precisao);

      if (caixa) {
        caixa.innerHTML = `
          <div class="location-icon">
            📍
          </div>

          <div class="location-text">
            <strong>
              Localização ativada
            </strong>

            <p>
              GPS ativo. Precisão aproximada:
              ${precisao} metros.
            </p>
          </div>

          <button
            id="locationButton"
            class="location-button"
          >
            Localização ativa
          </button>
        `;
      }
    },

    function (error) {
      console.error('Erro de localização:', error);

      if (botao) {
        botao.disabled = false;
        botao.textContent = 'Permitir localização';
      }

      if (error.code === 1) {
        alert('Você recusou a permissão de localização. Para usar mapas e navegação, permita o acesso à localização.');
      } else if (error.code === 2) {
        alert('Não foi possível encontrar sua localização.');
      } else if (error.code === 3) {
        alert('A localização demorou muito para responder. Tente novamente.');
      }
    },

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000
    }
  );
}
