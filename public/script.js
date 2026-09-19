const form = document.getElementById('chat-form');
const input = document.getElementById('message');
const chat = document.getElementById('chat');

function addMessage(text, role = 'bot') {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const message = input.value.trim();
  if (!message) return;

  addMessage(message, 'user');
  input.value = '';
  form.querySelector('button').disabled = true;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao processar a mensagem.');
    }

    addMessage(data.reply || 'Sem resposta.', 'bot');
  } catch (error) {
    addMessage(error.message || 'Não foi possível obter uma resposta.', 'bot');
  } finally {
    form.querySelector('button').disabled = false;
    input.focus();
  }
});
