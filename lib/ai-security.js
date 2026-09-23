'use strict';

const SCOPE = /\b(4x4|off[ -]?road|trilha|rota|gps|navega|ve[ií]culo|carro|motor|c[aâ]mbio|diferencial|pneu|guincho|atol|recupera|sos|seguran[cç]a|mec[aâ]nic|prepara|suspens|jeep|s10|troller|suzuki|toyota|mitsubishi|ford|chevrolet|app|grupo|passeio)\b/i;
const SECRET_WORDS = /\b(senha|password|passwd|token|cookie|api[ _-]?key|chave[ _-]?de[ _-]?api|authorization|bearer|client[ _-]?secret|private[ _-]?key|credencial)\b/i;
const SECRET_VALUES = /(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9]{20,}|bearer\s+[a-z0-9._~+\/-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s]{8,}|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})/i;
const INJECTION = /(ignore|ignorar|desconsidere|esque[cç]a|substitua|revele|mostre|exiba|imprima|repita|bypass|contorne|finja|simule|roleplay|jailbreak)[\s\S]{0,140}(instru[cç][oõ]es|prompt|sistema|system|regras|pol[ií]tica|segredo|token|chave|prote[cç][aã]o|restri[cç][oõ]es)/i;
const INTERNAL = /(system prompt|prompt do sistema|instru[cç][oõ]es internas|regras internas|developer message|mensagem do desenvolvedor|chain of thought|cadeia de pensamento)/i;

function normalizar(value, max = 2000) {
  return String(value ?? '').normalize('NFKC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g, '').replace(/\s{3,}/g, '  ').trim().slice(0, max);
}
function contemSegredo(value) { const text=normalizar(value,5000); return SECRET_WORDS.test(text)||SECRET_VALUES.test(text); }
function contemInstrucaoHostil(value) { const text=normalizar(value,5000); return INJECTION.test(text)||INTERNAL.test(text); }
function avaliarEntrada(value) {
  const text=normalizar(value);
  if(!text)return {ok:false,code:'empty'};
  if(contemSegredo(text))return {ok:false,code:'sensitive'};
  if(contemInstrucaoHostil(text))return {ok:false,code:'prompt-injection'};
  if(!SCOPE.test(text))return {ok:false,code:'out-of-scope'};
  return {ok:true,text};
}
function sanitizarMemoria(items) {
  if(!Array.isArray(items))return [];
  return items.slice(0,12).map(x=>normalizar(x,600)).filter(x=>x&&!contemSegredo(x)&&!contemInstrucaoHostil(x)).slice(0,8);
}
function sanitizarFonte(item) {
  const title=normalizar(item?.title,180);
  let content=normalizar(item?.content,1200);
  if(contemSegredo(content)||contemInstrucaoHostil(content)) content='';
  let url='';
  try { const p=new URL(String(item?.url||'')); if((p.protocol==='https:'||p.protocol==='http:')&&!p.username&&!p.password) url=p.toString().slice(0,1000); } catch {}
  return {title,url,content};
}
function validarSaida(value) {
  const text=normalizar(value,8000);
  if(!text)return {ok:false,code:'empty-output'};
  if(contemSegredo(text)||INTERNAL.test(text))return {ok:false,code:'unsafe-output'};
  return {ok:true,text};
}
module.exports={avaliarEntrada,contemSegredo,contemInstrucaoHostil,sanitizarMemoria,sanitizarFonte,validarSaida};
