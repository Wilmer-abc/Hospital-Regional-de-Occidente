// calendario-turnos.component.ts
import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TurnosService, DiaTrabajo } from '../../services/turnos.service';

interface DiaCalendario {
  fecha: string;
  diaSemana: string;
  numero: number;
  esHoy: boolean;
  esPasado: boolean;
  asignaciones: (DiaTrabajo & { nombreEmpleado?: string })[];
  disponible: boolean;
  asignacionesPendientes: DiaTrabajo[];
}

@Component({
  selector: 'app-calendario-turnos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './calendario-turnos.component.html',
  styleUrls: ['./calendario-turnos.component.scss']
})
export class CalendarioTurnosComponent implements OnInit {

  @Input() empleadoId!: number;
  @Input() equipo: any[] = [];
  @Input() turnosDisponibles: any[] = [];
  @Input() fechaInicio!: string;
  @Input() fechaFin!: string;

  @Output() asignacionesGuardadas = new EventEmitter<any>();
  @Output() turnoAsignado = new EventEmitter<any>();

  diaSeleccionado: DiaCalendario | null = null;

  mesActual: number;
  anioActual: number;
  diasCalendario: DiaCalendario[] = [];
  diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  mostrarModalAsignacion = false;
  fechaSeleccionada = '';
  turnoSeleccionado?: number;
  empleadoSeleccionado?: number;

  filtroActivo: string = 'todos';
  asignacionesPendientes: any[] = [];

  constructor(private turnosService: TurnosService) {
    const hoy = new Date();
    this.mesActual = hoy.getMonth();
    this.anioActual = hoy.getFullYear();
    this.asignacionesPendientes = [];
  }

  ngOnInit() {
    this.generarCalendario();
    this.cargarAsignaciones();
  }

  get nombreMes(): string {
    return this.meses[this.mesActual];
  }

  getNombreEmpleado(empleadoId: number): string {
    const empleado = this.equipo.find(e => e.id === empleadoId);
    return empleado ? empleado.nombre_completo : 'Empleado';
  }

  generarCalendario() {
    this.diasCalendario = [];
    
    const primerDia = new Date(this.anioActual, this.mesActual, 1);
    const ultimoDia = new Date(this.anioActual, this.mesActual + 1, 0);
    
    const diaInicio = primerDia.getDay();
    for (let i = diaInicio - 1; i >= 0; i--) {
      const fecha = new Date(this.anioActual, this.mesActual, -i);
      this.agregarDiaCalendario(fecha, true);
    }

    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
      const fecha = new Date(this.anioActual, this.mesActual, dia);
      this.agregarDiaCalendario(fecha, false);
    }

