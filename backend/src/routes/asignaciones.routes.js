const express = require("express");
const axios = require("axios");
const router = express.Router();
const db = require('../db.js');
const { requireAuth, requireRRHHorJefe } = require('../middlewares/auth.js');

// Configuración del biometrico
const BIOMETRICO_HOST = process.env.HIK1_HOST || "192.168.0.45";
const BIOMETRICO_USER = process.env.HIK1_USER || "admin";
const BIOMETRICO_PASS = process.env.HIK1_PASS || "Hospital0.";

//  SINCRONIZAR MARCAJES CRUDOS 
router.get("/sincronizar", async (_req, res) => {
  try {
    const { data } = await axios.get(
      `http://${BIOMETRICO_HOST}/ISAPI/AccessControl/AcsEvent?format=json`,
      {
        auth: { username: BIOMETRICO_USER, password: BIOMETRICO_PASS },
      }
    );

    const lista = data?.AcsEvent?.InfoList || [];
    res.json({ success: true, total: lista.length, data: lista });
  } catch (err) {
    console.error("Error consultando biométrico:", err.message);
    res.status(500).json({
      success: false,
      error: "Error consultando biométrico",
      message: err.message,
    });
  }
});

//  OBTENER MARCAJES POR EMPLEADO 
router.get("/marcajes/:empleadoId", async (req, res) => {
  const { empleadoId } = req.params;

  try {
    // Buscar el employeeNoString del biometrico desde la BD
    const [[emp]] = await db.query(
      "SELECT id, nombre_completo, id_dispositivo FROM empleados WHERE id = ?",
      [empleadoId]
    );

    if (!emp) {
      return res.status(404).json({ success: false, error: "Empleado no encontrado en la BD" });
    }
    if (!emp.id_dispositivo) {
      return res.status(400).json({ success: false, error: "Empleado no tiene id_dispositivo asignado" });
    }

    // Consultar eventos del biometrico
    const { data } = await axios.get(
      `http://${BIOMETRICO_HOST}/ISAPI/AccessControl/AcsEvent?format=json`,
      { auth: { username: BIOMETRICO_USER, password: BIOMETRICO_PASS } }
    );

    const lista = data?.AcsEvent?.InfoList || [];

    // Filtrar por el id_dispositivo
    const filtrados = lista.filter(
      (e) => e.employeeNoString === String(emp.id_dispositivo)
    );

    res.json({
      success: true,
      empleado: emp.nombre_completo,
      id_bd: emp.id,
      id_dispositivo: emp.id_dispositivo,
      total: filtrados.length,
      marcajes: filtrados.map((m) => ({
        fecha_hora: m.time,
        evento: m.attendanceStatus, 
        dispositivo: m.cardReaderNo,
        nombre: m.name
      })),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Error consultando biométrico",
      message: err.message,
    });
  }
});

