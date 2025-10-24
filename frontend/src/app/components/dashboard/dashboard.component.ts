import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import Chart from 'chart.js/auto';
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
    personalInactivo: 0,
    personalTotal: 0,
    turnosHoy: 0,
    turnosFijos: 0,
    turnosRotativos: 0,
    personalSinTurno: 0,
    alertas: 0,
    proximosTurnos: {
      manana: { enfermeros: 0, medicos: 0 },
      tarde: { enfermeros: 0, medicos: 0 },
      noche: { enfermeros: 0, medicos: 0 },
    },
    asistenciaSemanal: [],
    distribucionArea: [] // ✅ agregado para tu nuevo gráfico
  } as unknown as DashboardSummary;

  loading = true;
  hasData = false;

  constructor(private dash: DashboardService) {}

  ngOnInit(): void {
    this.loadRealData();
  }

  /** 🔹 Verifica si hay datos válidos */
  private hasAnyData(d: DashboardSummary): boolean {
    if (!d) return false;

    const prox = d.proximosTurnos || { 
      manana: { enfermeros: 0, medicos: 0 },
      tarde: { enfermeros: 0, medicos: 0 },
      noche: { enfermeros: 0, medicos: 0 }
    };

    const top =
      (d.personalActivo || 0) + (d.personalInactivo || 0) + (d.personalTotal || 0) +
      (d.turnosHoy || 0) + (d.turnosFijos || 0) + (d.turnosRotativos || 0) +
      (d.personalSinTurno || 0) + (d.alertas || 0) +
      (prox.manana.enfermeros || 0) + (prox.manana.medicos || 0) +
      (prox.tarde.enfermeros || 0)  + (prox.tarde.medicos || 0) +
      (prox.noche.enfermeros || 0)  + (prox.noche.medicos || 0);

    const serie = d.asistenciaSemanal?.some(x => x.entradas > 0);
    return top > 0 || !!serie;
  }


  /** 🔹 Carga los datos del backend */
  loadRealData(): void {
    this.loading = true;
    this.dash.getSummary().subscribe({
      next: (resp) => {
        if (resp.success && resp.data) {
          this.data = resp.data;
          this.hasData = this.hasAnyData(resp.data);
          setTimeout(() => this.renderCharts(), 250); // Espera que se renderice el DOM
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

  /** 🔹 Renderiza los gráficos del dashboard */
  private renderCharts(): void {
    // Limpia los gráficos previos (evita duplicados)
    Chart.getChart("areaChart")?.destroy();
    Chart.getChart("asistenciaChart")?.destroy();

    // 1️⃣ Gráfico de Distribución de Personal por Área
    if (this.data.distribucionArea && this.data.distribucionArea.length > 0) {
      const ctx1 = document.getElementById('areaChart') as HTMLCanvasElement;
      const areas = this.data.distribucionArea.map((a: any) => a.area);
      const cantidades = this.data.distribucionArea.map((a: any) => a.cantidad);

      new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: areas,
          datasets: [{
            data: cantidades,
            backgroundColor: [
              '#007bff', '#17a2b8', '#28a745', '#ffc107', '#dc3545',
              '#6f42c1', '#20c997', '#fd7e14'
            ],
            borderWidth: 2,
            borderColor: '#fff',
          }]
        },
        options: {
          cutout: '70%',
          plugins: {
            legend: { position: 'right', labels: { font: { size: 13 } } },
            title: { display: false }
          }
        }
      });
    }

    // 2️⃣ Gráfico de Asistencia Semanal
    if (this.data.asistenciaSemanal && this.data.asistenciaSemanal.length > 0) {
      const ctx2 = document.getElementById('asistenciaChart') as HTMLCanvasElement;
      const labels = this.data.asistenciaSemanal.map((d: any) => d.fecha.slice(5));
      const entradas = this.data.asistenciaSemanal.map((d: any) => d.entradas);

      new Chart(ctx2, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Entradas registradas',
            data: entradas,
            backgroundColor: 'rgba(0, 123, 255, 0.7)',
            borderColor: '#007bff',
            borderWidth: 2,
            borderRadius: 8,
          }]
        },
        options: {
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } },
            x: { grid: { display: false } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  }
}
