# Trilha 4X4

Aplicação web/PWA para organizar grupos, passeios e trilhas 4x4, com participantes, veículos, navegação off-road, localização em tempo real e SOS.

## Estado atual

O fluxo principal é:

**Grupo de amigos → passeio → passeio confirmado → administrador cria a trilha → rota/navegação.**

Recursos implementados:
- Cadastro, login e sessão.
- Cadastro de veículos; placa opcional.
- Grupos, convites, membros e passeios.
- Confirmação de participação em passeios.
- Criação de trilhas e ID `4X4-XXXXX`.
- Solicitação de entrada e aprovação pelo administrador.
- Rota planejada livre, sem obrigar o traçado a seguir estradas.
- Limite de 500 pontos por rota.
- Localização dos participantes e SOS em tempo real.
- Eventos em tempo real para grupos, rota e notificações.
- PWA para instalação em Android/iPhone.
- Pacote do percurso salvo no aparelho para fallback offline.

> O mapa-base ainda usa o OpenFreeMap e precisa de internet. O percurso salvo permanece disponível no aparelho, mas o download completo dos tiles de uma região será uma etapa posterior.

## Requisitos

- Node.js 18 ou superior
- npm

A IA é opcional e não é necessária para testar o aplicativo.

## Preparar no computador

```bash
git fetch origin
git reset --hard origin/main
npm install
```

Crie o `.env` a partir do exemplo, se ainda não existir:

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

### macOS/Linux

```bash
cp .env.example .env
```

Para o teste básico, o `.env` pode ficar apenas com:

```env
PORT=3000
TRILHA4X4_DB_PATH=
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
TAVILY_API_KEY=
```

Nunca publique chaves de API no GitHub.

## Verificação antes do teste

```bash
npm run check
npm run test:e2e10
```

Depois:

```bash
npm start
```

Abra no próprio computador:

`http://localhost:3000`

Verificação rápida do servidor:

```bash
curl http://localhost:3000/health
```

Resposta esperada:

```json
{"ok":true}
```

## Teste no celular

Para Android/iPhone fora do computador, o servidor precisa ser publicado por HTTPS. Para o teste planejado, usaremos o computador como servidor e um Cloudflare Tunnel, evitando abrir diretamente uma porta do roteador.

Fluxo:

```text
Android / iPhone
      ↓ HTTPS
Cloudflare Tunnel
      ↓
PC :3000
      ↓
Node/Express + SQLite
```

O computador, o servidor Node e a conexão com a internet precisam permanecer ativos durante o teste.

## Fluxo de participação

1. O grupo combina um passeio.
2. O administrador cria e confirma o passeio.
3. O administrador cria a trilha vinculada ao passeio.
4. Os participantes entram com seus veículos.
5. Quando necessário, o administrador aprova a entrada.
6. A trilha passa a concentrar navegação, rota, localização e SOS.

## IA 4x4

A integração opcional usa Groq e Tavily. Sem as chaves, o aplicativo continua funcionando com fallback local. A configuração da IA não é requisito para os testes móveis desta versão.
