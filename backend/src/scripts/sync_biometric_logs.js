import 'dotenv/config';
import DigestFetch from 'digest-fetch';
import xml2js from 'xml2js';
import db from '../db.js';

// ============================================================
// CONFIGURACIÓN DE DISPOSITIVOS BIOMÉTRICOS
// ============================================================
const devices = [
  { ip: '192.168.0.45', user: 'admin.', pass: 'Hospital0.' },
  { ip: '192.168.0.46', user: 'admin', pass: 'Hospital0.' }
];

// ============================================================
// OBTENER EVENTOS (ENTRADAS/SALIDAS) DE UN DISPOSITIVO
// ============================================================
async function fetchLogsFromDevice(device) {
  const client = new DigestFetch(device.user, device.pass);

  // Intervalo diario (00:00:00 → 23:59:59)
  const today = new Date();
  const startTime = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const endTime = new Date(today.setHours(23, 59, 59, 999)).toISOString();

  console.log(`📡 Extrayendo eventos desde ${device.ip} (${startTime} → ${endTime})`);

  const body = {
    AcsEventCond: {
      searchID: '1',
      maxResults: 1000,
      searchResultPosition: 0,
      startTime,
      endTime
    }
  };

  try {
    const res = await client.fetch(
      `http://${device.ip}/ISAPI/AccessControl/AcsEvent?format=json`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    const raw = await res.text();
    let data;

    try {
      data = JSON.parse(raw);
      console.log(`${device.ip}: respondió en JSON`);
    } catch {
      data = await xml2js.parseStringPromise(raw, {
        explicitArray: false,
        mergeAttrs: true,
        tagNameProcessors: [xml2js.processors.stripPrefix]
      });
      console.log(`${device.ip}: respondió en XML`);
    }

    // Normalizar estructura
    const eventos = Array.isArray(data?.AcsEvent?.Info)
      ? data.AcsEvent.Info
      : data?.AcsEvent?.Info
      ? [data.AcsEvent.Info]
      : [];

    console.log(`✅ ${device.ip}: ${eventos.length} eventos obtenidos`);

    return eventos.map(ev => ({
      device: device.ip,
      employeeNo: ev.employeeNo || ev.employeeNoString || null,
      eventTime: ev.time || ev.dateTime || ev.eventTime || null,
      major: ev.major || null,
      minor: ev.minor || null
    }));

  } catch (err) {
    console.error(`❌ Error en ${device.ip}:`, err.message);
    return [];
  }
}

// ============================================================
// PROCESAR EVENTOS Y GUARDAR EN BASE DE DATOS
// ============================================================
async function saveAttendanceEvents(events) {
  console.log('🧩 Procesando y guardando eventos en tabla asistencias...');

  let insertados = 0;

  for (const ev of events) {
    if (!ev.employeeNo || !ev.eventTime) continue;

    try {
      const [rows] = await db.query(
        'SELECT id FROM empleados WHERE numero_empleado = ? LIMIT 1',
        [ev.employeeNo]
      );

      if (!rows.length) continue;
      const empleado_id = rows[0].id;

      const fecha = ev.eventTime.split('T')[0];
      const hora = new Date(ev.eventTime);

      // Obtener turno asignado
      const [[turno]] = await db.query(`
        SELECT t.id, t.hora_inicio, t.hora_fin, 
               t.tolerancia_entrada_minutos, t.tolerancia_salida_minutos
        FROM asignacion_turnos a
        INNER JOIN turnos t ON t.id = a.turno_id
        WHERE a.empleado_id = ? AND ? BETWEEN a.fecha_inicio AND a.fecha_fin
        LIMIT 1;
      `, [empleado_id, fecha]);

      if (!turno) continue;

      const horaInicio = new Date(`${fecha}T${turno.hora_inicio}`);
      const horaFin = new Date(`${fecha}T${turno.hora_fin}`);

      let estado = 'COMPLETO';
      let minutos_retraso = 0;

      if (hora < horaInicio) {
        estado = 'TEMPRANO';
      } else if (hora > new Date(horaInicio.getTime() + turno.tolerancia_entrada_minutos * 60000)) {
        estado = 'TARDE';
        minutos_retraso = Math.floor((hora - horaInicio) / 60000);
      }

      // Guardar o actualizar la asistencia
      await db.query(`
        INSERT INTO asistencias (empleado_id, fecha, turno_id, entrada_real, estado, minutos_retraso)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE salida_real = VALUES(entrada_real), estado = VALUES(estado)
      `, [empleado_id, fecha, turno.id, hora, estado, minutos_retraso]);

      insertados++;
    } catch (error) {
      console.error(`⚠️ Error procesando evento de empleado ${ev.employeeNo}:`, error.message);
    }
  }

  console.log(`📦 Total registros insertados o actualizados: ${insertados}`);
}

// ============================================================
// MAIN - LECTURA Y PROCESAMIENTO GLOBAL
// ============================================================
(async () => {
  try {
    console.log('🚀 Iniciando sincronización de marcajes de asistencia...');
    const allEvents = [];

    for (const dev of devices) {
      const logs = await fetchLogsFromDevice(dev);
      allEvents.push(...logs);
    }

    console.log(`📊 Total eventos combinados: ${allEvents.length}`);

    if (allEvents.length === 0) {
      console.warn('⚠️ No hay eventos para procesar.');
      process.exit(0);
    }

    await saveAttendanceEvents(allEvents);

    console.log('✅ Sincronización de marcajes completada correctamente.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error general:', err);
    process.exit(1);
  }
})();
