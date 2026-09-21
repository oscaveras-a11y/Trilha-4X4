'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DB = path.join(ROOT, 'data', 'e2e-10-users.db');
const PORT = 3199;
const BASE = 'http://127.0.0.1:' + PORT;
const PASSWORD = 'Teste4x4!2026';

for (const suffix of ['', '-wal', '-shm']) {
  try { fs.unlinkSync(DB + suffix); } catch {}
}

const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), TRILHA4X4_DB_PATH: DB, OPENAI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', d => process.stdout.write('[server] ' + d));
server.stderr.on('data', d => process.stderr.write('[server] ' + d));

function client(label) {
  let cookie = '';
  async function request(method, url, body, expected) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + url, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (expected !== undefined) assert.equal(res.status, expected, label + ' ' + method + ' ' + url + ': ' + JSON.stringify(data));
    return { status: res.status, data };
  }
  return { label, request };
}

async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/health');
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Servidor de teste não iniciou.');
}

async function register(c, index) {
  const email = 'e2e10-' + Date.now() + '-' + index + '@example.test';
  const r = await c.request('POST', '/api/auth/register', {
    name: 'Piloto Teste ' + index, email, password: PASSWORD, termsAccepted: true,
  }, 201);
  c.user = r.data.user;
  const v = await c.request('POST', '/api/veiculos', {
    type: '4x4', brand: index % 2 ? 'Jeep' : 'Chevrolet', model: 'Teste ' + index,
    year: 2020 + (index % 6), color: 'Teste', plate: '', notes: 'E2E isolado',
  }, 201);
  c.vehicle = v.data.vehicle;
}

async function setupScenario(name, users, offset) {
  const admin = users[0];
  const groupRes = await admin.request('POST', '/api/grupos', { name: 'Grupo E2E ' + name }, 201);
  const groupId = groupRes.data.group.id;
  const inviteRes = await admin.request('POST', '/api/grupos/' + groupId + '/convite', {}, 201);
  const code = inviteRes.data.code;

  for (const member of users.slice(1)) {
    await member.request('POST', '/api/grupos/entrar', { code }, 200);
  }

  const detail = await admin.request('GET', '/api/grupos/' + groupId, undefined, 200);
  assert.equal(detail.data.group.members.length, 5, name + ': grupo deve ter 5 membros');

  const startsAt = new Date(Date.now() + (offset + 2) * 3600000).toISOString();
  const outingRes = await admin.request('POST', '/api/grupos/' + groupId + '/roles', {
    title: 'Passeio ' + name, description: 'Teste E2E com cinco contas',
    meetingPoint: 'Ponto ' + name, startsAt,
  }, 201);
  const outingId = outingRes.data.outing.id;

  for (const member of users.slice(1)) {
    await member.request('POST', '/api/grupos/' + groupId + '/roles/' + outingId + '/resposta', { response: 'going' }, 200);
  }
  await admin.request('POST', '/api/grupos/' + groupId + '/roles/' + outingId + '/status', { status: 'confirmed' }, 200);

  const trailRes = await admin.request('POST', '/api/trilhas', {
    name: 'Trilha E2E ' + name, type: 'passeio', visibility: 'convite',
    startAt: startsAt,
    plannedEndAt: new Date(new Date(startsAt).getTime() + 3 * 3600000).toISOString(),
    releaseAt: startsAt, groupId, outingId,
  }, 201);
  const trailId = trailRes.data.trail.id;

  const linked = await admin.request('GET', '/api/grupos/' + groupId, undefined, 200);
  assert.equal(linked.data.group.outings.find(o => o.id === outingId).trailId, trailId, name + ': passeio deve estar vinculado');
  assert.ok(linked.data.group.trails.some(t => t.id === trailId), name + ': trilha deve aparecer no grupo');

  for (const member of users.slice(1)) {
    await member.request('POST', '/api/grupos/' + groupId + '/roles/' + outingId + '/entrar-trilha', {
      vehicleId: member.vehicle.id,
    }, 201);
  }

  // Repetir solicitação não pode criar duplicata.
  const duplicate = await users[1].request('POST', '/api/grupos/' + groupId + '/roles/' + outingId + '/entrar-trilha', {
    vehicleId: users[1].vehicle.id,
  }, 200);
  assert.equal(duplicate.data.pending, true, name + ': segunda solicitação deve reutilizar pendência');

  const requests = await admin.request('GET', '/api/trilhas/' + trailId + '/solicitacoes', undefined, 200);
  const pending = requests.data.requests.filter(r => r.status === 'pending');
  assert.equal(pending.length, 4, name + ': deve haver 4 solicitações pendentes');

  // Membro comum não pode aprovar.
  await users[1].request('POST', '/api/trilhas/' + trailId + '/solicitacoes/' + pending[0].id, { action: 'aceitar' }, 403);

  for (const req of pending) {
    await admin.request('POST', '/api/trilhas/' + trailId + '/solicitacoes/' + req.id, { action: 'aceitar' }, 200);
  }

  for (const member of users) {
    const t = await member.request('GET', '/api/trilhas/' + trailId, undefined, 200);
    assert.equal(t.data.trail.participantCount, 5, name + ': trilha deve ter 5 participantes');
  }

  return { name, groupId, outingId, trailId, admin, users };
}

(async () => {
  try {
    await waitServer();
    const users = Array.from({ length: 10 }, (_, i) => client('U' + (i + 1)));
    for (let i = 0; i < users.length; i++) await register(users[i], i + 1);

    const A = await setupScenario('A', users.slice(0, 5), 0);
    const B = await setupScenario('B', users.slice(5, 10), 5);

    // Isolamento entre grupos e trilhas.
    await A.users[1].request('GET', '/api/grupos/' + B.groupId, undefined, 403);
    await A.users[1].request('GET', '/api/trilhas/' + B.trailId, undefined, 403);
    await B.users[1].request('GET', '/api/grupos/' + A.groupId, undefined, 403);
    await B.users[1].request('GET', '/api/trilhas/' + A.trailId, undefined, 403);

    const listA = await A.users[2].request('GET', '/api/trilhas', undefined, 200);
    assert.ok(listA.data.trails.some(t => t.id === A.trailId), 'Usuário A deve ver Trilha A');
    assert.ok(!listA.data.trails.some(t => t.id === B.trailId), 'Usuário A não deve listar Trilha B');

    const listB = await B.users[2].request('GET', '/api/trilhas', undefined, 200);
    assert.ok(listB.data.trails.some(t => t.id === B.trailId), 'Usuário B deve ver Trilha B');
    assert.ok(!listB.data.trails.some(t => t.id === A.trailId), 'Usuário B não deve listar Trilha A');

    console.log('\n✅ E2E 10 CONTAS APROVADO');
    console.log('Grupo A: 5 contas / Trilha A: 5 participantes');
    console.log('Grupo B: 5 contas / Trilha B: 5 participantes');
    console.log('Convites, RSVP, confirmação, vínculo, veículos, solicitações, aprovações e isolamento validados.');
  } catch (err) {
    console.error('\n❌ E2E 10 CONTAS FALHOU');
    console.error(err);
    process.exitCode = 1;
  } finally {
    server.kill('SIGTERM');
    setTimeout(() => {
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(DB + suffix); } catch {}
      }
    }, 200);
  }
})();