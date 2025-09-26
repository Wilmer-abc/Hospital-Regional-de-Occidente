const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');
const db = require('../db.js');

const router = express.Router();


// GET /api/reportes/formato-rol?area_id=3&mes=3&anio=2025
router.get('/formato-rol', async (req, res) => {
  try {
    const areaId = Number(req.query.area_id);
    const mes    = Number(req.query.mes);
    const anio   = Number(req.query.anio);

    if (!areaId || !mes || !anio) {
      return res.status(400).json({ success:false, error:'Parámetros requeridos: area_id, mes, anio' });
    }

    // Fechas del mes
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    // ultimo día del mes:
    const lastDay = new Date(anio, mes, 0).getDate();
    const hasta = `${anio}-${String(mes).padStart(2,'0')}-${lastDay}`;

    // Catalogos
    const [[area]] = await db.query(`SELECT id, nombre_area FROM areas WHERE id=?`, [areaId]);
    if (!area) return res.status(404).json({ success:false, error:'Área no encontrada' });

    const [empleados] = await db.query(`
      SELECT e.id, e.nombre_completo, e.rol_id, e.area_id, e.email,
             COALESCE(r.seccion_plantilla, 'OTROS') AS seccion,
             COALESCE(r.nivel,1) AS nivel
      FROM empleados e
      LEFT JOIN roles_empleado r ON r.id=e.rol_id
      WHERE e.activo=1 AND e.area_id=?
      ORDER BY seccion ASC, nombre_completo ASC
    `, [areaId]);

    if (!empleados.length) {
      return res.status(200).json({ success:false, error:'El área no tiene personal activo' });
    }

    // Asignaciones del mes
    const [asig] = await db.query(`
      SELECT a.empleado_id, a.fecha, t.codigo_plantilla, t.nombre_turno
      FROM asignacion_turnos a
      JOIN turnos t ON t.id = a.turno_id
      WHERE a.fecha BETWEEN ? AND ?
        AND a.empleado_id IN (${empleados.map(_=>'?').join(',')})
      ORDER BY a.empleado_id, a.fecha
    `, [desde, hasta, ...empleados.map(x=>x.id)]);

    // Mapa: { empId: { dia: "M/T/N/A" } }
    const mapa = new Map();
    for (const e of empleados) mapa.set(e.id, {});
    for (const r of asig) {
      const d = new Date(r.fecha);
      const dia = d.getDate();
      const code = r.codigo_plantilla || (r.nombre_turno?.[0] || '').toUpperCase();
      (mapa.get(r.empleado_id) || {})[dia] = code;
    }

    // Cargar plantilla
    const templatePath = path.join(__dirname, '..', '..', 'assets', 'templates', 'formato_rol.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);

    const ws = wb.getWorksheet('formato de rol'); 
    let headerRowIdx = null, colInicioDias = null;
    outer:
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const vals = row.values; 
      for (let c = 1; c <= row.cellCount; c++) {
        if (vals[c] === 1 && vals[c+1] === 2 && vals[c+2] === 3) {
          headerRowIdx = r;
          colInicioDias = c;
          break outer;
        }
      }
    }
    if (!headerRowIdx) {
      return res.status(500).json({ success:false, error:'No se pudo localizar la cabecera de días en la plantilla' });
    }

    // Rellena dias del mes f
    for (let d = 1; d <= lastDay; d++) {
      ws.getRow(headerRowIdx).getCell(colInicioDias + (d - 1)).value = d;
    }

    const ordenSecciones = [
      'ENFERMERAS PROFESIONALES',
      'ENFERMERA/O JEFE (A)', 
      'AUXILIARES DE ENFERMERÍA',
      'MÉDICO',
      'ADMISIÓN',
      'LABORATORIO',
      'CONSERJES',
      'SEGURIDAD',
      'OTROS'
    ];

    const porSeccion = new Map();
    for (const s of ordenSecciones) porSeccion.set(s, []);
    for (const e of empleados) {
      const s = ordenSecciones.includes(e.seccion) ? e.seccion : 'OTROS';
      porSeccion.get(s).push(e);
    }

    // Recorremos filas y cuando veamos "NOMBRE COMPLETO", sacamos el siguiente empleado de la sección vigente
    let seccionActual = 'OTROS';
    for (let r = 1; r <= ws.rowCount; r++) {
      const cNombre = 9; 
      const cellVal = (ws.getRow(r).getCell(cNombre).value || '').toString().trim();

      // Si la fila tiene un titulo de seccion, cambia seccionActual
      const raw = cellVal.toUpperCase();
      const matchSeccion = ordenSecciones.find(s => raw.includes(s));
      if (matchSeccion) {
        seccionActual = matchSeccion;
        continue;
      }

      // colocar nombre y sus codigos por daa
      if (cellVal.toUpperCase() === 'NOMBRE COMPLETO') {
        const lista = porSeccion.get(seccionActual) || [];
        if (!lista.length) continue; 

        const persona = lista.shift(); 
        // Escribe nombre
        ws.getRow(r).getCell(cNombre).value = persona.nombre_completo;

        // Escribe codigos por día
        const agenda = mapa.get(persona.id) || {};
        for (let d = 1; d <= lastDay; d++) {
          const code = agenda[d] || ''; // vacío si no hay asignación
          ws.getRow(r).getCell(colInicioDias + (d - 1)).value = code;
        }
      }
    }

    // Descargar
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      `attachment; filename="FORMATO_ROL_${area.nombre_area}_${anio}-${String(mes).padStart(2,'0')}.xlsx"`);

    await wb.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ success:false, error:'Error generando formato de rol', message: String(err?.message||err) });
  }
});

module.exports = router;
