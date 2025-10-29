import 'dotenv/config';
import DigestFetch from 'digest-fetch';
import xml2js from 'xml2js';
import db from '../db.js';

// ===========================================
// CONFIGURACIÓN DE DISPOSITIVOS
// ===========================================
const devices = [
  { ip: '192.168.0.45', user: 'admin.', pass: 'Hospital0.' },
  { ip: '192.168.0.46', user: 'admin', pass: 'Hospital0.' }
];

// ===========================================
// FUNCIONES AUXILIARES
// ===========================================
function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// Formatea fechas ISO
function isoNow(offsetDays = 0, hour = 0, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, min, 0, 0);
  return d.toISOString().split('.')[0];
}

// ===========================================
// DESCARGAR EVENTOS DESDE UN DISPOSITIVO
// ===========================================
async function fetchLogsFromDevice(device, limit = 1000) {
  const client = new DigestFetch(device.user, device.pass);
  const startTime = isoNow(0, 0, 0); // hoy desde medianoche
  const endTime = isoNow(0, 23, 59);

  console.log(`📡 Extrayendo eventos ${device.ip} (${startTime} → ${endTime})`);
  const body = {
    AcsEventCond: {
      searchID: '1',
      maxResults: limit,
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

    let data;
    try {
      data = await res.json();
    } catch {
      const xml = await res.text();
      data = await xml2js.parseStringPromise(xml, {
        explicitArray: false,
        mergeAttrs: true,
        tagNameProcessors: [xml2js.processors.stripPrefix]
      });
    }

    const eventos = Array.isArray(data?.AcsEvent?.Info)
      ? data.AcsEvent.Info
      : data?.AcsEvent?.Info
      ? [data.AcsEvent.Info]
      : [];

    console.log(`✅ ${device.ip}: ${eventos.length} eventos obtenidos`);
    return eventos.map(ev => ({
      device: device.ip,
      empleado: ev.employeeNo || ev.employeeNoString || null,
      fechaHora: ev.time || ev.dateTime || ev.eventTime || null
    }));
  } catch (err) {
    console.error(`❌ Error en ${device.ip}:`, err.message);
    return [];
  }
}

// ===========================================
// PROCESAR Y GUARDAR EVENTOS EN BD
// ===========================================
async function saveAttendance(events) {
  if (events.length === 0) {
    console.log('⚠️ No hay eventos para guardar.');
    return;
  }

  // Agrupar por empleado y fecha
  const map = new Map();
  for (const ev of events) {
    if (!ev.empleado || !ev.fechaHora) continue;
    const fecha = ev.fechaHora.split('T')[0];
    const key = `${ev.empleado}_${fecha}`;
    const hora = new Date(ev.fechaHora);

    if (!map.has(key)) map.set(key, { empleado: ev.empleado, fecha, entrada: hora, salida: hora });
    else {
      const reg = map.get(key);
      if (hora < reg.entrada) reg.entrada = hora;
      if (hora > reg.salida) reg.salida = hora;
    }
  }

  let procesados = 0;
  for (const reg of map.values()) {
    const [rows] = await db.query('SELECT id FROM empleados WHERE numero_empleado = ?', [reg.empleado]);
    if (!rows.length) continue;
    const empleado_id = rows[0].id;
    const fecha = reg.fecha;

    // Buscar turno asignado
    const [[turno]] = await db.query(`
      SELECT t.id, t.hora_inicio, t.tolerancia_entrada_minutos
      FROM asignacion_turnos a
      INNER JOIN turnos t ON t.id = a.turno_id
      WHERE a.empleado_id = ? AND ? BETWEEN a.fecha_inicio AND a.fecha_fin
      LIMIT 1;
    `, [empleado_id, fecha]);

    const turno_id = turno?.id || null;
    let estado = 'COMPLETO';
    let minutos_retraso = 0;

    if (turno_id) {
      const horaInicio = new Date(`${fecha}T${turno.hora_inicio}`);
      const tolerancia = turno.tolerancia_entrada_minutos;
      if (reg.entrada > new Date(horaInicio.getTime() + tolerancia * 60000)) {
        estado = 'TARDE';
        minutos_retraso = Math.floor((reg.entrada - horaInicio) / 60000);
      }
    }

    await db.query(`
      INSERT INTO asistencias (empleado_id, fecha, turno_id, entrada_real, salida_real, estado, minutos_retraso)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        entrada_real = VALUES(entrada_real),
        salida_real = VALUES(salida_real),
        estado = VALUES(estado),
        minutos_retraso = VALUES(minutos_retraso)
    `, [empleado_id, fecha, turno_id, reg.entrada, reg.salida, estado, minutos_retraso]);

    procesados++;
  }

  console.log(`🎯 ${procesados} registros procesados y guardados`);
}

// ===========================================
// SCRIPT PRINCIPAL
// ===========================================
(async () => {
  console.log('🚀 Iniciando sincronización de marcajes...');
  let allEvents = [];

  for (const dev of devices) {
    const evs = await fetchLogsFromDevice(dev);
    allEvents.push(...evs);
    await delay(300);
  }

  console.log(`📦 Total eventos combinados: ${allEvents.length}`);
  await saveAttendance(allEvents);
  console.log('✅ Sincronización de marcajes completada.');
  process.exit(0);
})();
