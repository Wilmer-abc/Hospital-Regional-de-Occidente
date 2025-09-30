import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule, FormGroup } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TurnosService } from '../../services/turnos.service';
import { CalendarioTurnosComponent } from '../calendario-turnos/calendario-turnos.component';
import { EmpleadosService } from '../../services/empleados.service';

const API = environment.apiBase;

// ===== Interfaces =====
interface Turno {
  nombre_turno: string;
  id: number;
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  minutos_descanso: number;
  tolerancia_entrada_minutos: number;
  tolerancia_salida_minutos: number;
  cruza_medianoche: boolean;
  esPersonalizado?: boolean;
}

interface Area {
  id: number;
  nombre: string;
}

interface Empleado {
  numero_empleado: string;
  id: number;
  nombre_completo: string;
  area_id: number | null;
  rol_id: number | null;
  email?: string | null;
  activo?: boolean;
  turnoAsignado?: number | null;
  rol_nombre?: string;
}

interface Rol {
  id: number;
  nombre: string;
  nivel?: number;
}

interface Reemplazo {
  id: number;
  empleadoId: number;
  reemplazoId: number | null;
  fechaInicio: string;
  fechaFin: string;
  motivo?: string;
  diaTrabajoId?: number;
}

interface NuevoTurno {
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  tolerancia_entrada_minutos: number;
  tolerancia_salida_minutos: number;
}

// 🔥 NUEVA INTERFACE para asignaciones
interface Asignacion {
  empleado_id: number;
  turno_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  hora_entrada?: string;
  hora_salida?: string;
}

@Component({
  selector: 'app-asignar-turnos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, CalendarioTurnosComponent],
  templateUrl: './asignar-turnos.component.html',
  styleUrls: ['./asignar-turnos.component.scss']
})
export class AsignarTurnosComponent implements OnInit {

  private empleadosService = inject(EmpleadosService);

  // ===== Estado de vistas =====
  vista: 'HOME' | 'LISTA_ROTATIVOS' | 'LISTA_FIJOS' | 'FORMULARIO' = 'HOME';
  modo: 'FIJO' | 'ROTATIVO' = 'ROTATIVO';
  editandoId: number | 'NUEVO' | null = null;
  step = 1;

  // ===== Estado general =====
  loading = false;
  error: string | null = null;
  info: string | null = null;

  // ===== Catálogos =====
  turnosFiltrados: any[] = [];
  turnos: Turno[] = [];
  areas: Area[] = [];
  jefesCandidatos: Empleado[] = [];
  roles: Rol[] = [];
  empleados: Empleado[] = [];
  empleadosAsignados: any[] = [];
  nuevoTurnoForm: FormGroup | undefined;
  
  

  // Datos de prueba / placeholders
  enfermerosSeleccionados: any[] = [];
  auxEnfermeriaSeleccionados: any[] = [];
  auxHospitalSeleccionadosData: any[] = [];

  empleadoCalendarioSeleccionado?: number;

  // ===== Inyecciones =====
  private turnosService = inject(TurnosService);
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);

  // ===== Formularios =====
  areaJefeForm = this.fb.group({
    area_id: [null as number | null, Validators.required],
    jefe_id: [null as number | null, Validators.required],
  });

  fijoForm = this.fb.group({
    area_id: [null, Validators.required],
    jefe_id: [null, Validators.required]
  });

  fechasForm = this.fb.group({
    fecha_inicio: ['', Validators.required],
    fecha_fin: ['', Validators.required],
    patron: ['NORMAL', Validators.required],
  });

  // ===== Turnos personalizados =====
  nuevoTurno: NuevoTurno = {
    nombre: '',
    hora_inicio: '08:00',
    hora_fin: '16:00',
    tolerancia_entrada_minutos: 15,
    tolerancia_salida_minutos: 15
  };
  areaService: any;
  
  // 🔥 MODIFICADO: Cambiar la estructura para usar fecha_inicio y fecha_fin
  asignacionesPendientes: Asignacion[] = [];

  // 🔥 NUEVA PROPIEDAD para conectar con el calendario
  asignacionesCalendario: Asignacion[] = [];

