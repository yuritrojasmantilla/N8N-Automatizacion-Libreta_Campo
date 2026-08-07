const config = Object.freeze({
  createWebhook:
    'https://yuritzarojasmantilla.app.n8n.cloud/webhook-test/libreta-geologica',
});

const form = document.getElementById('registro');
const message = document.getElementById('mensaje');
const dateInput = form.querySelector('[name="fecha_campo"]');
const photoInput = document.getElementById('fotos');
const photoSummary = document.getElementById('resumen');
const gpsButton = document.getElementById('gps');

function setMessage(text, type = '') {
  message.textContent = text;
  message.className = type;
}

if (dateInput) {
  dateInput.value = new Date().toISOString().slice(0, 10);
}

if (photoInput) {
  photoInput.addEventListener('change', () => {
    const files = [...photoInput.files];

    if (files.length > 5) {
      photoInput.value = '';
      photoSummary.textContent = 'Máximo cinco fotografías.';
      setMessage('Solo puedes adjuntar máximo cinco fotografías.', 'error');
      return;
    }

    photoSummary.textContent = files.length
      ? `${files.length} foto(s) seleccionada(s)`
      : 'Sin fotos seleccionadas';
  });
}

if (gpsButton) {
  gpsButton.addEventListener('click', () => {
    if (!navigator.geolocation) {
      setMessage('Tu navegador no permite obtener la ubicación.', 'error');
      return;
    }

    const originalText = gpsButton.textContent;
    gpsButton.textContent = 'Obteniendo ubicación…';
    gpsButton.disabled = true;

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        form.elements.latitud.value = coords.latitude.toFixed(7);
        form.elements.longitud.value = coords.longitude.toFixed(7);

        if (coords.altitude !== null && form.elements.elevacion_m) {
          form.elements.elevacion_m.value = coords.altitude.toFixed(1);
        }

        setMessage('Ubicación GPS agregada.', 'ok');
        gpsButton.textContent = originalText;
        gpsButton.disabled = false;
      },
      () => {
        setMessage(
          'No se pudo obtener la ubicación. Puedes ingresarla manualmente.',
          'error'
        );
        gpsButton.textContent = originalText;
        gpsButton.disabled = false;
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
      }
    );
  });
}

function buildFormData(currentForm) {
  const data = new FormData();

  [...currentForm.elements].forEach((field) => {
    if (!field.name || field.disabled) return;

    if (field.type === 'file') {
      [...field.files]
        .filter((file) => file.size > 0)
        .forEach((file) => {
          data.append(field.name, file, file.name);
        });

      return;
    }

    if (
      (field.type === 'checkbox' || field.type === 'radio') &&
      !field.checked
    ) {
      return;
    }

    /*
      Se envía el value del select, no el texto.
      Así n8n recibe: suelo, roca, agua, alta, media o baja.
    */
    data.append(field.name, field.value);
  });

  return data;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) return;

  if (!config.createWebhook.includes('/webhook-test/libreta-geologica')) {
    setMessage('La URL del webhook no está configurada correctamente.', 'error');
    return;
  }

  const submitButton = form.querySelector('.enviar');
  const originalText = submitButton.textContent;

  submitButton.disabled = true;
  submitButton.textContent = 'Enviando registro…';
  setMessage('Enviando registro a n8n…');

  try {
    const formData = buildFormData(form);

    const response = await fetch(config.createWebhook, {
      method: 'POST',
      body: formData,
      headers: {
        Accept: 'application/json',
      },
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('Error devuelto por n8n:', {
        status: response.status,
        response: responseText,
      });

      throw new Error(`n8n respondió con estado ${response.status}`);
    }

    let result = {};

    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      // El flujo puede responder texto y aun así haberse ejecutado correctamente.
    }

    setMessage(
      result.registro_id
        ? `Registro creado correctamente. ID: ${result.registro_id}`
        : 'Registro creado correctamente.',
      'ok'
    );

    form.reset();

    if (dateInput) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }

    if (photoSummary) {
      photoSummary.textContent = 'Sin fotos seleccionadas';
    }
  } catch (error) {
    console.error('Error al enviar el formulario:', error);

    setMessage(
      'El formulario llegó a n8n, pero el flujo devolvió un error. Revisa la ejecución roja en n8n.',
      'error'
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
});
