import express from 'express';
import { abrirMolinete, getStatus } from './serial';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.DRIVER_PORT || '3001', 10);
const COM_PORT = process.env.COM_PORT || 'COM1';
const PULSE_MS = parseInt(process.env.COM_PULSE_MS || '500', 10);
/**
 * POST /abrir
 * Envía pulso de 500ms al pin de habilitación de la PCA150
 * para abrir el molinete.
 *
 * Body opcional: { pin?: 'HAB1' | 'HAB2' }
 */
app.post('/abrir', async (req, res) => {
  const pin = req.body?.pin || 'HAB1';

  console.log(`[${new Date().toISOString()}] Solicitud apertura — PIN: ${pin}, COM: ${COM_PORT}`);

  try {
    await abrirMolinete(COM_PORT, pin, PULSE_MS);
    console.log(`[${new Date().toISOString()}] Molinete abierto OK`);
    res.json({ ok: true, pin, comPort: COM_PORT, pulseMs: PULSE_MS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error(`[${new Date().toISOString()}] Error apertura: ${message}`);
    res.status(500).json({ ok: false, error: message });
  }
});

/**
 * GET /status
 * Health check del driver y estado del puerto COM
 */
app.get('/status', (_req, res) => {
  const status = getStatus(COM_PORT);
  res.json({
    ok: true,
    comPort: COM_PORT,
    pulseMs: PULSE_MS,
    ...status,
  });
});

// Bind explícito a 127.0.0.1 — solo el proceso local puede alcanzar este puerto (C1).
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n=== MOLINETE DRIVER ===`);
  console.log(`Puerto HTTP:  127.0.0.1:${PORT}`);
  console.log(`Puerto COM:   ${COM_PORT}`);
  console.log(`Pulso:        ${PULSE_MS}ms`);
  console.log(`Placa:        DCM PCA150`);
  console.log(`========================\n`);
});
