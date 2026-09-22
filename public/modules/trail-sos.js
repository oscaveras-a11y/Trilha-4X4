/* SOS da trilha — Trilha 4X4 */

/*
   * SOS
   */

  async function ativarSOS() {

    if (!modoTrilhaAtivo) {

      alert(
        'Ative o Modo Trilha antes de usar o SOS.'
      );

      return;
    }


    const confirmar =
      confirm(
        '🆘 ATIVAR SOS?\\n\\nSua localização será enviada aos participantes desta trilha.'
      );


    if (!confirmar) {
      return;
    }


    navigator.geolocation.getCurrentPosition(

      async position => {

        try {

          const resposta =
            await fetch(
              '/api/trilhas/' +
              encodeURIComponent(
                trilhaId
              ) +
              '/sos',
              {
                method: 'POST',

                headers: {
                  'Content-Type':
                    'application/json'
                },

                body:
                  JSON.stringify({

                    latitude:
                      position.coords.latitude,

                    longitude:
                      position.coords.longitude,

                    accuracy:
                      position.coords.accuracy,

                    motivo:
                      'Preciso de ajuda'

                  })
              }
            );


          const dados =
            await resposta.json();


          if (!resposta.ok) {

            alert(
              dados.error ||
              'Não foi possível ativar o SOS.'
            );

            return;
          }


          meuSosId =
            dados.alert.id;


          const status =
            document.getElementById(
              'sosStatus'
            );


          status.style.display =
            'block';


          status.textContent =
            '🚨 SOS ATIVO. Os participantes desta trilha foram alertados.';


          const botao =
            document.getElementById(
              'sosButton'
            );


          botao.textContent =
            '🛑 ENCERRAR MEU SOS';

        } catch (erro) {

          console.error(erro);

          alert(
            'Não foi possível conectar ao servidor.'
          );

        }

      },

      () => {

        alert(
          'Não foi possível obter sua localização para o SOS.'
        );

      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }

    );

  }


  /*
   * ENCERRAR SOS
   */

  async function encerrarSOS() {

    if (!meuSosId) {
      return;
    }


    try {

      const resposta =
        await fetch(
          '/api/trilhas/' +
          encodeURIComponent(
            trilhaId
          ) +
          '/sos/' +
          encodeURIComponent(
            meuSosId
          ),
          {
            method: 'DELETE'
          }
        );


      if (!resposta.ok) {

        const dados =
          await resposta.json();

        alert(
          dados.error ||
          'Não foi possível encerrar o SOS.'
        );

        return;
      }


      meuSosId =
        null;


      document.getElementById(
        'sosStatus'
      ).style.display =
        'none';


      document.getElementById(
        'sosButton'
      ).textContent =
        '🆘 PRECISO DE AJUDA';

    } catch (erro) {

      console.error(erro);

      alert(
        'Não foi possível conectar ao servidor.'
      );

    }

  }


  /*
   * MOSTRAR SOS
   */

  function mostrarAlertaSOS(
    alerta
  ) {

    const status =
      document.getElementById(
        'sosStatus'
      );


    status.style.display =
      'block';


    status.textContent =
      '🚨 SOS ATIVO: ' +
      (
        alerta.userName ||
        'Participante'
      ) +
      ' precisa de ajuda.';

  }
