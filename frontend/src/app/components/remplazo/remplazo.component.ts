// import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule } from '@angular/forms';
// import { TurnosService } from '../../services/turnos.service';

// @Component({
//   selector: 'app-remplazo',
//   standalone: true,
//   imports: [CommonModule, FormsModule],
//   templateUrl: './remplazo.component.html',
//   styleUrls: ['./remplazo.component.scss']
// })
// export class RemplazoComponent implements OnInit {
//   @Input() fechaSeleccionada!: string;
//   @Input() turnoId!: number | null;
//   @Output() onCerrar = new EventEmitter<void>();
//   @Output() onSeleccionar = new EventEmitter<{ reemplazo: any, fechas: string[] }>();

//   empleadosDisponibles: any[] = [];
//   empleadosFiltrados: any[] = [];
//   busquedaReemplazo = '';
//   loading = false;
//   error: string | null = null;

//   // 🔄 Selección múltiple de días
//   fechasSeleccionadas: string[] = [];

//   constructor(private turnosService: TurnosService) {}

//   ngOnInit() {
//     this.cargarEmpleadosDisponibles();
//   }

//   cargarEmpleadosDisponibles() {
//     this.loading = true;
//     this.error = null;

//     this.turnosService.getEmpleadosDisponiblesParaReemplazo(this.fechaSeleccionada, this.turnoId)
//       .subscribe({
//         next: (res: any) => {
//           this.empleadosDisponibles = res.data || [];
//           this.empleadosFiltrados = this.empleadosDisponibles;
//           this.loading = false;
//         },
//         error: (err) => {
//           this.error = 'Error cargando empleados disponibles';
//           console.error(err);
//           this.loading = false;
//         }
//       });
//   }

//   filtrarEmpleados() {
//     const term = this.busquedaReemplazo.toLowerCase();
//     this.empleadosFiltrados = this.empleadosDisponibles.filter(e =>
//       e.nombre_completo.toLowerCase().includes(term)
//     );
//   }

//   seleccionarEmpleado(emp: any) {
//     if (!emp) return;
//     // 🔄 Emitir fechas seleccionadas (una o varias)
//     this.onSeleccionar.emit({
//       reemplazo: emp,
//       fechas: this.fechasSeleccionadas.length > 0
//         ? this.fechasSeleccionadas
//         : [this.fechaSeleccionada]
//     });
//   }

//   cerrarModal() {
//     this.onCerrar.emit();
//   }

//   prevenirCierre(event: MouseEvent) {
//     event.stopPropagation();
//   }

//     getRolNombre(rolId: number): string {
//     switch (rolId) {
//       case 1: return 'Administrador';
//       case 2: return 'Jefe de Área';
//       case 3: return 'Enfermero';
//       case 4: return 'Aux. Enfermería';
//       case 5: return 'Aux. Hospital';
//       default: return 'Empleado';
//     }
//   }

// }
