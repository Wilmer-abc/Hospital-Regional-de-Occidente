import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService, DashboardSummary } from '../../services/dashboard.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  data: DashboardSummary = {
    personalActivo: 0,
    personalInactivo: 0,      // ✅ Nuevo campo
    personalTotal: 0,
    turnosHoy: 0,
    alertas: 0,
    jerarquias: 0,
    proximosTurnos: {
      manana: { enfermeros: 0, medicos: 0 },
      tarde:  { enfermeros: 0, medicos: 0 },
      noche:  { enfermeros: 0, medicos: 0 },
    },
    asistenciaSemanal: [],
  };

  loading = true;
  hasData = false;

  constructor(private dash: DashboardService) {}

  ngOnInit(): void {
    this.loadRealData();
  }

  private hasAnyData(d: DashboardSummary): boolean {
    const top =
      d.personalActivo + d.personalInactivo + d.personalTotal +
      d.personalActivo + d.turnosHoy + d.alertas + d.jerarquias +
      d.proximosTurnos.manana.enfermeros + d.proximosTurnos.manana.medicos +
      d.proximosTurnos.tarde.enfermeros  + d.proximosTurnos.tarde.medicos +
      d.proximosTurnos.noche.enfermeros  + d.proximosTurnos.noche.medicos;
    const serie = d.asistenciaSemanal?.some(x => x.entradas > 0);
    return top > 0 || !!serie;
  }

  loadRealData() {
    this.loading = true;
    this.dash.getSummary().subscribe({
      next: (resp) => {
        if (resp.success && resp.data) {
          this.data = resp.data;
          this.hasData = this.hasAnyData(resp.data);
        } else {
          this.hasData = false;
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading dashboard:', err);
        this.loading = false;
        this.hasData = false;
      }
    });
  }
}
