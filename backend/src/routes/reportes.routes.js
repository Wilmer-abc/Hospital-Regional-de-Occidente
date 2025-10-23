const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');


// 1. Listar todas las áreas
router.get('/areas', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, nombre_area FROM areas WHERE eliminado_en IS NULL ORDER BY nombre_area
    `);
    res.json({ success: true, areas: rows });
  } catch (err) {
    console.error('Error obteniendo áreas:', err);
    res.status(500).json({ success: false, message: 'Error al obtener áreas' });
  }
});

// Generar reporte por área y rango de fechas

router.get('/asistencia', requireAuth, async (req, res) => {
  try {
    const { area_id, desde, hasta } = req.query;
    
    const [rows] = await db.query(`
      -- 1. GENERAR RANGO DE FECHAS
      WITH RECURSIVE fechas_rango AS (
        SELECT ? as fecha
        UNION ALL
        SELECT DATE_ADD(fecha, INTERVAL 1 DAY)
        FROM fechas_rango
        WHERE fecha < ?
      ),
      
      -- 2. EMPLEADOS CON TURNOS FIJOS EN EL ÁREA
      empleados_fijos AS (
        SELECT DISTINCT e.id as empleado_id, t.id as turno_id, t.dias_laborales
        FROM empleados e
        INNER JOIN asignacion_turnos at ON at.empleado_id = e.id
        INNER JOIN turnos t ON t.id = at.turno_id AND t.tipo_turno = 'FIJO'
        WHERE e.area_id = ?
          AND e.eliminado_en IS NULL
          AND e.activo = 1
          AND at.eliminado_en IS NULL
      ),
      
      -- 3. GENERAR TODOS LOS DÍAS LABORALES PARA TURNOS FIJOS
      turnos_fijos AS (
        SELECT 
          ef.empleado_id,
          ef.turno_id,
          fr.fecha,
          'FIJO' AS tipo_asignacion
        FROM empleados_fijos ef
        CROSS JOIN fechas_rango fr
        WHERE FIND_IN_SET(DAYOFWEEK(fr.fecha) - 1, ef.dias_laborales) > 0
      ),
      
      -- 4. TURNOS ROTATIVOS (asignaciones específicas)
      turnos_rotativos AS (
        SELECT 
          at.empleado_id,
          at.turno_id,
          at.fecha_inicio AS fecha,
          'ROTATIVO' AS tipo_asignacion
        FROM asignacion_turnos at
        INNER JOIN turnos t ON t.id = at.turno_id 
        WHERE at.eliminado_en IS NULL
          AND at.fecha_inicio BETWEEN ? AND ?
          AND (t.tipo_turno = 'ROTATIVO' OR t.tipo_turno IS NULL)
      ),
      
      -- 5. COMBINAR
      todos_turnos AS (
        SELECT * FROM turnos_fijos
        UNION ALL
        SELECT * FROM turnos_rotativos
      )
      
      -- 6. CONSULTA PRINCIPAL
      SELECT 
        ar.nombre_area AS area,
        jefe.nombre_completo AS jefe_area,
        e.nombre_completo AS empleado,
        re.nombre_rol AS cargo,
        tt.fecha,
        t.nombre_turno AS turno_asignado,
        t.tipo_turno,
        tt.tipo_asignacion,
        DATE_FORMAT(t.hora_inicio, '%H:%i') AS hora_entrada_programada,
        DATE_FORMAT(t.hora_fin, '%H:%i') AS hora_salida_programada,
        a.entrada_real,
        a.salida_real,
        a.estado,
        CASE 
          WHEN a.estado = 'COMPLETO' THEN 'Cumple horario'
          WHEN a.estado = 'TARDE' THEN 'Retraso'
          WHEN a.estado = 'FALTA' THEN 'Ausente'
          ELSE 'Ausente'
        END AS cumplimiento,
        CASE 
          WHEN a.estado IN ('COMPLETO','TARDE') THEN 'Presente'
          WHEN a.estado = 'FALTA' OR a.id IS NULL THEN 'Ausente'
          ELSE 'Ausente'
        END AS estado_dia
      FROM todos_turnos tt
      INNER JOIN empleados e ON e.id = tt.empleado_id
      INNER JOIN areas ar ON ar.id = e.area_id
      INNER JOIN roles_empleado re ON re.id = e.rol_id
      LEFT JOIN area_supervisores sup ON sup.area_id = ar.id AND sup.es_titular = 1
      LEFT JOIN empleados jefe ON jefe.id = sup.empleado_id
      LEFT JOIN turnos t ON t.id = tt.turno_id
      LEFT JOIN asistencias a ON a.empleado_id = e.id AND a.fecha = tt.fecha
      WHERE e.eliminado_en IS NULL
        AND e.activo = 1
      ORDER BY e.nombre_completo, tt.fecha;
    `, [desde, hasta, area_id, desde, hasta]);

    console.log('Registros generados:', rows.length);
    res.json({ success: true, registros: rows });
  } catch (err) {
    console.error('Error generando reporte:', err);
    res.status(500).json({ success: false, message: 'Error al generar reporte' });
  }
});

module.exports = router;
