const config = Object.freeze({
  // Reemplaza por la URL del webhook de n8n que recibe el registro de muestras.
  createWebhook: 'https://yuritzarojasmantilla.app.n8n.cloud/webhook/26c27d4a-16a3-4fb5-a7fc-660d426ac7b0',
});

// Lista precargada de geólogos del equipo de campo.
// Edita este arreglo para reflejar al equipo real; el formulario la usa
// para llenar el <select id="m-geologo"> automáticamente.
const GEOLOGISTS = [
  'Yuritza Juliana Rojas Mantilla',
  'Adriana Marcela Reatigui Mateus',
  'Karen Yuliana Carrizales Perez',
  'Sebastian Gomez Lopez',
  'Sebastian Artunduaga Ocampos'
];

console.info('Configuración n8n cargada:', {
  createWebhook: config.createWebhook || 'sin configurar',
});

// ------------------------------------------------------------
// Poblar select de geólogos (manteniendo la opción "Otro" al final)
// ------------------------------------------------------------
const selectGeologo = document.getElementById('m-geologo');
GEOLOGISTS.forEach((name) => {
  const opt = document.createElement('option');
  opt.value = name;
  opt.textContent = name;
  selectGeologo.insertBefore(opt, selectGeologo.querySelector('option[value="otro"]'));
});

// ------------------------------------------------------------
// Campos "Otro / Otra": mostrar el texto libre asociado y
// hacerlo obligatorio solo mientras esté visible.
// ------------------------------------------------------------
function wireOtherField(selectId, wrapId) {
  const select = document.getElementById(selectId);
  const wrap = document.getElementById(wrapId);
  const input = wrap.querySelector('[data-other-for]');
  const triggerValue = input.dataset.triggerValue;

  select.addEventListener('change', () => {
    const show = select.value === triggerValue;
    wrap.hidden = !show;
    input.required = show;
    input.disabled = !show;
    if (!show) input.value = '';
  });
}

wireOtherField('m-geologo', 'm-geologo-otro-wrap');
wireOtherField('m-municipio', 'm-municipio-otro-wrap');
wireOtherField('m-litologia', 'm-litologia-otro-wrap');

// ------------------------------------------------------------
// Fecha por defecto: hoy (editable por el usuario)
// ------------------------------------------------------------
const fechaInput = document.getElementById('m-fecha');
fechaInput.value = new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------
// Botón "Usar ubicación GPS"
// ------------------------------------------------------------
const btnGeo = document.getElementById('btn-geo');
const latInput = document.getElementById('m-lat');
const lonInput = document.getElementById('m-lon');

btnGeo.addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Este dispositivo no permite obtener la ubicación automáticamente.');
    return;
  }
  const originalLabel = btnGeo.textContent;
  btnGeo.textContent = 'Obteniendo ubicación...';
  btnGeo.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      latInput.value = position.coords.latitude.toFixed(6);
      lonInput.value = position.coords.longitude.toFixed(6);
      btnGeo.textContent = originalLabel;
      btnGeo.disabled = false;
    },
    () => {
      alert('No se pudo obtener la ubicación. Ingrésala manualmente.');
      btnGeo.textContent = originalLabel;
      btnGeo.disabled = false;
    }
  );
});

// ------------------------------------------------------------
// Construcción del FormData a enviar
// ------------------------------------------------------------
function buildFormData(form) {
  const fd = new FormData(form);

  form.querySelectorAll('select').forEach((select) => {
    const key = select.name;
    const option = select.options[select.selectedIndex];
    let value = option ? option.text.trim() : '';

    // Si el usuario eligió "Otro" / "Otra", se envía el texto libre
    // asociado en lugar del texto "Otro" y se descarta el campo auxiliar.
    const otherInput = form.querySelector(`[data-other-for="${key}"]`);
    if (otherInput && select.value === otherInput.dataset.triggerValue) {
      value = otherInput.value.trim();
      fd.delete(otherInput.name);
    }

    fd.delete(key);
    fd.append(key, value);
  });

  return fd;
}

function setStatus(form, type, message) {
  const status = form.querySelector('.status');
  status.className = `status ${type}`;
  status.textContent = message;
}

// ------------------------------------------------------------
// Envío del formulario
// ------------------------------------------------------------
const form = document.getElementById('form-muestra');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const status = form.querySelector('.status');
  const button = form.querySelector('.submit');

  status.className = 'status';
  status.textContent = '';

  if (!form.reportValidity()) return;

  if (!config.createWebhook || config.createWebhook.includes('TU-INSTANCIA')) {
    setStatus(form, 'error', 'Falta configurar la URL del webhook en app.js.');
    return;
  }

  const formData = buildFormData(form);

  button.disabled = true;
  const originalLabel = button.querySelector('span').textContent;
  button.querySelector('span').textContent = 'Enviando...';

  try {
    // Se envía como multipart/form-data (no JSON) para poder incluir
    // los archivos de fotografías junto con los demás campos.
    const response = await fetch(config.createWebhook, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`El servidor respondió con estado ${response.status}`);
    }

    setStatus(form, 'success', 'Muestra registrada correctamente.');
    form.reset();
    fechaInput.value = new Date().toISOString().slice(0, 10);
    document
      .querySelectorAll('.field-other')
      .forEach((wrap) => { wrap.hidden = true; });
  } catch (error) {
    console.error('Error al enviar el formulario:', error);
    setStatus(form, 'error', 'No se pudo enviar la solicitud. Intenta de nuevo.');
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = originalLabel;
  }
});