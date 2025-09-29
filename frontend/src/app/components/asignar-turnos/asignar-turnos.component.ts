import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule, FormGroup } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TurnosService } from '../../services/turnos.service';
import { CalendarioTurnosComponent } from '../calendario-turnos/calendario-turnos.component';

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

@Component({
  selector: 'app-asignar-turnos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, CalendarioTurnosComponent],
  templateUrl: './asignar-turnos.component.html',
  styleUrls: ['./asignar-turnos.component.scss']
})
export class AsignarTurnosComponent implements OnInit {

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
  busquedaReemplazo = '';
  empleadosDisponiblesReemplazo: Empleado[] = [];

  // ===== Asignaciones individuales (desde calendario-turnos) =====
  asignaciones: Record<number, any[]> = {};

  // ===== Descanso grupal =====
  diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  descansoGrupal: { [key: string]: boolean } = {};

  // ===== Ciclo de vida =====
  ngOnInit(): void {
    this.cargarCatalogos();
    this.cargarTurnos();
    
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

    // En cargarCatalogos(), modifica esta parte:
    const turnosGuardados = localStorage.getItem('turnosPersonalizados');
    const turnosPersonalizados = turnosGuardados ? JSON.parse(turnosGuardados) : [];
    // La asignación de this.turnos se realiza dentro del .then donde 't' está definido.
    console.log('Turnos personalizados cargados:', turnosPersonalizados);

    Promise.all([
      this.http.get<any>(`${API}/turnos`).toPromise(),
      this.http.get<any>(`${API}/areas`).toPromise(),
      this.http.get<any>(`${API}/empleados`).toPromise(),
      this.http.get<any>(`${API}/roles`).toPromise()
    ])
    .then(([t, a, e, r]) => {
      console.log('=== DATOS CARGADOS DESDE API ===');
      
      // Cargar turnos
      this.turnos = [...turnosPersonalizados, ...(t?.data || [])];
      
      // Cargar áreas
      this.areas = (a?.data || []).map((x: any) => ({ 
        id: x.id, 
        nombre: x.nombre || x.nombre_area || 'Sin nombre' 
      }));
      
      // Cargar roles - CORREGIDO para usar nombre_rol
      this.roles = (r?.data || []).map((rol: any) => ({
        id: rol.id,
        nombre: rol.nombre_rol || rol.nombre, // Usa nombre_rol que viene de la BD
        nivel: rol.nivel
      }));
      
      // Cargar empleados
      this.empleados = (e?.data || []).map((emp: any) => ({
        id: emp.id,
        numero_empleado: emp.numero_empleado,
        nombre_completo: emp.nombre_completo || emp.nombre || 'Sin nombre',
        area_id: emp.area_id || null,
        rol_id: emp.rol_id || null,
        email: emp.email || null,
        activo: emp.activo !== undefined ? emp.activo : true,
        turnoAsignado: emp.turnoAsignado || null
      }));

      console.log('=== EMPLEADOS CARGADOS ===');
      this.empleados.forEach(emp => {
        const rolNombre = this.getRolNombre(emp.rol_id);
        const tipoRol = this.getTipoRolPorNombre(emp.rol_id);
        console.log(`${emp.nombre_completo} - Rol ID: ${emp.rol_id} - Rol Nombre: "${rolNombre}" - Tipo: ${tipoRol} - Activo: ${emp.activo} - Área: ${emp.area_id}`);
      });

      // Filtrar empleados activos
      this.empleadosFiltrados = this.empleados.filter(emp => {
        if (!emp.activo) return false;
        
        const tipoRol = this.getTipoRolPorNombre(emp.rol_id);
        const esRolPermitido = ['ENFERMERO', 'AUX_ENFERMERIA', 'AUX_HOSPITAL'].includes(tipoRol);
        
        return esRolPermitido;
      });

      console.log('=== EMPLEADOS FILTRADOS FINALES ===');
      console.log('Total filtrados:', this.empleadosFiltrados.length);
      this.empleadosFiltrados.forEach(emp => {
        console.log(`✓ ${emp.nombre_completo} - ${this.getRolNombre(emp.rol_id)}`);
      });
    })
    .catch((error) => {
      console.error('Error cargando catálogos:', error);
      this.error = 'No se pudieron cargar catálogos. Usando datos locales.';
      
      this.turnos = [...turnosPersonalizados];
      
      // Usar datos de ejemplo si la API falla
      this.empleadosFiltrados = this.empleados.filter(emp => {
        if (!emp.activo) return false;
        const tipoRol = this.getTipoRolPorNombre(emp.rol_id);
        return ['ENFERMERO', 'AUX_ENFERMERIA', 'AUX_HOSPITAL'].includes(tipoRol);
      });
    })
    .finally(() => {
      this.loading = false;
      console.log('=== CARGA FINALIZADA ===');
      console.log('Empleados disponibles para rotativos:', this.empleadosFiltrados.length);
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

  isEmpleadoSeleccionable(empleado: Empleado): boolean {
    if (!empleado.activo) return false;
    const tipoRol = this.getTipoRolPorNombre(empleado.rol_id);
    if (!['ENFERMERO', 'AUX_ENFERMERIA', 'AUX_HOSPITAL'].includes(tipoRol)) return false;
    return empleado.area_id === null || empleado.area_id === this.areaJefeForm.controls.area_id.value;
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

  getEstadoDisponibilidad(empleado: Empleado): string {
    if (empleado.area_id === null) return 'Disponible';
    if (empleado.area_id === this.areaJefeForm.controls.area_id.value) return 'Asignado a esta área';
    return 'Asignado a otra área';
  }
    
  recibirAsignaciones(event: any) {
    console.log('Asignaciones recibidas desde calendario:', event);
    if (!this.asignaciones[event.empleadoId]) {
      this.asignaciones[event.empleadoId] = [];
    }
    this.asignaciones[event.empleadoId].push(event);
  }

  // ===== Flujo (stepper) =====
  abrirFormulario(id: any) {
    this.editandoId = id === 'NUEVO' ? 'NUEVO' : id;
    this.modo = this.vista === 'LISTA_ROTATIVOS' ? 'ROTATIVO' : 'FIJO';
    this.vista = 'FORMULARIO';
    this.resetFormulario();
  }

  cancelarFormulario() {
    this.vista = this.modo === 'ROTATIVO' ? 'LISTA_ROTATIVOS' : 'LISTA_FIJOS';
    this.editandoId = null;
    this.step = 1;
  }

  nextStep() { this.step++; }
  prevStep() { if (this.step > 1) this.step--; }

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

  toggleEmpleadoEquipo(empleado: Empleado) {
    const index = this.equipoCompleto.findIndex(e => e.id === empleado.id);
    if (index === -1) {
      this.equipoCompleto.push({ ...empleado });
    } else {
      this.equipoCompleto.splice(index, 1);
    }
  }

    private limpiarTurnos() {
    this.turnosFiltrados = this.turnosDisponibles.filter(
      t => t && t.nombre && t.hora_inicio && t.hora_fin
    );
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

  asignarReemplazo(empleado: Empleado) {
    if (this.reemplazoActual) {
      this.reemplazoActual.reemplazoId = empleado.id;
      this.mostrarModalReemplazos = false;
      this.reemplazoActual = null;
      this.info = `Reemplazo asignado: ${empleado.nombre_completo}`;
    }
  }

  // ===== Guardado de configuraciones =====
  guardarFormulario() {
    if (this.modo === 'ROTATIVO') {
      this.guardarConfiguracionRotativo();
    } else {
      this.guardarTurnosFijos();
    }
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
    this.equipoCompleto = [];
    this.empleadosFijos = [];
    this.reemplazos = [];
    this.descansoGrupal = {};
    this.step = 1;
    this.error = null;
    this.filtroBusqueda = '';
    this.filtroRol = null;
  }
}