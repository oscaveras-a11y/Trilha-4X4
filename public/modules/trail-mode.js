/* Navegação, modo trilha, GPS, offline e segurança da trilha — Trilha 4X4.
 * Extraído do HTML para permitir modularização incremental sem alterar o comportamento.
 */

let trilhaId = null;

  let trilha = null;

  let mapa = null;

  let marcadorUsuario = null;

  let precisaoUsuario = null;

  let watchId = null;

  let modoTrilhaAtivo = false;

  let conexaoTempoReal = null;

  let meuSosId = null;

  const marcadoresParticipantes = new Map();

  const rotasParticipantes = new Map();

  let rotaPlanejadaLinha = null;
  let rotaPlanejadaPontos = [];
  let marcadoresRotaPlanejada = [];
  let editandoRota = false;
  let gravandoRotaGps = false;
  let rotaGpsPausada = false;
  let watchRotaGpsId = null;
  let mapaCarregado = false;
  let ultimaCentralizacaoGps = 0;
  let ultimaPosicaoGpsAceita = null;
  let ultimaPosicaoRotaGpsAceita = null;
  let ultimoEnvioGpsEm = 0;
  const GPS_MAX_ACCURACY_METERS = 80;
  const GPS_MAX_SPEED_MPS = 70;
  const GPS_QUEUE_KEY = 'trilha4x4-gps-pendente-v1';
  const trilhasGeoJson = new Map();


  /*
   * PEGA O ID DA TRILHA NA URL
   */

  const parametros =
    new URLSearchParams(
      window.location.search
    );

  trilhaId =
    parametros.get('id');


  /*
   * BOTÃO VOLTAR
   */

  document
    .getElementById('voltarButton')
    .addEventListener(
      'click',
      () => {
        window.location.href = '/';
      }
    );


  /*
   * BOTÕES DE SEGURANÇA
   */

  document
    .getElementById('chegueiButton')
    .addEventListener(
      'click',
      () => registrarSeguranca('safe')
    );

  document
    .getElementById('aindaTrilhaButton')
    .addEventListener(
      'click',
      () => registrarSeguranca('still_on_trail')
    );

  document
    .getElementById('estender6Button')
    .addEventListener(
      'click',
      () => registrarSeguranca('extend', 6)
    );

  document
    .getElementById('estender12Button')
    .addEventListener(
      'click',
      () => registrarSeguranca('extend', 12)
    );

  document
    .getElementById('estender24Button')
    .addEventListener(
      'click',
      () => registrarSeguranca('extend', 24)
    );


  /*
   * BOTÃO MODO TRILHA
   */

  document
    .getElementById('modoTrilhaButton')
    .addEventListener(
      'click',
      () => {

        if (modoTrilhaAtivo) {

          encerrarModoTrilha();

        } else {

          iniciarModoTrilha();

        }

      }
    );


  /*
   * BOTÃO GPS
   */

  document
    .getElementById('gpsButton')
    .addEventListener(
      'click',
      () => {

        obterLocalizacao(true);

      }
    );


  /*
   * BOTÃO SOS
   */

  document
    .getElementById('sosButton')
    .addEventListener(
      'click',
      () => {

        if (meuSosId) {

          encerrarSOS();

        } else {

          ativarSOS();

        }

      }
    );


  /*
   * SEGURANÇA
   */

  async function carregarSeguranca() {
    try {
      const resposta = await fetch(
        '/api/trilhas/' +
        encodeURIComponent(trilhaId) +
        '/seguranca',
        { cache: 'no-store' }
      );

      if (!resposta.ok) {
        return;
      }

      const dados = await resposta.json();
      const ultimo = dados.events?.[0];
      const status = document.getElementById('segurancaStatus');

      if (ultimo && status) {
        status.textContent =
          `${ultimo.userName} registrou "${ultimo.action}" em ${dataBR(ultimo.createdAt)}.`;
      }
    } catch (erro) {
      console.warn('Status de segurança indisponível:', erro);
    }
  }

  async function registrarSeguranca(action, extensionHours = null) {
    if (
      action === 'safe' &&
      !confirm('Confirmar que você chegou em segurança?')
    ) {
      return;
    }

    try {
      const resposta = await fetch(
        '/api/trilhas/' +
        encodeURIComponent(trilhaId) +
        '/seguranca',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action, extensionHours }),
        }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        mostrarErro(dados.error || 'Não foi possível registrar a segurança.');
        return;
      }

      const status = document.getElementById('segurancaStatus');
      if (status) {
        status.textContent = dados.message;
      }

      carregarTrilha();
    } catch (erro) {
      console.error(erro);
      mostrarErro('Não foi possível conectar ao servidor.');
    }
  }


  /*
   * MOSTRAR ERRO
   */

  function mostrarErro(mensagem) {

    const elemento =
      document.getElementById(
        'mensagemErro'
      );

    elemento.textContent =
      mensagem;

    elemento.style.display =
      'block';

  }


  /*
   * DATA BRASILEIRA
   */

  function dataBR(valor) {

    if (!valor) {
      return '-';
    }

    return new Date(valor)
      .toLocaleString('pt-BR');

  }


  /*
   * TIPOS
   */

  function traduzirTipo(valor) {

    const tipos = {

      passeio: 'Passeio',

      privada: 'Privada',

      evento: 'Evento'

    };

    return tipos[valor] || valor;

  }


  /*
   * ACESSOS
   */

  function traduzirAcesso(valor) {

    const acessos = {

      publica: 'Pública',

      privada: 'Privada',

      convite: 'Somente por convite'

    };

    return acessos[valor] || valor;

  }


  /*
   * MAPA
   */

  function iniciarMapa() {
    mapa = new maplibregl.Map({
      container: 'mapa',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [-51.9253, -14.2350],
      zoom: 3.5,
      pitch: 0,
      bearing: 0,
      attributionControl: true,
    });

    mapa.addControl(new maplibregl.NavigationControl({
      visualizePitch: true,
      showCompass: true,
      showZoom: true,
    }), 'top-right');
    mapa.addControl(new maplibregl.ScaleControl({
      maxWidth: 120,
      unit: 'metric',
    }), 'bottom-left');

    mapa.on('load', () => {
      mapaCarregado = true;
      desenharRotaPlanejada();
    });

    mapa.on('click', adicionarPontoPlanejadoNoMapa);

    document.getElementById('verRotaButton').onclick = centralizarRotaPlanejada;
    document.getElementById('verTodosButton').onclick = enquadrarTudoNoMapa;
    document.getElementById('telaCheiaMapaButton').onclick = alternarMapaMaior;
    document.getElementById('baixarOfflineButton').onclick = salvarPercursoOffline;
    document.getElementById('excluirOfflineButton').onclick = excluirPercursoOffline;
    atualizarStatusOffline();

    setTimeout(() => mapa.resize(), 100);
  }

  function centralizarRotaPlanejada() {
    if (rotaPlanejadaPontos.length < 2) {
      alert('Ainda não há uma rota planejada para mostrar.');
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    rotaPlanejadaPontos.forEach(p => bounds.extend([p.longitude, p.latitude]));
    mapa.fitBounds(bounds, { padding: 45, maxZoom: 16, duration: 700 });
  }

  function enquadrarTudoNoMapa() {
    const pontos = rotaPlanejadaPontos.map(p => [p.longitude, p.latitude]);
    marcadoresParticipantes.forEach(m => {
      const p = m.getLngLat();
      pontos.push([p.lng, p.lat]);
    });
    if (marcadorUsuario) {
      const p = marcadorUsuario.getLngLat();
      pontos.push([p.lng, p.lat]);
    }
    if (!pontos.length) {
      alert('Ainda não há posições para enquadrar.');
      return;
    }
    if (pontos.length === 1) {
      mapa.easeTo({ center: pontos[0], zoom: 16 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    pontos.forEach(p => bounds.extend(p));
    mapa.fitBounds(bounds, { padding: 45, maxZoom: 16, duration: 700 });
  }

  function alternarMapaMaior() {
    const elemento = document.getElementById('mapa');
    const ampliado = elemento.dataset.ampliado === '1';
    elemento.dataset.ampliado = ampliado ? '0' : '1';
    elemento.style.height = ampliado ? '' : '78vh';
    document.getElementById('telaCheiaMapaButton').textContent =
      ampliado ? '⛶ MAPA MAIOR' : '↙ MAPA NORMAL';
    setTimeout(() => mapa.resize(), 50);
  }


  function desenharRotaPlanejada() {
    marcadoresRotaPlanejada.forEach(m => m.remove());
    marcadoresRotaPlanejada = [];
    if (!mapa || !mapaCarregado) return;

    const sourceId = 'rota-planejada';
    const layerId = 'rota-planejada-linha';
    if (mapa.getLayer(layerId)) mapa.removeLayer(layerId);
    if (mapa.getSource(sourceId)) mapa.removeSource(sourceId);
    rotaPlanejadaLinha = null;

    if (!rotaPlanejadaPontos.length) return;

    const coordenadas = rotaPlanejadaPontos.map(p => [p.longitude, p.latitude]);
    if (coordenadas.length >= 2) {
      mapa.addSource(sourceId, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coordenadas } }
      });
      mapa.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#ff7a00',
          'line-width': 7,
          'line-opacity': 0.95,
        },
        layout: { 'line-join': 'round', 'line-cap': 'round' }
      });
      rotaPlanejadaLinha = { sourceId, layerId };

      if (editandoRota) {
        mapa.off('click', layerId, inserirPontoNaLinhaPlanejada);
        mapa.on('click', layerId, inserirPontoNaLinhaPlanejada);
        mapa.on('mouseenter', layerId, () => { mapa.getCanvas().style.cursor = 'crosshair'; });
        mapa.on('mouseleave', layerId, () => { mapa.getCanvas().style.cursor = ''; });
      }
    }

    rotaPlanejadaPontos.forEach((ponto, index) => {
      const el = document.createElement('div');
      el.className = 'rota-numero';
      el.textContent = String(index + 1);
      const titulo = index === 0 ? '🚩 Saída'
        : index === rotaPlanejadaPontos.length - 1 ? '🏁 Chegada'
        : '📍 Ponto ' + (index + 1);

      const marcador = new maplibregl.Marker({ element: el, draggable: editandoRota })
        .setLngLat([ponto.longitude, ponto.latitude])
        .setPopup(new maplibregl.Popup({ offset: 20 }).setText(titulo))
        .addTo(mapa);

      if (editandoRota) {
        marcador.on('dragend', () => {
          const pos = marcador.getLngLat();
          rotaPlanejadaPontos[index] = { latitude: pos.lat, longitude: pos.lng };
          desenharRotaPlanejada();
        });
        el.addEventListener('dblclick', (evento) => {
          evento.stopPropagation();
          if (confirm('Excluir o ponto ' + (index + 1) + ' da rota?')) {
            rotaPlanejadaPontos.splice(index, 1);
            desenharRotaPlanejada();
          }
        });
      }
      marcadoresRotaPlanejada.push(marcador);
    });

    // Não reenquadrar a rota inteira enquanto o GPS está acompanhando o veículo.
    // Isso evita que fitBounds() dispute o centro do mapa com a posição em movimento.
    if (coordenadas.length >= 2 && !editandoRota && !gravandoRotaGps && !modoTrilhaAtivo) {
      centralizarRotaPlanejada();
    }
  }

  function inserirPontoNaLinhaPlanejada(evento) {
    if (!editandoRota || !evento?.lngLat || rotaPlanejadaPontos.length < 2) return;
    evento.originalEvent?.stopPropagation();
    const clique = mapa.project(evento.lngLat);
    let melhorIndice = 1;
    let menor = Infinity;
    for (let i = 0; i < rotaPlanejadaPontos.length - 1; i++) {
      const a0 = rotaPlanejadaPontos[i], b0 = rotaPlanejadaPontos[i + 1];
      const a = mapa.project([a0.longitude, a0.latitude]);
      const b = mapa.project([b0.longitude, b0.latitude]);
      const dx=b.x-a.x, dy=b.y-a.y, l2=dx*dx+dy*dy;
      let t=l2?((clique.x-a.x)*dx+(clique.y-a.y)*dy)/l2:0;
      t=Math.max(0,Math.min(1,t));
      const d=Math.hypot(clique.x-(a.x+t*dx), clique.y-(a.y+t*dy));
      if(d<menor){menor=d;melhorIndice=i+1;}
    }
    rotaPlanejadaPontos.splice(melhorIndice,0,{
      latitude:evento.lngLat.lat, longitude:evento.lngLat.lng
    });
    desenharRotaPlanejada();
  }

  async function carregarRotaPlanejada() {
    const status = document.getElementById('rotaPlanejadaStatus');

    try {
      const resposta = await fetch(
        '/api/trilhas/' +
        encodeURIComponent(trilhaId) +
        '/rota-planejada',
        { cache: 'no-store' }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        const recuperada = await carregarPercursoOfflineComoFallback();
        if (!recuperada) {
          status.textContent = dados.error || 'Não foi possível carregar a rota planejada.';
        }
        return;
      }

      if (!dados.released) {
        status.textContent =
          '🔒 A rota foi preparada pelo administrador e será liberada em ' +
          dataBR(dados.releaseAt) + '.';
        return;
      }

      rotaPlanejadaPontos = Array.isArray(dados.points)
        ? dados.points
        : [];

      status.textContent = rotaPlanejadaPontos.length >= 2
        ? `🗺️ Rota planejada disponível com ${rotaPlanejadaPontos.length} pontos.`
        : 'O administrador ainda não criou uma rota para esta trilha.';

      const proximoPasso = document.getElementById('rotaProximoPasso');
      if (proximoPasso) {
        proximoPasso.style.display =
          trilha && trilha.role === 'admin' && rotaPlanejadaPontos.length < 2
            ? 'block'
            : 'none';
      }

      desenharRotaPlanejada();
    } catch (erro) {
      console.warn('Rota planejada indisponível:', erro);
      const recuperada = await carregarPercursoOfflineComoFallback();
      if (!recuperada) status.textContent = 'Não foi possível carregar a rota planejada.';
    }
  }

  function atualizarBotoesGravacaoRota() {
    const iniciar = document.getElementById('gravarRotaGpsButton');
    const pausar = document.getElementById('pausarRotaGpsButton');
    const finalizar = document.getElementById('finalizarRotaGpsButton');

    iniciar.style.display = gravandoRotaGps ? 'none' : 'block';
    pausar.style.display = gravandoRotaGps ? 'block' : 'none';
    finalizar.style.display = gravandoRotaGps ? 'block' : 'none';
    pausar.textContent = rotaGpsPausada
      ? '▶ CONTINUAR GRAVAÇÃO'
      : '⏸ PAUSAR GRAVAÇÃO';
  }

  function registrarPontoRotaGps(position) {
    if (!gravandoRotaGps || rotaGpsPausada) return;

    const validacao = validarPosicaoGps(position, 'rota');
    if (!validacao.ok) {
      atualizarStatusGps('⚠️ ' + validacao.motivo);
      return;
    }
    atualizarStatusGps('📡 GPS ativo · precisão ' + Math.round(position.coords.accuracy) + ' m', 'ativo');
    atualizarMapaUsuario(position);

    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const ultimo = rotaPlanejadaPontos[rotaPlanejadaPontos.length - 1];

    if (ultimo) {
      const distancia = mapa.distance(
        [ultimo.longitude, ultimo.latitude],
        [longitude, latitude]
      );
      if (distancia < 5) return;
    }

    if (rotaPlanejadaPontos.length >= 500) {
      finalizarGravacaoRotaGps();
      alert('A gravação atingiu o limite de 500 pontos. Revise e salve a rota.');
      return;
    }

    rotaPlanejadaPontos.push({ latitude, longitude });
    desenharRotaPlanejada();

    document.getElementById('rotaPlanejadaStatus').textContent =
      '📡 Gravando rota pelo GPS · ' + rotaPlanejadaPontos.length + ' pontos.';
  }

  function iniciarGravacaoRotaGps() {
    if (!navigator.geolocation) {
      alert('Este dispositivo não oferece GPS pelo navegador.');
      return;
    }

    if (rotaPlanejadaPontos.length &&
        !confirm('Começar uma nova gravação apagará os pontos atuais ainda não salvos. Continuar?')) {
      return;
    }

    const pontosAnteriores = rotaPlanejadaPontos.slice();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        rotaPlanejadaPontos = [];
        ultimaPosicaoRotaGpsAceita = null;
        gravandoRotaGps = true;
        rotaGpsPausada = false;
        editandoRota = false;
        desenharRotaPlanejada();
        atualizarBotoesGravacaoRota();

        registrarPontoRotaGps(position);
        mapa.easeTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 17 });

        if (watchRotaGpsId !== null) {
          navigator.geolocation.clearWatch(watchRotaGpsId);
        }
        watchRotaGpsId = navigator.geolocation.watchPosition(
          registrarPontoRotaGps,
          (erro) => {
            erroGPS(erro);
            if (erro?.code === 1) finalizarGravacaoRotaGps();
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 2000 }
        );
      },
      (erro) => {
        rotaPlanejadaPontos = pontosAnteriores;
        gravandoRotaGps = false;
        rotaGpsPausada = false;
        atualizarBotoesGravacaoRota();
        desenharRotaPlanejada();
        erroGPS(erro);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function alternarPausaRotaGps() {
    if (!gravandoRotaGps) return;
    rotaGpsPausada = !rotaGpsPausada;
    atualizarBotoesGravacaoRota();
    document.getElementById('rotaPlanejadaStatus').textContent =
      rotaGpsPausada
        ? '⏸ Gravação da rota pausada. Os pontos já registrados foram mantidos.'
        : '📡 Gravação da rota retomada.';
  }

  function finalizarGravacaoRotaGps() {
    if (!gravandoRotaGps) return;

    if (watchRotaGpsId !== null) {
      navigator.geolocation.clearWatch(watchRotaGpsId);
      watchRotaGpsId = null;
    }

    gravandoRotaGps = false;
    rotaGpsPausada = false;
    editandoRota = true;
    atualizarBotoesGravacaoRota();
    desenharRotaPlanejada();

    ['desfazerRotaButton', 'salvarRotaButton', 'limparRotaButton']
      .forEach((id) => {
        document.getElementById(id).style.display = 'block';
      });

    document.getElementById('editarRotaButton').textContent =
      '⏹ PARAR DE ADICIONAR PONTOS';

    document.getElementById('rotaPlanejadaStatus').textContent =
      rotaPlanejadaPontos.length >= 2
        ? '🏁 Gravação finalizada com ' + rotaPlanejadaPontos.length +
          ' pontos. Revise a rota e toque em SALVAR ROTA.'
        : 'Gravação finalizada. São necessários pelo menos 2 pontos para salvar.';
  }


  function encerrarWatchersDaPagina() {
    if (watchRotaGpsId !== null) {
      navigator.geolocation.clearWatch(watchRotaGpsId);
      watchRotaGpsId = null;
    }
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (conexaoTempoReal) {
      conexaoTempoReal.close();
      conexaoTempoReal = null;
    }
  }

  window.addEventListener('pagehide', encerrarWatchersDaPagina);
  window.addEventListener('beforeunload', encerrarWatchersDaPagina);


  function configurarEditorRota() {
    const editor = document.getElementById('editorRota');

    if (!trilha || trilha.role !== 'admin') {
      editor.style.display = 'none';
      return;
    }

    editor.style.display = 'block';

    document.getElementById('criarRotaMapaButton').onclick = () => {
      if (!editandoRota) document.getElementById('editarRotaButton').click();
      document.getElementById('mapa').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    document.getElementById('criarRotaGpsAtalhoButton').onclick = iniciarGravacaoRotaGps;

    document.getElementById('gravarRotaGpsButton').onclick = iniciarGravacaoRotaGps;
    document.getElementById('pausarRotaGpsButton').onclick = alternarPausaRotaGps;
    document.getElementById('finalizarRotaGpsButton').onclick = finalizarGravacaoRotaGps;
    atualizarBotoesGravacaoRota();

    document.getElementById('editarRotaButton').onclick = () => {
      editandoRota = !editandoRota;
      document.getElementById('editarRotaButton').textContent =
        editandoRota ? '⏹ PARAR DE ADICIONAR PONTOS' : '✏️ CRIAR / EDITAR ROTA';

      mapa.getContainer().style.cursor = editandoRota ? 'crosshair' : '';
      desenharRotaPlanejada();

      ['desfazerRotaButton', 'salvarRotaButton', 'limparRotaButton']
        .forEach((id) => {
          document.getElementById(id).style.display = editandoRota ? 'block' : 'none';
        });
    };

    document.getElementById('desfazerRotaButton').onclick = () => {
      rotaPlanejadaPontos.pop();
      desenharRotaPlanejada();
    };

    document.getElementById('limparRotaButton').onclick = async () => {
      if (!confirm('Apagar toda a rota planejada?')) {
        return;
      }

      const resposta = await fetch(
        '/api/trilhas/' + encodeURIComponent(trilhaId) + '/rota-planejada',
        { method: 'DELETE' }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        alert(dados.error || 'Não foi possível apagar a rota.');
        return;
      }

      rotaPlanejadaPontos = [];
      desenharRotaPlanejada();
      document.getElementById('rotaPlanejadaStatus').textContent =
        'O administrador ainda não criou uma rota para esta trilha.';
    };

    document.getElementById('salvarRotaButton').onclick = async () => {
      if (rotaPlanejadaPontos.length < 2) {
        alert('Adicione pelo menos o ponto de saída e o ponto de chegada.');
        return;
      }

      const resposta = await fetch(
        '/api/trilhas/' + encodeURIComponent(trilhaId) + '/rota-planejada',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: rotaPlanejadaPontos }),
        }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        alert(dados.error || 'Não foi possível salvar a rota.');
        return;
      }

      alert('✅ Rota salva com sucesso.');
      document.getElementById('rotaPlanejadaStatus').textContent =
        `🗺️ Rota planejada salva com ${rotaPlanejadaPontos.length} pontos.`;
    };
  }

  function adicionarPontoPlanejadoNoMapa(evento) {
    if (!editandoRota || !trilha || trilha.role !== 'admin' || !evento?.lngLat) return;
    if (rotaPlanejadaPontos.length >= 500) {
      alert('A rota atingiu o limite de 500 pontos.');
      return;
    }
    rotaPlanejadaPontos.push({
      latitude: evento.lngLat.lat,
      longitude: evento.lngLat.lng,
    });
    desenharRotaPlanejada();
  }


  function valorLocalData(iso) {
    if (!iso) return '';
    const data = new Date(iso);
    const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  async function editarDadosTrilha() {
    if (!trilha || trilha.role !== 'admin') return;

    const name = prompt('Nome da trilha:', trilha.name || '');
    if (name === null) return;

    const startAt = prompt(
      'Início (AAAA-MM-DDTHH:MM):',
      valorLocalData(trilha.startAt)
    );
    if (startAt === null) return;

    const plannedEndAt = prompt(
      'Término previsto (AAAA-MM-DDTHH:MM):',
      valorLocalData(trilha.plannedEndAt)
    );
    if (plannedEndAt === null) return;

    const releaseAt = prompt(
      'Liberação da rota (vazio = imediata):',
      valorLocalData(trilha.releaseAt)
    );
    if (releaseAt === null) return;

    const resposta = await fetch(
      '/api/trilhas/' + encodeURIComponent(trilhaId),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type: trilha.type,
          visibility: trilha.visibility,
          startAt,
          plannedEndAt,
          releaseAt: releaseAt.trim() || null,
          status: trilha.status,
        }),
      }
    );

    const dados = await resposta.json();
    if (!resposta.ok) {
      alert(dados.error || 'Não foi possível editar a trilha.');
      return;
    }

    alert('Trilha atualizada com sucesso.');
    await carregarTrilha();
  }


  /*
   * CARREGAR TRILHA
   */

  async function carregarTrilha() {

    if (!trilhaId) {

      mostrarErro(
        'ID da trilha não foi informado.'
      );

      return;
    }


    try {

      const resposta =
        await fetch(
          '/api/trilhas/' +
          encodeURIComponent(
            trilhaId
          ),
          {
            cache: 'no-store'
          }
        );


      const dados =
        await resposta.json();


      if (!resposta.ok) {
        const recuperada = await carregarTrilhaOfflineComoFallback();
        if (!recuperada) {
          mostrarErro(dados.error || 'Não foi possível abrir esta trilha.');
        }
        return;
      }


      trilha =
        dados.trail;


      document.title =
        trilha.name +
        ' — Trilha 4X4';


      document.getElementById(
        'nomeTrilha'
      ).textContent =
        trilha.name;


      document.getElementById(
        'codigoTrilha'
      ).textContent =
        trilha.code;


      document.getElementById(
        'tipoTrilha'
      ).textContent =
        traduzirTipo(
          trilha.type
        );


      document.getElementById(
        'acessoTrilha'
      ).textContent =
        traduzirAcesso(
          trilha.visibility
        );


      document.getElementById(
        'inicioTrilha'
      ).textContent =
        dataBR(
          trilha.startAt
        );


      document.getElementById(
        'fimTrilha'
      ).textContent =
        dataBR(
          trilha.plannedEndAt
        );


      document.getElementById(
        'segurancaTrilha'
      ).textContent =
        dataBR(
          trilha.safetyEndAt
        );


      document.getElementById(
        'papelTrilha'
      ).textContent =
        trilha.role === 'admin'
          ? 'Administrador'
          : 'Membro';


      mostrarParticipantes(
        trilha.participants
      );

      const adminAcoes = document.getElementById('adminTrilhaAcoes');
      adminAcoes.style.display = trilha.role === 'admin' ? 'flex' : 'none';
      document.getElementById('editarDadosTrilhaButton').onclick = editarDadosTrilha;

      configurarEditorRota();
      carregarRotaPlanejada();
      carregarRota();

      carregarSeguranca();

    } catch (erro) {

      console.error(erro);

      const recuperada = await carregarTrilhaOfflineComoFallback();
      if (!recuperada) {
        mostrarErro('Não foi possível conectar ao servidor.');
      }

    }

  }


  /*
   * PARTICIPANTES
   */

  function mostrarParticipantes(
    participantes
  ) {

    const elemento =
      document.getElementById(
        'participantes'
      );


    if (
      !participantes ||
      participantes.length === 0
    ) {

      elemento.textContent =
        'Nenhum participante encontrado.';

      return;
    }


    elemento.innerHTML =
      participantes
        .map(
          participante => {

            const papel =
              participante.role === 'admin'
                ? 'Administrador'
                : 'Membro';


            return `
              <div class="participante">

                <span>
                  👤
                  ${escaparHTML(
                    participante.name
                  )}
                </span>

                <strong>
                  ${papel}
                </strong>

              </div>
            `;

          }
        )
        .join('');

  }


  async function carregarRota() {
    try {
      const resposta = await fetch(
        '/api/trilhas/' +
        encodeURIComponent(trilhaId) +
        '/rota',
        { cache: 'no-store' }
      );

      if (!resposta.ok) {
        return;
      }

      const dados = await resposta.json();

      (dados.points || []).forEach((ponto) => {
        adicionarPontoRota(ponto);
      });
    } catch (erro) {
      console.warn('Rota ainda não disponível:', erro);
    }
  }


  function adicionarPontoRota(localizacao) {
    if (!mapa || !mapaCarregado || !localizacao || !localizacao.userId) return;
    let coordenadas = trilhasGeoJson.get(localizacao.userId) || [];
    coordenadas.push([localizacao.longitude, localizacao.latitude]);
    if (coordenadas.length > 500) coordenadas = coordenadas.slice(-500);
    trilhasGeoJson.set(localizacao.userId, coordenadas);

    const sourceId = 'trajeto-' + localizacao.userId;
    const layerId = 'trajeto-linha-' + localizacao.userId;
    const data = { type:'Feature', geometry:{ type:'LineString', coordinates:coordenadas } };
    const source = mapa.getSource(sourceId);
    if (source) {
      source.setData(data);
    } else {
      mapa.addSource(sourceId, { type:'geojson', data });
      mapa.addLayer({
        id:layerId, type:'line', source:sourceId,
        paint:{
          'line-color': localizacao.userId === trilha?.creatorId ? '#dc2626' : '#2563eb',
          'line-width':4, 'line-opacity':0.75
        }
      });
    }
    rotasParticipantes.set(localizacao.userId, { sourceId, layerId });
  }


  /*
   * SEGURANÇA CONTRA HTML
   */

  function escaparHTML(texto) {

    return String(texto || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll(
        "'",
        '&#039;'
      );

  }


  function atualizarStatusGps(texto, tipo = '') {
    const status = document.getElementById('gpsStatus');
    if (!status) return;
    status.textContent = texto;
    status.className = 'status' + (tipo ? ' ' + tipo : '');
  }

  function distanciaGpsMetros(a, b) {
    if (!a || !b) return 0;
    const rad = Math.PI / 180;
    const lat1 = a.latitude * rad, lat2 = b.latitude * rad;
    const dLat = (b.latitude - a.latitude) * rad;
    const dLon = (b.longitude - a.longitude) * rad;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function validarPosicaoGps(position, contexto = 'compartilhamento') {
    const coords = position?.coords;
    if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
      return { ok: false, motivo: 'Posição GPS inválida.' };
    }
    const accuracy = Number(coords.accuracy);
    if (!Number.isFinite(accuracy) || accuracy > GPS_MAX_ACCURACY_METERS) {
      return { ok: false, motivo: 'GPS com baixa precisão (' + Math.round(accuracy || 0) + ' m).' };
    }
    const atual = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      timestamp: Number(position.timestamp) || Date.now()
    };
    const ultimaPosicao = contexto === 'rota' ? ultimaPosicaoRotaGpsAceita : ultimaPosicaoGpsAceita;
    if (ultimaPosicao) {
      const dt = Math.max(0.1, (atual.timestamp - ultimaPosicao.timestamp) / 1000);
      const distancia = distanciaGpsMetros(ultimaPosicao, atual);
      const velocidadeCalculada = distancia / dt;
      const velocidadeSensor = Number(coords.speed);
      if (distancia > 100 && velocidadeCalculada > GPS_MAX_SPEED_MPS &&
          (!Number.isFinite(velocidadeSensor) || velocidadeSensor < GPS_MAX_SPEED_MPS)) {
        return { ok: false, motivo: 'Salto de GPS ignorado.' };
      }
    }
    if (contexto === 'rota') ultimaPosicaoRotaGpsAceita = atual;
    else ultimaPosicaoGpsAceita = atual;
    return { ok: true };
  }

  function lerFilaGps() {
    try {
      const fila = JSON.parse(localStorage.getItem(GPS_QUEUE_KEY) || '[]');
      return Array.isArray(fila) ? fila : [];
    } catch (_) {
      return [];
    }
  }

  function salvarFilaGps(fila) {
    try {
      localStorage.setItem(GPS_QUEUE_KEY, JSON.stringify(fila.slice(-500)));
    } catch (erro) {
      console.warn('Não foi possível persistir a fila GPS:', erro);
    }
  }

  function enfileirarGps(payload) {
    const fila = lerFilaGps();
    fila.push({ trilhaId, payload, createdAt: new Date().toISOString() });
    salvarFilaGps(fila);
    atualizarStatusGps('📴 Offline · posição salva no aparelho (' + fila.length + ' pendente' + (fila.length === 1 ? '' : 's') + ').');
  }

  async function sincronizarFilaGps() {
    if (!navigator.onLine) return;
    const fila = lerFilaGps();
    if (!fila.length) return;
    atualizarStatusGps('🔄 Sincronizando ' + fila.length + ' posição' + (fila.length === 1 ? '' : 'ões') + '…');
    const restantes = [];
    for (const item of fila) {
      try {
        const resposta = await fetch('/api/trilhas/' + encodeURIComponent(item.trilhaId) + '/localizacao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        });
        if (!resposta.ok) restantes.push(item);
      } catch (_) {
        restantes.push(item);
      }
    }
    salvarFilaGps(restantes);
    atualizarStatusGps(restantes.length
      ? '📴 Ainda há ' + restantes.length + ' posição' + (restantes.length === 1 ? '' : 'ões') + ' aguardando conexão.'
      : '✅ GPS sincronizado.', restantes.length ? '' : 'ativo');
  }

  window.addEventListener('online', () => {
    atualizarStatusGps('🌐 Internet voltou · sincronizando GPS…');
    sincronizarFilaGps();
  });
  window.addEventListener('offline', () => {
    atualizarStatusGps('📴 Sem internet · o GPS continuará sendo registrado no aparelho.');
  });

  /*
   * INICIAR MODO TRILHA
   */

  function iniciarModoTrilha() {

    if (!navigator.geolocation) {

      mostrarErro(
        'Este dispositivo não oferece GPS pelo navegador.'
      );

      return;
    }


    modoTrilhaAtivo =
      true;
    ultimaPosicaoGpsAceita = null;
    sincronizarFilaGps();


    const botao =
      document.getElementById(
        'modoTrilhaButton'
      );


    botao.textContent =
      '⏹ ENCERRAR MODO TRILHA';


    botao.classList.add(
      'ativo'
    );


    const status =
      document.getElementById(
        'modoStatus'
      );


    status.className =
      'status ativo';


    status.textContent =
      'Modo Trilha ativo. Sua localização está sendo compartilhada apenas com os participantes desta trilha.';


    obterLocalizacao(false);


    watchId =
      navigator.geolocation.watchPosition(
        enviarLocalizacao,

        erroGPS,

        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 15000
        }
      );


    conectarTempoReal();

  }


  /*
   * ENCERRAR MODO TRILHA
   */

  async function encerrarModoTrilha() {

    modoTrilhaAtivo =
      false;


    if (watchId !== null) {

      navigator.geolocation.clearWatch(
        watchId
      );

      watchId = null;

    }


    if (conexaoTempoReal) {

      conexaoTempoReal.close();

      conexaoTempoReal =
        null;

    }


    try {

      await fetch(
        '/api/trilhas/' +
        encodeURIComponent(
          trilhaId
        ) +
        '/localizacao',
        {
          method: 'DELETE'
        }
      );

    } catch (erro) {

      console.error(erro);

    }


    const botao =
      document.getElementById(
        'modoTrilhaButton'
      );


    botao.textContent =
      '▶ ATIVAR MODO TRILHA';


    botao.classList.remove(
      'ativo'
    );


    const status =
      document.getElementById(
        'modoStatus'
      );


    status.className =
      'status';


    status.textContent =
      'Modo Trilha encerrado. Sua localização deixou de ser compartilhada.';

  }


  /*
   * OBTER GPS
   */

  function obterLocalizacao(
    centralizar
  ) {

    navigator.geolocation.getCurrentPosition(

      position => {

        atualizarMapaUsuario(
          position
        );


        if (
          centralizar &&
          mapa
        ) {

          mapa.easeTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 16 });

        }


        if (
          modoTrilhaAtivo
        ) {

          enviarLocalizacao(
            position
          );

        }

      },

      erroGPS,

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      }

    );

  }


  /*
   * ATUALIZAR MINHA POSIÇÃO
   */

  function atualizarMapaUsuario(position) {
    if (!mapa) return;
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const precisao = position.coords.accuracy;

    if (!marcadorUsuario) {
      const el = document.createElement('div');
      el.className = 'meu-veiculo-mapa';
      marcadorUsuario = new maplibregl.Marker({ element: el })
        .setLngLat([longitude, latitude])
        .setPopup(new maplibregl.Popup({ offset: 22 }).setText('📍 Você está aqui'))
        .addTo(mapa);
    } else {
      marcadorUsuario.setLngLat([longitude, latitude]);
    }

    // Em Modo Trilha ou durante a gravação de uma rota, o mapa acompanha
    // continuamente o veículo. A rota permanece desenhada como referência.
    if ((modoTrilhaAtivo || gravandoRotaGps) && mapaCarregado) {
      const agora = Date.now();
      if (agora - ultimaCentralizacaoGps >= 800) {
        ultimaCentralizacaoGps = agora;
        const zoomAtual = mapa.getZoom();
        const opcoes = {
          center: [longitude, latitude],
          zoom: Math.max(zoomAtual, 16),
          duration: 650,
          essential: true
        };
        const heading = Number(position.coords.heading);
        if (Number.isFinite(heading) && heading >= 0 && position.coords.speed > 1) {
          opcoes.bearing = heading;
        }
        mapa.easeTo(opcoes);
      }
    }

    if (mapaCarregado) {
      const sourceId='precisao-usuario', layerId='precisao-usuario-circulo';
      const data={type:'Feature',properties:{},geometry:{type:'Point',coordinates:[longitude,latitude]}};
      const src=mapa.getSource(sourceId);
      if(src) src.setData(data);
      else {
        mapa.addSource(sourceId,{type:'geojson',data});
        mapa.addLayer({id:layerId,type:'circle',source:sourceId,paint:{
          'circle-radius': Math.max(8, Math.min(45, precisao / 2)),
          'circle-color':'#22c55e','circle-opacity':0.12,
          'circle-stroke-color':'#22c55e','circle-stroke-opacity':0.45,'circle-stroke-width':2
        }});
      }
    }
  }


  /*
   * ENVIAR LOCALIZAÇÃO
   */

  async function enviarLocalizacao(
    position
  ) {

    if (!modoTrilhaAtivo) {
      return;
    }

    const validacao = validarPosicaoGps(position);
    if (!validacao.ok) {
      atualizarStatusGps('⚠️ ' + validacao.motivo);
      return;
    }

    atualizarStatusGps(
      (navigator.onLine ? '📡 GPS ativo' : '📴 GPS ativo sem internet') +
      ' · precisão ' + Math.round(position.coords.accuracy) + ' m',
      navigator.onLine ? 'ativo' : ''
    );

    atualizarMapaUsuario(
      position
    );

    const payloadGps = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: Number(position.timestamp) || Date.now()
    };
    ultimoEnvioGpsEm = Date.now();

    if (!navigator.onLine) {
      enfileirarGps(payloadGps);
      return;
    }

    try {

      const respostaGps = await fetch(
        '/api/trilhas/' +
        encodeURIComponent(
          trilhaId
        ) +
        '/localizacao',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify(payloadGps)
        }
      );

      if (!respostaGps.ok) {
        throw new Error('HTTP ' + respostaGps.status);
      }
      sincronizarFilaGps();

    } catch (erro) {

      console.error(
        'Erro ao enviar localização:',
        erro
      );
      enfileirarGps(payloadGps);

    }

  }


  /*
   * TEMPO REAL
   */

  function conectarTempoReal() {

    if (conexaoTempoReal) {

      conexaoTempoReal.close();

    }


    conexaoTempoReal =
      new EventSource(
        '/api/trilhas/' +
        encodeURIComponent(
          trilhaId
        ) +
        '/localizacoes'
      );


    conexaoTempoReal
      .addEventListener(
        'estado',
        evento => {

          const localizacoes =
            JSON.parse(
              evento.data
            );


          localizacoes.forEach(
            mostrarParticipanteMapa
          );

        }
      );


    conexaoTempoReal
      .addEventListener(
        'localizacao',
        evento => {

          mostrarParticipanteMapa(
            JSON.parse(
              evento.data
            )
          );

        }
      );


    conexaoTempoReal
      .addEventListener(
        'localizacao_removida',
        evento => {

          const dados =
            JSON.parse(
              evento.data
            );


          removerParticipanteMapa(
            dados.userId
          );

        }
      );


    conexaoTempoReal
      .addEventListener(
        'sos',
        evento => {

          mostrarAlertaSOS(
            JSON.parse(
              evento.data
            )
          );

        }
      );

    conexaoTempoReal
      .addEventListener(
        'rota_atualizada',
        async () => {
          if (!editandoRota && !gravandoRotaGps) {
            await carregarRotaPlanejada();
          }
        }
      );


    conexaoTempoReal.onerror =
      () => {

        console.warn(
          'Conexão em tempo real indisponível.'
        );

      };

  }


  /*
   * MOSTRAR PARTICIPANTE NO MAPA
   */

  function mostrarParticipanteMapa(localizacao) {
    if (!mapa || !localizacao || !localizacao.userId) return;
    adicionarPontoRota(localizacao);
    let marcador = marcadoresParticipantes.get(localizacao.userId);
    if (!marcador) {
      const el=document.createElement('div');
      el.className='participante-mapa';
      marcador=new maplibregl.Marker({element:el})
        .setLngLat([localizacao.longitude,localizacao.latitude])
        .setPopup(new maplibregl.Popup({offset:18}).setText('👤 '+(localizacao.name||'Participante')))
        .addTo(mapa);
      marcadoresParticipantes.set(localizacao.userId,marcador);
    } else {
      marcador.setLngLat([localizacao.longitude,localizacao.latitude]);
    }
  }


  /*
   * REMOVER PARTICIPANTE
   */

  function removerParticipanteMapa(
    userId
  ) {

    const marcador =
      marcadoresParticipantes.get(
        userId
      );


    if (marcador) {

      marcador.remove();

      marcadoresParticipantes.delete(
        userId
      );

    }

  }


  /*
   * ERRO GPS
   */

  function erroGPS(error) {

    console.error(
      'GPS:',
      error
    );


    const mensagens = {
      1: 'Permissão de localização negada.',
      2: 'Sinal de GPS indisponível.',
      3: 'GPS demorou para responder.'
    };
    atualizarStatusGps('⚠️ ' + (mensagens[error?.code] || 'Não foi possível obter a localização.'));
    mostrarErro(
      (mensagens[error?.code] || 'Não foi possível obter sua localização.') +
      ' Verifique a permissão e o sinal de GPS.'
    );

  }


  /*
   * INICIALIZAÇÃO
   */

  iniciarMapa();

  carregarTrilha();
