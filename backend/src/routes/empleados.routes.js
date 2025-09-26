const express = require('express');
const db = require('../db.js');
const { audit } = require('../utils/audit.js');
const router = express.Router();
const biometricSvc = require('../services/biometric/hikvision.service');

//  helpers 
function isISODate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d||'')); }

// MODELO 
class EmpleadosModel {
  static async getAll() {
    const [rows] = await db.query(`
      SELECT id, numero_empleado, nombre_completo, email, rol_id, area_id, activo, creado_en, actualizado_en
      FROM empleados
      ORDER BY nombre_completo ASC
    `);
    return rows;
  }

  static async getById(id) {
    const [rows] = await db.query(`
      SELECT id, numero_empleado, nombre_completo, email, rol_id, area_id, activo, creado_en, actualizado_en
      FROM empleados
      WHERE id = ?
    `, [id]);
    return rows.length ? rows[0] : null;
  }

  static async getByNumeroEmpleado(numero_empleado) {
    const [rows] = await db.query(`SELECT id FROM empleados WHERE numero_empleado = ?`, [numero_empleado]);
    return rows.length ? rows[0] : null;
  }

  static async getByEmail(email) {
    if (!email) return null;
    const [rows] = await db.query(`SELECT id FROM empleados WHERE email = ?`, [email]);
    return rows.length ? rows[0] : null;
  }

