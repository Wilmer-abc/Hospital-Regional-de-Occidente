const express = require("express");
const axios = require("axios");
const router = express.Router();
const db = require('../db.js');
const { requireAuth, requireRRHHorJefe } = require('../middlewares/auth.js');
const { plantillaAsignacionNormal, plantillaAsignacionReemplazo } = require('../services/emailTemplates.js');
const { sendEmail} = require('../services/email.service.js');



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
  `SELECT a.fecha_inicio, a.fecha_fin, a.turno_id, 
          t.nombre_turno, t.hora_inicio, t.hora_fin
   FROM asignacion_turnos a
   JOIN turnos t ON a.turno_id = t.id
   WHERE a.empleado_id = ? 
     AND (
       (YEAR(a.fecha_inicio) = ? AND MONTH(a.fecha_inicio) = ?)
       OR
       (YEAR(a.fecha_fin) = ? AND MONTH(a.fecha_fin) = ?)
     )`,
  [id, año, mes, año, mes]
);

  // Expandir rangos
  const asignaciones = [];
  rows.forEach(r => {
    let f = new Date(r.fecha_inicio);
    const fin = new Date(r.fecha_fin);
    while (f <= fin) {
      asignaciones.push({
        fecha: f.toISOString().split("T")[0],
        turno_id: r.turno_id,
        nombre_turno: r.nombre_turno,
        hora_inicio: r.hora_inicio,
        hora_fin: r.hora_fin
      });
      f.setDate(f.getDate() + 1);
    }
  });

  res.json({ success: true, data: asignaciones });
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

    // ========================= CREAR ASIGNACIONES EN BULK =========================
    router.post('/bulk', requireAuth, async (req, res) => {
      const { asignaciones } = req.body;
      if (!Array.isArray(asignaciones) || asignaciones.length === 0) {
        return res.status(400).json({ success: false, message: 'No hay asignaciones' });
      }

      let conn;
      const resultadosCorreos = [];

      try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // 🔹 Filtrar duplicados en memoria (por seguridad)
        const asignacionesUnicas = asignaciones.filter(
          (a, i, arr) =>
            i === arr.findIndex(
              b =>
                b.empleado_id === a.empleado_id &&
                b.turno_id === a.turno_id &&
                b.fecha_inicio === a.fecha_inicio &&
                b.fecha_fin === a.fecha_fin
            )
        );

        // 🔹 Insertar todas las asignaciones ignorando duplicados
        const placeholders = asignacionesUnicas.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
        const values = asignacionesUnicas.flatMap(a => [
          a.empleado_id,
          a.turno_id,
          a.fecha_inicio,
          a.fecha_fin,
          req.user?.id || null,
          null // lote_id
        ]);

        await conn.query(
          `INSERT IGNORE INTO asignacion_turnos 
          (empleado_id, turno_id, fecha_inicio, fecha_fin, creado_por, lote_id)
          VALUES ${placeholders}`,
          values
        );

        await conn.commit();

        // =================== 📧 AGRUPAR Y ENVIAR CORREOS ===================
        const empleadosMap = new Map();

        for (const a of asignacionesUnicas) {
          if (!empleadosMap.has(a.empleado_id)) empleadosMap.set(a.empleado_id, []);
          empleadosMap.get(a.empleado_id).push(a);
        }

        for (const [empleado_id, asignacionesEmpleado] of empleadosMap.entries()) {
          try {
            // 🔹 Obtener info del empleado, área, jefe y sus turnos
            const [[emp]] = await db.query(`
              SELECT e.nombre_completo AS empleado_nombre, e.email, ar.nombre_area AS area_nombre
              FROM empleados e
              LEFT JOIN areas ar ON e.area_id = ar.id
              WHERE e.id = ?;
            `, [empleado_id]);

            const [[jefe]] = await db.query(`
              SELECT es.nombre_completo AS jefe_nombre
              FROM area_supervisores s
              JOIN empleados es ON es.id = s.empleado_id
              WHERE s.area_id = ? AND s.es_titular = 1
              LIMIT 1;
            `, [emp?.area_id || null]);

            // 🔹 Traer datos de turnos con detalles
            const turnosIds = asignacionesEmpleado.map(a => a.turno_id);
            const placeholdersTurnos = turnosIds.map(() => '?').join(',');
            const [turnos] = await db.query(
              `SELECT id, nombre_turno, hora_inicio, hora_fin 
              FROM turnos WHERE id IN (${placeholdersTurnos})`,
              turnosIds
            );

            // 🔹 Consolidar la lista de fechas y horarios
            const listaTurnosHTML = asignacionesEmpleado
              .map(a => {
                const turno = turnos.find(t => t.id === a.turno_id);
                return `
                  <tr>
                    <td>${a.fecha_inicio}</td>
                    <td>${turno?.nombre_turno || '—'}</td>
                    <td>${turno?.hora_inicio || '—'} - ${turno?.hora_fin || '—'}</td>
                  </tr>`;
              })
              .join('');

            // 🧩 Plantilla HTML unificada
            const htmlMensaje = `
              <div style="font-family: Arial, sans-serif; color: #333;">
                <h2>📅 Nuevo turno asignado</h2>
                <p>Hola <strong>${emp.empleado_nombre}</strong>,</p>
                <p>Se te ha asignado a nuevos turnos en el área 
                  <strong>${emp.area_nombre || 'Sin área'}</strong>.</p>

                <table border="1" cellpadding="6" cellspacing="0" 
                      style="border-collapse:collapse; margin-top:1rem; width:100%;">
                  <thead style="background:#f3f3f3;">
                    <tr>
                      <th>Fecha</th>
                      <th>Turno</th>
                      <th>Horario</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${listaTurnosHTML}
                  </tbody>
                </table>

                <p style="margin-top:1rem;"><strong>Jefe responsable:</strong> ${jefe?.jefe_nombre || 'No asignado'}</p>
                <hr>
                <small>Hospital Regional de Occidente<br>
                Sistema de Gestión de Asistencia</small>
              </div>
            `;

            // 🔹 Enviar correo consolidado
            if (emp.email) {
              const enviado = await sendEmail(
                emp.email,
                '📅 Nuevos turnos asignados',
                htmlMensaje
              );
              resultadosCorreos.push({
                empleado_id,
                correo: emp.email,
                total_turnos: asignacionesEmpleado.length,
                enviado
              });
            } else {
              resultadosCorreos.push({
                empleado_id,
                correo: null,
                total_turnos: asignacionesEmpleado.length,
                enviado: false,
                error: 'Empleado sin correo'
              });
            }
          } catch (err) {
            console.error('❌ Error enviando correo agrupado:', err.message);
            resultadosCorreos.push({
              empleado_id,
              enviado: false,
              error: err.message
            });
          }
        }

        // ✅ Respuesta final
        res.json({
          success: true,
          message: 'Asignaciones registradas y correos enviados correctamente',
          total_empleados: empleadosMap.size,
          resultadosCorreos
        });

      } catch (error) {
        if (conn) await conn.rollback();
        console.error('❌ Error al crear asignaciones:', error);
        res.status(500).json({
          success: false,
          message: 'Error al crear asignaciones',
          error: error.message
        });
      } finally {
        if (conn) conn.release();
      }
    });



      module.exports = router;
