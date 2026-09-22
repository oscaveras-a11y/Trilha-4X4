/* Módulo de Grupos — Trilha 4X4 */

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

    let chatGrupoEventos = null;

    async function atualizarChatGrupo() {
      const caixa = document.getElementById('mensagensGrupo');
      if (!caixa || !document.body.contains(caixa)) {
        if (chatGrupoEventos) {
          chatGrupoEventos.close();
          chatGrupoEventos = null;
        }
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

        const estavaPertoDoFim =
          caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 100;
        caixa.innerHTML = (dadosChat.messages || []).map((m) =>
          '<div style="margin-bottom:10px;"><strong>' +
          escaparTextoTrilha(m.userName) + '</strong> <small>' +
          new Date(m.createdAt).toLocaleString('pt-BR') + '</small><br>' +
          escaparTextoTrilha(m.message) + '</div>'
        ).join('') || '<p>A conversa ainda está vazia. Mande a primeira mensagem.</p>';
        if (estavaPertoDoFim) {
          caixa.scrollTop = caixa.scrollHeight;
        }
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
    if (typeof EventSource !== 'undefined') {
      chatGrupoEventos = new EventSource('/api/grupos/' + encodeURIComponent(groupId) + '/eventos');
      chatGrupoEventos.addEventListener('mensagem', atualizarChatGrupo);
      chatGrupoEventos.addEventListener('grupo_atualizado', async () => {
        if (!document.getElementById('detalhesGrupo')) {
          chatGrupoEventos?.close();
          return;
        }
        chatGrupoEventos?.close();
        chatGrupoEventos = null;
        await abrirDetalhesGrupo(groupId);
      });
      chatGrupoEventos.onerror = () => {
        // EventSource tenta reconectar automaticamente.
      };
    }

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
  const destino = document.getElementById('conteudoModulo');
  if (!destino) return;

  destino.innerHTML = '<div class="module-loading">Carregando seus grupos...</div>';

  try {
    const resposta = await fetch('/api/grupos', { cache: 'no-store' });
    const dados = await resposta.json();

    if (resposta.status === 401) {
      destino.innerHTML = '<div class="module-empty"><h2>👥 Grupos</h2><p>Entre na sua conta para ver, criar ou participar de grupos.</p><button type="button" id="loginGrupos">Entrar</button></div>';
      document.getElementById('loginGrupos')?.addEventListener('click', () => { window.location.href = '/auth.html'; });
      return;
    }
    if (!resposta.ok) throw new Error(dados.error || 'Não foi possível carregar os grupos.');

    const grupos = Array.isArray(dados.groups) ? dados.groups : [];
    destino.innerHTML = `
      <section class="groups-page">
        <div class="groups-actions">
          <div><h2>👥 Meus grupos</h2><p>Organize seus amigos, rolês e trilhas.</p></div>
          <button type="button" id="mostrarCriarGrupo">＋ Criar grupo</button>
        </div>

        <div id="formCriarGrupo" class="groups-inline-form" hidden>
          <input id="nomeNovoGrupo" maxlength="80" placeholder="Nome do grupo">
          <button id="criarNovoGrupo" type="button">Criar</button>
        </div>

        <div class="groups-join">
          <h3>Entrar com convite</h3>
          <div class="groups-inline-form">
            <input id="codigoConviteGrupo" placeholder="Código G4X4-..." autocomplete="off">
            <button id="entrarGrupoCodigo" type="button">Entrar</button>
          </div>
        </div>

        <div class="groups-list">
          ${grupos.length ? grupos.map((grupo) => `
            <article class="group-card">
              <div>
                <strong>${escaparTextoTrilha(grupo.name)}</strong>
                <small>${Number(grupo.memberCount) || 0} participante(s) · ${grupo.role === 'admin' ? 'Administrador' : 'Membro'}</small>
              </div>
              <div class="group-card-actions">
                <button type="button" data-open-group="${escaparTextoTrilha(grupo.id)}">Abrir grupo →</button>
                ${grupo.role === 'admin' ? `<button type="button" data-edit-group="${escaparTextoTrilha(grupo.id)}" data-group-name="${encodeURIComponent(grupo.name)}">✏️ Editar</button>` : ''}
              </div>
            </article>
          `).join('') : '<div class="module-empty"><p>Você ainda não participa de nenhum grupo.</p><small>Crie um grupo ou use um código de convite para começar.</small></div>'}
        </div>
      </section>
    `;

    document.getElementById('mostrarCriarGrupo')?.addEventListener('click', () => {
      const form = document.getElementById('formCriarGrupo');
      if (form) form.hidden = !form.hidden;
    });

    destino.querySelectorAll('[data-open-group]').forEach((botao) => {
      botao.addEventListener('click', () => abrirDetalhesGrupo(botao.dataset.openGroup));
    });
    destino.querySelectorAll('[data-edit-group]').forEach((botao) => {
      botao.addEventListener('click', () => editarGrupo(botao.dataset.editGroup, decodeURIComponent(botao.dataset.groupName || '')));
    });

    document.getElementById('entrarGrupoCodigo')?.addEventListener('click', async () => {
      const input = document.getElementById('codigoConviteGrupo');
      const code = input?.value.trim().toUpperCase();
      if (!code) return alert('Informe o código de convite.');
      const entrar = await fetch('/api/grupos/entrar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code })
      });
      const resultado = await entrar.json();
      if (!entrar.ok) return alert(resultado.error || 'Não foi possível entrar no grupo.');
      abrirDetalhesGrupo(resultado.group.id);
    });

    document.getElementById('criarNovoGrupo')?.addEventListener('click', async () => {
      const input = document.getElementById('nomeNovoGrupo');
      const name = input?.value.trim();
      if (!name) return alert('Informe o nome do grupo.');
      const criar = await fetch('/api/grupos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
      });
      const resultado = await criar.json();
      if (!criar.ok) return alert(resultado.error || 'Não foi possível criar o grupo.');
      await abrirGrupos();
    });
  } catch (error) {
    console.error('Erro ao carregar grupos:', error);
    destino.innerHTML = `<div class="module-empty"><h2>Não foi possível carregar os grupos</h2><p>${escaparHtml(error.message || 'Erro de conexão.')}</p><button type="button" id="tentarGruposNovamente">Tentar novamente</button></div>`;
    document.getElementById('tentarGruposNovamente')?.addEventListener('click', abrirGrupos);
  }
}