    const diasRestantes = 42 - this.diasCalendario.length;
    for (let i = 1; i <= diasRestantes; i++) {
      const fecha = new Date(this.anioActual, this.mesActual + 1, i);
      this.agregarDiaCalendario(fecha, true);
    }
  }

  private agregarDiaCalendario(fecha: Date, esExterno: boolean) {
    const hoy = new Date();
    const diaCalendario: DiaCalendario = {
      fecha: fecha.toISOString().split('T')[0],
      diaSemana: this.diasSemana[fecha.getDay()],
      numero: fecha.getDate(),
      esHoy: fecha.toDateString() === hoy.toDateString(),
      esPasado: fecha < hoy && !esExterno,
      asignaciones: [],
      disponible: !esExterno,
      asignacionesPendientes: []
    };

    this.diasCalendario.push(diaCalendario);
  }

  mesAnterior() {
    this.mesActual--;
    if (this.mesActual < 0) {
      this.mesActual = 11;
      this.anioActual--;
    }
    this.generarCalendario();
    this.cargarAsignaciones();
  }

  mesSiguiente() {
    this.mesActual++;
    if (this.mesActual > 11) {
      this.mesActual = 0;
      this.anioActual++;
    }
    this.generarCalendario();
    this.cargarAsignaciones();
  }

  cargarAsignaciones() {
    if (this.empleadoId) {
      this.turnosService.getCalendarioEmpleado(this.empleadoId, this.mesActual + 1, this.anioActual)
        .subscribe({
          next: (response) => {
            if (response.success && response.data) {
              this.procesarAsignaciones(response.data);
            }
          },
          error: (error) => {
            console.error('Error cargando asignaciones:', error);
          }
        });
    } 
  }

  private procesarAsignaciones(asignaciones: DiaTrabajo[]) {
    this.diasCalendario.forEach(dia => {
      dia.asignaciones = [];
    });

    asignaciones.forEach(asignacion => {
      // 🔹 Usar fecha_inicio para mapear en calendario
      const dia = this.diasCalendario.find(d => d.fecha === asignacion.fecha_inicio);
      if (dia) {
        dia.asignaciones.push({
          ...asignacion,
          nombreEmpleado: this.getNombreEmpleado(asignacion.empleado_id)
        });
      }
    });
  }

  seleccionarDia(dia: DiaCalendario) {
    if (!dia.disponible) return;
    
    this.fechaSeleccionada = dia.fecha;
    this.diaSeleccionado = dia;
    
    if (dia.disponible) {
      this.abrirModalAsignacion(dia.fecha);
    }
  }

  abrirModalAsignacion(fecha: string) {
    this.fechaSeleccionada = fecha;
    this.empleadoSeleccionado = this.empleadoId;
    this.turnoSeleccionado = undefined;
    this.mostrarModalAsignacion = true;
  }

  confirmarAsignacion() {
    if (this.turnoSeleccionado && this.empleadoId) {
      const turnoSeleccionado = this.turnosDisponibles.find(t => t.id === this.turnoSeleccionado);
      if (!turnoSeleccionado) {
        console.error('Turno no encontrado. ID:', this.turnoSeleccionado);
        return;
      }

      const nuevaAsignacion = {
        fecha_inicio: this.fechaSeleccionada,  
        fecha_fin: this.fechaSeleccionada,     
        fecha: this.fechaSeleccionada,         
        empleado_id: this.empleadoId,
        turno_id: this.turnoSeleccionado,
        hora_entrada: turnoSeleccionado.hora_inicio,
        hora_salida: turnoSeleccionado.hora_fin,
        estado: "ASIGNADO" as "ASIGNADO",
        necesita_reemplazo: false,
        nombreEmpleado: this.getNombreEmpleado(this.empleadoId)
      };

      // Actualizar visualmente el calendario
      const dia = this.diasCalendario.find(d => d.fecha === this.fechaSeleccionada);
      if (dia) {
        dia.asignaciones = [nuevaAsignacion];
      }

      // Emitir evento al componente padre
      this.turnoAsignado.emit(nuevaAsignacion);

      // Guardar en asignaciones pendientes
      this.asignacionesPendientes.push(nuevaAsignacion);

      this.cerrarModal();
    }
  }

  guardarAsignaciones() {
    if (this.asignacionesPendientes.length === 0) {
      alert('No hay asignaciones pendientes para guardar');
      return;
    }

    console.log('Asignaciones pendientes antes de enviar:', this.asignacionesPendientes);

    const payload = {
      asignaciones: this.asignacionesPendientes.map(a => ({
        empleado_id: a.empleado_id,
        turno_id: a.turno_id,
        fecha_inicio: a.fecha_inicio,  
        fecha_fin: a.fecha_fin        
      }))
    };

    console.log('Payload que se enviará al backend:', payload);

    this.turnosService.guardarAsignaciones(payload).subscribe({
      next: (res) => {
        if (res.success) {
          alert(' Asignaciones guardadas correctamente');
          this.asignacionesPendientes = [];
          this.asignacionesGuardadas.emit(this.asignacionesPendientes);
        } else {
          alert(`Error del servidor: ${res.message}`);
        }
      },
      error: (err) => {
        console.error('Error guardando asignaciones en servidor:', err);

        if (err.status === 400) {
          alert(`Error de validación: ${err.error.message}. Turnos inválidos: ${err.error.turnosInvalidos}`);
        } else if (err.status === 401) {
          alert('Error de autenticación. Por favor, inicie sesión nuevamente.');
        } else {
          alert('Error inesperado. Revise la consola.');
        }
      }
    });
  }

  cerrarModal() {
    this.mostrarModalAsignacion = false;
    this.fechaSeleccionada = '';
    this.turnoSeleccionado = undefined;
    this.empleadoSeleccionado = undefined;
  }
}
