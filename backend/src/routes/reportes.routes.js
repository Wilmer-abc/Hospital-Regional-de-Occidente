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
    if (!area_id || !desde || !hasta) {
      return res.status(400).json({ success: false, message: 'Parámetros incompletos' });
    }

    const [rows] = await db.query(`
      -- Generar rango de fechas
      WITH RECURSIVE fechas_rango AS (
        SELECT ? as fecha
        UNION ALL
        SELECT DATE_ADD(fecha, INTERVAL 1 DAY)
        FROM fechas_rango
        WHERE fecha < ?
      ),
      
      -- Empleados del área
      empleados_area AS (
        SELECT 
          e.id AS empleado_id,
          e.nombre_completo AS empleado,
          e.area_id,
          ar.nombre_area AS area,
          re.nombre_rol AS cargo,
          jefe.nombre_completo AS jefe_area
        FROM empleados e
        INNER JOIN areas ar ON ar.id = e.area_id
        INNER JOIN roles_empleado re ON re.id = e.rol_id
        LEFT JOIN area_supervisores sup ON sup.area_id = ar.id AND sup.es_titular = 1
        LEFT JOIN empleados jefe ON jefe.id = sup.empleado_id
        WHERE e.area_id = ?
          AND e.eliminado_en IS NULL
          AND e.activo = 1
      ),
      
      -- Combinar empleados con todas las fechas del rango
      empleados_fechas AS (
        SELECT 
          ea.*,
          fr.fecha
        FROM empleados_area ea
        CROSS JOIN fechas_rango fr
      ),
      
      -- Obtener asignaciones de turnos para cada fecha
      asignaciones_completas AS (
        SELECT 
          ef.empleado_id,
          ef.fecha,
          ef.area,
          ef.jefe_area,
          ef.empleado,
          ef.cargo,
          at.turno_id,
          t.nombre_turno,
          DATE_FORMAT(t.hora_inicio, '%H:%i') AS hora_entrada_programada,
          DATE_FORMAT(t.hora_fin, '%H:%i') AS hora_salida_programada
        FROM empleados_fechas ef
        LEFT JOIN asignacion_turnos at ON at.empleado_id = ef.empleado_id 
          AND ef.fecha BETWEEN at.fecha_inicio AND at.fecha_fin
          AND at.eliminado_en IS NULL
        LEFT JOIN turnos t ON t.id = at.turno_id
      ),
      
      -- Obtener asistencias registradas
      asistencias_completas AS (
        SELECT 
          ac.*,
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
        FROM asignaciones_completas ac
        LEFT JOIN asistencias a ON a.empleado_id = ac.empleado_id AND a.fecha = ac.fecha
      )
      
      SELECT * FROM asistencias_completas
      ORDER BY empleado, fecha;
    `, [desde, hasta, area_id]);

    console.log('Registros generados:', rows.length);
    res.json({ success: true, registros: rows });
  } catch (err) {
    console.error('Error generando reporte:', err);
    res.status(500).json({ success: false, message: 'Error al generar reporte' });
  }
});

module.exports = router;
