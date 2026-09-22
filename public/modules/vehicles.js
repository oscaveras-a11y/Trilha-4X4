/* Módulo de veículos (Meu 4x4) — Trilha 4X4 */

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

