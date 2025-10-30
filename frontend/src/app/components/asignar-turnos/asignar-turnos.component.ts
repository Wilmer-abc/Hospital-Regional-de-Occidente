import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule, FormGroup } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TurnosService } from '../../services/turnos.service';
import { CalendarioTurnosComponent } from '../calendario-turnos/calendario-turnos.component';
import { EmpleadosService } from '../../services/empleados.service';
import { RemplazoComponent } from '../reemplazo/remplazo.component';
import { RenovacionComponent } from '../renovacion/renovacion.component';
import { Subject, takeUntil } from 'rxjs';


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
  empleado: any[];
  length: any;
  asignacionesPrevias?: Asignacion[];
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

interface NuevoTurno {
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  tolerancia_entrada_minutos: number;
  tolerancia_salida_minutos: number;
}

// NUEVA INTERFACE para asignaciones
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
  imports: [CommonModule, ReactiveFormsModule, FormsModule, CalendarioTurnosComponent, RemplazoComponent, RenovacionComponent],
  templateUrl: './asignar-turnos.component.html',
  styleUrls: ['./asignar-turnos.component.scss']
})
export class AsignarTurnosComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private filtroTimeout: any;

  private empleadosService = inject(EmpleadosService);

  // ===== Estado de vistas =====
  vista: 'HOME' | 'LISTA_ROTATIVOS' | 'LISTA_FIJOS' | 'FORMULARIO' = 'HOME';
  modo: 'FIJO' | 'ROTATIVO' = 'ROTATIVO';
  editandoId: number | 'NUEVO' | null = null;
  step = 1;

  turnoSeleccionadoGlobal: number | null = null;
  fijoFormData = { fecha_inicio: '', fecha_fin: '' };
  descansoGrupal: boolean[] = [false, false, false, false, false, false, false];
  modoReemplazoActivo: boolean = false;

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
  EmpleadoSeleccionado: any;
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
  
  // MODIFICADO: Cambiar la estructura para usar fecha_inicio y fecha_fin
  asignacionesPendientes: Asignacion[] = [];

  // NUEVA PROPIEDAD para conectar con el calendario
  asignacionesCalendario: Asignacion[] = [];
  modoEdicion: boolean | undefined;
  form: any;
  asignacionesPrevias: any;
  fechaInicioFijo: string | undefined;
  fechaFinFijo: string | undefined;
  areaSeleccionada: any;
  jefeSeleccionado: any;
  reemplazos: any[] = [];
  calendarioComponent: any;
  mostrarModalReemplazo: boolean = false;
  reemplazoActivo: any;
  empleadoOriginal: any;
  turnoId: any;

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

  // ===== Asignaciones individuales (desde calendario-turnos) =====
  asignaciones: Record<number, any[]> = {};

  // ===== Descanso grupal =====
  diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  // ===== Ciclo de vida =====
  ngOnInit(): void {
      this.cargarCatalogos();
      this.cargarTurnos();

      // CORREGIDO: Suscripción con manejo de desuscripción
      this.empleadosService.empleados$
        .pipe(takeUntil(this.destroy$))
        .subscribe(empleados => {
          this.empleados = empleados.map(emp => ({
            ...emp,
            id: emp.id ?? 0,
            empleado: emp.empleado ?? [],
            length: emp.length ?? 0,
            asignacionesPrevias: emp.asignacionesPrevias ?? undefined
          }));
          
          // Solo filtrar cuando sea necesario
          if (this.vista === 'FORMULARIO' && this.step === 2) {
            setTimeout(() => this.filtrarEmpleados(), 100);
          }
        });
    }


      ngOnDestroy(): void {
      this.destroy$.next();
      this.destroy$.complete();
      
      // Limpiar timeouts
      if (this.filtroTimeout) {
        clearTimeout(this.filtroTimeout);
      }
    }

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
          esPersonalizado: true 
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
          this.filtrarEmpleados();
        })
        .catch((error) => {
          console.error('Error cargando catálogos:', error);
          this.error = 'No se pudieron cargar algunos catálogos.';
          this.filtrarEmpleados(); 
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
    
    // Opcional: Mostrar mensaje de confirmación
    this.info = 'Configuración eliminada correctamente';
    setTimeout(() => this.info = null, 3000);
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

  guardarTurnosFijos() {
    const area_id = this.fijoForm.controls.area_id.value;
    const jefe_id = this.fijoForm.controls.jefe_id.value;
    const turno_id = this.empleadosFijos.length > 0 ? this.empleadosFijos[0].turnoAsignado : null;

    if (!area_id || !jefe_id || !turno_id) {
      alert('Debe seleccionar el área, jefe y turno fijo para los empleados.');
      return;
    }

    if (this.empleadosFijos.length === 0) {
      alert('No hay empleados en el área seleccionada.');
      return;
    }

    const empleados_ids = this.empleadosFijos.map(e => e.id);
    const dias_descanso = this.descansoGrupal
      .map((checked, i) => (checked ? i.toString() : null))
      .filter(Boolean)
      .join(',');

    const payload = { area_id, jefe_id, turno_id, empleados_ids, dias_descanso };
    console.log('Enviando turnos fijos:', payload);

    this.turnosService.guardarTurnosFijos(payload).subscribe({
      next: (res: any) => {
        console.log('Turnos fijos creados:', res);

        // Crear tarjeta visual
        const nuevaConfig = {
          id: res.lote_id || Date.now(),
          areaNombre: this.areas.find(a => a.id === area_id)?.nombre || 'Área desconocida',
          jefeNombre: this.jefesCandidatos.find(j => j.id === jefe_id)?.nombre_completo || 'Jefe desconocido',
          empleadosCount: empleados_ids.length,
          tipo: 'FIJO',
          fechaCreacion: new Date(),
        };

        //Insertar y forzar renderizado
        this.configuracionesFijas = [...this.configuracionesFijas, nuevaConfig];

        //Reset visual
        this.vista = 'LISTA_FIJOS';
        this.info = `Turno fijo creado correctamente para ${empleados_ids.length} empleado(s).`;

        // Limpiar formulario
        this.fijoForm.reset();
        this.empleadosFijos = [];
        this.descansoGrupal.fill(false);
      },
      error: (err) => {
        console.error('Error guardando turnos fijos:', err);
        this.error = 'Error al guardar los turnos fijos.';
      }
    });
  }

  onReemplazoSeleccionado(event: any) {
    console.log('👥 Reemplazo seleccionado:', event);

    // Pasar el reemplazo al calendario
    this.calendarioComponent.activarModoReemplazo(event);
  }

  //  NUEVO MÉTODO: Guardar configuración fija en localStorage
  private guardarConfiguracionFija() {
    const configuracion = {
      id: this.editandoId === 'NUEVO' ? Date.now() : this.editandoId,
      areaId: this.fijoForm.value.area_id,
      jefeId: this.fijoForm.value.jefe_id,
      empleadosFijos: this.empleadosFijos.map(emp => ({
        ...emp,
        turnoId: emp.turnoAsignado
      })),
      turnos: [...this.turnos],
      descansoGrupal: [...this.descansoGrupal],
      areaNombre: this.getAreaNombre(this.fijoForm.value.area_id ?? null),
      jefeNombre: this.getEmpleadoNombre(this.fijoForm.value.jefe_id ?? null),
      empleadosCount: this.empleadosFijos.length,
      fechaCreacion: new Date().toISOString(),
      tipo: 'FIJO'
    };

    const configs = this.configuracionesFijas;
    if (this.editandoId === 'NUEVO') {
      configs.push(configuracion);
    } else {
      const index = configs.findIndex(c => c.id === this.editandoId);
      if (index !== -1) configs[index] = configuracion;
    }
    this.configuracionesFijas = configs;
    
    console.log('Configuración fija guardada:', configuracion);
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
  
  // MODIFICADO: Adaptar para usar fecha_inicio y fecha_fin
  recibirAsignaciones(event: any) {
    console.log('Asignaciones recibidas desde calendario:', event);

    // Si es un array (múltiples asignaciones)
    if (Array.isArray(event)) {
      const nuevasAsignaciones = event.map(asig => ({
        empleado_id: asig.empleado_id,
        turno_id: asig.turno_id,
        fecha_inicio: asig.fecha_inicio || asig.fecha, 
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
        fecha_inicio: event.fecha_inicio || event.fecha, 
        fecha_fin: event.fecha_fin || event.fecha,
        hora_entrada: event.hora_entrada,
        hora_salida: event.hora_salida
      };
      this.asignacionesCalendario.push(nuevaAsignacion);
      
      // También actualizar el turno asignado en el equipo
      const empleado = this.equipoCompleto.find(e => e.id === event.empleado_id);
      if (empleado) {
        empleado.turnoAsignado = event.turno_id;
        console.log(`Turno ${event.turno_id} asignado a ${empleado.nombre_completo}`);
      }
    }

    console.log('📋 Asignaciones totales del calendario:', this.asignacionesCalendario);
  }

  //NUEVO MÉTODO: Limpiar asignaciones del calendario
  limpiarAsignacionesCalendario() {
    this.asignacionesCalendario = [];
    this.info = 'Asignaciones del calendario limpiadas';
  }

  // En el método abrirFormulario, actualiza esta parte:
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
        if (this.modo === 'FIJO') {
          //NUEVO: Cargar configuración fija
          this.fijoForm.patchValue({
            area_id: conf.areaId,
            jefe_id: conf.jefeId
          });
          
          // Cargar empleados del área
          this.cargarEmpleadosArea();
          
          // Cargar turnos asignados
          if (conf.empleadosFijos) {
            conf.empleadosFijos.forEach((empConf: { id: number; turnoId: number | null | undefined; }) => {
              const empleado = this.empleadosFijos.find(e => e.id === empConf.id);
              if (empleado) {
                empleado.turnoAsignado = empConf.turnoId;
              }
            });
          }
          
          // Cargar días de descanso
          if (conf.descansoGrupal) {
            this.descansoGrupal = [...conf.descansoGrupal];
          }
        } else {
          // Código existente para rotativos...
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

          if (conf.fecha_inicio && conf.fecha_fin) {
            this.cargarAsignacionesEquipoCompleto(conf.fecha_inicio, conf.fecha_fin);
          }
          this.step = 4;
        }
      }
    }
  }

  // NUEVO MÉTODO: Cargar asignaciones de todo el equipo
  private cargarAsignacionesEquipoCompleto(fechaInicio: string, fechaFin: string) {
    console.log('Cargando asignaciones del equipo completo...');
    
    this.equipoCompleto.forEach(empleado => {
      this.turnosService.getAsignacionesEmpleado(empleado.id, fechaInicio, fechaFin).subscribe({
        next: (res) => {
          if (res.success && res.asignaciones && res.asignaciones.length > 0) {
            console.log(`Asignaciones cargadas para ${empleado.nombre_completo}:`, res.asignaciones);
            
            // Almacenar las asignaciones en el empleado
            if (!empleado.asignacionesPrevias) {
              empleado.asignacionesPrevias = [];
            }
            empleado.asignacionesPrevias = [...res.asignaciones];
            
            // Si este empleado está seleccionado en el calendario, actualizar la vista
            if (this.empleadoCalendarioSeleccionado === empleado.id) {
              this.actualizarCalendarioConAsignacionesPrevias();
            }
          }
        },
        error: (err) => {
          console.error(`❌ Error cargando asignaciones para ${empleado.nombre_completo}:`, err);
        }
      });
    });
  }

  //NUEVO MÉTODO: Actualizar el calendario cuando cambia el empleado seleccionado
  onEmpleadoCalendarioChange() {
    console.log('👤 Empleado calendario cambiado:', this.empleadoCalendarioSeleccionado);
    
    if (this.empleadoCalendarioSeleccionado) {
      this.actualizarCalendarioConAsignacionesPrevias();
    }
  }

  // NUEVO MÉTODO: Actualizar asignaciones previas en el calendario
  private actualizarCalendarioConAsignacionesPrevias() {
    if (!this.empleadoCalendarioSeleccionado) return;
    
    const empleado = this.equipoCompleto.find(e => e.id === this.empleadoCalendarioSeleccionado);
    if (empleado && empleado.asignacionesPrevias) {
      console.log(`📋 Enviando ${empleado.asignacionesPrevias.length} asignaciones previas al calendario`);
      
      // Emitir las asignaciones al componente del calendario
      this.recibirAsignaciones(empleado.asignacionesPrevias);
    }
  }

  abrirModalReemplazo(empleado: any) {
    this.EmpleadoSeleccionado = empleado;
    this.mostrarModalReemplazo  = true;
  }

  // Manejar reemplazo confirmado
  onReemplazoConfirmado(event: any) {
    console.log('Reemplazo confirmado:', event);

    // Guardar temporalmente los datos del reemplazo
    this.reemplazoActivo = event.empleadoReemplazo;
    this.empleadoOriginal = event.empleadoOriginal;
    this.turnoId = event.turnoId;

    // Actualizar el ID del empleado en el calendario dinámicamente
    this.empleadoCalendarioSeleccionado = this.reemplazoActivo.id;

    // Mostrar aviso
    this.info = ` ${event.empleadoReemplazo.nombre_completo} cubrirá el turno de ${event.empleadoOriginal.nombre_completo}. 
    Ahora selecciona los días en el calendario que este empleado cubrirá.`;

    // Recargar las asignaciones para el calendario (modo reemplazo)
    this.cargarAsignacionesEquipoCompleto(
      this.fechasForm.controls.fecha_inicio.value || '',
      this.fechasForm.controls.fecha_fin.value || ''
    );

    this.reemplazoActivo = true;
  }

  // MODIFICA el método cancelarFormulario para diferenciar entre cancelar y retroceder
    cancelarFormulario(esCancelacionTotal: boolean = true) {
      if (esCancelacionTotal) {
        // Cancelación total: regresar a la vista de lista
        this.vista = this.modo === 'ROTATIVO' ? 'LISTA_ROTATIVOS' : 'LISTA_FIJOS';
        this.editandoId = null;
        this.step = 1;
        this.error = null;
        
        // Limpiar equipo temporal sin afectar áreas
        this.equipoCompleto = [];
        
        console.log('❌ Formulario cancelado - regresando a lista');
      } else {
        // Solo retroceder un paso (para el botón "Atrás")
        this.prevStep();
      }
    }

    // MODIFICA el método prevStep para mayor claridad
    prevStep() {
      if (this.step > 1) {
        this.step--;
        this.error = null; // limpiar errores al retroceder
      }
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

      // ✅ NUEVO BLOQUE: Agregar jefe al equipo completo
      const jefeId = this.areaJefeForm.controls.jefe_id.value;
      const jefeSeleccionado = this.jefesCandidatos.find(j => j.id === jefeId);

      // Agregar jefe al inicio del equipo si no estaba ya incluido
      if (jefeSeleccionado && !this.equipoCompleto.some(e => e.id === jefeSeleccionado.id)) {
        this.equipoCompleto = [jefeSeleccionado, ...this.equipoCompleto];
        console.log('👥 Equipo completo incluyendo jefe:', this.equipoCompleto);
      }
    }

    // Paso 3: Validar turnos
    if (this.step === 3) {
      if (this.turnosDisponibles.length === 0) {
        this.error = 'Debes crear al menos un turno antes de continuar.';
        return;
      }
    }

    // Paso 4: Validar asignaciones a empleados
    if (this.step === 4) {
      const empleadosConTurno = this.equipoCompleto.filter(e => e.turnoAsignado);
      if (empleadosConTurno.length === 0 && this.asignacionesCalendario.length === 0) {
        this.error = 'Debes asignar turnos a los empleados seleccionados antes de guardar.';
        return;
      }
    }

    // ✅ Si pasó todas las validaciones, avanzar de paso
    if (this.step < 4) {
      this.step++;
      this.error = null; // limpiar errores
    }
  }

  // ===== Empleados =====
  filtrarEmpleados() {
    if (this.filtroTimeout) {
      clearTimeout(this.filtroTimeout);
    }
    
    this.filtroTimeout = setTimeout(() => {
      let filtrados = this.empleados.filter(e => e.activo);

      if (this.filtroBusqueda) {
        const search = this.filtroBusqueda.toLowerCase();
        filtrados = filtrados.filter(e => 
          e.nombre_completo.toLowerCase().includes(search)
        );
      }

      if (this.filtroRol) {
        filtrados = filtrados.filter(e => 
          this.getTipoRolPorNombre(e.rol_id) === this.filtroRol
        );
      } else {
        filtrados = filtrados.filter(e =>
          ['ENFERMERO', 'AUX_ENFERMERIA', 'AUX_HOSPITAL']
            .includes(this.getTipoRolPorNombre(e.rol_id))
        );
      }

      this.empleadosFiltrados = filtrados;
    }, 300);
  }

  toggleEmpleadoEquipo(empleado: Empleado) {
    // Verificar si puede ser seleccionado
    if (!this.puedeSerSeleccionado(empleado)) {
      this.error = `${empleado.nombre_completo} ya está asignado a otra área (${this.getAreaNombre(empleado.area_id)})`;
      return;
    }

    const index = this.equipoCompleto.findIndex(e => e.id === empleado.id);
    
    if (index === -1) {
      // SOLO agregar al equipo, NO asignar área todavía
      this.equipoCompleto.push({ ...empleado });
      console.log(`✅ ${empleado.nombre_completo} agregado al equipo temporal`);
    } else {
      // Solo remover del equipo temporal
      this.equipoCompleto.splice(index, 1);
      console.log(`❌ ${empleado.nombre_completo} removido del equipo temporal`);
    }
    
    // Limpiar mensajes de error si la operación fue exitosa
    this.error = null;
  }

  // Método para verificar si un empleado puede ser seleccionado
  puedeSerSeleccionado(empleado: Empleado): boolean {
    if (empleado.area_id === null) return true;
    const areaFormId = this.areaJefeForm.controls.area_id.value;
    if (!areaFormId) return false;
    return empleado.area_id === areaFormId;
  }

  // Método para liberar empleado del área (cuando se elimina del equipo)
  liberarEmpleadoArea(empleado: Empleado) {
    empleado.area_id = null;
    this.actualizarAreaEmpleadoEnBD(empleado.id, null);
  }

  //NUEVO MÉTODO: Asignar turno por defecto
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
        
        // el turno con esPersonalizado: true
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
          esPersonalizado: true 
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
    const turno = this.turnos.find(t => t.id === id);
    
    if (!turno) {
      this.error = 'Turno no encontrado';
      return;
    }

    // Si es un turno del sistema (no personalizado), mostrar advertencia
    if (!turno.esPersonalizado) {
      if (!confirm('Este es un turno del sistema. ¿Estás seguro de que quieres eliminarlo?')) {
        return;
      }
    } else {
      if (!confirm('¿Estás seguro de que quieres eliminar este turno?')) {
        return;
      }
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

    // MODIFICA el método guardarFormulario - agrega esta función al inicio:
    async guardarFormulario() {
    // 🟢 Modo FIJO
    if (this.modo === 'FIJO') {
      const area_id = this.fijoForm.value.area_id;
      const jefe_id = this.fijoForm.value.jefe_id;
      const turno_id = this.turnoSeleccionadoGlobal;
      const fecha_inicio = this.fijoFormData.fecha_inicio;
      const fecha_fin = this.fijoFormData.fecha_fin;

      if (!area_id || !jefe_id || !turno_id || !fecha_inicio || !fecha_fin) {
        this.error = 'Debe seleccionar área, jefe, turno y rango de fechas';
        return;
      }

      // Generar asignaciones automáticas
      const empleados_ids = this.empleadosFijos.map(e => e.id);
      const asignaciones = empleados_ids.map(emp => ({
        empleado_id: emp,
        turno_id,
        fecha_inicio,
        fecha_fin
      }));

      const payload = {
        asignaciones,
        area_id,
        jefe_id,
        turno_id,
        fecha_inicio,
        fecha_fin,
        dias_descanso: this.descansoGrupal
          .map((d, i) => (d ? i.toString() : null))
          .filter(Boolean)
          .join(',')
      };

      this.http.post(`${API}/asignaciones/fijos`, payload).subscribe({
        next: (res: any) => {
          console.log('✅ Turnos fijos asignados:', res);
          this.info = 'Turnos fijos guardados correctamente';
          this.vista = 'LISTA_FIJOS';
          this.cargarConfiguraciones();
          this.cancelarFormulario(); // Opcional, según tu flujo
        },
        error: (err) => {
          console.error('❌ Error guardando turnos fijos:', err);
          if (err.status === 400) {
            this.error = 'Error en los datos: ' + (err.error?.message || 'Verifica los campos');
          } else if (err.status === 500) {
            this.error = 'Error del servidor: ' + (err.error?.error || 'Intenta más tarde');
          } else {
            this.error = 'Error al guardar turnos fijos.';
          }
        }
      });
      return; // Salimos aquí, no ejecutamos el resto
    }

    // 🟢 Modo DINÁMICO / CALENDARIO (código original)
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

    // Asignar áreas SOLO cuando se guarda definitivamente
    await this.asignarAreasDefinitivas();

    let asignacionesParaGuardar: Asignacion[] = [];

    if (this.asignacionesCalendario.length > 0) {
      // Usar las asignaciones del calendario
      asignacionesParaGuardar = this.asignacionesCalendario.map(asig => ({
        empleado_id: asig.empleado_id,
        turno_id: asig.turno_id,
        fecha_inicio: asig.fecha_inicio,
        fecha_fin: asig.fecha_fin
      }));
    } else {
      // Flujo tradicional: turnos asignados en el equipo
      const empleadosConTurno = this.equipoCompleto.filter(emp => emp.turnoAsignado);

      if (empleadosConTurno.length === 0) {
        this.error = 'Ningún empleado tiene turno asignado. Asigna turnos antes de guardar.';
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
        console.log('Asignaciones guardadas:', res);
        this.info = `Asignaciones guardadas correctamente (${payload.asignaciones.length} turnos)`;
        this.guardarConfiguracionEnLocalStorage();
        this.mostrarResumenAsignaciones();

        this.asignacionesCalendario = [];
        setTimeout(() => {
          this.cancelarFormulario();
        }, 3000);
      },
      error: (err) => {
        console.error('Error guardando asignaciones:', err);
        this.revertirAsignacionAreas();

        if (err.status === 400) {
          this.error = 'Error en los datos enviados: ' + (err.error?.message || 'Formato incorrecto');
        } else if (err.status === 500) {
          this.error = 'Error del servidor: ' + (err.error?.error || 'Intenta nuevamente');
        } else {
          this.error = 'Error al guardar asignaciones: ' + err.message;
        }
      }
    });
  }

  cargarConfiguraciones() {
    throw new Error('Method not implemented.');
  }

  obtenerInicioMes() {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-01`;
  }

  obtenerFinMes() {
    const hoy = new Date();
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    return fin.toISOString().split('T')[0];
  }

 //MÉTODO MEJORADO: Guardar configuración en localStorage
    private guardarConfiguracionEnLocalStorage() {
      const configuracion = {
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
        fechaCreacion: new Date().toISOString(),
        asignacionesCalendario: [...this.asignacionesCalendario]
      };

      if (this.modo === 'ROTATIVO') {
        const configs = this.configuracionesRotativas;
        if (this.editandoId === 'NUEVO') {
          configs.push(configuracion);
        } else {
          const index = configs.findIndex(c => c.id === this.editandoId);
          if (index !== -1) configs[index] = configuracion;
        }
        this.configuracionesRotativas = configs;
      } else {
        const configs = this.configuracionesFijas;
        if (this.editandoId === 'NUEVO') {
          configs.push(configuracion);
        } else {
          const index = configs.findIndex(c => c.id === this.editandoId);
          if (index !== -1) configs[index] = configuracion;
        }
        this.configuracionesFijas = configs;
      }
  }

  // Método para asignar áreas definitivamente al guardar
  private async asignarAreasDefinitivas(): Promise<void> {
    const areaId = this.areaJefeForm.controls.area_id.value;
    if (!areaId) {
      throw new Error('No hay área seleccionada');
    }

    const promesas = this.equipoCompleto.map(empleado => {
      // Solo asignar área si el empleado no la tiene o si es diferente
      if (empleado.area_id !== areaId) {
        return this.actualizarAreaEmpleadoEnBD(empleado.id, areaId).toPromise();
      }
      return Promise.resolve();
    });

    await Promise.all(promesas);
    
    // Actualizar el estado local de los empleados
    this.equipoCompleto.forEach(empleado => {
      empleado.area_id = areaId;
    });
  }

  // Método para revertir asignación si hay error
  private revertirAsignacionAreas(): void {
    this.equipoCompleto.forEach(empleado => {
      empleado.area_id = null;
    });
  }

  // Método para mostrar resumen de asignaciones
  private mostrarResumenAsignaciones(): void {
    const areaNombre = this.getAreaNombre(this.areaJefeForm.controls.area_id.value);
    const empleadosCount = this.equipoCompleto.length;
    
    this.info = ` ${empleadosCount} empleados asignados al área ${areaNombre} y turnos guardados correctamente`;
    
    // Mostrar detalles
    setTimeout(() => {
      console.log('📋 Resumen de asignaciones:');
      this.equipoCompleto.forEach(emp => {
        const turnoNombre = this.turnos.find(t => t.id === emp.turnoAsignado)?.nombre || 'Sin turno';
        console.log(`   - ${emp.nombre_completo}: ${turnoNombre}`);
      });
    }, 100);
  }

  // Mantén este método para actualizar en BD (pero sin mostrar mensajes)
  private actualizarAreaEmpleadoEnBD(empleadoId: number, areaId: number | null) {
    return this.http.patch(`${API}/empleados/${empleadoId}`, { area_id: areaId });
  }
        
    guardarTurnoEnDB(turno: Turno) {
    return this.http.post<Turno>(`${API}/turnos`, turno);
  }

  // Después de asignar el turno exitosamente, actualiza los empleados
    asignarTurno() {
      this.turnosService.crearTurno(this.turnoData).subscribe({
        next: (response) => {
          //ctualizar el estado local de los empleados
          this.actualizarEmpleadosAsignados();
          
          //Recargar la lista completa de empleados
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

    editarTurno(empleadoId: number) {
    this.modoEdicion = true;

    const desde = this.form.get('fecha_inicio')?.value;
    const hasta = this.form.get('fecha_fin')?.value;

    if (desde && hasta) {
      this.turnosService.getAsignacionesEmpleado(empleadoId, desde, hasta).subscribe({
        next: (res) => {
          if (res.success && res.asignaciones.length > 0) {
            this.asignacionesPrevias = res.asignaciones;
          } else {
            this.asignacionesPrevias = [] as Asignacion[];
          }
        },
        error: (err) => console.error('Error cargando asignaciones:', err)
      });
    }
  }

  // ODIFICA el método resetFormulario:
    private resetFormulario() {
      this.areaJefeForm.reset();
      this.fijoForm.reset();
      this.fechasForm.reset({ patron: 'NORMAL' });
      
      //Solo limpiar equipo temporal, NO liberar áreas
      this.equipoCompleto = [];
      
      this.empleadosFijos = [];
      this.reemplazos = [];
      this.descansoGrupal = [];
      this.step = 1;
      this.error = null;
      this.filtroBusqueda = '';
      this.filtroRol = null;
      this.asignacionesCalendario = [];
      
      console.log('🔄 Formulario reseteado - equipos temporales limpiados');
    }

    // ===== Funciones TrackBy para mejorar rendimiento =====
  trackByEmpleadoId(index: number, empleado: any): number {
    return empleado.id;
  }

  trackByTurnoId(index: number, turno: any): number {
    return turno.id;
  }

  trackByAreaId(index: number, area: any): number {
    return area.id;
  }
  trackByConfigId(index: number, config: any): number {
    return config.id || index;
  }

  trackByDiaSemana(index: number, dia: any): number {
    return index;
  }

  trackByRolId(index: number, rol: any): number {
    return rol.id || index;
  }

  trackByJefeId(index: number, jefe: any): number {
    return jefe.id || index;
  }

  trackByAsignacionId(index: number, asignacion: any): number {
    return asignacion.id || index;
  }
}

 