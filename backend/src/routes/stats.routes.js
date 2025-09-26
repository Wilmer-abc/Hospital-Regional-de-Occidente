// const express = require('express');
// const db = require('../db.js'); // debe exponer .query con Promises (mysql2/promise)
// const router = express.Router();

// // GET /api/stats/overview
// router.get('/overview', async (_req, res) => {
//   try {
//     // empleados activos
//     const [[empActivos]] = await db.query(
//       'SELECT COUNT(*) AS total FROM empleados WHERE activo = 1'
//     );

//     // turnos de HOY
//     const [[turnosHoy]] = await db.query(
//       'SELECT COUNT(*) AS total FROM asignacion_turnos WHERE fecha = CURDATE()'
//     );

//     // alertas pendientes
//     const [[alertasPend]] = await db.query(
//       "SELECT COUNT(*) AS total FROM alertas WHERE estado = 'PENDIENTE'"
//     );

//     // “jerarquías” (ejemplo: suma de roles_empleado + areas)
//     const [[cntRoles]] = await db.query('SELECT COUNT(*) AS total FROM roles_empleado');
//     const [[cntAreas]] = await db.query('SELECT COUNT(*) AS total FROM areas');

//     res.json({
//       success: true,
//       data: {
//         activos: empActivos.total,
//         turnosHoy: turnosHoy.total,
//         alertasPendientes: alertasPend.total,
//         jerarquias: {
//           roles: cntRoles.total,
//           areas: cntAreas.total,
//           total: cntRoles.total + cntAreas.total
//         }
//       }
//     });
//   } catch (e) {
//     console.error('Stats error:', e);
//     res.status(500).json({ success: false, error: 'Error obteniendo estadísticas' });
//   }
// });

// module.exports = router;
