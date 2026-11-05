// Pequeño envoltorio de fetch para hablar con la API.
// Centraliza el manejo de errores para que las vistas no repitan código.

export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error ?? `Error ${response.status}`);
  }

  return data;
}
