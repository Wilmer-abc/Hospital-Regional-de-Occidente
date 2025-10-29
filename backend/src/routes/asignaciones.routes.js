const express = require("express");
const axios = require("axios");
const router = express.Router();
const db = require('../db.js');
const { requireAuth, requireRRHHorJefe } = require('../middlewares/auth.js');
const { plantillaAsignacionNormal, plantillaAsignacionReemplazo } = require('../services/emailTemplates.js');
const { sendEmail} = require('../services/email.service.js');



// // Configuración del biometrico
// const BIOMETRICO_HOST = process.env.HIK1_HOST || "192.168.0.45";
// const BIOMETRICO_USER = process.env.HIK1_USER || "admin";
// const BIOMETRICO_PASS = process.env.HIK1_PASS || "Hospital0.";

// //  SINCRONIZAR MARCAJES CRUDOS 
// router.get("/sincronizar", async (_req, res) => {
//   try {
//     const { data } = await axios.get(
//       `http://${BIOMETRICO_HOST}/ISAPI/AccessControl/AcsEvent?format=json`,
//       {
//         auth: { username: BIOMETRICO_USER, password: BIOMETRICO_PASS },
//       }
//     );

//     const lista = data?.AcsEvent?.InfoList || [];
//     res.json({ success: true, total: lista.length, data: lista });
//   } catch (err) {
//     console.error("Error consultando biométrico:", err.message);
//     res.status(500).json({
//       success: false,
//       error: "Error consultando biométrico",
//       message: err.message,
//     });
//   }
// });

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

  // ========================= OBTENER CALENDARIO DE ASIGNACIONES DE UN EMPLEADO =========================
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

    async function buscarEmpleadosDisponiblesParaReemplazo(fecha, turnoId = null) {
      const [empleados] = await db.query(`
        SELECT 
          e.id,
          e.nombre_completo,
          e.email,
          e.rol_id,
          e.area_id,
          ar.nombre_area
        FROM empleados e
        LEFT JOIN areas ar ON e.area_id = ar.id
        WHERE e.activo = 1
          -- 🔸 No debe tener asignaciones que cubran la fecha seleccionada
          AND e.id NOT IN (
            SELECT a.empleado_id
            FROM asignacion_turnos a
            WHERE ? BETWEEN a.fecha_inicio AND a.fecha_fin
              AND a.eliminado_en IS NULL
          )
          -- 🔸 Solo empleados sin área o sin asignación vigente
          AND (e.area_id IS NULL OR e.area_id = 0)
        ORDER BY e.nombre_completo ASC
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

        //  AGRUPAR Y ENVIAR CORREOS
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

          for (const asignacion of asignacionesEmpleado) {
            if (asignacion.esReemplazo) {
              const [reemplazo] = await conn.query(
                'SELECT nombre_completo, email FROM empleados WHERE id = ?',
                [asignacion.empleado_id]
              );

              if (reemplazo.length && reemplazo[0].email) {
                const html = plantillaAsignacionReemplazo(
                  reemplazo[0],
                  {
                    nombre: asignacion.nombre_turno,
                    hora_inicio: asignacion.hora_inicio,
                    hora_fin: asignacion.hora_fin
                  },
                  asignacion,
                  { nombre: emp.area_nombre },
                  jefe,
                  { nombre_completo: emp.empleado_nombre }
                );

                await sendEmail(
                  reemplazo[0].email,
                  '🔄 Asignación de reemplazo',
                  html
                );

                console.log(`📧 Correo de reemplazo enviado a: ${reemplazo[0].email}`);
              } else {
                console.warn(`⚠️ Reemplazo ${asignacion.empleado_id} sin correo registrado`);
              }
            }
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


    // ========================= ASIGNAR TURNOS FIJOS =========================
    router.post('/fijos', requireAuth, async (req, res) => {
      //  aceptar tanto 'empleados' como 'empleados_ids'
      let { area_id, jefe_id, turno_id, empleados, empleados_ids, dias_descanso } = req.body;

      // Unificar formato
      if (!empleados && Array.isArray(empleados_ids)) {
        empleados = empleados_ids.map(id => ({ id }));
      }

      // Normalizar días de descanso
      if (typeof dias_descanso === 'string') {
        dias_descanso = dias_descanso.split(',').map(d => d.trim());
      }

      // 🧭 Validaciones iniciales
      if (!area_id || !jefe_id || !turno_id || !Array.isArray(empleados) || empleados.length === 0) {
        console.warn('⚠️ Datos incompletos recibidos en /fijos:', req.body);
        return res.status(400).json({
          success: false,
          message: 'Debe seleccionar el área, jefe, turno fijo y al menos un empleado.'
        });
      }

      let conn;
      try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // 🧩 Obtener ID del usuario creador (puede venir de Keycloak)
        // Si el usuario no existe aún en usuarios_sistema, será NULL
        const creadorId = req.user?.id ?? null;
        const creadorUsuario = req.user?.preferred_username || 'keycloak_user';

        // 📦 Crear registro del lote (cabecera)
        const [loteResult] = await conn.query(
          `INSERT INTO asignaciones_lote 
          (area_id, jefe_id, turno_id, fecha_inicio, fecha_fin, patron, dias_descanso, creado_por)
          VALUES (?, ?, ?, CURDATE(), NULL, 'NORMAL', ?, ?)`,
          [area_id, jefe_id, turno_id, dias_descanso?.join(',') || null, creadorId]
        );

        const loteId = loteResult.insertId;
        console.log(`📦 Lote fijo creado (ID: ${loteId}) por ${creadorUsuario}`);

        // 🔹 Insertar las asignaciones para todos los empleados
        const placeholders = empleados.map(() => '(?, ?, CURDATE(), CURDATE(), ?, ?)').join(',');
        const values = empleados.flatMap(emp => [
          emp.id,
          turno_id,
          creadorId,
          loteId
        ]);

        await conn.query(
          `INSERT INTO asignacion_turnos 
          (empleado_id, turno_id, fecha_inicio, fecha_fin, creado_por, lote_id)
          VALUES ${placeholders}`,
          values
        );

        await conn.commit();

        // =================== 📧 Enviar correos ===================
        const resultadosCorreos = [];
        for (const emp of empleados) {
          try {
            const [[infoEmpleado]] = await db.query(`
              SELECT e.nombre_completo, e.email, ar.nombre_area AS area_nombre
              FROM empleados e
              LEFT JOIN areas ar ON e.area_id = ar.id
              WHERE e.id = ?`, [emp.id]);

            if (infoEmpleado?.email) {
              const htmlMensaje = `
                <div style="font-family: Arial, sans-serif; color: #333;">
                  <h2>📅 Turno fijo asignado</h2>
                  <p>Hola <strong>${infoEmpleado.nombre_completo}</strong>,</p>
                  <p>Se te ha asignado un turno fijo en el área 
                    <strong>${infoEmpleado.area_nombre || 'Sin área'}</strong>.</p>
                  <p>Horario: <strong>08:00 AM - 04:00 PM</strong></p>
                  <p>Días de descanso: <strong>${dias_descanso?.length ? dias_descanso.join(', ') : 'Ninguno'}</strong></p>
                  <hr>
                  <small>Hospital Regional de Occidente<br>
                  Sistema de Gestión de Asistencia</small>
                </div>
              `;
              const enviado = await sendEmail(
                infoEmpleado.email,
                '📅 Turno fijo asignado',
                htmlMensaje
              );
              resultadosCorreos.push({ empleado_id: emp.id, correo: infoEmpleado.email, enviado });
            } else {
              resultadosCorreos.push({ empleado_id: emp.id, correo: null, enviado: false });
            }
          } catch (err) {
            console.error(`❌ Error enviando correo a empleado ${emp.id}:`, err.message);
            resultadosCorreos.push({ empleado_id: emp.id, error: err.message });
          }
        }

        // =================== 🧾 Registrar en bitácora ===================
        await db.query(
          `INSERT INTO audit_log (evento, entidad, entidad_id, actor_id, actor_username, ip, user_agent)
          VALUES ('CREATE', 'asignaciones_lote', ?, ?, ?, ?, ?)`,
          [
            loteId,
            creadorId,
            creadorUsuario,
            req.ip || null,
            req.headers['user-agent'] || null
          ]
        );

        console.log(`✅ Turnos fijos asignados correctamente para ${empleados.length} empleados.`);

        res.json({
          success: true,
          message: `Turnos fijos asignados correctamente.`,
          lote_id: loteId,
          total_empleados: empleados.length,
          resultadosCorreos
        });
      } catch (error) {
        if (conn) await conn.rollback();
        console.error('❌ Error en /fijos:', error);
        res.status(500).json({
          success: false,
          message: 'Error al asignar turnos fijos',
          error: error.message
        });
      } finally {
        if (conn) conn.release();
      }
    });

    // ========================= EMPLEADOS DISPONIBLES PARA REEMPLAZO =========================
    router.get("/reemplazos/disponibles", async (req, res) => {
      try {
        const { fecha, turno_id } = req.query;

        if (!fecha) {
          return res.status(400).json({ success: false, message: "Falta la fecha" });
        }

        console.log("📅 Buscando empleados disponibles para:", fecha, "Turno:", turno_id || "—");

        // 🔹 Nueva lógica:
        // 1) Solo empleados activos
        // 2) Que no tengan asignación para ese día (fecha entre fecha_inicio y fecha_fin)
        // 3) Que no estén asignados a otra área (solo disponibles o sin área)
        const [rows] = await db.query(`
          SELECT 
            e.id, e.nombre_completo, e.email, e.rol_id, e.area_id, ar.nombre_area
          FROM empleados e
          LEFT JOIN areas ar ON e.area_id = ar.id
          WHERE e.activo = 1
            AND e.id NOT IN (
              SELECT a.empleado_id
              FROM asignacion_turnos a
              WHERE ? BETWEEN a.fecha_inicio AND a.fecha_fin
                AND a.eliminado_en IS NULL
            )
            AND (e.area_id IS NULL OR e.area_id = 0)
          ORDER BY e.nombre_completo ASC;
        `, [fecha]);

        console.log(`✅ ${rows.length} empleados disponibles encontrados`);
        res.json({ success: true, data: rows });

      } catch (error) {
        console.error("❌ Error en /reemplazos/disponibles:", error.message);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ========================= SOLICITAR REEMPLAZO =========================
    router.post("/reemplazos/solicitar", async (req, res) => {
      let conn;
      try {
        const { empleado_original_id, empleado_reemplazo_id, fechas, turno_id } = req.body;

        if (!empleado_original_id || !empleado_reemplazo_id || !fechas?.length || !turno_id) {
          return res.status(400).json({ 
            success: false, 
            message: "Datos incompletos: empleado_original_id, empleado_reemplazo_id, fechas y turno_id son requeridos" 
          });
        }

        console.log("🔄 Solicitando reemplazo:", {
          empleado_original_id,
          empleado_reemplazo_id,
          fechas,
          turno_id
        });

        conn = await db.getConnection();
        await conn.beginTransaction();

        // 🔹 Buscar datos de los empleados y turno
        const [[reemplazo]] = await db.query(
          "SELECT id, nombre_completo, email FROM empleados WHERE id = ?", 
          [empleado_reemplazo_id]
        );
        
        const [[reemplazado]] = await db.query(
          "SELECT id, nombre_completo FROM empleados WHERE id = ?", 
          [empleado_original_id]
        );
        
        const [[turno]] = await db.query(
          "SELECT id, nombre_turno AS nombre, hora_inicio, hora_fin FROM turnos WHERE id = ?", 
          [turno_id]
        );

        if (!reemplazo || !reemplazado || !turno) {
          await conn.rollback();
          return res.status(400).json({ 
            success: false, 
            message: "No se encontraron los datos necesarios para el reemplazo" 
          });
        }

        // 🔹 Insertar asignaciones de reemplazo para cada fecha
        const asignacionesCreadas = [];
        for (const fecha of fechas) {
          const [result] = await conn.query(`
            INSERT INTO asignacion_turnos (empleado_id, turno_id, fecha_inicio, fecha_fin, creado_por)
            VALUES (?, ?, ?, ?, ?)
          `, [empleado_reemplazo_id, turno_id, fecha, fecha, req.user?.id || null]);
          
          asignacionesCreadas.push({
            id: result.insertId,
            fecha: fecha
          });
        }

        await conn.commit();

        console.log(`✅ Reemplazo creado: ${asignacionesCreadas.length} asignaciones para ${reemplazo.nombre_completo}`);

        // 🔹 Enviar correo de notificación usando la plantilla existente
        try {
          const html = plantillaAsignacionReemplazo(
            reemplazo,
            turno,
            { 
              fecha_inicio: fechas[0], 
              fecha_fin: fechas[fechas.length - 1] 
            },
            null,
            null,
            reemplazado
          );

          await sendEmail(
            reemplazo.email, 
            "🔄 Asignación de reemplazo - Hospital Regional", 
            html
          );
          
          console.log(`📧 Correo enviado a: ${reemplazo.email}`);
        } catch (emailError) {
          console.error("❌ Error enviando correo:", emailError);
          // No fallar la operación principal por error de email
        }

        res.json({ 
          success: true, 
          message: "Reemplazo asignado y notificado correctamente",
          asignaciones_creadas: asignacionesCreadas.length
        });

      } catch (error) {
        if (conn) await conn.rollback();
        console.error("❌ Error en /reemplazos/solicitar:", error);
        res.status(500).json({ 
          success: false, 
          message: error.message 
        });
      } finally {
        if (conn) conn.release();
      }
    });

      // =================== OBTENER ASIGNACIONES EXISTENTES DE UN EMPLEADO ===================
    router.get('/empleado/:id', requireAuth, async (req, res) => {
      const { id } = req.params;
      const { desde, hasta } = req.query;

      if (!id || !desde || !hasta) {
        return res.status(400).json({
          success: false,
          message: 'Faltan parámetros (id, desde, hasta)',
        });
      }

      try {
        const [rows] = await db.query(
          `SELECT a.id, a.empleado_id, a.turno_id, 
                  a.fecha_inicio, a.fecha_fin,
                  t.nombre_turno, t.hora_inicio, t.hora_fin
          FROM asignacion_turnos a
          INNER JOIN turnos t ON t.id = a.turno_id
          WHERE a.empleado_id = ?
            AND a.fecha_inicio BETWEEN ? AND ?
            AND a.eliminado_en IS NULL`,
          [id, desde, hasta]
        );

        // Expandir días dentro de los rangos
        const asignaciones = [];
        rows.forEach(r => {
          let f = new Date(r.fecha_inicio);
          const fin = new Date(r.fecha_fin);
          while (f <= fin) {
            asignaciones.push({
              fecha: f.toISOString().split('T')[0],
              turno_id: r.turno_id,
              nombre_turno: r.nombre_turno,
              hora_inicio: r.hora_inicio,
              hora_fin: r.hora_fin
            });
            f.setDate(f.getDate() + 1);
          }
        });

        res.json({ success: true, asignaciones });
      } catch (error) {
        console.error('❌ Error al obtener asignaciones:', error);
        res.status(500).json({
          success: false,
          message: 'Error al obtener asignaciones del empleado',
          error: error.message,
        });
      }
    });
    
    // ========================= RENOVAR LOTE DE ASIGNACIONES =========================  
    router.post('/renovar-lote', requireAuth, async (req, res) => {
      const { lote_id } = req.body;
      if (!lote_id) {
        return res.status(400).json({ success: false, message: 'Falta el ID del lote' });
      }

      let conn;
      try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // Obtener datos del lote original
        const [[lote]] = await conn.query(
          `SELECT * FROM asignaciones_lote WHERE id = ?`, [lote_id]
        );

        if (!lote) {
          return res.status(404).json({ success: false, message: 'Lote no encontrado' });
        }

        // Calcular fechas del próximo mes
        const fechaInicio = new Date(lote.fecha_inicio);
        const fechaFin = new Date(lote.fecha_fin);

        const nuevoInicio = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth() + 1, 1);
        const nuevoFin = new Date(nuevoInicio.getFullYear(), nuevoInicio.getMonth() + 1, 0);

        // Crear nuevo lote
        const [nuevoLote] = await conn.query(`
          INSERT INTO asignaciones_lote 
          (area_id, jefe_id, turno_id, fecha_inicio, fecha_fin, patron, dias_descanso, creado_por)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          lote.area_id, lote.jefe_id, lote.turno_id,
          nuevoInicio, nuevoFin,
          lote.patron, lote.dias_descanso, req.user?.id || null
        ]);

        const nuevoLoteId = nuevoLote.insertId;

        // Obtener empleados asignados
        const [asignaciones] = await conn.query(
          `SELECT empleado_id, turno_id FROM asignacion_turnos WHERE lote_id = ?`,
          [lote_id]
        );

        // Insertar nuevas asignaciones
        for (const a of asignaciones) {
          await conn.query(`
            INSERT INTO asignacion_turnos (empleado_id, turno_id, fecha_inicio, fecha_fin, creado_por, lote_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [a.empleado_id, a.turno_id, nuevoInicio, nuevoFin, req.user?.id || null, nuevoLoteId]);
        }

        await conn.commit();

        // Enviar correos a empleados y jefe (puedes reutilizar plantilla)
        // Similar al bloque de /bulk o /fijos

        res.json({
          success: true,
          message: 'Lote renovado correctamente',
          nuevo_lote_id: nuevoLoteId
        });

      } catch (error) {
        if (conn) await conn.rollback();
        res.status(500).json({ success: false, message: error.message });
      } finally {
        if (conn) conn.release();
      }
    });

    // ========================= RENOVAR LOTE DE ASIGNACIONES =========================
    router.post('/renovar-lote', requireAuth, async (req, res) => {
      const { lote_id } = req.body;
      if (!lote_id) {
        return res.status(400).json({ success: false, message: 'Falta el ID del lote' });
      }

      let conn;
      try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // 🔹 Obtener datos del lote original
        const [[lote]] = await conn.query(`SELECT * FROM asignaciones_lote WHERE id = ?`, [lote_id]);
        if (!lote) {
          return res.status(404).json({ success: false, message: 'Lote no encontrado' });
        }

        // 🔹 Calcular fechas del siguiente mes
        const fechaInicio = new Date(lote.fecha_inicio);
        const nuevoInicio = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth() + 1, 1);
        const nuevoFin = new Date(nuevoInicio.getFullYear(), nuevoInicio.getMonth() + 1, 0);

        // 🔹 Crear nuevo lote
        const [nuevoLote] = await conn.query(`
          INSERT INTO asignaciones_lote 
          (area_id, jefe_id, turno_id, fecha_inicio, fecha_fin, patron, dias_descanso, creado_por)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          lote.area_id, lote.jefe_id, lote.turno_id,
          nuevoInicio, nuevoFin,
          lote.patron, lote.dias_descanso, req.user?.id || null
        ]);

        const nuevoLoteId = nuevoLote.insertId;

        // 🔹 Obtener empleados del lote anterior
        const [asignaciones] = await conn.query(
          `SELECT empleado_id, turno_id FROM asignacion_turnos WHERE lote_id = ?`,
          [lote_id]
        );

        if (asignaciones.length === 0) {
          return res.status(400).json({ success: false, message: 'No hay empleados asignados en el lote actual.' });
        }

        // 🔹 Insertar nuevas asignaciones para el nuevo mes
        for (const a of asignaciones) {
          await conn.query(`
            INSERT INTO asignacion_turnos (empleado_id, turno_id, fecha_inicio, fecha_fin, creado_por, lote_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [a.empleado_id, a.turno_id, nuevoInicio, nuevoFin, req.user?.id || null, nuevoLoteId]);
        }

        await conn.commit();

        // Enviar correos a los empleados y jefe del área
        const [[areaInfo]] = await db.query(`
          SELECT a.nombre_area, e.nombre_completo AS jefe_nombre, e.email AS jefe_email
          FROM areas a
          LEFT JOIN empleados e ON e.id = ?
          WHERE a.id = ?`,
          [lote.jefe_id, lote.area_id]
        );

        const areaNombre = areaInfo?.nombre_area || 'Sin área';
        const jefeNombre = areaInfo?.jefe_nombre || 'Sin jefe asignado';

        const [empleados] = await db.query(`
          SELECT e.id, e.nombre_completo, e.email, t.nombre_turno, t.hora_inicio, t.hora_fin
          FROM asignacion_turnos a
          JOIN empleados e ON e.id = a.empleado_id
          JOIN turnos t ON t.id = a.turno_id
          WHERE a.lote_id = ?`, [nuevoLoteId]
        );

        const resultadosCorreos = [];

        for (const emp of empleados) {
          try {
            if (!emp.email) {
              resultadosCorreos.push({ empleado_id: emp.id, correo: null, enviado: false, error: 'Sin correo' });
              continue;
            }

            const htmlMensaje = `
              <div style="font-family: Arial, sans-serif; color: #333; padding: 1rem;">
                <h2 style="color:#2563eb;">Renovación automática de turno</h2>
                <p>Estimado(a) <strong>${emp.nombre_completo}</strong>,</p>
                <p>Tu turno ha sido renovado automáticamente para el mes siguiente con la misma configuración del mes actual.</p>

                <table border="1" cellpadding="6" cellspacing="0" 
                      style="border-collapse:collapse; margin-top:1rem; width:100%; font-size:0.95rem;">
                  <thead style="background:#f3f4f6;">
                    <tr>
                      <th style="text-align:left;">Área</th>
                      <th style="text-align:left;">Jefe</th>
                      <th style="text-align:left;">Turno</th>
                      <th style="text-align:left;">Horario</th>
                      <th style="text-align:left;">Rango</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>${areaNombre}</td>
                      <td>${jefeNombre}</td>
                      <td>${emp.nombre_turno}</td>
                      <td>${emp.hora_inicio} - ${emp.hora_fin}</td>
                      <td>${nuevoInicio.toISOString().split('T')[0]} al ${nuevoFin.toISOString().split('T')[0]}</td>
                    </tr>
                  </tbody>
                </table>

                <p style="margin-top:1rem;">Por favor, verifica tu horario y notifica cualquier incidencia a tu jefe inmediato.</p>
                <hr style="margin-top:1rem;">
                <small>Hospital Regional de Occidente<br>
                Sistema de Gestión de Asistencia Biométrica</small>
              </div>
            `;

            await sendEmail(
              emp.email,
              'Renovación de turno mensual - Hospital Regional de Occidente',
              htmlMensaje
            );

            resultadosCorreos.push({ empleado_id: emp.id, correo: emp.email, enviado: true });

          } catch (err) {
            console.error(`Error enviando correo a ${emp.nombre_completo}:`, err.message);
            resultadosCorreos.push({ empleado_id: emp.id, correo: emp.email, enviado: false, error: err.message });
          }
        }
            // ======================================================
        // Registrar evento en bitácora

        await db.query(`
          INSERT INTO audit_log (evento, entidad, entidad_id, actor_id, actor_username)
          VALUES ('CREATE', 'renovacion_lote', ?, ?, ?)
        `, [nuevoLoteId, req.user?.id || null, req.user?.preferred_username || 'sistema']);

        console.log(`Lote ${nuevoLoteId} renovado y correos enviados a ${resultadosCorreos.length} empleados.`);

        res.json({
          success: true,
          message: `Lote renovado y correos enviados (${resultadosCorreos.length}).`,
          nuevo_lote_id: nuevoLoteId,
          resultadosCorreos
        });

      } catch (error) {
        if (conn) await conn.rollback();
        console.error('Error en /renovar-lote:', error);
        res.status(500).json({ success: false, message: error.message });
      } finally {
        if (conn) conn.release();
      }
    });

module.exports = router;