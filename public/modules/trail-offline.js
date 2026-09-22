/* Armazenamento offline da trilha — Trilha 4X4 */

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
