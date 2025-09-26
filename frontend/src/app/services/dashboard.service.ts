import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export type ProximosTurnos = {
  manana: { enfermeros: number; medicos: number };
  tarde:  { enfermeros: number; medicos: number };
  noche:  { enfermeros: number; medicos: number };
};

export interface DashboardSummary {
  personalActivo: number;
  personalInactivo: number;    
  personalTotal: number; 
  turnosHoy: number;
  alertas: number;
  jerarquias: number;
  proximosTurnos: ProximosTurnos;
  asistenciaSemanal: Array<{ fecha: string; entradas: number }>;
}

export interface ApiResponse<T=any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private base = `${environment.apiBase}/dashboard`;

  constructor(private http: HttpClient) {}

  getSummary() {
    return this.http.get<ApiResponse<DashboardSummary>>(`${this.base}/summary`);
  }
}
