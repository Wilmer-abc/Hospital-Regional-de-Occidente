import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportesService } from '../../services/reportes.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reportes.component.html',
  styleUrls: ['./reportes.component.scss']
})
export class ReportesComponent implements OnInit {
  private repService = inject(ReportesService);
  areas: any[] = [];
  registros: any[] = [];

  areaSeleccionada: number | null = null;
  mesSeleccionado = '';   // formato YYYY-MM
  semanaSeleccionada: any = null;
  semanas: any[] = [];

  cargando = false;

  ngOnInit() {
    this.repService.getAreas().subscribe({
      next: (res) => {
        this.areas = res.areas;
        console.log('Áreas cargadas:', this.areas);
      },
      error: (err) => {
        console.error('Error cargando áreas:', err);
      }
    });
  }

  obtenerNombreArea() {
    const areaObj = this.areas.find(a => a.id === this.areaSeleccionada);
    console.log('Buscando área:', {
      seleccionada: this.areaSeleccionada,
      areas: this.areas,
      encontrada: areaObj
    });
    return areaObj ? areaObj.nombre_area : 'Área no encontrada';
  }

  generarSemanas() {
    if (!this.mesSeleccionado) return;

    const [year, month] = this.mesSeleccionado.split('-').map(Number);
    const fechaInicioMes = new Date(year, month - 1, 1);
    const diasMes = new Date(year, month, 0).getDate();

    this.semanas = [];

    let diaActual = 1;
    let numeroSemana = 1;

    while (diaActual <= diasMes) {
      const inicio = diaActual;
      const fin = Math.min(diaActual + 6, diasMes);
      const desde = new Date(year, month - 1, inicio).toISOString().split('T')[0];
      const hasta = new Date(year, month - 1, fin).toISOString().split('T')[0];
      const texto = `Semana ${numeroSemana}: ${inicio}–${fin} ${fechaInicioMes.toLocaleString('es', { month: 'short' })}`;
      this.semanas.push({ numero: numeroSemana, desde, hasta, texto });
      diaActual += 7;
      numeroSemana++;
    }

    this.semanaSeleccionada = null;
  }

generarReporte() {
  if (!this.areaSeleccionada || !this.semanaSeleccionada) {
    alert('Seleccione un área y una semana.');
    return;
  }

  const { desde, hasta } = this.semanaSeleccionada;
  this.cargando = true;

  console.log('Generando reporte con:', {
    areaId: this.areaSeleccionada,
    desde,
    hasta,
    areasDisponibles: this.areas
  });

  this.repService.getReporte(this.areaSeleccionada, desde, hasta).subscribe({
    next: (res) => {
      console.log('Datos recibidos:', res.registros);
      this.registros = res.registros;
      this.cargando = false;
    },
    error: (err) => {
      console.error('Error al generar reporte:', err);
      this.cargando = false;
    }
  });
}

obtenerResumen() {
  const total = this.registros.length;
  const presentes = this.registros.filter(r => r.estado_dia === 'Presente').length;
  const ausentes = this.registros.filter(r => r.estado_dia === 'Ausente').length;
  return { total, presentes, ausentes };
}

  // MÉTODOS NUEVOS PARA LAS CLASES DINÁMICAS
  getCumplimientoClass(cumplimiento: string): string {
    if (!cumplimiento) return '';
    
    if (cumplimiento.includes('✅') || cumplimiento.includes('Cumple')) return 'estado-presente';
    if (cumplimiento.includes('⚠️') || cumplimiento.includes('Retraso')) return 'estado-retraso';
    if (cumplimiento.includes('❌') || cumplimiento.includes('Ausente')) return 'estado-ausente';
    
    return '';
  }

  getEstadoClass(estado: string): string {
    if (!estado) return '';
    
    if (estado.includes('Presente')) return 'estado-presente';
    if (estado.includes('Ausente')) return 'estado-ausente';
    if (estado.includes('Retraso') || estado.includes('Tarde')) return 'estado-retraso';
    
    return '';
  }

