import 'dotenv/config';
import DigestFetch from 'digest-fetch';
import xml2js from 'xml2js';
import db from '../db.js';

// Verificar credenciales específicas para cada dispositivo
const devices = [
  { ip: '192.168.0.45', user: 'admin.', pass: 'Hospital0.' },
  { ip: '192.168.0.46', user: 'admin', pass: 'Hospital0.' }
];

// Función para probar conexión antes de extraer usuarios
async function testDeviceConnection(device) {
  const client = new DigestFetch(device.user, device.pass);
  
  try {
    console.log(`Probando conexión con ${device.ip}...`);
    
    // Intentar una request simple primero
    const testRes = await client.fetch(`http://${device.ip}/ISAPI/System/deviceInfo`);
    
    if (testRes.ok) {
      console.log(` ${device.ip}: Autenticación exitosa`);
      return true;
    } else {
      console.log(` ${device.ip}: Error HTTP ${testRes.status}`);
      return false;
    }
  } catch (error) {
    console.log(` ${device.ip}: Error de conexión - ${error.message}`);
    return false;
  }
}

// Función auxiliar para limpiar valores
function extractValue(obj) {
  if (!obj) return null;
  if (typeof obj === 'string') return obj.trim();
  if (obj._) return obj._.trim();
  if (typeof obj === 'object') {
    const values = Object.values(obj).filter(v => v && (typeof v !== 'object' || v._));
    return values.length > 0 ? extractValue(values[0]) : null;
  }
  return String(obj).trim();
}

// Obtiene usuarios de un solo dispositivo (versión mejorada)
async function fetchFromDevice(device) {
  // Primero probar la conexión
  const connectionOk = await testDeviceConnection(device);
  if (!connectionOk) {
    console.log(`⏭ Saltando dispositivo ${device.ip} debido a problemas de autenticación`);
    return [];
  }

  const client = new DigestFetch(device.user, device.pass);
  console.log(`Extrayendo usuarios de ${device.ip}...`);

  const all = [];
  const maxResults = 50; // Reducir para debugging
  let pos = 0;
  let more = true;
  const maxLoops = 10; // Reducir para pruebas

  for (let i = 0; i < maxLoops && more; i++) {
    const searchId = `SRCH${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    
    try {
      // Intentar JSON primero
      const body = {
        UserInfoSearchCond: { 
          searchID: searchId, 
          maxResults, 
          searchResultPosition: pos 
        }
      };

      const res = await client.fetch(
        `http://${device.ip}/ISAPI/AccessControl/UserInfo/Search?format=json`,
        { 
          method: 'POST', 
          headers: { 
            'Content-Type': 'application/json',
            'Connection': 'keep-alive'
          }, 
          body: JSON.stringify(body) 
        }
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const status = data?.UserInfoSearch?.responseStatusStrg;
      console.log(`${device.ip}: Lote ${i} - JSON (${status})`);

      // Procesar usuarios
      const usersRaw = data?.UserInfoSearch?.UserInfo;
      if (usersRaw) {
        const usersList = Array.isArray(usersRaw) ? usersRaw : [usersRaw];
        console.log(`${device.ip}: Procesando ${usersList.length} usuarios`);
        
        for (const u of usersList) {
          const numero_empleado = extractValue(u.employeeNo) || extractValue(u.employeeNoString);
          const nombre_completo = extractValue(u.name) || 'SIN NOMBRE';
          
          if (numero_empleado) {
            all.push({ 
              device: device.ip, 
              numero_empleado, 
              nombre_completo 
            });
          }
        }
      } else {
        console.log(`${device.ip}: Sin usuarios en lote ${i}`);
      }

      // Verificar si hay más resultados
      if (status === 'MORE') {
        pos += maxResults;
      } else {
        more = false;
      }

    } catch (error) {
      console.error(`${device.ip}: Error en lote ${i}:`, error.message);
      break;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`${device.ip}: Total ${all.length} usuarios encontrados`);
  return all;
}

// Unificar duplicados
function unify(devicesUsers) {
  const map = new Map();
  for (const list of devicesUsers) {
    for (const u of list) {
      if (!u.numero_empleado) continue;
      map.set(u.numero_empleado, u);
    }
  }
  return Array.from(map.values());
}

// Guardar en base de datos
async function saveToDB(users) {
  console.log('Guardando en base de datos...');
  let insertados = 0;
  
  for (const u of users) {
    try {
      await db.query(
        `INSERT INTO empleados (numero_empleado, nombre_completo, activo)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE nombre_completo = VALUES(nombre_completo), activo = 1`,
        [u.numero_empleado, u.nombre_completo]
      );
      insertados++;
    } catch (dbError) {
      console.error(`Error insertando usuario ${u.numero_empleado}:`, dbError.message);
    }
  }
  console.log(`Total insertados/actualizados: ${insertados}`);
}

// Main
(async () => {
  try {
    console.log('Iniciando sincronización de usuarios biométricos...');
    const results = [];
    
    for (const d of devices) {
      try {
        const deviceUsers = await fetchFromDevice(d);
        results.push(deviceUsers);
      } catch (deviceError) {
        console.error(`Error crítico con dispositivo ${d.ip}:`, deviceError.message);
        results.push([]);
      }
    }
    
    const unified = unify(results);
    console.log(`🧩 Total unificados (sin duplicados): ${unified.length}`);
    
    if (unified.length > 0) {
      await saveToDB(unified);
      console.log('Sincronización completada correctamente.');
    } else {
      console.warn('Sincronización completada pero no se encontraron usuarios.');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error general:', err);
    process.exit(1);
  }
})();