router.post("/generar-calendario", async (req, res) => {
  try {
    const { empleados_ids, fecha_inicio, fecha_fin, tipo_turno, configuracion_personalizada } = req.body;

    // Lógica para generar calendario
    const calendario = await generarCalendarioRotativo(
      empleados_ids, 
      fecha_inicio, 
      fecha_fin, 
      tipo_turno, 
      configuracion_personalizada
    );

    res.json({ success: true, data: { calendario } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/reemplazos/disponibles", async (req, res) => {
  try {
    const { fecha, turno_id } = req.query;
    
    const empleadosDisponibles = await buscarEmpleadosDisponiblesParaReemplazo(fecha, turno_id);
    
    res.json({ success: true, data: empleadosDisponibles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


router.get('/empleado/:id/calendario', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { mes, año } = req.query;
  if (!id || !mes || !año) {
    return res.status(400).json({ success: false, message: 'Faltan parámetros' });
  }

  try {
    const [rows] = await db.query(
      `SELECT a.fecha, a.turno_id, t.nombre_turno, t.hora_inicio, t.hora_fin
       FROM asignacion_turnos a
       JOIN turnos t ON a.turno_id = t.id
       WHERE a.empleado_id = ? 
         AND MONTH(a.fecha) = ? 
         AND YEAR(a.fecha) = ?`,
      [id, mes, año]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al obtener calendario', error: err.message });
  }
});


router.post("/reemplazos/solicitar", async (req, res) => {
  try {
    const { dia_trabajo_id, empleado_original_id, empleado_reemplazo_id, motivo } = req.body;
    
    await solicitarReemplazo(dia_trabajo_id, empleado_original_id, empleado_reemplazo_id, motivo);
    
    res.json({ success: true, message: "Reemplazo solicitado correctamente" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Funciones auxiliares
async function generarCalendarioRotativo(empleadosIds, fechaInicio, fechaFin, tipoTurno, config) {
  const calendario = [];
  const fechaInicioObj = new Date(fechaInicio);
  const fechaFinObj = new Date(fechaFin);
  
  let fechaActual = new Date(fechaInicioObj);
  
  while (fechaActual <= fechaFinObj) {
    for (const empleadoId of empleadosIds) {
      const diaTrabajo = {
        fecha: fechaActual.toISOString().split('T')[0],
        empleado_id: empleadoId,
        turno_id: null, // Se asignará después
        hora_entrada: '08:00', // Por defecto
        hora_salida: '16:00', // Por defecto
        necesita_reemplazo: false,
        estado: 'ASIGNADO'
      };
      
      // Aplicar lógica según tipo de turno
      if (tipoTurno === '24x72') {
        // Lógica para turnos 24x72
      } else if (tipoTurno === '12x36') {
        // Lógica para turnos 12x36
      }
      
      calendario.push(diaTrabajo);
    }
    
    fechaActual.setDate(fechaActual.getDate() + 1);
  }
  
  return calendario;
  }

  async function buscarEmpleadosDisponiblesParaReemplazo(fecha, turnoId) {
    // Lógica para buscar empleados disponibles
    const [empleados] = await db.query(`
      SELECT e.* FROM empleados e
      LEFT JOIN asignacion_turnos at ON e.id = at.empleado_id AND at.fecha = ?
      WHERE e.activo = 1 AND at.id IS NULL
    `, [fecha]);
    
    return empleados;
  }

// ================= CREAR BULK =================
router.post('/bulk', requireAuth, async (req, res) => {
  const { asignaciones } = req.body;
  if (!Array.isArray(asignaciones) || asignaciones.length === 0) {
    return res.status(400).json({ success: false, message: 'No hay asignaciones' });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // VALIDAR que todos los turnos_id existen y no están eliminados
    const turnosIds = [...new Set(asignaciones.map(a => a.turno_id).filter(id => id))];
    if (turnosIds.length > 0) {
      const placeholders = turnosIds.map(() => '?').join(',');
      const [turnosExistentes] = await conn.query(
        `SELECT id FROM turnos WHERE id IN (${placeholders}) AND eliminado_en IS NULL`,
        turnosIds
      );

      const turnosExistentesIds = turnosExistentes.map(t => t.id);
      const turnosInvalidos = turnosIds.filter(id => !turnosExistentesIds.includes(id));

      if (turnosInvalidos.length > 0) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({
          success: false,
          message: 'Algunos turnos no existen',
          turnosInvalidos
        });
      }
    }

    // Procesar cada asignación
    for (const a of asignaciones) {
      if (!a.empleado_id || !a.turno_id || !a.fecha_inicio || !a.fecha_fin) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({
          success: false,
          message: 'Datos incompletos en asignación',
          asignacion: a
        });
      }

      // Verificar si ya existe una asignación que se solape en el rango
      const [existentes] = await conn.query(
        `SELECT id FROM asignacion_turnos 
         WHERE empleado_id = ? 
           AND ((fecha_inicio <= ? AND fecha_fin >= ?) OR (fecha_inicio <= ? AND fecha_fin >= ?)) 
           AND eliminado_en IS NULL`,
        [a.empleado_id, a.fecha_fin, a.fecha_inicio, a.fecha_inicio, a.fecha_fin]
      );

      if (existentes.length > 0) {
        // Actualizar asignación existente (cambiar turno_id y rango)
        await conn.query(
          `UPDATE asignacion_turnos 
           SET turno_id = ?, fecha_inicio = ?, fecha_fin = ? 
           WHERE id = ?`,
          [a.turno_id, a.fecha_inicio, a.fecha_fin, existentes[0].id]
        );
      } else {
        // Insertar nueva asignación
        await conn.query(
          `INSERT INTO asignacion_turnos (empleado_id, turno_id, fecha_inicio, fecha_fin, creado_por)
           VALUES (?, ?, ?, ?, ?)`,
          [a.empleado_id, a.turno_id, a.fecha_inicio, a.fecha_fin, req.usuario?.id || null]
        );
      }
    }

    await conn.commit();
    conn.release();

    res.json({
      success: true,
      message: 'Asignaciones guardadas correctamente',
      total: asignaciones.length
    });

  } catch (err) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }
    console.error('Error en bulk:', err);
    res.status(500).json({
      success: false,
      message: 'Error al guardar asignaciones',
      error: err.message
    });
  }
});



      module.exports = router;
