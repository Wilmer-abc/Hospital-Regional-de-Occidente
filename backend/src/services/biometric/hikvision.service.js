const { makeClient } = require('../biometric/hikvision.client.cjs');
const db = require('../../db');

function buildConfig(prefix) {
  return {
    host: process.env[`${prefix}_HOST`],
    port: process.env[`${prefix}_PORT`] || '80',
    user: process.env[`${prefix}_USER`],
    pass: process.env[`${prefix}_PASS`],
    proto: process.env[`${prefix}_PROTOCOL`] || 'http',
    timeout: parseInt(process.env[`${prefix}_TIMEOUT_MS`] || '5000', 10),
  };
}

// Soporta múltiples biométricos
const devices = [buildConfig('HIK1'), buildConfig('HIK2')].filter(d => d.host);

function getDigestClient(dev) {
  return makeClient({
    baseUrl: `${dev.proto}://${dev.host}:${dev.port}`,
    user: dev.user,
    pass: dev.pass,
  });
}

// ========================== TEST CONEXIÓN ==========================
async function testConnectionAll() {
  const results = [];
  for (const dev of devices) {
    try {
      const client = getDigestClient(dev);
      const data = await client.get('/ISAPI/AccessControl/AcsCfg/capabilities?format=json');
      results.push({ host: dev.host, ok: true, capabilities: data });
    } catch (err) {
      results.push({ host: dev.host, ok: false, error: err.message });
    }
  }
  return results;
}

// ========================== PULL EVENTS ==========================
async function pullEvents({ since, until, limit }) {
  const allEvents = [];

  for (const dev of devices) {
    try {
      const client = getDigestClient(dev);
      const { AcsEvent } = await client.get('/ISAPI/AccessControl/AcsEvent?format=json');

      const lista = AcsEvent?.InfoList || [];

      const eventos = lista.map(ev => ({
        device: dev.host,
        employeeNo: ev.employeeNoString,
        name: ev.name,
        time: ev.time,
        eventType: ev.attendanceStatus,
        reader: ev.cardReaderNo,
        temperature: ev.temperature || null,
      }));

      allEvents.push(...eventos);
    } catch (err) {
      console.error(`Error leyendo eventos del biométrico ${dev.host}:`, err.message);
    }
  }

  // Limita resultados
  const eventosLimitados = limit ? allEvents.slice(0, limit) : allEvents;
  return { events: eventosLimitados, count: eventosLimitados.length };
}

// ========================== EXPORTS ==========================
module.exports = {
  testConnectionAll,
  pullEvents
};

async function syncAsistenciasDesdeBiometricos() {
  const { events } = await pullEvents({ limit: 200 });

  for (const ev of events) {
    const [rows] = await db.query('SELECT id FROM empleados WHERE numero_empleado = ?', [ev.employeeNo]);
    if (!rows.length) continue; // si el empleado no existe en la BD, lo saltamos

    const empleado_id = rows[0].id;
    const fecha = ev.time.split('T')[0];
    const hora = new Date(ev.time);
    
    // Determinar si es entrada o salida según horario asignado
    const [[turno]] = await db.query(`
      SELECT t.id, t.hora_inicio, t.hora_fin, t.tolerancia_entrada_minutos, t.tolerancia_salida_minutos
      FROM asignacion_turnos a
      INNER JOIN turnos t ON t.id = a.turno_id
      WHERE a.empleado_id = ? AND ? BETWEEN a.fecha_inicio AND a.fecha_fin
      LIMIT 1;
    `, [empleado_id, fecha]);

    if (!turno) continue;

    const horaInicio = new Date(`${fecha}T${turno.hora_inicio}`);
    const horaFin = new Date(`${fecha}T${turno.hora_fin}`);
    const toleranciaEntrada = turno.tolerancia_entrada_minutos;
    const toleranciaSalida = turno.tolerancia_salida_minutos;

    let estado = 'COMPLETO';
    let minutos_retraso = 0;

    if (hora < horaInicio) {
      estado = 'TEMPRANO';
    } else if (hora > new Date(horaInicio.getTime() + toleranciaEntrada * 60000)) {
      estado = 'TARDE';
      minutos_retraso = Math.floor((hora - horaInicio) / 60000);
    }

    await db.query(`
      INSERT INTO asistencias (empleado_id, fecha, turno_id, entrada_real, estado, minutos_retraso)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE salida_real = VALUES(entrada_real), estado = VALUES(estado)
    `, [empleado_id, fecha, turno.id, hora, estado, minutos_retraso]);
  }
}