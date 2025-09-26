const express = require('express');
const db = require('../db.js');
const { audit } = require('../utils/audit.js');
const router = express.Router();



//  Helpers 

function isISODate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d||'')); }



/*  MODELO  */

class EmpleadosModel {

  static async getAll() {

    const [rows] = await db.query(`

      SELECT id, numero_empleado, nombre_completo, email, rol_id, area_id, activo, creado_en, actualizado_en

      FROM empleados ORDER BY nombre_completo ASC

    `);

    return rows;

  }



  static async getById(id) {

    const [rows] = await db.query(`SELECT * FROM empleados WHERE id=?`, [id]);

    return rows.length ? rows[0] : null;

  }



  static async getByNumeroEmpleado(numero_empleado) {

    const [rows] = await db.query(`SELECT id FROM empleados WHERE numero_empleado=?`, [numero_empleado]);

    return rows.length ? rows[0] : null;

  }



  static async getByEmail(email) {

    if (!email) return null;

    const [rows] = await db.query(`SELECT id FROM empleados WHERE email=?`, [email]);

    return rows.length ? rows[0] : null;

  }



  static async create({ numero_empleado, nombre_completo, email, rol_id, area_id, activo = 1 }) {

    let normalizedAreaId = (!area_id || Number.isNaN(Number(area_id))) ? null : Number(area_id);



    const [result] = await db.query(`

      INSERT INTO empleados (numero_empleado, nombre_completo, email, rol_id, area_id, activo)

      VALUES (?,?,?,?,?,?)

    `, [numero_empleado, nombre_completo, email || null, rol_id, normalizedAreaId, activo]);



    return { id: result.insertId, numero_empleado, nombre_completo, email, rol_id, area_id: normalizedAreaId, activo };

  }



  static async update(id, { nombre_completo, email, rol_id, area_id, activo }) {

    let normalizedAreaId = (!area_id || Number.isNaN(Number(area_id))) ? null : Number(area_id);



    const [result] = await db.query(`

      UPDATE empleados SET nombre_completo=?, email=?, rol_id=?, area_id=?, activo=? WHERE id=?

    `, [nombre_completo, email || null, rol_id, normalizedAreaId, activo, id]);



    if (!result.affectedRows) throw new Error('Empleado no encontrado');

    return this.getById(id);

  }



  static async softDelete(id) {

    const [result] = await db.query(`UPDATE empleados SET activo=0 WHERE id=?`, [id]);

    if (!result.affectedRows) throw new Error('Empleado no encontrado');

    return true;

  }



  static async delete(id) {

    const [result] = await db.query(`DELETE FROM empleados WHERE id=?`, [id]);

    if (!result.affectedRows) throw new Error('Empleado no encontrado');

    return true;

  }



  static async getActive() {

    const [rows] = await db.query(`SELECT * FROM empleados WHERE activo=1 ORDER BY nombre_completo ASC`);

    return rows;

  }

}



/*  CONTROLADOR  */

class EmpleadosController {

  static async getAllEmpleados(_req, res) {

    try {

      const empleados = await EmpleadosModel.getAll();

      res.json({ success: true, data: empleados, count: empleados.length });

    } catch (e) {

      res.status(500).json({ success: false, error: 'Error obteniendo empleados', message: e.message });

    }

  }



  static async getEmpleadosActivos(_req, res) {

    try {

      const empleados = await EmpleadosModel.getActive();

      res.json({ success: true, data: empleados, count: empleados.length });

    } catch (e) {

      res.status(500).json({ success: false, error: 'Error obteniendo empleados activos', message: e.message });

    }

  }



  static async getEmpleadoById(req, res) {

    try {

      const { id } = req.params;

      if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });

      const empleado = await EmpleadosModel.getById(Number(id));

      if (!empleado) return res.status(404).json({ success: false, error: 'Empleado no encontrado' });

