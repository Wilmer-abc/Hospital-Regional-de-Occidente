const { makeClient } = require('./hikvision.client.cjs');
const db = require('../../db');
const xml2js = require('xml2js');

// Construye configuración desde .env (HIK1_, HIK2_, etc.)
function buildConfig(prefix) {
  return {
    host: process.env[`${prefix}_HOST`],
    port: process.env[`${prefix}_PORT`] || '80',
    user: process.env[`${prefix}_USER`],
    pass: process.env[`${prefix}_PASS`],
    proto: process.env[`${prefix}_PROTOCOL`] || 'http',
    timeout: parseInt(process.env[`${prefix}_TIMEOUT_MS`] || '8000', 10)
  };
}

const devices = [buildConfig('HIK1'), buildConfig('HIK2')].filter(d => d.host);

// TEST DE CONEXIÓN
async function testConnectionAll() {
  const results = [];
  for (const dev of devices) {
    try {
      const client = makeClient({
        baseUrl: `${dev.proto}://${dev.host}:${dev.port}`,
        user: dev.user,
        pass: dev.pass
      });
      const data = await client.get(`/ISAPI/AccessControl/AcsCfg/capabilities?format=json`);
      results.push({ host: dev.host, ok: true, capabilities: data });
    } catch (err) {
      results.push({ host: dev.host, ok: false, error: err.message });
    }
  }
  return results;
}

// Función auxiliar para extraer valores de objetos XML complejos
function extractValue(obj) {
  if (!obj) return null;
  if (typeof obj === 'string') return obj.trim();
  if (obj._) return obj._.trim(); // valor con atributos
  if (typeof obj === 'object') {
    // Buscar cualquier propiedad que contenga el valor
    const values = Object.values(obj).filter(val => 
      val && (typeof val !== 'object' || (val && val._))
    );
    return values.length > 0 ? extractValue(values[0]) : null;
  }
  return String(obj).trim();
}

// Función mejorada para obtener usuarios de un dispositivo
async function getUsersFromDevice(dev) {
  const client = makeClient({
    baseUrl: `${dev.proto}://${dev.host}:${dev.port}`,
    user: dev.user,
    pass: dev.pass
  });

  console.log(`\nIniciando extracción COMPLETA de usuarios desde ${dev.host}...`);
  
  const usuariosDispositivo = [];
  let posicion = 0;
  const maxResults = 100;
  let totalProcesados = 0;
  let ciclosCompletos = 0;
  const maxCiclos = 10;

  while (ciclosCompletos < maxCiclos) {
    try {
      const searchId = `SRCH${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
      
      console.log(`[${dev.host}] Lote ${ciclosCompletos + 1}, Posición: ${posicion}`);

      const body = {
        UserInfoSearchCond: {
          searchID: searchId,
          maxResults: maxResults,
          searchResultPosition: posicion
        }
      };

      let data;
      let responseStatus;

      // INTENTO 1: Formato JSON
      try {
        data = await client.post(`/ISAPI/AccessControl/UserInfo/Search?format=json`, body);
        responseStatus = data?.UserInfoSearch?.responseStatusStrg;
        console.log(`${dev.host} respondió en JSON, estado: ${responseStatus}`);
      } catch (jsonErr) {
        // INTENTO 2: Formato XML
        console.warn(`${dev.host} falló en JSON, intentando XML...`);
        try {
          const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
            <UserInfoSearchCond version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
              <searchID>${searchId}</searchID>
              <maxResults>${maxResults}</maxResults>
              <searchResultPosition>${posicion}</searchResultPosition>
            </UserInfoSearchCond>`;
          
          const xmlResp = await client.post(`/ISAPI/AccessControl/UserInfo/Search`, xmlBody, {
            headers: { 
              'Content-Type': 'application/xml',
              'Content-Length': Buffer.byteLength(xmlBody)
            }
          });

          // Parsear XML con opciones más permisivas
          data = await xml2js.parseStringPromise(xmlResp, {
            explicitArray: false,
            mergeAttrs: true,
            explicitRoot: false,
            ignoreAttrs: false,
            tagNameProcessors: [xml2js.processors.stripPrefix]
          });
          
          responseStatus = data?.UserInfoSearch?.responseStatusStrg;
          console.log(` ${dev.host} respondió en XML, estado: ${responseStatus}`);
        } catch (xmlErr) {
          console.error(`${dev.host} falló en XML también:`, xmlErr.message);
          break;
        }
      }

      // PROCESAR USUARIOS - Manejar múltiples formatos
      let listaUsuarios = [];

      const userInfoSearch = data?.UserInfoSearch;
      if (!userInfoSearch) {
        console.log(`  ${dev.host}: Estructura de respuesta inesperada`);
        break;
      }

      // Caso 1: Array de usuarios
      if (Array.isArray(userInfoSearch.UserInfo)) {
        listaUsuarios = userInfoSearch.UserInfo;
      } 
      // Caso 2: Objeto único de usuario
      else if (userInfoSearch.UserInfo && typeof userInfoSearch.UserInfo === 'object') {
        listaUsuarios = [userInfoSearch.UserInfo];
      }
      // Caso 3: Sin usuarios
      else if (userInfoSearch.responseStatusStrg === 'NO MATCH' || userInfoSearch.responseStatusStrg === 'OK') {
        console.log(`${dev.host}: No hay más usuarios disponibles`);
        break;
      }

      console.log(`${dev.host}: Procesando ${listaUsuarios.length} usuarios en este lote`);

      // Procesar cada usuario
      for (const usuarioRaw of listaUsuarios) {
        try {
          // Extraer número de empleado de múltiples formas posibles
          let numero_empleado = extractValue(usuarioRaw.employeeNo) || 
                               extractValue(usuarioRaw.employeeNoString) ||
                               extractValue(usuarioRaw.employeeNo_) ||
                               extractValue(usuarioRaw.employeeID);
          
          // Extraer nombre
          let nombre_completo = extractValue(usuarioRaw.name) || 
                               extractValue(usuarioRaw.name_) ||
                               extractValue(usuarioRaw.userName) ||
                               'SIN NOMBRE';

          // Solo agregar si tiene número de empleado
          if (numero_empleado) {
            const usuarioLimpio = {
              device: dev.host,
              numero_empleado: numero_empleado,
              nombre_completo: nombre_completo
            };

            usuariosDispositivo.push(usuarioLimpio);
            totalProcesados++;
          } else {
            console.log(`Usuario omitido - Sin número de empleado:`, JSON.stringify(usuarioRaw, null, 2));
          }
        } catch (userErr) {
          console.error(`Error procesando usuario individual:`, userErr.message);
        }
      }

      // VERIFICAR SI HAY MÁS RESULTADOS
      const tieneMasResultados = responseStatus === 'MORE' || 
                                listaUsuarios.length === maxResults ||
                                (userInfoSearch.numOfMatches && parseInt(userInfoSearch.numOfMatches) > posicion + listaUsuarios.length);

      if (tieneMasResultados) {
        posicion += maxResults;
        ciclosCompletos++;
        console.log(` ${dev.host}: Avanzando a posición ${posicion} (${totalProcesados} usuarios hasta ahora)`);
        
        // Pequeña pausa para no saturar el dispositivo
        await new Promise(resolve => setTimeout(resolve, 300));
      } else {
        console.log(` ${dev.host}: Extracción completada. Razón: ${responseStatus}`);
        break;
      }

    } catch (loteError) {
      console.error(`Error en lote ${posicion} de ${dev.host}:`, loteError.message);
      
      // Intentar continuar desde la siguiente posición
      posicion += maxResults;
      ciclosCompletos++;
      
      if (ciclosCompletos >= maxCiclos) {
        console.error(`Demasiados errores en ${dev.host}, terminando extracción`);
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`${dev.host}: Extracción finalizada - ${totalProcesados} usuarios encontrados`);
  return usuariosDispositivo;
}

