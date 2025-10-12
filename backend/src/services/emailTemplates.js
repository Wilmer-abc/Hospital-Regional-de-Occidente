function plantillaAsignacionNormal(emp, turno, asignacion, area = null, jefe = null) {
  return `
    <div style="font-family: Arial, sans-serif; color: #333; padding: 16px;">
      <h2 style="color: #0066cc;">📅 Nuevo turno asignado</h2>
      <p>Hola <strong>${emp.nombre_completo}</strong>,</p>
      <p>Se te ha asignado un nuevo turno en el sistema del hospital:</p>
      <ul>
        <li><strong>Área:</strong> ${area?.nombre || "No definida"}</li>
        <li><strong>Jefe de área:</strong> ${jefe?.nombre_completo || "No definido"}</li>
        <li><strong>Turno:</strong> ${turno.nombre}</li>
        <li><strong>Horario:</strong> ${turno.hora_inicio} - ${turno.hora_fin}</li>
        <li><strong>Fecha inicio:</strong> ${asignacion.fecha_inicio}</li>
        <li><strong>Fecha fin:</strong> ${asignacion.fecha_fin}</li>
      </ul>
      <p>Por favor, asegúrate de presentarte puntualmente en el horario indicado.</p>
      <hr>
      <small>Este correo es generado automáticamente por el sistema de gestión de turnos del Hospital Regional de Occidente.</small>
    </div>
  `;
}

function plantillaAsignacionReemplazo(emp, turno, asignacion, area = null, jefe = null, reemplazado = null) {
  return `
    <div style="font-family: Arial, sans-serif; color: #333; padding: 16px;">
      <h2 style="color: #cc6600;">🔄 Asignación de reemplazo</h2>
      <p>Hola <strong>${emp.nombre_completo}</strong>,</p>
      <p>Se te ha asignado un turno como <strong>reemplazo</strong> en el sistema del hospital:</p>
      <ul>
        <li><strong>Área:</strong> ${area?.nombre || "No definida"}</li>
        <li><strong>Jefe de área:</strong> ${jefe?.nombre_completo || "No definido"}</li>
        <li><strong>Turno:</strong> ${turno.nombre}</li>
        <li><strong>Horario:</strong> ${turno.hora_inicio} - ${turno.hora_fin}</li>
        <li><strong>Fecha inicio:</strong> ${asignacion.fecha_inicio}</li>
        <li><strong>Fecha fin:</strong> ${asignacion.fecha_fin}</li>
        <li><strong>Reemplazando a:</strong> ${reemplazado?.nombre_completo || "No especificado"}</li>
      </ul>
      <p>Gracias por tu apoyo cubriendo este turno.</p>
      <hr>
      <small>Este correo es generado automáticamente por el sistema de gestión de turnos del Hospital Regional de Occidente.</small>
    </div>
  `;
}

module.exports = {
  plantillaAsignacionNormal,
  plantillaAsignacionReemplazo
};
