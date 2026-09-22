/* Criação, listagem, entrada e administração de Trilhas — Trilha 4X4 */

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
              groupId: grupoPrefill || null,
              outingId: rolePrefill || null,
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

        if (dados.trail?.id) {
          window.location.href =
            '/criar-rota.html?id=' +
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

  const trilha = (window.__trilhasCarregadas || []).find(
    (item) => String(item.id) === String(trilhaId)
  );

  const overlayLista = document.getElementById('listaTrilhasOverlay');
  if (overlayLista) overlayLista.style.display = 'none';

  const overlay = document.createElement('div');
  overlay.id = 'trilhaSelecionadaOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;
    align-items:center;justify-content:center;z-index:100000;padding:20px;box-sizing:border-box;
  `;

  const nome = escaparTextoTrilha(trilha?.name || 'Trilha selecionada');
  const codigo = escaparTextoTrilha(trilha?.code || '');

  overlay.innerHTML = `
    <div style="width:min(560px,100%);background:#101612;color:#f5f7f5;border:1px solid rgba(255,255,255,.11);border-radius:20px;padding:22px;box-sizing:border-box;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div>
          <small style="color:#9da79f;">TRILHA SELECIONADA</small>
          <h2 style="margin:5px 0 0;">🛣️ ${nome}</h2>
          ${codigo ? `<div style="margin-top:5px;color:#9da79f;">${codigo}</div>` : ''}
        </div>
        <button type="button" id="fecharTrilhaSelecionada" aria-label="Fechar" style="border:0;background:#252e27;color:#fff;border-radius:10px;padding:8px 12px;font-size:18px;cursor:pointer;">✕</button>
      </div>

      ${trilha && trilha.role === 'admin' ? `<button type="button" id="abrirCriarRotaTrilha" style="width:100%;margin-top:22px;padding:20px;text-align:left;border:1px solid rgba(255,166,43,.45);border-radius:16px;background:#2a1d0d;color:#fff;cursor:pointer;"><strong style="display:block;font-size:19px;">🛣️ Criar rota</strong><span style="display:block;margin-top:7px;color:#d7c6ad;line-height:1.45;">Abrir o mapa exclusivo para gravar o percurso pelo GPS →</span></button>` : ''}
      <button type="button" id="abrirNavegacaoTrilha" style="width:100%;margin-top:12px;padding:20px;text-align:left;border:1px solid rgba(105,211,55,.35);border-radius:16px;background:#17231a;color:#fff;cursor:pointer;">
        <strong style="display:block;font-size:19px;">🧭 Navegação</strong>
        <span style="display:block;margin-top:7px;color:#b7c0b9;line-height:1.45;">Abrir mapa, rota da trilha, GPS e localização dos participantes →</span>
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  const fechar = () => {
    overlay.remove();
    if (overlayLista) overlayLista.style.display = '';
  };

  document.getElementById('fecharTrilhaSelecionada').addEventListener('click', fechar);
  document.getElementById('abrirCriarRotaTrilha')?.addEventListener('click', () => {
    window.location.href = '/criar-rota.html?id=' + encodeURIComponent(trilhaId);
  });
  document.getElementById('abrirNavegacaoTrilha').addEventListener('click', () => {
    window.location.href = '/trilha.html?id=' + encodeURIComponent(trilhaId);
  });
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

    window.__trilhasCarregadas = trilhas;

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