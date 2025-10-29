import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

@Component({
  selector: 'app-renovacion',
  standalone: true, 
  imports: [CommonModule], 
  templateUrl: './renovacion.component.html',
  styleUrls: ['./renovacion.component.scss']
})
export class RenovacionComponent {
  @Input() loteId!: number;
  @Input() fechaFin!: string;
  @Input() areaNombre!: string;
  @Input() jefeNombre!: string;
  @Input() empleadosCount!: number;

  cargando = false;
  mensaje: string | null = null;
  error: string | null = null;

  constructor(private http: HttpClient) {}

  puedeRenovar(): boolean {
    if (!this.fechaFin) return false;
    const hoy = new Date();
    const fin = new Date(this.fechaFin);
    const diff = (fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 2; // Habilitar 2 días antes del fin
  }

    renovarTurno(event: Event): void {
    event.stopPropagation();
    console.log('🟢 Click detectado en botón Renovar');
    console.log('📦 loteId enviado:', this.loteId);

    if (!this.loteId) {
        console.warn('⚠️ No hay loteId disponible');
        return;
    }

    this.cargando = true;
    this.mensaje = null;
    this.error = null;

    this.http.post(`/api/asignaciones/renovar-lote`, { lote_id: this.loteId }).subscribe({
        next: (resp: any) => {
        console.log('✅ Respuesta del servidor:', resp);
        this.cargando = false;
        if (resp.success) {
            this.mensaje = resp.message;
        } else {
            this.error = resp.message || 'Error al renovar el turno';
        }
        },
        error: err => {
        console.error('❌ Error en la petición:', err);
        this.cargando = false;
        this.error = err.error?.message || 'Error inesperado al renovar';
        }
    });
    }

}
