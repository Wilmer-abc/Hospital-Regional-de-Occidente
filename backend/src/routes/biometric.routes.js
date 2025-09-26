const router = require('express').Router();
const auth = require('../middlewares/auth');
const svc = require('../services/biometric/hikvision.service');

// Validacion defensiva: falla en arranque si falta algo
['requireAuth', 'requireAdmin'].forEach((k) => {
  if (typeof auth[k] !== 'function') {
    throw new Error(
      `[biometric.routes] Missing middleware function: ${k}. Revisa exports de src/middlewares/auth.js`
    );
  }
});

const { requireAuth, requireAdmin } = auth;

// Todas las rutas requieren autenticación
router.use(requireAuth);

//  CONFIG 
router.get('/config', requireAdmin, (_req, res) => {
  res.json({
    enabled: typeof svc.hikEnabled === 'function' ? !!svc.hikEnabled() : false,
    mock: String(process.env.HIK_MOCK || 'true') === 'true',
    protocol: process.env.HIK_PROTOCOL || 'http',
    host: process.env.HIK_HOST || null,
    port: process.env.HIK_PORT || null,
    timeoutMs: Number(process.env.HIK_TIMEOUT_MS || '5000'),
  });
});

//  TEST CONEXION 
router.get('/test-connection', requireAdmin, async (_req, res) => {
  try {
    const data = await svc.testConnection();
    res.json(data);
  } catch (err) {
    console.error('Hikvision test-connection error:', err.message);
    res.status(502).json({ message: 'Error probando conexión', detail: err.message });
  }
});

router.get('/capabilities', requireAdmin, async (_req, res) => {
  try {
    const data = await svc.getCapabilities();
    res.json(data);
  } catch (err) {
    console.error('Hikvision capabilities error:', err.message);
    res.status(502).json({ message: 'Error consultando el biometrico', detail: err.message });
  }
});

//  EVENTOS CRUDOS 
router.get('/events', requireAdmin, async (req, res) => {
  try {
    const since = req.query.since ? new Date(req.query.since) : null;
    const until = req.query.until ? new Date(req.query.until) : null;

    if (since && isNaN(since)) return res.status(400).json({ message: 'since invalido' });
    if (until && isNaN(until)) return res.status(400).json({ message: 'until invalido' });
    if (since && until && since > until)
      return res.status(400).json({ message: '"since" > "until"' });

    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '200', 10), 1000));
    const cursor = (req.query.cursor || '').trim() || null;

    const { events = [], nextCursor = null } =
      (await svc.pullEvents({ since, until, limit, cursor })) || {};

    if (!events.length) return res.status(204).send();

    res.json({ count: events.length, nextCursor, events });
  } catch (err) {
    console.error('Hikvision events error:', err.message);
    res.status(502).json({ message: 'Error obteniendo eventos', detail: err.message });
  }
});

//  EVENTOS FILTRADOS POR EMPLEADO 
router.get('/marcajes/dispositivo/:deviceId', requireAdmin, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { desde, hasta } = req.query;

    const { events = [] } = await svc.pullEvents({
      since: desde ? new Date(desde) : null,
      until: hasta ? new Date(hasta) : null,
      limit: 1000,
    });

    const filtrados = events.filter(ev => String(ev.device_person_id) === String(deviceId));

    res.json({ success: true, deviceId, total: filtrados.length, events: filtrados });
  } catch (err) {
    console.error('Hikvision marcajes error:', err.message);
    res.status(502).json({ message: 'Error obteniendo marcajes', detail: err.message });
  }
});

module.exports = router;
  