// FUNCIÓN PRINCIPAL MEJORADA
async function getAllUserNames() {
  console.log(' INICIANDO EXTRACCIÓN COMPLETA DE TODOS LOS USUARIOS');
  console.log(`Dispositivos configurados: ${devices.length}`);
  
  const todosLosUsuarios = [];

  for (const dev of devices) {
    try {
      const usuariosDispositivo = await getUsersFromDevice(dev);
      todosLosUsuarios.push(...usuariosDispositivo);
      
      console.log(` ${dev.host}: ${usuariosDispositivo.length} usuarios recuperados`);
    } catch (error) {
      console.error(`💥 Error crítico con ${dev.host}:`, error.message);
    }
  }

  // ELIMINAR DUPLICADOS por numero_empleado
  const usuariosUnicos = [];
  const empleadosVistos = new Set();

  for (const usuario of todosLosUsuarios) {
    const clave = usuario.numero_empleado.trim().toLowerCase();
    if (!empleadosVistos.has(clave)) {
      empleadosVistos.add(clave);
      usuariosUnicos.push(usuario);
    }
  }

  // REPORTE FINAL DETALLADO
  console.log('\n ========== REPORTE FINAL ==========');
  console.log(` Total de usuarios crudos: ${todosLosUsuarios.length}`);
  console.log(` Total de usuarios únicos: ${usuariosUnicos.length}`);
  console.log(` Distribución por dispositivo:`);
  
  devices.forEach(dev => {
    const count = todosLosUsuarios.filter(u => u.device === dev.host).length;
    const unicosCount = usuariosUnicos.filter(u => u.device === dev.host).length;
    console.log(`   ${dev.host}: ${count} crudos, ${unicosCount} únicos`);
  });

  // Mostrar algunos ejemplos
  console.log(`\n Ejemplos de usuarios encontrados (primeros 5):`);
  usuariosUnicos.slice(0, 5).forEach((u, i) => {
    console.log(`   ${i + 1}. ${u.numero_empleado} - ${u.nombre_completo}`);
  });

  return usuariosUnicos;
}

// OBTENER EVENTOS (si necesitas esta función)
async function pullEvents(options = {}) {
  const { since = null, until = null, limit = 200 } = options;
  
  console.log('Obteniendo eventos desde dispositivos Hikvision...');
  
  const todosEventos = [];
  
  for (const dev of devices) {
    try {
      const client = makeClient({
        baseUrl: `${dev.proto}://${dev.host}:${dev.port}`,
        user: dev.user,
        pass: dev.pass
      });
      
      // Implementar lógica para obtener eventos según tu necesidad
      // Esto es un placeholder - ajusta según la API de Hikvision
      console.log(`Obteniendo eventos de ${dev.host}...`);
      
    } catch (error) {
      console.error(`Error obteniendo eventos de ${dev.host}:`, error.message);
    }
  }
  
  return {
    events: todosEventos,
    count: todosEventos.length
  };
}

// EXPORTAR TODAS LAS FUNCIONES
module.exports = {
  testConnectionAll,
  getAllUserNames,
  pullEvents
};