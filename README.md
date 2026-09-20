# Trilha-4X4

Aplicação web para organizar trilhas, passeios e eventos 4x4, com cadastro de participantes e veículos, aprovação de entrada, localização durante a trilha, SOS e assistente integrado à API da OpenAI.

## Recursos atuais

- Cadastro e login de usuários.
- Cadastro de um ou mais veículos; placa é opcional.
- Criação de trilhas/eventos com ID no formato `4X4-XXXXX`.
- Busca de trilha pelo ID.
- Solicitação de participação em qualquer trilha, inclusive pública.
- Entrada somente após aprovação do criador/administrador.
- Painel do administrador com nome, e-mail e dados do veículo do solicitante.
- Aprovação ou recusa pelo administrador.
- Modo Trilha com compartilhamento de localização entre participantes.
- Histórico de rota e recursos de segurança/SOS.
- Assistente do Trilha 4X4 usando a API da OpenAI, com fallback local quando a API não estiver configurada ou estiver indisponível.

## Requisitos

- Node.js 18+
- Uma chave da API da OpenAI para habilitar o assistente online

## Configuração

```bash
npm install
cp .env.example .env
```

Preencha o arquivo local `.env`:

```env
OPENAI_API_KEY=sua_chave_aqui
OPENAI_MODEL=gpt-4o-mini
PORT=3000
```

O arquivo `.env` é ignorado pelo Git e não deve ser commitado. Se uma chave já tiver sido publicada anteriormente, revogue-a e gere outra antes de usar o projeto.

## Executar

```bash
npm start
```

Abra `http://localhost:3000`.

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

## Verificação do servidor

```bash
curl http://localhost:3000/health
```

## Assistente OpenAI

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Como funciona o Trilha 4X4?"}'
```

A chave da OpenAI é utilizada somente no servidor e nunca deve ser enviada ao navegador.

## Fluxo de participação

1. O administrador cria a trilha e recebe um ID `4X4-XXXXX`.
2. O participante cadastra seu veículo e procura a trilha pelo ID.
3. A solicitação fica pendente independentemente de a trilha ser pública, privada ou por convite.
4. O criador/administrador visualiza nome, e-mail e veículo do participante. A placa pode ficar vazia.
5. O criador/administrador aceita ou recusa a solicitação.
6. Somente após a aprovação o participante passa a acessar a página e os recursos daquela trilha.
