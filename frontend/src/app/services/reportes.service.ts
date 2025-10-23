// frontend/src/app/services/reportes.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';

const API = environment.apiBase + '/reportes';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  obtenerAsistencia(areaSeleccionada: number, desde: any, hasta: any) {
    throw new Error('Method not implemented.');
  }
  constructor(private http: HttpClient) {}

  getAreas() {
    return this.http.get<any>(`${API}/areas`);
  }

  getReporte(areaId: number, desde: string, hasta: string) {
    const params = new HttpParams()
      .set('area_id', areaId)
      .set('desde', desde)
      .set('hasta', hasta);
    return this.http.get<any>(`${API}/asistencia`, { params });
  }

  
}
