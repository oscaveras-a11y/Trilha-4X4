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

  const OFFLINE_DB = 'trilha4x4-offline';
  const OFFLINE_STORE = 'percursos';
  const OFFLINE_VERSION = 2;

  function abrirBancoOffline() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB indisponível'));
      const req = indexedDB.open(OFFLINE_DB, OFFLINE_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
          db.createObjectStore(OFFLINE_STORE, { keyPath: 'trilhaId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function lerPercursoOffline() {
    const db = await abrirBancoOffline();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readonly');
      const req = tx.objectStore(OFFLINE_STORE).get(String(trilhaId));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function salvarPercursoOffline() {
    if (!trilha || rotaPlanejadaPontos.length < 2) {
      alert('Esta trilha ainda não possui uma rota disponível para baixar.');
      return;
    }
    const pontosOffline = rotaPlanejadaPontos.slice(0, 500).map((ponto) => ({
      latitude: Number(ponto.latitude),
      longitude: Number(ponto.longitude),
    }));
    const latitudes = pontosOffline.map((p) => p.latitude);
    const longitudes = pontosOffline.map((p) => p.longitude);
    const pacote = {
      schemaVersion: OFFLINE_VERSION,
      trilhaId: String(trilhaId),
      salvoEm: new Date().toISOString(),
      trilha: {
        id: trilha.id, name: trilha.name, code: trilha.code, type: trilha.type,
        visibility: trilha.visibility, startAt: trilha.startAt,
        plannedEndAt: trilha.plannedEndAt, safetyEndAt: trilha.safetyEndAt,
        role: trilha.role,
        participants: Array.isArray(trilha.participants) ? trilha.participants : [],
      },
      points: pontosOffline,
      mapArea: {
        minLatitude: Math.min(...latitudes),
        maxLatitude: Math.max(...latitudes),
        minLongitude: Math.min(...longitudes),
        maxLongitude: Math.max(...longitudes),
        paddingKm: 2,
      },
      mapPackage: {
        ready: false,
        provider: null,
        reason: 'Aguardando pacote de mapa próprio/MBTiles para uso offline.',
      },
    };
    if (navigator.storage?.persist) {
      try { await navigator.storage.persist(); } catch {}
    }
    const db = await abrirBancoOffline();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).put(pacote);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await atualizarStatusOffline();
  }

  async function excluirPercursoOffline() {
    if (!confirm('Excluir o percurso offline deste dispositivo?')) return;
    const db = await abrirBancoOffline();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).delete(String(trilhaId));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await atualizarStatusOffline();
  }

  async function atualizarStatusOffline() {
    const status = document.getElementById('offlineStatus');
    const excluir = document.getElementById('excluirOfflineButton');
    const baixar = document.getElementById('baixarOfflineButton');
    try {
      const pacote = await lerPercursoOffline();
      if (!pacote) {
        status.textContent = '📱 Percurso ainda não salvo neste dispositivo.';
        excluir.style.display = 'none';
        baixar.textContent = '⬇️ BAIXAR PERCURSO OFFLINE';
        return;
      }
      const quando = new Date(pacote.salvoEm).toLocaleString('pt-BR');
      const participantes = Array.isArray(pacote.trilha?.participants) ? pacote.trilha.participants.length : 0;
      const mapaPronto = pacote.mapPackage?.ready === true;
      status.textContent = (mapaPronto ? '✅' : '🟡') +
        ' Dados offline: rota com ' + pacote.points.length + ' pontos + ' +
        participantes + ' participante(s) · atualizado em ' + quando +
        (mapaPronto
          ? ' · mapa offline disponível.'
          : ' · mapa-base ainda requer pacote próprio/MBTiles; a rota e os dados continuam disponíveis sem internet.');
      excluir.style.display = '';
      baixar.textContent = '↻ ATUALIZAR PERCURSO OFFLINE';
    } catch (erro) {
      console.warn('Armazenamento offline indisponível:', erro);
      status.textContent = '⚠️ Este navegador não disponibilizou armazenamento persistente para o percurso.';
    }
  }

  async function carregarPercursoOfflineComoFallback() {
    try {
      const pacote = await lerPercursoOffline();
      if (!pacote || !Array.isArray(pacote.points) || pacote.points.length < 2) return false;
      rotaPlanejadaPontos = pacote.points.slice(0, 500);
      desenharRotaPlanejada();
      const status = document.getElementById('rotaPlanejadaStatus');
      if (status) status.textContent = '📴 Sem internet · usando percurso salvo neste dispositivo.';
      return true;
    } catch {
      return false;
    }
  }

  async function carregarTrilhaOfflineComoFallback() {
    try {
      const pacote = await lerPercursoOffline();
      if (!pacote?.trilha) return false;
      trilha = pacote.trilha;
      document.title = trilha.name + ' — Trilha 4X4';
      document.getElementById('nomeTrilha').textContent = trilha.name || 'Trilha offline';
      document.getElementById('codigoTrilha').textContent = trilha.code || '—';
      document.getElementById('tipoTrilha').textContent = traduzirTipo(trilha.type);
      document.getElementById('acessoTrilha').textContent = traduzirAcesso(trilha.visibility);
      document.getElementById('inicioTrilha').textContent = dataBR(trilha.startAt);
      document.getElementById('fimTrilha').textContent = dataBR(trilha.plannedEndAt);
      document.getElementById('segurancaTrilha').textContent = dataBR(trilha.safetyEndAt);
      document.getElementById('papelTrilha').textContent =
        trilha.role === 'admin' ? 'Administrador (offline)' : 'Membro (offline)';
      mostrarParticipantes(trilha.participants || []);
      const adminAcoes = document.getElementById('adminTrilhaAcoes');
      if (adminAcoes) adminAcoes.style.display = 'none';
      await carregarPercursoOfflineComoFallback();
      return true;
    } catch (erro) {
      console.warn('Dados offline da trilha indisponíveis:', erro);
      return false;
    }
  }

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

    if (coordenadas.length >= 2 && !editandoRota) centralizarRotaPlanejada();
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

    atualizarMapaUsuario(position);

    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const ultimo = rotaPlanejadaPontos[rotaPlanejadaPontos.length - 1];

    if (ultimo) {
      const distancia = mapa.distance(
        [ultimo.latitude, ultimo.longitude],
        [latitude, longitude]
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


    atualizarMapaUsuario(
      position
    );


    try {

      await fetch(
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

          body:
            JSON.stringify({

              latitude:
                position.coords.latitude,

              longitude:
                position.coords.longitude,

              accuracy:
                position.coords.accuracy

            })
        }
      );

    } catch (erro) {

      console.error(
        'Erro ao enviar localização:',
        erro
      );

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


    mostrarErro(
      'Não foi possível obter sua localização. Verifique a permissão de GPS do navegador.'
    );

  }


  /*
   * SOS
   */

  async function ativarSOS() {

    if (!modoTrilhaAtivo) {

      alert(
        'Ative o Modo Trilha antes de usar o SOS.'
      );

      return;
    }


    const confirmar =
      confirm(
        '🆘 ATIVAR SOS?\\n\\nSua localização será enviada aos participantes desta trilha.'
      );


    if (!confirmar) {
      return;
    }


    navigator.geolocation.getCurrentPosition(

      async position => {

        try {

          const resposta =
            await fetch(
              '/api/trilhas/' +
              encodeURIComponent(
                trilhaId
              ) +
              '/sos',
              {
                method: 'POST',

                headers: {
                  'Content-Type':
                    'application/json'
                },

                body:
                  JSON.stringify({

                    latitude:
                      position.coords.latitude,

                    longitude:
                      position.coords.longitude,

                    accuracy:
                      position.coords.accuracy,

                    motivo:
                      'Preciso de ajuda'

                  })
              }
            );


          const dados =
            await resposta.json();


          if (!resposta.ok) {

            alert(
              dados.error ||
              'Não foi possível ativar o SOS.'
            );

            return;
          }


          meuSosId =
            dados.alert.id;


          const status =
            document.getElementById(
              'sosStatus'
            );


          status.style.display =
            'block';


          status.textContent =
            '🚨 SOS ATIVO. Os participantes desta trilha foram alertados.';


          const botao =
            document.getElementById(
              'sosButton'
            );


          botao.textContent =
            '🛑 ENCERRAR MEU SOS';

        } catch (erro) {

          console.error(erro);

          alert(
            'Não foi possível conectar ao servidor.'
          );

        }

      },

      () => {

        alert(
          'Não foi possível obter sua localização para o SOS.'
        );

      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }

    );

  }


  /*
   * ENCERRAR SOS
   */

  async function encerrarSOS() {

    if (!meuSosId) {
      return;
    }


    try {

      const resposta =
        await fetch(
          '/api/trilhas/' +
          encodeURIComponent(
            trilhaId
          ) +
          '/sos/' +
          encodeURIComponent(
            meuSosId
          ),
          {
            method: 'DELETE'
          }
        );


      if (!resposta.ok) {

        const dados =
          await resposta.json();

        alert(
          dados.error ||
          'Não foi possível encerrar o SOS.'
        );

        return;
      }


      meuSosId =
        null;


      document.getElementById(
        'sosStatus'
      ).style.display =
        'none';


      document.getElementById(
        'sosButton'
      ).textContent =
        '🆘 PRECISO DE AJUDA';

    } catch (erro) {

      console.error(erro);

      alert(
        'Não foi possível conectar ao servidor.'
      );

    }

  }


  /*
   * MOSTRAR SOS
   */

  function mostrarAlertaSOS(
    alerta
  ) {

    const status =
      document.getElementById(
        'sosStatus'
      );


    status.style.display =
      'block';


    status.textContent =
      '🚨 SOS ATIVO: ' +
      (
        alerta.userName ||
        'Participante'
      ) +
      ' precisa de ajuda.';

  }


  /*
   * INICIALIZAÇÃO
   */

  iniciarMapa();

  carregarTrilha();