// Reemplaza el getter turnosDisponibles por este:
  get turnosDisponibles(): Turno[] {
    // Filtrar turnos válidos y ordenarlos
    return this.turnos
      .filter(t => t && t.nombre && t.hora_inicio && t.hora_fin)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  get enfermerosEquipoSeleccionados() {
  return this.equipoCompleto.filter(e => this.getTipoRolPorNombre(e.rol_id) === 'ENFERMERO');
  }

  get auxEnfermeriaEquipoSeleccionados() {
    return this.equipoCompleto.filter(e => this.getTipoRolPorNombre(e.rol_id) === 'AUX_ENFERMERIA');
  }

  get auxHospitalSeleccionados() {
    return this.equipoCompleto.filter(e => this.getTipoRolPorNombre(e.rol_id) === 'AUX_HOSPITAL');
  }

  // ===== Gestión de equipos =====
  empleadosFiltrados: Empleado[] = [];
  empleadosFijos: Empleado[] = [];
  filtroBusqueda: string = '';
  filtroRol: string | null = null;
  equipoCompleto: Empleado[] = [];

  // ===== Reemplazos =====
  reemplazos: Reemplazo[] = [];
  reemplazoActual: Reemplazo | null = null;
  mostrarModalReemplazos = false;
  busquedaReemplazo: string = '';
  empleadosDisponiblesReemplazo: Empleado[] = [];
  empleadoReemplazoSeleccionado: Empleado | null = null;
  empleadosFiltradosReemplazo: Empleado[] = [];

  // ===== Asignaciones individuales (desde calendario-turnos) =====
  asignaciones: Record<number, any[]> = {};

  // ===== Descanso grupal =====
  diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  descansoGrupal: { [key: string]: boolean } = {};

  // ===== Ciclo de vida =====
  ngOnInit(): void {
    this.cargarCatalogos();
    this.cargarTurnos();

        this.empleadosService.empleados$.subscribe(empleados => {
      this.empleados = empleados.map(emp => ({
        ...emp,
        id: emp.id ?? 0 // Asigna 0 si id es undefined
      }));
      this.filtrarEmpleados(); // Re-filtrar cuando cambien los datos
    });
    
  }

  // 🔹 Cargar turnos desde DB
   cargarTurnos() {
    this.http.get<any>(`${API}/turnos`).subscribe({
      next: (res) => {
        const turnosDB: Turno[] = res.data || res || [];
        this.turnos = turnosDB.map(t => ({
          id: t.id,
          nombre: t.nombre || t.nombre_turno,
          nombre_turno: t.nombre_turno || t.nombre || '',
          hora_inicio: t.hora_inicio,
          hora_fin: t.hora_fin,
          minutos_descanso: t.minutos_descanso ?? 0,
          tolerancia_entrada_minutos: t.tolerancia_entrada_minutos,
          tolerancia_salida_minutos: t.tolerancia_salida_minutos,
          cruza_medianoche: t.cruza_medianoche ?? false,
          esPersonalizado: true // 🔥 Marcar todos como personalizados para poder eliminarlos
        }));
      },
      error: (err) => console.error('Error cargando turnos:', err)
    });
  }

     private cargarCatalogos() {
    this.loading = true;
    this.error = null;

    const turnosGuardados = localStorage.getItem('turnosPersonalizados');
    const turnosPersonalizados = turnosGuardados ? JSON.parse(turnosGuardados) : [];

    // Cargar empleados usando el servicio
    this.empleadosService.cargarEmpleados().subscribe({
      next: (empleadosResponse) => {
        Promise.all([
          this.http.get<any>(`${API}/turnos`).toPromise(),
          this.http.get<any>(`${API}/areas`).toPromise(),
          this.http.get<any>(`${API}/roles`).toPromise()
        ])
        .then(([t, a, r]) => {
          
          // Los empleados ya están cargados por el servicio
          // Solo necesitamos cargar los otros catálogos
          
          // Cargar turnos
          this.turnos = [...turnosPersonalizados, ...(t?.data || [])];
          
          // Cargar áreas
          this.areas = (a?.data || []).map((x: any) => ({ 
            id: x.id, 
            nombre: x.nombre || x.nombre_area || 'Sin nombre' 
          }));
          
          // Cargar roles
          this.roles = (r?.data || []).map((rol: any) => ({
            id: rol.id,
            nombre: rol.nombre_rol || rol.nombre,
            nivel: rol.nivel
          }));

          // Filtrar empleados activos (los empleados ya vienen del servicio)
          this.filtrarEmpleados();
        })
        .catch((error) => {
          console.error('Error cargando catálogos:', error);
          this.error = 'No se pudieron cargar algunos catálogos.';
          this.filtrarEmpleados(); // Al menos filtrar los empleados que tenemos
        })
        .finally(() => {
          this.loading = false;
        });
      },
      error: (error) => {
        console.error('Error cargando empleados:', error);
        this.error = 'No se pudieron cargar los empleados.';
        this.loading = false;
      }
    });
  }


  //  Gestión de areas y empleados 
  onAreaChangeRotativo(areaId: string | number | null) {
    const id = areaId ? Number(areaId) : null;
    console.log('Área cambiada a:', id);
    if (id !== null) {
      this.cargarJefesCandidatos(id);
    }
    
    // Forzar el filtrado de empleados
    setTimeout(() => {
      this.filtrarEmpleados();
    }, 100);
  }

  
  cargarJefesCandidatos(areaId: number | null) {
    if (!areaId) {
      this.jefesCandidatos = [];
      return;
    }
    this.jefesCandidatos = this.empleados.filter(emp => 
      emp.area_id === areaId && emp.activo
    );
  }

  onTurnoEmpleadoChange(empleado: Empleado) {
    console.log(`Turno cambiado para ${empleado.nombre_completo}:`, empleado.turnoAsignado);
  }

  eliminarConfiguracion(conf: any, vista: string) {
    if (vista === 'LISTA_ROTATIVOS') {
      this.configuracionesRotativas = this.configuracionesRotativas.filter(c => c.id !== conf.id);
    } else {
      this.configuracionesFijas = this.configuracionesFijas.filter(c => c.id !== conf.id);
    }
  }

  cargarEmpleados() {
  this.loading = true;
  this.empleadosService.getEmpleados().subscribe({
    next: (empleados) => {
      this.empleados = (empleados.data ?? []).map(emp => ({
        ...emp,
        id: emp.id ?? 0 // Asigna 0 si id es undefined
      }));
      this.empleadosFiltrados = (empleados.data ?? []).map(emp => ({
        ...emp,
        id: emp.id ?? 0 // Asigna 0 si id es undefined
      }));
      this.loading = false;
    },
    error: (error) => {
      console.error('Error al cargar empleados:', error);
      this.loading = false;
    }
  });
}

cargarAreas() {
  this.areaService.getAreas().subscribe({
    next: (areas: Area[]) => {
      this.areas = areas;
    },
    error: (error: any) => {
      console.error('Error al cargar áreas:', error);
    }
  });
}

  cargarEmpleadosArea() {
    const areaId = this.fijoForm.controls.area_id.value;
    if (areaId !== null) {
      this.cargarJefesCandidatos(areaId);
    }
    this.empleadosFijos = this.empleados.filter(e => e.area_id === areaId && e.activo);
    this.cargarJefesCandidatos(areaId);
  }

  eliminarEmpleadoFijo(id: number) {
    this.empleadosFijos = this.empleadosFijos.filter(e => e.id !== id);
  }

  aplicarDescansoGrupal() {
    this.info = 'Días de descanso aplicados al grupo';
  }

  isEmpleadoSeleccionado(id: number): boolean {
    return this.equipoCompleto.some(e => e.id === id);
  }

  // Reemplaza el método existente por este:
isEmpleadoSeleccionable(emp: any): boolean {
  return !this.empleadosAsignados.some(a => a.id === emp.id);
}


  getEmpleadosDisponiblesRotativos(): Empleado[] {
    const areaId = this.areaJefeForm.controls.area_id.value;
    
    return this.empleados.filter(emp => {
      if (!emp.activo) return false;
      
      const tipoRol = this.getTipoRolPorNombre(emp.rol_id);
      
      // Solo permitir los roles específicos para turnos rotativos
      if (!['ENFERMERO', 'AUX_ENFERMERIA', 'AUX_HOSPITAL'].includes(tipoRol)) return false;
      
      // Permitir empleados sin área o que ya estén en esta área
      return emp.area_id === null || emp.area_id === areaId;
    });
  }

  getEstadoDisponibilidad(empleado: any): string {
    if (!empleado.area_id) {
      return 'Disponible para asignar';
    } else if (empleado.area_id === this.areaJefeForm.controls.area_id.value) {
      return 'Ya asignado a esta área';
    } else {
      return `Ocupado en ${this.getAreaNombre(empleado.area_id)}`;
    }
  }
  
  // 🔥 MODIFICADO: Adaptar para usar fecha_inicio y fecha_fin
  recibirAsignaciones(event: any) {
    console.log('📅 Asignaciones recibidas desde calendario:', event);

    // Si es un array (múltiples asignaciones)
    if (Array.isArray(event)) {
      const nuevasAsignaciones = event.map(asig => ({
        empleado_id: asig.empleado_id,
        turno_id: asig.turno_id,
        fecha_inicio: asig.fecha_inicio || asig.fecha, // fallback si viene como "fecha"
        fecha_fin: asig.fecha_fin || asig.fecha,
        hora_entrada: asig.hora_entrada,
        hora_salida: asig.hora_salida
      }));
      this.asignacionesCalendario = [...this.asignacionesCalendario, ...nuevasAsignaciones];
    } 
    // Si es una sola asignación
    else if (event && event.empleado_id) {
      const nuevaAsignacion: Asignacion = {
        empleado_id: event.empleado_id,
        turno_id: event.turno_id,
        fecha_inicio: event.fecha_inicio || event.fecha, // fallback si viene como "fecha"
        fecha_fin: event.fecha_fin || event.fecha,
        hora_entrada: event.hora_entrada,
        hora_salida: event.hora_salida
      };
      this.asignacionesCalendario.push(nuevaAsignacion);
      
      // También actualizar el turno asignado en el equipo
      const empleado = this.equipoCompleto.find(e => e.id === event.empleado_id);
      if (empleado) {
        empleado.turnoAsignado = event.turno_id;
        console.log(`✅ Turno ${event.turno_id} asignado a ${empleado.nombre_completo}`);
      }
    }

    console.log('📋 Asignaciones totales del calendario:', this.asignacionesCalendario);
  }

  // 🔥 NUEVO MÉTODO: Limpiar asignaciones del calendario
  limpiarAsignacionesCalendario() {
    this.asignacionesCalendario = [];
    this.info = 'Asignaciones del calendario limpiadas';
  }


  // ===== Flujo (stepper) =====
  abrirFormulario(id: any) {
    this.editandoId = id === 'NUEVO' ? 'NUEVO' : id;
    this.modo = this.vista === 'LISTA_ROTATIVOS' ? 'ROTATIVO' : 'FIJO';
    this.vista = 'FORMULARIO';
    this.resetFormulario();

    if (id !== 'NUEVO') {
      const conf = this.modo === 'FIJO'
        ? this.configuracionesFijas.find(c => c.id === id)
        : this.configuracionesRotativas.find(c => c.id === id);

      if (conf) {
        this.areaJefeForm.patchValue({
          area_id: conf.areaId,
          jefe_id: conf.jefeId
        });
        this.equipoCompleto = [...(conf.equipo || conf.empleadosFijos || [])];
        this.reemplazos = [...(conf.reemplazos || [])];
        this.fechasForm.patchValue({
          fecha_inicio: conf.fecha_inicio,
          fecha_fin: conf.fecha_fin,
          patron: conf.patron || 'NORMAL'
        });

        // 🔥 Ir directo al paso 4 para reemplazos
        this.step = 4;
      }
    }
  }

  // Abrir modal con lista de empleados
  abrirModalReemplazo(empleadoId: number) {
    this.mostrarModalReemplazos = true;
    this.busquedaReemplazo = '';

    // Cargar empleados disponibles (excepto el que será reemplazado)
    this.empleadosDisponiblesReemplazo = this.empleados.filter(emp =>
      emp.activo && emp.id !== empleadoId
    );

    // Inicialmente mostrar todos
    this.empleadosFiltradosReemplazo = [...this.empleadosDisponiblesReemplazo];
  }
  
  cerrarModalReemplazos() {
    this.mostrarModalReemplazos = false;
    this.busquedaReemplazo = '';
  }

  filtrarEmpleadosReemplazo() {
    const term = this.busquedaReemplazo.toLowerCase().trim();

    if (!term) {
      this.empleadosFiltradosReemplazo = [...this.empleadosDisponiblesReemplazo];
      return;
    }

    this.empleadosFiltradosReemplazo = this.empleadosDisponiblesReemplazo.filter(emp =>
      emp.nombre_completo.toLowerCase().includes(term)
    );
  }


  cancelarFormulario() {
    this.vista = this.modo === 'ROTATIVO' ? 'LISTA_ROTATIVOS' : 'LISTA_FIJOS';
    this.editandoId = null;
    this.step = 1;
  }

  nextStep() {
    // Paso 1: Validar área y jefe
    if (this.step === 1) {
      if (!this.areaJefeForm.value.area_id || !this.areaJefeForm.value.jefe_id) {
        this.error = 'Debes seleccionar un área y un jefe de área antes de continuar.';
        return;
      }
    }

    // Paso 2: Validar equipo
    if (this.step === 2) {
      if (this.equipoCompleto.length === 0) {
        this.error = 'Debes seleccionar al menos un empleado para el equipo.';
        return;
      }
    }

    // Paso 3: Validar turnos
    if (this.step === 3) {
      if (this.turnosDisponibles.length === 0) {
        this.error = 'Debes crear al menos un turno antes de continuar.';
        return;
      }
      // Si hay turnos, permitir avanzar aunque no cree nuevos
    }

    // Paso 4: Validar asignaciones a empleados
    if (this.step === 4) {
      const empleadosConTurno = this.equipoCompleto.filter(e => e.turnoAsignado);
      if (empleadosConTurno.length === 0 && this.asignacionesCalendario.length === 0) {
        this.error = 'Debes asignar turnos a los empleados seleccionados antes de guardar.';
        return;
      }
    }

    // Si pasó las validaciones, avanzar
    if (this.step < 4) {
      this.step++;
      this.error = null; // limpiar errores
    }
  }


  prevStep() {
    if (this.step > 1) {
      this.step--;
    }
  }

  // ===== Empleados =====
  filtrarEmpleados() {
    let filtrados = this.empleados.filter(e => e.activo);

    if (this.filtroBusqueda) {
      const search = this.filtroBusqueda.toLowerCase();
      filtrados = filtrados.filter(e => e.nombre_completo.toLowerCase().includes(search));
    }

    if (this.filtroRol) {
      filtrados = filtrados.filter(e => this.getTipoRolPorNombre(e.rol_id) === this.filtroRol);
    } else {
      filtrados = filtrados.filter(e =>
        ['ENFERMERO', 'AUX_ENFERMERIA', 'AUX_HOSPITAL'].includes(this.getTipoRolPorNombre(e.rol_id))
      );
    }

    this.empleadosFiltrados = filtrados;
  }

  // Reemplaza el método existente por este:
  toggleEmpleadoEquipo(empleado: Empleado) {
    // Verificar si puede ser seleccionado
    if (!this.puedeSerSeleccionado(empleado)) {
      this.error = `${empleado.nombre_completo} ya está asignado a otra área (${this.getAreaNombre(empleado.area_id)})`;
      return;
    }

    const index = this.equipoCompleto.findIndex(e => e.id === empleado.id);
    
    if (index === -1) {
      // Agregar al equipo y asignar área
      this.equipoCompleto.push({ ...empleado });
      
      // Si no tiene área asignada, asignarla automáticamente
      if (empleado.area_id === null) {
        this.asignarEmpleadoArea(empleado);
      }
    } else {
      // Remover del equipo
      const empleadoRemovido = this.equipoCompleto[index];
      this.equipoCompleto.splice(index, 1);
      
      // Liberar el área solo si no está en otros equipos activos
      this.liberarEmpleadoSiNoEstaEnOtrosEquipos(empleadoRemovido);
    }
  }

  // Método auxiliar para liberar empleado
  private liberarEmpleadoSiNoEstaEnOtrosEquipos(empleado: Empleado) {
    // Verificar si el empleado está en algún equipo activo en otras configuraciones
    const enOtrosEquipos = this.configuracionesRotativas.some(conf => 
      conf.equipo?.some((e: any) => e.id === empleado.id)
    );
    
    if (!enOtrosEquipos) {
      this.liberarEmpleadoArea(empleado);
    }
  }

    private limpiarTurnos() {
    this.turnosFiltrados = this.turnosDisponibles.filter(
      t => t && t.nombre && t.hora_inicio && t.hora_fin
    );
  }

  // Método para asignar empleado al área
  asignarEmpleadoArea(empleado: Empleado) {
    const areaId = this.areaJefeForm.controls.area_id.value;
    if (!areaId) {
      this.error = 'Primero selecciona un area';
      return;
    }

    // Actualizar el área del empleado
    empleado.area_id = areaId;
    
    // Aquí deberías llamar al servicio para actualizar en la BD
    this.actualizarAreaEmpleadoEnBD(empleado.id, areaId);
    
    this.info = `${empleado.nombre_completo} asignado al área ${this.getAreaNombre(areaId)}`;
  }

  // Método para actualizar en la BD
  private actualizarAreaEmpleadoEnBD(empleadoId: number, areaId: number | null) {
      this.http.patch(`${API}/empleados/${empleadoId}`, { area_id: areaId })
        .subscribe({
          next: (response: any) => {
            console.log('Área actualizada en BD');
            // Actualizar el estado global
            if (response.success) {
              const empleadoActualizado = this.empleados.find(e => e.id === empleadoId);
              if (empleadoActualizado) {
                empleadoActualizado.area_id = areaId;
                // Asegúrate de incluir numero_empleado
                this.empleadosService.actualizarEmpleado({
                  ...empleadoActualizado,
                  numero_empleado: empleadoActualizado.numero_empleado,
                  email: empleadoActualizado.email ?? '',
                  activo: empleadoActualizado.activo ?? true // Asegura boolean
                });
              }
            }
          },
          error: (err) => console.error('Error actualizando área:', err)
        });
    }

  // Método para verificar si un empleado puede ser seleccionado
  puedeSerSeleccionado(empleado: Empleado): boolean {
    // Si no tiene área asignada, puede ser seleccionado
    if (empleado.area_id === null) return true;
    
    // Si ya tiene área, solo puede ser seleccionado si es la misma área del formulario
    const areaFormId = this.areaJefeForm.controls.area_id.value;
    
    // Si no hay área seleccionada en el formulario, no puede seleccionar empleados con área
    if (!areaFormId) return false;
    
    return empleado.area_id === areaFormId;
  }

  // Método para liberar empleado del área (cuando se elimina del equipo)
  liberarEmpleadoArea(empleado: Empleado) {
    empleado.area_id = null;
    this.actualizarAreaEmpleadoEnBD(empleado.id, null);
  }

  // 🔥 NUEVO MÉTODO: Asignar turno por defecto
  asignarTurnoPorDefecto() {
    // Solo asignar si no hay asignaciones del calendario
    if (this.asignacionesCalendario.length === 0) {
      this.equipoCompleto.forEach(empleado => {
        if (!empleado.turnoAsignado && this.turnosDisponibles.length > 0) {
          empleado.turnoAsignado = this.turnosDisponibles[0].id;
          console.log(`🔄 Turno asignado por defecto a ${empleado.nombre_completo}:`, empleado.turnoAsignado);
        }
      });
    }
  }



crearTurnoPersonalizado() {
  if (!this.nuevoTurno.nombre || !this.nuevoTurno.hora_inicio || !this.nuevoTurno.hora_fin) {
    this.error = "Debes completar nombre, hora de inicio y hora de fin para crear el turno.";
    return;
  }

  const nuevo = {
    nombre: this.nuevoTurno.nombre,
    hora_inicio: this.nuevoTurno.hora_inicio,
    hora_fin: this.nuevoTurno.hora_fin,
    tolerancia_entrada_minutos: this.nuevoTurno.tolerancia_entrada_minutos ?? 15,
    tolerancia_salida_minutos: this.nuevoTurno.tolerancia_salida_minutos ?? 15
  };

  this.http.post<any>(`${API}/turnos`, nuevo).subscribe({
    next: (res) => {
      const turnoGuardado = res.data;
      
      // 🔥 SOLUCIÓN: Agregar el turno con esPersonalizado: true
      this.turnos.push({
        ...turnoGuardado,
        id: turnoGuardado.id,
        nombre: turnoGuardado.nombre || turnoGuardado.nombre_turno,
        hora_inicio: turnoGuardado.hora_inicio,
        hora_fin: turnoGuardado.hora_fin,
        tolerancia_entrada_minutos: turnoGuardado.tolerancia_entrada_minutos,
        tolerancia_salida_minutos: turnoGuardado.tolerancia_salida_minutos,
        minutos_descanso: turnoGuardado.minutos_descanso || 0,
        cruza_medianoche: turnoGuardado.cruza_medianoche || false,
        esPersonalizado: true // 🔥 ESTA ES LA CLAVE
      });
      
      this.info = 'Turno creado correctamente';
      this.nuevoTurno = { 
        nombre: '', 
        hora_inicio: '08:00', 
        hora_fin: '16:00', 
        tolerancia_entrada_minutos: 15, 
        tolerancia_salida_minutos: 15 
      };
    },
    error: (err) => {
      console.error('Error guardando turno:', err);
      this.error = 'Error al crear el turno';
    }
  });

}

  private guardarTurnosEnLocalStorage() {
    const personalizados = this.turnos.filter(t => t.esPersonalizado);
    localStorage.setItem('turnosPersonalizados', JSON.stringify(personalizados));
    console.log('Turnos guardados en localStorage:', personalizados);
  }

  eliminarTurno(id: number) {
    if (!confirm('¿Estás seguro de que quieres eliminar este turno?')) {
      return;
    }

    this.http.delete<any>(`${API}/turnos/${id}`).subscribe({
      next: () => {
        // Eliminar de la lista local
        this.turnos = this.turnos.filter(t => t.id !== id);
        this.info = 'Turno eliminado correctamente';
      },
      error: (err) => {
        console.error('Error eliminando turno:', err);
        this.error = 'No se pudo eliminar el turno';
      }
    });
  }



  // ===== Reemplazos =====
  agregarReemplazo() {
    const nuevo: Reemplazo = {
      id: Date.now(),
      empleadoId: this.equipoCompleto[0]?.id || 0,
      reemplazoId: null,
      fechaInicio: new Date().toISOString().split('T')[0],
      fechaFin: new Date().toISOString().split('T')[0]
    };
    this.reemplazos.push(nuevo);
  }

  eliminarReemplazo(reemplazo: Reemplazo) {
    this.reemplazos = this.reemplazos.filter(r => r.id !== reemplazo.id);
  }
  asignarReemplazo(emp: Empleado) {
    if (this.reemplazoActual) {
      this.reemplazoActual.reemplazoId = emp.id;
      this.reemplazoActual.motivo = 'Reemplazo manual';
    }
    this.mostrarModalReemplazos = false;
    this.busquedaReemplazo = '';
    this.info = ` ${emp.nombre_completo} asignado como reemplazo`;
  }

  guardarFormulario() {
    if (!this.fechasForm.value.fecha_inicio || !this.fechasForm.value.fecha_fin) {
      this.error = 'Debes seleccionar fechas de inicio y fin';
      return;
    }

     if (this.equipoCompleto.length === 0) {
    this.error = 'No hay empleados en el equipo.';
    return;
    }

    if (this.turnosDisponibles.length === 0) {
      this.error = 'No hay turnos disponibles. Crea al menos uno.';
      return;
    }

    const empleadosConTurno = this.equipoCompleto.filter(e => e.turnoAsignado);

    if (empleadosConTurno.length === 0 && this.asignacionesCalendario.length === 0) {
      this.error = 'Debes asignar turnos a los empleados antes de guardar.';
      return;
    }

    let asignacionesParaGuardar: Asignacion[] = [];
    if (this.asignacionesCalendario.length > 0) {
      // Usar las asignaciones del calendario
      asignacionesParaGuardar = this.asignacionesCalendario.map(asig => ({
        empleado_id: asig.empleado_id,
        turno_id: asig.turno_id,
        fecha_inicio: asig.fecha_inicio,
        fecha_fin: asig.fecha_fin
      }));
    } 
    // OPCIÓN B: Usar turnos asignados en el equipo (flujo tradicional)
    else {
      const empleadosConTurno = this.equipoCompleto.filter(emp => emp.turnoAsignado);
      
      if (empleadosConTurno.length === 0) {
        this.error = 'Ningún empleado tiene turno asignado. Asigna turnos a los empleados antes de guardar.';
        return;
      }

      asignacionesParaGuardar = empleadosConTurno.map(emp => ({
        empleado_id: emp.id,
        turno_id: emp.turnoAsignado!,
        fecha_inicio: String(this.fechasForm.value.fecha_inicio ?? ''),
        fecha_fin: String(this.fechasForm.value.fecha_fin ?? '')
      }));
    }

    const payload = {
      asignaciones: asignacionesParaGuardar
    };

    this.http.post(`${API}/asignaciones/bulk`, payload).subscribe({
      next: (res: any) => {
        console.log('✅ Asignaciones guardadas:', res);
        this.info = `Asignaciones guardadas correctamente (${payload.asignaciones.length} turnos)`;
        
        // Limpiar después de guardar
        this.asignacionesCalendario = [];
        setTimeout(() => {
          this.cancelarFormulario();
        }, 2000);
      },
      error: (err) => {
        console.error('❌ Error guardando asignaciones:', err);
        
        if (err.status === 400) {
          this.error = 'Error en los datos enviados: ' + (err.error?.message || 'Formato incorrecto');
        } else if (err.status === 500) {
          this.error = 'Error del servidor: ' + (err.error?.error || 'Intenta nuevamente');
        } else {
          this.error = 'Error al guardar asignaciones: ' + err.message;
        }
      }
    });
    
    
this.http.post(`${API}/asignaciones/bulk`, payload).subscribe({
    next: (res: any) => {
      console.log('✅ Asignaciones guardadas:', res);
      this.info = `Asignaciones guardadas correctamente (${payload.asignaciones.length} turnos)`;

      // 🔥 Crear la tarjeta en localStorage
      const conf = {
        id: this.editandoId === 'NUEVO' ? Date.now() : this.editandoId,
        areaId: this.areaJefeForm.value.area_id,
        jefeId: this.areaJefeForm.value.jefe_id,
        equipo: [...this.equipoCompleto],
        turnos: [...this.turnos],
        reemplazos: [...this.reemplazos],
        fecha_inicio: this.fechasForm.value.fecha_inicio,
        fecha_fin: this.fechasForm.value.fecha_fin,
        patron: this.fechasForm.value.patron,
        areaNombre: this.getAreaNombre(this.areaJefeForm.value.area_id ?? null),
        jefeNombre: this.getEmpleadoNombre(this.areaJefeForm.value.jefe_id ?? null),
        empleadosCount: this.equipoCompleto.length,
        fechaCreacion: new Date().toISOString()
      };

      if (this.modo === 'ROTATIVO') {
        const configs = this.configuracionesRotativas;
        if (this.editandoId === 'NUEVO') {
          configs.push(conf);
        } else {
          const index = configs.findIndex(c => c.id === this.editandoId);
          if (index !== -1) configs[index] = conf;
        }
        this.configuracionesRotativas = configs;
      } else {
        const configs = this.configuracionesFijas;
        if (this.editandoId === 'NUEVO') {
          configs.push(conf);
        } else {
          const index = configs.findIndex(c => c.id === this.editandoId);
          if (index !== -1) configs[index] = conf;
        }
        this.configuracionesFijas = configs;
      }

      // 🔥 Regresar a la lista
      this.vista = this.modo === 'ROTATIVO' ? 'LISTA_ROTATIVOS' : 'LISTA_FIJOS';
      this.resetFormulario();
    },
    error: (err) => { /* ... igual que tienes */ }
  });
}
    

  


  guardarTurnoEnDB(turno: Turno) {
  return this.http.post<Turno>(`${API}/turnos`, turno);
}

  private guardarConfiguracionRotativo() {
    const conf = {
      id: this.editandoId === 'NUEVO' ? Date.now() : this.editandoId,
      areaId: this.areaJefeForm.value.area_id,
      jefeId: this.areaJefeForm.value.jefe_id,
      equipo: [...this.equipoCompleto],
      turnos: [...this.turnos],
      reemplazos: [...this.reemplazos],
      fecha_inicio: this.fechasForm.value.fecha_inicio,
      fecha_fin: this.fechasForm.value.fecha_fin,
      patron: this.fechasForm.value.patron,
      areaNombre: this.getAreaNombre(this.areaJefeForm.value.area_id ?? null),
      jefeNombre: this.getEmpleadoNombre(this.areaJefeForm.value.jefe_id ?? null),
      empleadosCount: this.equipoCompleto.length,
      fechaCreacion: new Date().toISOString()
    };

    const configs = this.configuracionesRotativas;
    if (this.editandoId === 'NUEVO') {
      configs.push(conf);
    } else {
      const index = configs.findIndex(c => c.id === this.editandoId);
      if (index !== -1) configs[index] = conf;
    }
    this.configuracionesRotativas = configs;
    this.vista = 'LISTA_ROTATIVOS';
    this.info = 'Configuración rotativa guardada correctamente';
    this.resetFormulario();
  }

  private guardarTurnosFijos() {
    if (this.fijoForm.invalid) {
      this.error = 'Completa todos los campos requeridos';
      return;
    }

    const conf = {
      id: this.editandoId === 'NUEVO' ? Date.now() : this.editandoId,
      areaId: this.fijoForm.value.area_id,
      jefeId: this.fijoForm.value.jefe_id,
      empleadosFijos: this.empleadosFijos.map(emp => ({
        ...emp,
        turnoId: emp.turnoAsignado
      })),
      turnos: [...this.turnos],
      descansoGrupal: { ...this.descansoGrupal },
      areaNombre: this.getAreaNombre(this.fijoForm.value.area_id ?? null),
      jefeNombre: this.getEmpleadoNombre(this.fijoForm.value.jefe_id ?? null),
      empleadosCount: this.empleadosFijos.length,
      fechaCreacion: new Date().toISOString()
    };

    const configs = this.configuracionesFijas;
    if (this.editandoId === 'NUEVO') {
      configs.push(conf);
    } else {
      const index = configs.findIndex(c => c.id === this.editandoId);
      if (index !== -1) configs[index] = conf;
    }
    this.configuracionesFijas = configs;
    this.vista = 'LISTA_FIJOS';
    this.info = 'Configuración fija guardada correctamente';
    this.resetFormulario();
  }

  // Después de asignar el turno exitosamente, actualiza los empleados
    asignarTurno() {
      this.turnosService.crearTurno(this.turnoData).subscribe({
        next: (response) => {
          // ✅ Actualizar el estado local de los empleados
          this.actualizarEmpleadosAsignados();
          
          // ✅ Recargar la lista completa de empleados
          this.cargarEmpleadosArea();
          
          this.mostrarMensajeExito('Turno asignado correctamente');
        },
        error: (error) => {
          console.error('Error al asignar turno:', error);
        }
      });
    }
  mostrarMensajeExito(arg0: string) {
    throw new Error('Method not implemented.');
  }
  turnoData(turnoData: any) {
    throw new Error('Method not implemented.');
  }

    actualizarEmpleadosAsignados() {
      // Itera sobre los empleados seleccionados en equipoCompleto
      this.equipoCompleto.forEach((empleado) => {
        // Actualizar el área_id del empleado
        empleado.area_id = this.areaJefeForm.value.area_id ?? null;
      });
    }

  // ===== LocalStorage =====
  get configuracionesRotativas(): any[] {
    const stored = localStorage.getItem('configuracionesRotativas');
    return stored ? JSON.parse(stored) : [];
  }
  set configuracionesRotativas(value: any[]) {
    localStorage.setItem('configuracionesRotativas', JSON.stringify(value));
  }

  get configuracionesFijas(): any[] {
    const stored = localStorage.getItem('configuracionesFijas');
    return stored ? JSON.parse(stored) : [];
  }
  set configuracionesFijas(value: any[]) {
    localStorage.setItem('configuracionesFijas', JSON.stringify(value));
  }

  // ===== Utilidades =====
  getTipoRolPorNombre(rolId: number | null): string {
    if (!rolId) return '';
    const rolNombre = this.getRolNombre(rolId).toLowerCase();
    if (rolNombre.includes('enfermer') && !rolNombre.includes('auxiliar')) return 'ENFERMERO';
    if (rolNombre.includes('auxiliar') && rolNombre.includes('enfermer')) return 'AUX_ENFERMERIA';
    if (rolNombre.includes('auxiliar') && rolNombre.includes('hospital')) return 'AUX_HOSPITAL';
    return '';
  }

  getRolNombre(rolId: number | null): string {
    if (!rolId) return 'Sin rol';
    return this.roles.find(r => r.id === rolId)?.nombre || `Rol ${rolId}`;
  }

  getEmpleadoNombre(id: number | null): string {
    return this.empleados.find(e => e.id === id)?.nombre_completo || '—';
  }

  getAreaNombre(id: number | null): string {
    return this.areas.find(a => a.id === id)?.nombre || '—';
  }

  private resetFormulario() {
    this.areaJefeForm.reset();
    this.fijoForm.reset();
    this.fechasForm.reset({ patron: 'NORMAL' });
    
    // Liberar empleados del área actual al cancelar
    this.equipoCompleto.forEach(emp => {
      this.liberarEmpleadoSiNoEstaEnOtrosEquipos(emp);
    });
    
    this.equipoCompleto = [];
    this.empleadosFijos = [];
    this.reemplazos = [];
    this.descansoGrupal = {};
    this.step = 1;
    this.error = null;
    this.filtroBusqueda = '';
    this.filtroRol = null;
    this.asignacionesCalendario = []; // 🔥 Limpiar asignaciones del calendario
  }
}