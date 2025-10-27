// backend/routes/biometric.routes.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const svc = require('../services/biometric/hikvision.service.js');

const { requireAuth, requireAdmin } = auth;

// Todas las rutas requieren autenticación
router.use(requireAuth);

// =================== 🔌 PROBAR CONEXIÓN ===================
router.get('/test-connection', requireAdmin, async (_req, res) => {
  try {
    const data = await svc.testConnectionAll();
    res.json({ success: true, devices: data });
  } catch (err) {
    console.error('Hikvision test-connection error:', err.message);
    res.status(502).json({ success: false, message: 'Error probando conexión', detail: err.message });
  }
});

// =================== 📋 OBTENER EVENTOS ===================
router.get('/events', requireAdmin, async (req, res) => {
  try {
    const since = req.query.since ? new Date(req.query.since) : null;
    const until = req.query.until ? new Date(req.query.until) : null;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '200', 10), 1000));

    const { events, count } = await svc.pullEvents({ since, until, limit });

    if (!events.length) return res.status(204).send();

    res.json({ success: true, count, events });
  } catch (err) {
    console.error('Hikvision events error:', err.message);
    res.status(502).json({ success: false, message: 'Error obteniendo eventos', detail: err.message });
  }
});

// ===================== SINCRONIZAR EMPLEADOS DESDE BIOMÉTRICOS =====================
router.post('/sync-users', requireAdmin, async (_req, res) => {
  try {
    const users = await svc.getAllUserNames(); // función que obtiene todos los empleados desde ambos biométricos

    for (const u of users) {
      await db.query(`
        INSERT INTO empleados (numero_empleado, nombre_completo, activo)
        VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE nombre_completo = VALUES(nombre_completo), activo = 1
      `, [u.numero_empleado, u.nombre_completo]);
    }

    res.json({ success: true, total: users.length });
  } catch (err) {
    console.error('❌ Error sincronizando empleados:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});


module.exports = router;
