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

// Generar reporte por área y rango de fechas - VERSIÓN SIMPLIFICADA
router.get('/asistencia', requireAuth, async (req, res) => {
  try {
    const { area_id, desde, hasta, tipo_reporte = 'semana' } = req.query;
    
    console.log('Parámetros recibidos:', { area_id, desde, hasta, tipo_reporte });

    let query = '';
    let params = [];

    if (tipo_reporte === 'todo') {
      // REPORTE COMPLETO - Solo por área, sin filtro de fecha
      query = `
        SELECT 
          ar.nombre_area AS area,
          jefe.nombre_completo AS jefe_area,
          e.nombre_completo AS empleado,
          re.nombre_rol AS cargo,
          at.fecha_inicio AS fecha,
          t.nombre_turno AS turno_asignado,
          t.tipo_turno,
          CASE 
            WHEN t.tipo_turno = 'FIJO' THEN 'FIJO'
            ELSE 'ROTATIVO'
          END AS tipo_asignacion,
          DATE_FORMAT(t.hora_inicio, '%H:%i') AS hora_entrada_programada,
          DATE_FORMAT(t.hora_fin, '%H:%i') AS hora_salida_programada,
          a.entrada_real,
          a.salida_real,
          a.estado,
          CASE 
            WHEN a.estado = 'COMPLETO' THEN '✅ Cumple horario'
            WHEN a.estado = 'TARDE' THEN '⚠️ Retraso'
            WHEN a.estado = 'FALTA' THEN '❌ Ausente'
            ELSE '❌ Ausente'
          END AS cumplimiento,
          CASE 
            WHEN a.estado IN ('COMPLETO','TARDE') THEN 'Presente'
            WHEN a.estado = 'FALTA' OR a.id IS NULL THEN 'Ausente'
            ELSE 'Ausente'
          END AS estado_dia
        FROM empleados e
        INNER JOIN areas ar ON ar.id = e.area_id
        INNER JOIN roles_empleado re ON re.id = e.rol_id
        LEFT JOIN area_supervisores sup ON sup.area_id = ar.id AND sup.es_titular = 1
        LEFT JOIN empleados jefe ON jefe.id = sup.empleado_id
        LEFT JOIN asignacion_turnos at ON at.empleado_id = e.id AND at.eliminado_en IS NULL
        LEFT JOIN turnos t ON t.id = at.turno_id
        LEFT JOIN asistencias a ON a.empleado_id = e.id AND a.fecha = at.fecha_inicio
        WHERE e.eliminado_en IS NULL
          AND e.activo = 1
          AND ar.id = ?
        ORDER BY e.nombre_completo, at.fecha_inicio;
      `;
      
      params = [area_id];
      
    } else {
      // REPORTE POR SEMANA O MES - Con filtro de fecha
      query = `
        SELECT 
          ar.nombre_area AS area,
          jefe.nombre_completo AS jefe_area,
          e.nombre_completo AS empleado,
          re.nombre_rol AS cargo,
          at.fecha_inicio AS fecha,
          t.nombre_turno AS turno_asignado,
          t.tipo_turno,
          CASE 
            WHEN t.tipo_turno = 'FIJO' THEN 'FIJO'
            ELSE 'ROTATIVO'
          END AS tipo_asignacion,
          DATE_FORMAT(t.hora_inicio, '%H:%i') AS hora_entrada_programada,
          DATE_FORMAT(t.hora_fin, '%H:%i') AS hora_salida_programada,
          a.entrada_real,
          a.salida_real,
          a.estado,
          CASE 
            WHEN a.estado = 'COMPLETO' THEN '✅ Cumple horario'
            WHEN a.estado = 'TARDE' THEN '⚠️ Retraso'
            WHEN a.estado = 'FALTA' THEN '❌ Ausente'
            ELSE '❌ Ausente'
          END AS cumplimiento,
          CASE 
            WHEN a.estado IN ('COMPLETO','TARDE') THEN 'Presente'
            WHEN a.estado = 'FALTA' OR a.id IS NULL THEN 'Ausente'
            ELSE 'Ausente'
          END AS estado_dia
        FROM empleados e
        INNER JOIN areas ar ON ar.id = e.area_id
        INNER JOIN roles_empleado re ON re.id = e.rol_id
        LEFT JOIN area_supervisores sup ON sup.area_id = ar.id AND sup.es_titular = 1
        LEFT JOIN empleados jefe ON jefe.id = sup.empleado_id
        LEFT JOIN asignacion_turnos at ON at.empleado_id = e.id AND at.eliminado_en IS NULL
        LEFT JOIN turnos t ON t.id = at.turno_id
        LEFT JOIN asistencias a ON a.empleado_id = e.id AND a.fecha = at.fecha_inicio
        WHERE e.eliminado_en IS NULL
          AND e.activo = 1
          AND ar.id = ?
          AND at.fecha_inicio BETWEEN ? AND ?
        ORDER BY e.nombre_completo, at.fecha_inicio;
      `;
      
      params = [area_id, desde, hasta];
    }

    console.log('Ejecutando consulta con parámetros:', params);
    const [rows] = await db.query(query, params);

    console.log('Registros generados:', rows.length);
    res.json({ success: true, registros: rows });
    
  } catch (err) {
    console.error('Error generando reporte:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error al generar reporte',
      error: err.message 
    });
  }
});

module.exports = router;