/* Mapa da Home, localização e atalho de segurança — Trilha 4X4 */

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

