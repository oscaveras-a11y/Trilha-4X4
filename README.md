# Trilha-4X4

Movimento 4x4 com uma integração simples com a API da OpenAI (ChatGPT).

## Requisitos

- Node.js 18+
- Uma chave de API da OpenAI

## Configuração

```bash
npm install
cp .env.example .env
```

Abra `.env` e defina `OPENAI_API_KEY`. Opcionalmente, altere `OPENAI_MODEL`.

## Executar

```bash
npm start
```

O servidor ficará disponível em `http://localhost:3000`.

## Endpoint

Envie uma mensagem para o ChatGPT com:

```bash
curl -X POST http://localhost:3000/api/chat \\
  -H "Content-Type: application/json" \\
  -d '{"message":"Explique o Movimento 4x4 em poucas palavras."}'
```

Resposta:

```json
{"reply":"..."}
```

A chave de API fica somente no servidor e nunca deve ser exposta no navegador ou commitada no repositório.