      res.json({ success: true, data: empleado });

    } catch (e) {

      res.status(500).json({ success: false, error: 'Error obteniendo empleado', message: e.message });

    }

  }



  static async createEmpleado(req, res) {

    try {

      const { numero_empleado, nombre_completo, email, rol_id, area_id, activo } = req.body;

      if (!numero_empleado || !nombre_completo || !rol_id) {

        return res.status(400).json({ success: false, error: 'Campos requeridos: numero_empleado, nombre_completo, rol_id' });

      }



      if (await EmpleadosModel.getByNumeroEmpleado(numero_empleado)) {

        return res.status(409).json({ success: false, error: 'Número de empleado ya existe' });

      }



      if (email && await EmpleadosModel.getByEmail(email)) {

        return res.status(409).json({ success: false, error: 'Correo ya existe' });

      }



      const nuevo = await EmpleadosModel.create({

        numero_empleado, nombre_completo, email, rol_id: Number(rol_id),

        area_id, activo: activo !== undefined ? Boolean(activo) : true

      });



      await audit({ evento: 'CREATE', entidad: 'empleados', entidad_id: nuevo.id, antes: null, despues: nuevo, req });

      res.status(201).json({ success: true, message: 'Empleado creado', data: nuevo });

    } catch (e) {

      res.status(500).json({ success: false, error: 'Error creando empleado', message: e.message });

    }

  }



  static async updateEmpleado(req, res) {

    try {

      const { id } = req.params;

      const { nombre_completo, email, rol_id, area_id, activo } = req.body;

      if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });



      const existente = await EmpleadosModel.getById(Number(id));

      if (!existente) return res.status(404).json({ success: false, error: 'Empleado no encontrado' });



      const actualizado = await EmpleadosModel.update(Number(id), {

        nombre_completo, email, rol_id: Number(rol_id), area_id,

        activo: activo !== undefined ? Boolean(activo) : existente.activo

      });



      await audit({ evento: 'UPDATE', entidad: 'empleados', entidad_id: Number(id), antes: existente, despues: actualizado, req });

      res.json({ success: true, message: 'Empleado actualizado', data: actualizado });

    } catch (e) {

      res.status(500).json({ success: false, error: 'Error actualizando empleado', message: e.message });

    }

  }



  static async deactivateEmpleado(req, res) {

    try {

      const { id } = req.params;

      if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });



      const antes = await EmpleadosModel.getById(Number(id));

      if (!antes) return res.status(404).json({ success: false, error: 'Empleado no encontrado' });



      await EmpleadosModel.softDelete(Number(id));

      await audit({ evento: 'DEACTIVATE', entidad: 'empleados', entidad_id: Number(id), antes, despues: { ...antes, activo: 0 }, req });

      res.json({ success: true, message: 'Empleado desactivado' });

    } catch (e) {

      res.status(500).json({ success: false, error: 'Error desactivando empleado', message: e.message });

    }

  }



  static async deleteEmpleado(req, res) {

    try {

      const { id } = req.params;

      if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });



      const antes = await EmpleadosModel.getById(Number(id));

      if (!antes) return res.status(404).json({ success: false, error: 'Empleado no encontrado' });



      await EmpleadosModel.delete(Number(id));

      await audit({ evento: 'DELETE', entidad: 'empleados', entidad_id: Number(id), antes, despues: null, req });

      res.json({ success: true, message: 'Empleado eliminado permanentemente' });

    } catch (e) {

      res.status(500).json({ success: false, error: 'Error eliminando empleado', message: e.message });

    }

  }

}



//  DISPONIBLES 

router.get('/disponibles', async (req, res) => {

  try {

    const { desde, hasta, area_id, rol } = req.query;

    if (!desde || !hasta) return res.status(400).json({ success: false, error: 'Parámetros requeridos: desde, hasta' });



    let sql = `

      SELECT e.id, e.numero_empleado, e.nombre_completo, e.rol_id, e.area_id

      FROM empleados e

      WHERE e.activo=1

        AND e.id NOT IN (

          SELECT empleado_id FROM asignacion_turnos WHERE fecha BETWEEN ? AND ?

        )

    `;

    const params = [desde, hasta];

    if (area_id) { sql += " AND e.area_id=?"; params.push(area_id); }

    if (rol) { sql += " AND e.rol_id IN (SELECT id FROM roles_empleado WHERE LOWER(nombre_rol) LIKE ?)"; params.push(`%${rol.toLowerCase()}%`); }

    sql += " ORDER BY e.nombre_completo ASC";



    const [rows] = await db.query(sql, params);

    res.json({ success: true, data: rows });

  } catch (e) {

    res.status(500).json({ success: false, error: 'Error consultando empleados disponibles', message: e.message });

  }

});



//  CRUD 

router.get('/', EmpleadosController.getAllEmpleados);

router.get('/activos', EmpleadosController.getEmpleadosActivos);

router.get('/:id', EmpleadosController.getEmpleadoById);

router.post('/', EmpleadosController.createEmpleado);

router.put('/:id', EmpleadosController.updateEmpleado);

router.delete('/:id', EmpleadosController.deactivateEmpleado);

router.delete('/:id/permanent', EmpleadosController.deleteEmpleado);



module.exports = router;
