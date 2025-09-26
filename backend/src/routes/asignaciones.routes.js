const express = require("express");
const axios = require("axios");
const router = express.Router();

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




module.exports = router;
