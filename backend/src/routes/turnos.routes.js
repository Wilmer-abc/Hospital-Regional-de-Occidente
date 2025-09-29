const express = require('express');
const db = require('../db.js');
const router = express.Router();

// ===============================
// CRUD de Turnos
// ===============================

// Crear un turno
router.post('/', async (req, res) => {
  const { nombre, hora_inicio, hora_fin, tolerancia_entrada_minutos, tolerancia_salida_minutos } = req.body;
  if (!nombre || !hora_inicio || !hora_fin) {
    return res.status(400).json({ success: false, message: 'Faltan datos' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO turnos (nombre_turno, hora_inicio, hora_fin, tolerancia_entrada_minutos, tolerancia_salida_minutos)
       VALUES (?,?,?,?,?)`,
      [nombre, hora_inicio, hora_fin, tolerancia_entrada_minutos || 15, tolerancia_salida_minutos || 15]
    );

    const [rows] = await db.query(`SELECT id, nombre_turno AS nombre, hora_inicio, hora_fin, tolerancia_entrada_minutos, tolerancia_salida_minutos 
                                   FROM turnos WHERE id=?`, [result.insertId]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error creando turno', error: err.message });
  }
});

// Obtener todos los turnos
router.get('/', async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, nombre_turno AS nombre, hora_inicio, hora_fin, tolerancia_entrada_minutos, tolerancia_salida_minutos 
      FROM turnos 
      ORDER BY id ASC`);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error obteniendo turnos', error: err.message });
  }
});

// Obtener un turno por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT id, nombre_turno AS nombre, hora_inicio, hora_fin, tolerancia_entrada_minutos, tolerancia_salida_minutos 
       FROM turnos WHERE id=?`, 
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Turno no encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error obteniendo turno', error: err.message });
  }
});

// Actualizar un turno
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, hora_inicio, hora_fin, tolerancia_entrada_minutos, tolerancia_salida_minutos } = req.body;

  try {
    const [result] = await db.query(
      `UPDATE turnos SET nombre_turno=?, hora_inicio=?, hora_fin=?, tolerancia_entrada_minutos=?, tolerancia_salida_minutos=? 
       WHERE id=?`,
      [nombre, hora_inicio, hora_fin, tolerancia_entrada_minutos || 15, tolerancia_salida_minutos || 15, id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Turno no encontrado' });

    const [rows] = await db.query(
      `SELECT id, nombre_turno AS nombre, hora_inicio, hora_fin, tolerancia_entrada_minutos, tolerancia_salida_minutos 
       FROM turnos WHERE id=?`, 
      [id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error actualizando turno', error: err.message });
  }
});

// Eliminar un turno
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query(`DELETE FROM turnos WHERE id=?`, [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Turno no encontrado' });
    }
    res.json({ success: true, message: 'Turno eliminado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error eliminando turno', error: err.message });
  }
});

module.exports = router;
