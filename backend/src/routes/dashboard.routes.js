const express = require('express');
const router = express.Router();
const db = require('../db.js');
const { requireAuth, requireRRHHorJefe } = require('../middlewares/auth.js');

// Helper: genera ultimos 7 daas 
function last7Days() {
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push(iso);
  }
  return days;
}

// Ruta principal del dashboard 
router.get('/', requireAuth, requireRRHHorJefe, async (_req, res) => {
  try {
    const [[{ cActivos }]] = await db.query(
      `SELECT COUNT(*) cActivos FROM empleados WHERE activo=1 AND eliminado_en IS NULL`
    );
    const [[{ cAreas }]] = await db.query(
      `SELECT COUNT(*) cAreas FROM areas WHERE eliminado_en IS NULL`
    );
    
    res.json({
      success: true,
      data: {
        personalActivo: cActivos,
        jerarquias: cAreas,
        turnosHoy: 0,
        alertas: 0,
        proximosTurnos: { 
          manana: { enfermeros: 0, medicos: 0 }, 
          tarde: { enfermeros: 0, medicos: 0 }, 
          noche: { enfermeros: 0, medicos: 0 } 
        }
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, error: 'Error cargando dashboard' });
  }
});

// Ruta completa de resumen 
router.get('/summary', requireAuth, requireRRHHorJefe, async (_req, res) => {
  try {
    // 1) Personal activo 
    const [[{ c: personalActivo }]] = await db.query(
      'SELECT COUNT(*) AS c FROM empleados WHERE activo = 1 AND eliminado_en IS NULL'
    );

    // 2) Personal inactivo 
    const [[{ c: personalInactivo }]] = await db.query(
      'SELECT COUNT(*) AS c FROM empleados WHERE activo = 0 AND eliminado_en IS NULL'
    );

    // 3) Personal total
    const [[{ c: personalTotal }]] = await db.query(
      'SELECT COUNT(*) AS c FROM empleados WHERE eliminado_en IS NULL'
    );

    // 4) Turnos hoy
    const [[{ c: turnosHoy }]] = await db.query(
      'SELECT COUNT(*) AS c FROM asignacion_turnos WHERE fecha = CURDATE()'
    );

    // 5) Alertas pendientes
    const [[{ c: alertas }]] = await db.query(
      "SELECT COUNT(*) AS c FROM alertas WHERE estado = 'PENDIENTE'"
    );

    // 6) Jerarquias
    const [[{ c: jerarquias }]] = await db.query(
      'SELECT COUNT(*) AS c FROM areas WHERE eliminado_en IS NULL'
    );

    // 7) Proximos turnos
    const [prox] = await db.query(`
      SELECT
        t.nombre_turno AS turno,
        LOWER(IFNULL(re.nombre_rol, '')) AS nombre_rol
      FROM asignacion_turnos at
      JOIN turnos t ON t.id = at.turno_id
      JOIN empleados e ON e.id = at.empleado_id
      LEFT JOIN roles_empleado re ON re.id = e.rol_id
      WHERE at.fecha = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      AND e.eliminado_en IS NULL
    `);

    const bucket = {
      manana: { enfermeros: 0, medicos: 0 },
      tarde:  { enfermeros: 0, medicos: 0 },
      noche:  { enfermeros: 0, medicos: 0 },
    };

    for (const r of prox) {
      const name = (r.turno || '').toLowerCase();
      const role = r.nombre_rol;
      let slot = null;
      
      if (name.includes('mañana') || name.includes('manana')) slot = 'manana';
      else if (name.includes('tarde')) slot = 'tarde';
      else if (name.includes('noche')) slot = 'noche';
      if (!slot) continue;

      if (role.includes('enfermer')) bucket[slot].enfermeros += 1;
      else if (role.includes('medic')) bucket[slot].medicos += 1;
    }

    // 8) Asistencia semanal
    const days = last7Days();
    const [asistRaw] = await db.query(`
      SELECT DATE(fecha_hora) AS dia, COUNT(*) AS entradas
      FROM registros_asistencia
      WHERE fecha_hora >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND tipo_evento = 'ENTRADA'
      GROUP BY DATE(fecha_hora)
    `);
    
    const map = new Map(asistRaw.map(r => [r.dia.toISOString?.() ? r.dia.toISOString().slice(0,10) : String(r.dia), r.entradas]));
    const asistenciaSemanal = days.map(d => ({ fecha: d, entradas: map.get(d) || 0 }));

    res.json({
      success: true,
      data: {
        personalActivo,
        personalInactivo,
        personalTotal,
        turnosHoy,
        alertas,
        jerarquias,
        proximosTurnos: bucket,
        asistenciaSemanal,
      }
    });
  } catch (e) {
    console.error('Dashboard summary error:', e);
    res.status(500).json({ success: false, error: 'Error generando resumen' });
  }
});

module.exports = router;