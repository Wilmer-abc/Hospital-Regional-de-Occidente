import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Turno {
  id: number;
  nombre_turno: string;
  hora_inicio: string;
  hora_fin: string;
  minutos_descanso: number;
  tolerancia_entrada_minutos: number;
  tolerancia_salida_minutos: number;
  cruza_medianoche: boolean;
}

export interface Asignacion {
  id: number;
  fecha: string;
  empleado_id: number;
  nombre_completo: string;
  numero_empleado: string;
  turno_id: number;
  nombre_turno: string;
  hora_inicio: string;
  hora_fin: string;
  cruza_medianoche: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class TurnosService {
  getEmpleadosDisponibles(desde: string, hasta: string, arg2: string | undefined) {
    throw new Error('Method not implemented.');
  }
  private base = environment.apiBase; //ej. http://localhost:3000/api

  constructor(private http: HttpClient) {}

  //  helpers 
  // Normaliza el payload que espera el backend (nombre_turno en vez de nombre)
  private toTurnoPayload(body: Partial<Turno> & { nombre?: string }) {
    return {
      nombre_turno: body.nombre_turno ?? body.nombre ?? '',
      hora_inicio: body.hora_inicio,
      hora_fin: body.hora_fin,
      minutos_descanso: body.minutos_descanso ?? 0,
      tolerancia_entrada_minutos: body.tolerancia_entrada_minutos ?? 10,
      tolerancia_salida_minutos: body.tolerancia_salida_minutos ?? 10,
      cruza_medianoche: !!body.cruza_medianoche,
    };
  }

  //  Turnos 
  getTurnos(): Observable<ApiResponse<Turno[]>> {
    return this.http.get<ApiResponse<Turno[]>>(`${this.base}/turnos`);
  }

  createTurno(body: Partial<Turno> & { nombre?: string }) {
    const payload = this.toTurnoPayload(body);
    // tu backend devuelve { id } dentro de data
    return this.http.post<ApiResponse<{ id: number }>>(`${this.base}/turnos`, payload);
  }

  updateTurno(id: number, body: Partial<Turno> & { nombre?: string }) {
    const payload = this.toTurnoPayload(body);
    return this.http.put<ApiResponse>(`${this.base}/turnos/${id}`, payload);
  }

  // NUEVO: Eliminar múltiples turnos
  deleteTurnos(ids: number[]): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${this.base}/turnos`, {
      body: { ids }
    });
  }


  getCandidatosJefe(areaId: number): Observable<ApiResponse<any[]>> {
  return this.http.get<ApiResponse<any[]>>(
    `${this.base}/areas/${areaId}/candidatos-jefe`
  );
}


  // turnos.service.ts
getDisponibles(desde: string, hasta: string, areaId?: number, rol?: string, q?: string) {
  let params = new HttpParams()
    .set('desde', desde)
    .set('hasta', hasta);

  if (areaId) params = params.set('areaId', areaId);
  if (rol) params = params.set('rol', rol);
  if (q) params = params.set('q', q);

  return this.http.get<ApiResponse<any[]>>(`${this.base}/asignaciones/disponibles`, { params });
}





  // NUEVO: Verificar si un turno puede ser eliminado
  canDeleteTurno(id: number): Observable<ApiResponse<{ can_delete: boolean; asignaciones_count: number }>> {
    return this.http.get<ApiResponse<{ can_delete: boolean; asignaciones_count: number }>>(
      `${this.base}/turnos/${id}/can-delete`
    );
  }

  //  Asignaciones 
  getAsignaciones(q: { desde?: string; hasta?: string; empleado_id?: number; area_id?: number }) {
    let p = new HttpParams();
    (Object.keys(q) as Array<keyof typeof q>).forEach(k => {
      const v = q[k];
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    });
    return this.http.get<ApiResponse<Asignacion[]>>(`${this.base}/asignaciones`, { params: p });
  }

  assignOne(body: { empleado_id: number; turno_id: number; fecha: string }) {
    return this.http.post<ApiResponse>(`${this.base}/asignaciones`, body);
  }

  assignBulk(body: { empleado_id: number; turno_id: number; desde: string; hasta: string; diasSemana?: number[] }) {
    return this.http.post<ApiResponse>(`${this.base}/asignaciones/bulk`, body);
  }

  //  Endpoints nuevos de la vista 4 pasos 
  previsualizar(body: {
    turno_id: number; area_id: number; jefe_id: number;
    empleados_ids: number[]; fecha_inicio: string; fecha_fin: string;
    patron: 'NORMAL' | '24x72'; dias_descanso: number[];
  }) {
    return this.http.post<ApiResponse>(`${this.base}/asignaciones/previsualizar`, body);
  }

  asignarLote(body: {
    turno_id: number; area_id: number; jefe_id: number;
    empleados_ids: number[]; fecha_inicio: string; fecha_fin: string;
    patron: 'NORMAL' | '24x72'; dias_descanso: number[];
  }) {
    return this.http.post<ApiResponse>(`${this.base}/asignaciones/lote`, body);
  }
}
