const { makeClient } = require('../biometric/hikvision.client.cjs');
const mock = require('../biometric/hikvision.mock');

const USE_MOCK = String(process.env.HIK_MOCK || 'true') === 'true';

function buildConfig(prefix) {
  return {
    host: process.env[`${prefix}_HOST`],
    port: process.env[`${prefix}_PORT`] || '80',
    user: process.env[`${prefix}_USER`],
    pass: process.env[`${prefix}_PASS`],
    proto: process.env[`${prefix}_PROTOCOL`] || 'http',
    timeout: process.env[`${prefix}_TIMEOUT_MS`] || 5000,
  };
}

// Soportamos múltiples biométricos
const devices = [
  buildConfig('HIK1'),
  buildConfig('HIK2'),
].filter(d => d.host);

function getDigestClient(dev) {
  return makeClient({
    baseUrl: `${dev.proto}://${dev.host}:${dev.port}`,
    user: dev.user,
    pass: dev.pass,
  });
}

async function pullEvents({ since, until, limit, cursor }) {
  // TODO: Implementar llamada real al biométrico
  // De momento devolvemos mock
  return {
    events: [],
    nextCursor: null
  };
}

module.exports = {
  // otros exports que ya tengas
  pullEvents,
};



// Obtener solo nombres desde cada biométrico
// async function getUserNamesFromDevice(dev) {
//   const client = getDigestClient(dev);
//   const body = {
//     UserInfoSearchCond: {
//       searchID: "1",
//       maxResults: 50,
//       searchResultPosition: 0
//     }
//   };

//   try {
//     const data = await client.postJson("/ISAPI/AccessControl/UserInfo/Search?format=json", body);
//     const usuarios = (data?.UserInfoSearch?.UserInfo) || [];
//     return usuarios.map(u => ({
//       device: dev.host,
//       numero_empleado: u.employeeNo,
//       nombre_completo: u.name
//     }));
//   } catch (err) {
//     console.error(`Error en biométrico ${dev.host}:`, err.message);
//     return [];
//   }
// }

// // API pública: juntar todos los biométricos
// async function getAllUserNames() {
//   if (USE_MOCK) {
//     return [
//       { device: "mock", numero_empleado: "1", nombre_completo: "Usuario Demo" },
//       { device: "mock", numero_empleado: "2", nombre_completo: "Otro Demo" }
//     ];
//   }

//   const all = await Promise.all(devices.map(getUserNamesFromDevice));
//   return all.flat();
// }

// module.exports = {
//   getAllUserNames,
// };
