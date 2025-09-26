import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TurnosService } from '../../services/turnos.service';

const API = environment.apiBase;

interface Turno {
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
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './asignar-turnos.component.html',
  styleUrls: ['./asignar-turnos.component.scss']
})
export class AsignarTurnosComponent implements OnInit {
  //  Sistema de vistas 
  vista: 'HOME' | 'LISTA_ROTATIVOS' | 'LISTA_FIJOS' | 'FORMULARIO' = 'HOME';
  modo: 'FIJO' | 'ROTATIVO' = 'ROTATIVO';
  editandoId: number | 'NUEVO' | null = null;
  step = 1;

  //  Estado general 
  loading = false;
  error: string | null = null;
  info: string | null = null;

  //  Catálogos 
  turnos: Turno[] = [];
  areas: Area[] = [];
  jefesCandidatos: Empleado[] = [];
  roles: Rol[] = [];
  empleados: Empleado[] = [];
  private turnosService = inject(TurnosService);

  //  Almacenamiento persistente 
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

  //  Formularios 
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);

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

  //  Turnos personalizados
  nuevoTurno: NuevoTurno = {
    nombre: '',
    hora_inicio: '08:00',
    hora_fin: '16:00',
    tolerancia_entrada_minutos: 15,
    tolerancia_salida_minutos: 15
  };

  get turnosDisponibles(): Turno[] {
    return this.turnos;
  }

  //  Gestión de equipos 
  empleadosFiltrados: Empleado[] = [];
  empleadosFijos: Empleado[] = [];
  filtroBusqueda: string = '';
  filtroRol: string | null = null;

  // Para rotativos
  equipoCompleto: Empleado[] = [];
  reemplazos: Reemplazo[] = [];
  reemplazoActual: Reemplazo | null = null;

  // Contadores
  get enfermerosSeleccionados(): Empleado[] {
    return this.equipoCompleto.filter(e => this.getTipoRolPorNombre(e.rol_id) === 'ENFERMERO');
  }

  get auxEnfermeriaSeleccionados(): Empleado[] {
    return this.equipoCompleto.filter(e => this.getTipoRolPorNombre(e.rol_id) === 'AUX_ENFERMERIA');
  }

  get auxHospitalSeleccionados(): Empleado[] {
    return this.equipoCompleto.filter(e => this.getTipoRolPorNombre(e.rol_id) === 'AUX_HOSPITAL');
  }

  //  Descanso grupal 
  diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  descansoGrupal: { [key: string]: boolean } = {};

  //  Preview 
  previewFechas: string[] = [];

  //  Modal reemplazos 
  mostrarModalReemplazos = false;
  busquedaReemplazo = '';
  empleadosDisponiblesReemplazo: Empleado[] = [];

  //  Métodos principales 
  ngOnInit(): void {
    this.cargarCatalogos();
  }

  private cargarCatalogos() {
  this.loading = true;
  this.error = null;

  const turnosGuardados = localStorage.getItem('turnosPersonalizados');
  const turnosPersonalizados = turnosGuardados ? JSON.parse(turnosGuardados) : [];

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

  //  Métodos auxiliares 
  private getRolNombrePorId(rolId: number | null, roles: Rol[]): string {
    if (!rolId) return '';
    const rol = roles.find(r => r.id === rolId);
    return rol?.nombre || '';
  }

  //  Navegación y vistas 
abrirFormulario(id: any) {
  if (id === 'NUEVO') {
    this.editandoId = 'NUEVO';
    this.modo = this.vista === 'LISTA_ROTATIVOS' ? 'ROTATIVO' : 'FIJO';
    this.vista = 'FORMULARIO';
    this.resetFormulario();
    return;
  }

  // Editar configuración existente
  this.editandoId = id;
  this.modo = this.vista === 'LISTA_ROTATIVOS' ? 'ROTATIVO' : 'FIJO';
  this.vista = 'FORMULARIO';
  this.cargarConfiguracionExistente(id);
}

// Removed duplicate implementation of cargarConfiguracionExistente


  cancelarFormulario() {
    this.vista = this.modo === 'ROTATIVO' ? 'LISTA_ROTATIVOS' : 'LISTA_FIJOS';
    this.editandoId = null;
    this.step = 1;
  }

  // ====== Gestión de empleados disponibles para rotativos ======
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

  getTipoRolPorNombre(rolId: number | null): string {
  if (!rolId) return '';
  
  const rolNombre = this.getRolNombre(rolId).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  console.log(`Clasificando rol: "${rolNombre}" (ID: ${rolId})`);
  
  // Mapeo más flexible de roles
  if (rolNombre.includes('enfermer') && !rolNombre.includes('auxiliar')) {
    return 'ENFERMERO';
  } else if (rolNombre.includes('auxiliar') && rolNombre.includes('enfermer')) {
    return 'AUX_ENFERMERIA';
  } else if (rolNombre.includes('auxiliar') && rolNombre.includes('hospital')) {
    return 'AUX_HOSPITAL';
  }
  
  return '';
}

    debugEmpleadosFiltrados() {
    console.log('=== DEBUG EMPLEADOS FILTRADOS ===');
    console.log('Filtro rol:', this.filtroRol);
    console.log('Filtro búsqueda:', this.filtroBusqueda);
    console.log('Empleados filtrados:', this.empleadosFiltrados.length);
    
    this.empleadosFiltrados.forEach(emp => {
      const tipoRol = this.getTipoRolPorNombre(emp.rol_id);
      console.log(`${emp.nombre_completo} - Rol ID: ${emp.rol_id} - Tipo: ${tipoRol}`);
    });
  }

  getTipoRol(rolNombre: string): string | null {
    if (!rolNombre) return null;

    const nombre = rolNombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
    //  esto quita tildes para que "enfermería" = "enfermeria"

    if (nombre.includes('enfermero') || nombre.includes('enfermera')) {
      return 'ENFERMERO';
    }
    if (nombre.includes('auxiliar de enfermeria')) {
      return 'AUX_ENFERMERIA';
    }
    if (nombre.includes('auxiliar de hospital')) {
      return 'AUX_HOSPITAL';
    }

    return null;
  }

  getEstadoDisponibilidad(empleado: Empleado): string {
    if (empleado.area_id === null) {
      return 'Disponible';
    } else if (empleado.area_id === this.areaJefeForm.controls.area_id.value) {
      return 'Asignado a esta área';
    } else {
      return 'Asignado a otra área';
    }
  }

  isEmpleadoSeleccionable(empleado: Empleado): boolean {
    if (!empleado.activo) return false;
    
    const tipoRol = this.getTipoRolPorNombre(empleado.rol_id);
    
    // Solo permitir roles específicos
    if (!['ENFERMERO', 'AUX_ENFERMERIA', 'AUX_HOSPITAL'].includes(tipoRol)) return false;
    
    // Permitir empleados sin área o que ya estén en esta área
    return empleado.area_id === null || empleado.area_id === this.areaJefeForm.controls.area_id.value;
  }

  //  Gestión de areas y empleados 
  onAreaChangeRotativo(areaId: string | number | null) {
    const id = areaId ? Number(areaId) : null;
    console.log('Área cambiada a:', id);
    this.cargarJefesCandidatos(id);
    
    // Forzar el filtrado de empleados
    setTimeout(() => {
      this.filtrarEmpleados();
    }, 100);
  }

  cargarEmpleadosArea(): void {
    const areaId = this.fijoForm.controls.area_id.value;
    if (!areaId) return;

    this.empleadosFijos = this.empleados.filter(emp => 
      emp.area_id === areaId && emp.activo
    );
    this.cargarJefesCandidatos(areaId);
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

  //  Gestión de equipos 
  filtrarEmpleados() {
    console.log('=== FILTRANDO EMPLEADOS ===');
    console.log('Filtro rol:', this.filtroRol);
    console.log('Filtro búsqueda:', this.filtroBusqueda);
    console.log('Total empleados:', this.empleados.length);

    const areaId = this.areaJefeForm.controls.area_id.value;

    let filtrados = this.empleados.filter(e => {
      if (!e.activo) {
        console.log(`Empleado ${e.nombre_completo} no activo - excluido`);
        return false;
      }
      return true;
    });

    console.log('Empleados activos:', filtrados.length);

    // Buscar por nombre
    if (this.filtroBusqueda) {
      const search = this.filtroBusqueda.toLowerCase();
      filtrados = filtrados.filter(e => 
        e.nombre_completo.toLowerCase().includes(search)
      );
      console.log('Después de búsqueda por nombre:', filtrados.length);
    }

    // Filtro por tipo de rol
    if (this.filtroRol) {
      filtrados = filtrados.filter(e => {
        const tipoRolEmpleado = this.getTipoRolPorNombre(e.rol_id);
        return tipoRolEmpleado === this.filtroRol;
      });
      console.log('Después de filtro por rol:', filtrados.length);
    } else {
      // Si no hay filtro, mostrar solo los roles permitidos
      filtrados = filtrados.filter(e => {
        const tipo = this.getTipoRolPorNombre(e.rol_id);
        const esPermitido = ['ENFERMERO', 'AUX_ENFERMERIA', 'AUX_HOSPITAL'].includes(tipo);
        console.log(`Empleado ${e.nombre_completo} - Rol: ${tipo} - Permitido: ${esPermitido}`);
        return esPermitido;
      });
      console.log('Después de filtro por roles permitidos:', filtrados.length);
    }

    // Mostrar empleados que no tienen área o están en el área seleccionada
    filtrados = filtrados.filter(e => {
      const disponible = e.area_id === null || e.area_id === areaId;
      console.log(`Disponibilidad área para ${e.nombre_completo}: ${disponible} (área emp: ${e.area_id}, área sel: ${areaId})`);
      return disponible;
    });

    console.log('Empleados finales filtrados:', filtrados.length);
    this.empleadosFiltrados = filtrados;
    
    // Debug final
    this.empleadosFiltrados.forEach(emp => {
      const tipoRol = this.getTipoRolPorNombre(emp.rol_id);
      console.log(`✓ ${emp.nombre_completo} - Rol: ${this.getRolNombre(emp.rol_id)} - Tipo: ${tipoRol} - Área: ${emp.area_id}`);
    });
  }

    cargarEmpleadosDisponibles() {
    const desde = this.fechasForm.controls.fecha_inicio.value;
    const hasta = this.fechasForm.controls.fecha_fin.value;

    if (!desde || !hasta) {
      console.warn('Debes seleccionar fechas antes de cargar empleados.');
      return;
    }

    this.turnosService.getEmpleadosDisponibles(desde, hasta, this.filtroRol ?? undefined)
      
  }


  toggleEmpleadoEquipo(empleado: Empleado) {
    if (this.modo === 'ROTATIVO' && !this.isEmpleadoSeleccionable(empleado)) {
      this.error = 'Este empleado no está disponible para selección';
      return;
    }

    const index = this.equipoCompleto.findIndex(e => e.id === empleado.id);
    
    if (index === -1) {
      if (this.modo === 'ROTATIVO') {
        const tipoRol = this.getTipoRolPorNombre(empleado.rol_id);
        const limiteAlcanzado = 
          (tipoRol === 'ENFERMERO' && this.enfermerosSeleccionados.length >= 5) ||
          (tipoRol === 'AUX_ENFERMERIA' && this.auxEnfermeriaSeleccionados.length >= 5) ||
          (tipoRol === 'AUX_HOSPITAL' && this.auxHospitalSeleccionados.length >= 5);

        if (limiteAlcanzado) {
          this.error = `Límite alcanzado para ${this.getNombreTipoRol(tipoRol)} (máximo 5)`;
          return;
        }
      }

      this.equipoCompleto.push({...empleado});
    } else {
      this.equipoCompleto.splice(index, 1);
    }
  }

  isEmpleadoSeleccionado(id: number): boolean {
    return this.equipoCompleto.some(e => e.id === id);
  }

  //  Gestión de turnos 
  crearTurnoPersonalizado() {
    if (!this.nuevoTurno.nombre || !this.nuevoTurno.hora_inicio || !this.nuevoTurno.hora_fin) {
      this.error = 'Complete todos los campos del turno';
      return;
    }

    const nuevoId = Math.max(...this.turnos.map(t => t.id), 0) + 1;
    const nuevoTurno: Turno = {
      id: nuevoId,
      nombre: this.nuevoTurno.nombre,
      hora_inicio: this.nuevoTurno.hora_inicio,
      hora_fin: this.nuevoTurno.hora_fin,
      minutos_descanso: 60,
      tolerancia_entrada_minutos: this.nuevoTurno.tolerancia_entrada_minutos || 15,
      tolerancia_salida_minutos: this.nuevoTurno.tolerancia_salida_minutos || 15,
      cruza_medianoche: false,
      esPersonalizado: true
    };

    this.turnos.push(nuevoTurno);
    this.guardarTurnosEnLocalStorage();
    
    this.nuevoTurno = {
      nombre: '',
      hora_inicio: '08:00',
      hora_fin: '16:00',
      tolerancia_entrada_minutos: 15,
      tolerancia_salida_minutos: 15
    };

    this.info = 'Turno creado correctamente';
  }

  private guardarTurnosEnLocalStorage() {
    const turnosPersonalizados = this.turnos.filter(t => t.esPersonalizado);
    localStorage.setItem('turnosPersonalizados', JSON.stringify(turnosPersonalizados));
  }

  eliminarTurno(turnoId: number) {
    const enUso = this.equipoCompleto.some(emp => emp.turnoAsignado === turnoId) ||
                  this.empleadosFijos.some(emp => emp.turnoAsignado === turnoId);

    if (enUso) {
      this.error = 'No se puede eliminar un turno que está en uso';
      return;
    }

    this.turnos = this.turnos.filter(t => t.id !== turnoId);
    this.guardarTurnosEnLocalStorage();
    this.info = 'Turno eliminado correctamente';
  }

    eliminarConfiguracion(conf: any, vista: string) {
    if (conf.empleados && conf.empleados.length > 0) {
      conf.empleados.forEach((emp: any) => {
        if (!this.empleadosFiltrados.some((e: any) => e.id === emp.id)) {
          this.empleadosFiltrados.push(emp);
        }
      });
    }

    // 2. Eliminar de la lista
    if (vista === 'LISTA_ROTATIVOS') {
      this.configuracionesRotativas = this.configuracionesRotativas.filter(c => c.id !== conf.id);
    } else {
      this.configuracionesFijas = this.configuracionesFijas.filter(c => c.id !== conf.id);
    }
  }


  //  Gestión de reemplazos 
  agregarReemplazo() {
    if (this.equipoCompleto.length === 0) {
      this.error = 'Primero debe seleccionar empleados para el equipo';
      return;
    }

    const nuevoReemplazo: Reemplazo = {
      id: Date.now(),
      empleadoId: this.equipoCompleto[0]?.id || 0,
      reemplazoId: null,
      fechaInicio: new Date().toISOString().split('T')[0],
      fechaFin: new Date().toISOString().split('T')[0]
    };
    this.reemplazos.push(nuevoReemplazo);
  }

  eliminarReemplazo(reemplazo: Reemplazo) {
    this.reemplazos = this.reemplazos.filter(r => r.id !== reemplazo.id);
  }

  buscarReemplazo(reemplazo: Reemplazo) {
    this.reemplazoActual = reemplazo;
    this.mostrarModalReemplazos = true;
    
    this.empleadosDisponiblesReemplazo = this.empleados.filter(emp => {
      if (emp.id === reemplazo.empleadoId) return false;
      if (!emp.activo) return false;
      
      const tipoRol = this.getTipoRolPorNombre(emp.rol_id);
      if (!['ENFERMERO', 'AUX_ENFERMERIA', 'AUX_HOSPITAL'].includes(tipoRol)) return false;
      
      return true;
    });
  }

  asignarReemplazo(empleado: Empleado) {
    if (this.reemplazoActual) {
      this.reemplazoActual.reemplazoId = empleado.id;
      this.mostrarModalReemplazos = false;
      this.reemplazoActual = null;
      this.info = `Reemplazo asignado: ${empleado.nombre_completo}`;
    }
  }

  //  Navegación por pasos 
  nextStep() {
    this.step++;

    //  paso 2, cargar empleados
    if (this.step === 2 && this.modo === 'ROTATIVO') {
      this.cargarEmpleadosDisponibles();
    }
  }


  prevStep() {
    if (this.step > 1) {
      this.step--;
      this.error = null;
    }
  }

  validarPasoActual(): boolean {
    switch (this.step) {
      case 1:
        const areaId = this.areaJefeForm.controls.area_id.value;
        const jefeId = this.areaJefeForm.controls.jefe_id.value;
        if (!areaId || !jefeId) {
          this.error = 'Selecciona área y jefe antes de continuar';
          return false;
        }
        break;
      case 2:
        if (this.equipoCompleto.length === 0) {
          this.error = 'Selecciona al menos un empleado para el equipo';
          return false;
        }
        break;
      case 3:
        const sinTurno = this.equipoCompleto.filter(emp => !emp.turnoAsignado);
        if (sinTurno.length > 0) {
          this.error = `Hay ${sinTurno.length} empleados sin turno asignado`;
          return false;
        }
        break;
    }
    return true;
  }

  //  Guardar configuraciones 
guardarFormulario() {
  if (this.modo === 'ROTATIVO') {
    this.guardarConfiguracionRotativo();
  } else {
    this.guardarTurnosFijos();
  }
}

private guardarConfiguracionRotativo() {
  if (!this.validarPasoActual()) return;

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

  //  Utilidades 
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

  private cargarConfiguracionExistente(id: number) {
    let conf: any;

    // 👇 CORRECCIÓN: Usar this.modo en lugar de this.vista
    if (this.modo === 'ROTATIVO') {
      conf = this.configuracionesRotativas.find(c => c.id === id);
      if (conf) {
        // 👇 CORRECCIÓN: Usar las propiedades correctas del objeto
        this.areaJefeForm.patchValue({ 
          area_id: conf.areaId || conf.area_id, 
          jefe_id: conf.jefeId || conf.jefe_id 
        });
        
        // Cargar equipo
        this.equipoCompleto = conf.equipo || conf.empleados || [];
        
        // Cargar reemplazos
        this.reemplazos = conf.reemplazos || [];
        
        // Cargar fechas
        this.fechasForm.patchValue({
          fecha_inicio: conf.fecha_inicio || '',
          fecha_fin: conf.fecha_fin || '',
          patron: conf.patron || 'NORMAL'
        });
        
        // Ir al último paso para edición
        this.step = 4;
        
        console.log('Configuración rotativa cargada:', conf);
      }
    } else {
      conf = this.configuracionesFijas.find(c => c.id === id);
      if (conf) {
        this.fijoForm.patchValue({ 
          area_id: conf.areaId || conf.area_id, 
          jefe_id: conf.jefeId || conf.jefe_id 
        });
        this.empleadosFijos = conf.empleadosFijos || conf.empleados || [];
        this.descansoGrupal = conf.descansoGrupal || {};
        this.cargarEmpleadosArea();
        
        console.log('Configuración fija cargada:', conf);
      }
    }

    if (!conf) {
      this.error = 'Configuración no encontrada';
      console.error('Configuración no encontrada. ID:', id, 'Modo:', this.modo);
      console.log('Configuraciones rotativas:', this.configuracionesRotativas);
      console.log('Configuraciones fijas:', this.configuracionesFijas);
      
      // Volver a la lista correspondiente después de 2 segundos
      setTimeout(() => {
        this.cancelarFormulario();
      }, 2000);
      return;
    }
  }

  getRolNombre(rolId: number | null): string {
    if (!rolId) return 'Sin rol asignado';
    const rol = this.roles.find(r => r.id === rolId);
    return rol?.nombre || `Rol ${rolId}`;
  }

  getNombreTipoRol(tipo: string): string {
    const nombres: { [key: string]: string } = {
      'ENFERMERO': 'Enfermeros',
      'AUX_ENFERMERIA': 'Auxiliares de Enfermería',
      'AUX_HOSPITAL': 'Auxiliares de Hospital'
    };
    return nombres[tipo] || tipo;
  }

  getEmpleadoNombre(id: number | null): string {
    if (!id) return '—';
    const emp = this.empleados.find(e => e.id === id);
    return emp?.nombre_completo || '—';
  }

  getAreaNombre(id: number | null): string {
    if (!id) return '—';
    const area = this.areas.find(a => a.id === id);
    return area?.nombre || '—';
  }

  eliminarEmpleadoFijo(id: number) {
    this.empleadosFijos = this.empleadosFijos.filter(e => e.id !== id);
  }

  onTurnoEmpleadoChange(empleado: Empleado) {
    console.log(`Turno cambiado para ${empleado.nombre_completo}:`, empleado.turnoAsignado);
  }

  aplicarDescansoGrupal() {
    this.info = 'Días de descanso aplicados al grupo';
  }

  generarPreviewFechas() {
    this.previewFechas = ['2024-01-01', '2024-01-02', '2024-01-03']; 
  }
}