  descargarPDF() {
    if (this.registros.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    const doc = new jsPDF('l', 'mm', 'a4');
    const logo = new Image();
    logo.src = 'assets/logo-hospital.png';

    const fechaGen = new Date().toLocaleDateString('es-GT');
    const area = this.obtenerNombreArea().replace(/\s+/g, '_');
    const rango = this.obtenerRangoSeleccionado();
    const resumen = this.obtenerResumen();

    logo.onload = () => {
      doc.setFontSize(10);
      try {
        doc.addImage(logo, 'PNG', 14, 8, 25, 25);
      } catch (e) {
        console.warn('No se pudo cargar el logo, continuando sin imagen...');
      }

      doc.setFont('helvetica', 'bold');
      doc.text('Hospital Regional de Occidente', 45, 15);
      doc.setFontSize(12);
      doc.text('Reporte de Asistencia por Área', 45, 23);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Área: ${this.obtenerNombreArea()}`, 14, 38);
      doc.text(`Periodo: ${rango}`, 90, 38);
      doc.text(`Generado: ${fechaGen}`, 200, 38);

      doc.text(
        `Total: ${resumen.total} | Presentes: ${resumen.presentes} | Ausentes: ${resumen.ausentes}`,
        14,
        45
      );

      const columnas = [
        { header: 'Empleado', dataKey: 'empleado' },
        { header: 'Cargo', dataKey: 'cargo' },
        { header: 'Fecha', dataKey: 'fecha' },
        { header: 'Turno', dataKey: 'turno_asignado' },
        { header: 'Entrada Prog.', dataKey: 'hora_entrada_programada' },
        { header: 'Salida Prog.', dataKey: 'hora_salida_programada' },
        { header: 'Entrada Real', dataKey: 'entrada_real' },
        { header: 'Salida Real', dataKey: 'salida_real' },
        { header: 'Cumplimiento', dataKey: 'cumplimiento' },
        { header: 'Estado', dataKey: 'estado_dia' }
      ];

      const filas = this.registros.map((r) => ({
        empleado: r.empleado,
        cargo: r.cargo,
        fecha: this.formatearFecha(r.fecha),
        turno_asignado: r.turno_asignado || 'N/A',
        hora_entrada_programada: r.hora_entrada_programada || 'N/A',
        hora_salida_programada: r.hora_salida_programada || 'N/A',
        entrada_real: r.entrada_real ? this.formatearHora(r.entrada_real) : '--:--',
        salida_real: r.salida_real ? this.formatearHora(r.salida_real) : '--:--',
        cumplimiento: r.cumplimiento,
        estado_dia: r.estado_dia
      }));

      autoTable(doc, {
        columns: columnas,
        body: filas,
        startY: 50,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [0, 82, 155], textColor: 255, halign: 'center' },
        alternateRowStyles: { fillColor: [240, 240, 240] },
        columnStyles: { 
          cumplimiento: { halign: 'center' }, 
          estado_dia: { halign: 'center' } 
        },
        didDrawPage: (data) => {
          const pageSize = doc.internal.pageSize;
          const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
          doc.setFontSize(8);
          doc.text(
            `Página ${doc.getNumberOfPages()} | Generado: ${fechaGen}`,
            14,
            pageHeight - 5
          );
        }
      });

      // ✅ NOMBRE CORREGIDO del archivo
      const nombreArchivo = `Reporte_${area}_${fechaGen.replace(/\//g, '-')}.pdf`;
      doc.save(nombreArchivo);
    };

    setTimeout(() => {
      if (logo.complete) return;
      console.warn('⚠️ Sin logo, generando PDF...');
      if (typeof logo.onload === 'function') {
        logo.onload(new Event('load'));
      }
    }, 500);
  }

  // NUEVO MÉTODO para formatear fechas correctamente
  formatearFecha(fechaString: string): string {
    if (!fechaString) return 'N/A';
    
    try {
      const fecha = new Date(fechaString);
      // Ajustar para problema de zona horaria
      fecha.setMinutes(fecha.getMinutes() + fecha.getTimezoneOffset());
      return fecha.toLocaleDateString('es-GT');
    } catch (e) {
      return 'Fecha inválida';
    }
  }

  // NUEVO MÉTODO para formatear horas correctamente
  formatearHora(fechaHoraString: string): string {
    if (!fechaHoraString) return '--:--';
    
    try { 
      const fecha = new Date(fechaHoraString);
      // Ajustar para problema de zona horaria
      fecha.setMinutes(fecha.getMinutes() + fecha.getTimezoneOffset());
      return fecha.toLocaleTimeString('es-GT', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    } catch (e) {
      return '--:--';
    }
  }

  obtenerRangoSeleccionado() {
    if (!this.semanaSeleccionada) return 'Sin rango';
    const { desde, hasta } = this.semanaSeleccionada;
    return `${desde} a ${hasta}`;
  }
}