  static async create({ numero_empleado, nombre_completo, email, rol_id, area_id, activo = 1 }) {
    let normalizedAreaId = (area_id === '' || area_id === undefined || area_id === null || Number.isNaN(Number(area_id)))
      ? null : Number(area_id);

    const [result] = await db.query(`
      INSERT INTO empleados (numero_empleado, nombre_completo, email, rol_id, area_id, activo)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [numero_empleado, nombre_completo, email || null, rol_id, normalizedAreaId, activo]);
    
    return { 
      id: result.insertId, numero_empleado, nombre_completo, email: email || null,
      rol_id, area_id: normalizedAreaId, activo 
    };
  }

  static async update(id, { nombre_completo, email, rol_id, area_id, activo }) {
    let normalizedAreaId = (area_id === '' || area_id === undefined || area_id === null || Number.isNaN(Number(area_id)))
      ? null : Number(area_id);

    const [result] = await db.query(`
      UPDATE empleados SET nombre_completo=?, email=?, rol_id=?, area_id=?, activo=? WHERE id=?
    `, [nombre_completo, email || null, rol_id, normalizedAreaId, activo, id]);
    
    if (result.affectedRows === 0) throw new Error('Empleado no encontrado');
    return this.getById(id);
  }

  static async softDelete(id) {
    const [result] = await db.query(`UPDATE empleados SET activo=0 WHERE id=?`, [id]);
    if (result.affectedRows === 0) throw new Error('Empleado no encontrado');
    return true;
  }

  static async delete(id) {
    const [result] = await db.query(`DELETE FROM empleados WHERE id=?`, [id]);
    if (result.affectedRows === 0) throw new Error('Empleado no encontrado');
    return true;
  }

  static async getActive() {
    const [rows] = await db.query(`
      SELECT id, numero_empleado, nombre_completo, email, rol_id, area_id, activo, creado_en, actualizado_en
      FROM empleados
      WHERE activo=1
      ORDER BY nombre_completo ASC
    `);
    return rows;
  }
}

//  CONTROLADOR
class EmpleadosController {
  static async getAllEmpleados(_req, res) {
    try {
      const empleados = await EmpleadosModel.getAll();
      return res.json({ success: true, data: empleados, count: empleados.length });
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Error obteniendo empleados', message: error.message });
    }
  }

  static async getEmpleadosActivos(_req, res) {
    try {
      const empleados = await EmpleadosModel.getActive();
      return res.json({ success: true, data: empleados, count: empleados.length });
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Error obteniendo empleados activos', message: error.message });
    }
  }

  static async getEmpleadoById(req, res) {
    try {
      const { id } = req.params;
      if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'ID invalido' });
      const empleado = await EmpleadosModel.getById(parseInt(id, 10));
      if (!empleado) return res.status(404).json({ success: false, error: 'Empleado no encontrado' });
      return res.json({ success: true, data: empleado });
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Error obteniendo empleado', message: error.message });
    }
  }

  static async createEmpleado(req, res) {
    try {
      const { numero_empleado, nombre_completo, email, rol_id, area_id, activo } = req.body;
      const required = [];
      if (!numero_empleado) required.push('numero_empleado');
      if (!nombre_completo) required.push('nombre_completo');
      if (!rol_id) required.push('rol_id');

      if (required.length) {
        return res.status(400).json({ success: false, error: 'Faltan campos requeridos', required });
      }

      if (await EmpleadosModel.getByNumeroEmpleado(numero_empleado)) {
        return res.status(409).json({ success: false, field: 'numero_empleado', error: 'El número de empleado ya existe' });
      }

      if (email) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          return res.status(400).json({ success: false, field: 'email', error: 'Correo inválido' });
        }
        if (await EmpleadosModel.getByEmail(email)) {
          return res.status(409).json({ success: false, field: 'email', error: 'El correo ya existe' });
        }
      }

      const nuevo = await EmpleadosModel.create({
        numero_empleado,
        nombre_completo,
        email: email || null,
        rol_id: parseInt(rol_id, 10),
        area_id,
        activo: activo !== undefined ? Boolean(activo) : true,
      });

      await audit({ evento: 'CREATE', entidad: 'empleados', entidad_id: nuevo.id, antes: null, despues: nuevo, req });
      return res.status(201).json({ success: true, message: 'Empleado creado', data: nuevo });
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Error creando empleado', message: error.message });
    }
  }

  static async updateEmpleado(req, res) {
    try {
      const { id } = req.params;
      const { nombre_completo, email, rol_id, area_id, activo } = req.body;
      if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'ID invalido' });

      const existente = await EmpleadosModel.getById(parseInt(id, 10));
      if (!existente) return res.status(404).json({ success: false, error: 'Empleado no encontrado' });

      const actualizado = await EmpleadosModel.update(parseInt(id, 10), {
        nombre_completo,
        email: email || null,
        rol_id: parseInt(rol_id, 10),
        area_id,
        activo: activo !== undefined ? Boolean(activo) : existente.activo,
      });

      await audit({ evento: 'UPDATE', entidad: 'empleados', entidad_id: parseInt(id, 10), antes: existente, despues: actualizado, req });
      return res.json({ success: true, message: 'Empleado actualizado', data: actualizado });
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Error actualizando empleado', message: error.message });
    }
  }

  static async deactivateEmpleado(req, res) {
    try {
      const { id } = req.params;
      if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });

      const antes = await EmpleadosModel.getById(parseInt(id, 10));
      if (!antes) return res.status(404).json({ success: false, error: 'Empleado no encontrado' });

      await EmpleadosModel.softDelete(parseInt(id, 10));
      await audit({ evento: 'DEACTIVATE', entidad: 'empleados', entidad_id: parseInt(id, 10), antes, despues: { ...antes, activo: 0 }, req });
      return res.json({ success: true, message: 'Empleado desactivado' });
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Error desactivando empleado', message: error.message });
    }
  }

  static async deleteEmpleado(req, res) {
    try {
      const { id } = req.params;
      if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });

      const antes = await EmpleadosModel.getById(parseInt(id, 10));
      if (!antes) return res.status(404).json({ success: false, error: 'Empleado no encontrado' });

      await EmpleadosModel.delete(parseInt(id, 10));
      await audit({ evento: 'DELETE', entidad: 'empleados', entidad_id: parseInt(id, 10), antes, despues: null, req });
      return res.json({ success: true, message: 'Empleado eliminado permanentemente' });
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Error eliminando empleado', message: error.message });
    }
  }
}


router.post('/importar-biometrico', async (_req, res) => {
  try {
    const users = await biometricSvc.getUserNames();
    const importados = [];
    
    for (const u of users) {
      // Verificamos si ya existe en DB
      const existente = await EmpleadosModel.getByNumeroEmpleado(u.employeeNo);
      if (!existente) {
        const nuevo = await EmpleadosModel.create({
          numero_empleado: u.employeeNo,
          nombre_completo: u.name,
          email: null,
          rol_id: null,
          area_id: null,
          activo: 1
        });
        importados.push(nuevo);
      }
    }
    
    res.json({ success: true, importados, count: importados.length });
  } catch (err) {
    console.error("Error importando empleados:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

//  RUTA DISPONIBLES 
  router.get('/disponibles', async (req, res) => {
    try {
      const { desde, hasta, area_id, rol } = req.query;
      if (!desde || !hasta) {
        return res.status(400).json({ success: false, error: "Parámetros requeridos: desde, hasta" });
      }

      let sql = `
        SELECT e.id, e.numero_empleado, e.nombre_completo, e.rol_id, e.area_id
        FROM empleados e
        WHERE e.activo=1
          AND e.id NOT IN (
            SELECT empleado_id
            FROM asignacion_turnos
            WHERE fecha BETWEEN ? AND ?
          )
      `;
      const params = [desde, hasta];
      if (area_id) { sql += " AND e.area_id=?"; params.push(area_id); }
      if (rol) { sql += " AND e.rol_id IN (SELECT id FROM roles_empleado WHERE LOWER(nombre_rol) LIKE ?)"; params.push(`%${rol.toLowerCase()}%`); }
      sql += " ORDER BY e.nombre_completo ASC";

      const [rows] = await db.query(sql, params);
      res.json({ success: true, data: rows });
    } catch (e) {
      res.status(500).json({ success: false, error: "Error consultando empleados disponibles", message: e.message });
    }
  });

  function showToast(type, message) {
  // Puedes usar cualquier librería como Toastr, PrimeNG o Angular Material.
  switch (type) {
    case 'success':
      console.log(' Éxito:', message);
      alert(' ' + message);
      break;
    case 'error':
      console.error(' Error:', message);
      alert(' ' + message);
      break;
    case 'info':
    default:
      console.info('ℹInfo:', message);
      alert('ℹ ' + message);
      break;
  }
}

//  RUTAS CRUD 
router.get('/', EmpleadosController.getAllEmpleados);
router.get('/activos', EmpleadosController.getEmpleadosActivos);
router.get('/:id', EmpleadosController.getEmpleadoById);
router.post('/', EmpleadosController.createEmpleado);
router.put('/:id', EmpleadosController.updateEmpleado);
router.delete('/:id', EmpleadosController.deactivateEmpleado);
router.delete('/:id/permanent', EmpleadosController.deleteEmpleado);

module.exports = router;
