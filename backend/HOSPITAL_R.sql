CREATE DATABASE HOSPITAL_RO;
USE HOSPITAL_RO;

-- ROLES DEL SISTEMA admin/rrhh/auditor/supervisor
CREATE TABLE roles_sistema (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  nombre_rol   VARCHAR(100) NOT NULL UNIQUE,
  descripcion  VARCHAR(500) NULL
);

-- USUARIOS DEL SISTEMA (pueden entrar al sistema)
CREATE TABLE usuarios_sistema (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  username         VARCHAR(100) NOT NULL UNIQUE,
  keycloak_sub     CHAR(50) UNIQUE NULL,               
  nombre_completo  VARCHAR(150) NOT NULL,
  email            VARCHAR(120) NULL,
  rol_id           INT NULL,                        
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_usr_rol FOREIGN KEY (rol_id) REFERENCES roles_sistema(id)
);

-- ROLES DE EMPLEADO catalogo del personal
CREATE TABLE roles_empleado (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  nombre_rol       VARCHAR(50) NOT NULL UNIQUE,
  nivel            TINYINT NOT NULL DEFAULT 1,
  descripcion      VARCHAR(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  supervisa_global TINYINT(1) NOT NULL DEFAULT 0,
  seccion_plantilla VARCHAR(120) NULL,
  creado_en        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  eliminado_en     TIMESTAMP NULL,
  creado_por       INT NULL,
  actualizado_por  INT NULL,
  eliminado_por    INT NULL,
  CONSTRAINT fk_rol_creado_por       FOREIGN KEY (creado_por)      REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  CONSTRAINT fk_rol_actualizado_por  FOREIGN KEY (actualizado_por)  REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  CONSTRAINT fk_rol_eliminado_por    FOREIGN KEY (eliminado_por)    REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  INDEX idx_roles_emp_nivel (nivel)
);

-- AREAS (catalogo) + auditoria
CREATE TABLE areas (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  nombre_area      VARCHAR(50) NOT NULL UNIQUE,
  descripcion      VARCHAR(500) null,
  creado_en        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  eliminado_en     TIMESTAMP NULL,
  creado_por       INT NULL,
  actualizado_por  INT NULL,
  eliminado_por    INT NULL,
  CONSTRAINT fk_area_creado_por       FOREIGN KEY (creado_por)      REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  CONSTRAINT fk_area_actualizado_por  FOREIGN KEY (actualizado_por)  REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  CONSTRAINT fk_area_eliminado_por    FOREIGN KEY (eliminado_por)    REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  INDEX idx_area_nombre (nombre_area)
);

-- TABLA DE ROLES SUPERVISORES POR AREA
CREATE TABLE area_supervisor_roles (
  area_id INT NOT NULL,         
  rol_id  INT NOT NULL,          
  PRIMARY KEY (area_id, rol_id),
  CONSTRAINT fk_asr_area FOREIGN KEY (area_id) REFERENCES areas(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_asr_rol  FOREIGN KEY (rol_id)  REFERENCES roles_empleado(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- TABLA DE SUPERVISORES ESPECÍFICOS POR ÁREA
CREATE TABLE area_supervisores (
  area_id     INT NOT NULL,
  empleado_id INT NOT NULL,
  es_titular TINYINT(1) NOT NULL DEFAULT 0,
  desde DATE NULL,
  hasta DATE NULL,
  creado_por INT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (area_id, empleado_id),
  CONSTRAINT fk_as_area FOREIGN KEY (area_id) REFERENCES areas(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_as_emp  FOREIGN KEY (empleado_id) REFERENCES empleados(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_as_usr FOREIGN KEY (creado_por) REFERENCES usuarios_sistema(id)
);

-- TURNOS plantillas de horarios + auditoría
CREATE TABLE turnos (
  id                           INT AUTO_INCREMENT PRIMARY KEY,
  nombre_turno                 VARCHAR(100) NOT NULL,
  codigo_plantilla             VARCHAR(10) NULL, 
  hora_inicio                  TIME NOT NULL,
  hora_fin                     TIME NOT NULL,
  minutos_descanso             INT NOT NULL DEFAULT 0,
  tolerancia_entrada_minutos   INT NOT NULL DEFAULT 10,
  tolerancia_salida_minutos    INT NOT NULL DEFAULT 10,
  cruza_medianoche             BOOLEAN NOT NULL DEFAULT FALSE, 
  creado_en        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  eliminado_en     TIMESTAMP NULL,
  creado_por       INT NULL,
  actualizado_por  INT NULL,
  eliminado_por    INT NULL,
  CONSTRAINT fk_turno_creado_por       FOREIGN KEY (creado_por)      REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  CONSTRAINT fk_turno_actualizado_por  FOREIGN KEY (actualizado_por)  REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  CONSTRAINT fk_turno_eliminado_por    FOREIGN KEY (eliminado_por)    REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  UNIQUE KEY uk_turno_horas (hora_inicio, hora_fin)  
);

-- EMPLEADOS (nucleo de personal) + auditoría y soft delete
CREATE TABLE empleados ( 
  id                INT AUTO_INCREMENT PRIMARY KEY,
  numero_empleado   VARCHAR(32) NOT NULL UNIQUE,      
  nombre_completo   VARCHAR(150) NOT NULL,
  email             VARCHAR(120) NULL,  
  rol_id            INT NULL,                            
  area_id           INT NULL,                      
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  creado_por        INT NULL,
  actualizado_por   INT NULL,
  eliminado_en      TIMESTAMP NULL,
  eliminado_por     INT NULL,
  CONSTRAINT fk_emp_rol    FOREIGN KEY (rol_id)  REFERENCES roles_empleado(id) ON DELETE SET NULL,
  CONSTRAINT fk_emp_area   FOREIGN KEY (area_id) REFERENCES areas(id)          ON DELETE SET NULL,
  CONSTRAINT fk_emp_creado_por      FOREIGN KEY (creado_por)      REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  CONSTRAINT fk_emp_actualizado_por FOREIGN KEY (actualizado_por) REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  CONSTRAINT fk_emp_eliminado_por   FOREIGN KEY (eliminado_por)   REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  INDEX idx_emp_nombre (nombre_completo),
  INDEX idx_emp_activo (activo)
);


-- ASIGNACIONES POR LOTE (cabecera de acciones masivas)
CREATE TABLE asignaciones_lote (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  area_id        INT NOT NULL,
  jefe_id        INT NOT NULL,      
  turno_id       INT NOT NULL,
  fecha_inicio   DATE NOT NULL,
  fecha_fin      DATE NOT NULL,
  patron         ENUM('NORMAL','24x72') NOT NULL DEFAULT 'NORMAL',
  dias_descanso  SET('0','1','2','3','4','5','6') NULL,   
  creado_por     INT NOT NULL,                          
  creado_en      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lote_area  FOREIGN KEY (area_id)  REFERENCES areas(id),
  CONSTRAINT fk_lote_jefe  FOREIGN KEY (jefe_id)  REFERENCES empleados(id),
  CONSTRAINT fk_lote_turno FOREIGN KEY (turno_id) REFERENCES turnos(id),
  CONSTRAINT fk_lote_user  FOREIGN KEY (creado_por) REFERENCES usuarios_sistema(id),
  INDEX idx_lote_area_fecha (area_id, fecha_inicio, fecha_fin)
);

-- ASIGNACION DE TURNOS detalle por empleado y dia
CREATE TABLE asignacion_turnos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  empleado_id   INT NOT NULL,
  turno_id      INT NOT NULL,
  fecha         DATE NOT NULL,
  creado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lote_id       INT NULL,
  creado_por    INT NULL,     
  eliminado_en  TIMESTAMP NULL,
  eliminado_por INT NULL,
  CONSTRAINT fk_asig_emp    FOREIGN KEY (empleado_id) REFERENCES empleados(id) ON DELETE CASCADE,
  CONSTRAINT fk_asig_turno  FOREIGN KEY (turno_id)    REFERENCES turnos(id),
  CONSTRAINT fk_asig_lote   FOREIGN KEY (lote_id)     REFERENCES asignaciones_lote(id) ON DELETE SET NULL,
  CONSTRAINT fk_asig_creado_por   FOREIGN KEY (creado_por) REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  CONSTRAINT fk_asig_eliminado_por FOREIGN KEY (eliminado_por) REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  UNIQUE KEY uk_asig_dia (empleado_id, fecha),
  UNIQUE KEY uk_asig_turno_dia (empleado_id, turno_id, fecha),  
  INDEX idx_asig_emp_time (empleado_id, fecha),
  INDEX idx_asig_turno_fecha (turno_id, fecha)
);

-- ALERTAS  llegadas tarde, ausencias
CREATE TABLE alertas (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  empleado_id   INT NOT NULL,
  tipo_alerta   VARCHAR(50) NOT NULL,
  descripcion   TEXT NULL,
  fecha_hora    DATETIME NOT NULL,
  estado        ENUM('PENDIENTE','RESUELTA') NOT NULL DEFAULT 'PENDIENTE',
  CONSTRAINT fk_alert_emp FOREIGN KEY (empleado_id) REFERENCES empleados(id) ON DELETE CASCADE,
  INDEX idx_alert_emp_time (empleado_id, fecha_hora),
  INDEX idx_alert_estado (estado, fecha_hora)
);

-- AUDITORIA GENERICA bitacora de acciones
CREATE TABLE audit_log (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  evento          ENUM('CREATE','UPDATE','DELETE','ASSIGN','UNASSIGN','LOGIN','EMAIL') NOT NULL,
  entidad         VARCHAR(50) NOT NULL,          
  entidad_id      INT NULL,
  antes           JSON NULL,                     
  despues         JSON NULL,                     
  actor_id        INT NULL,              
  actor_username  VARCHAR(80) NULL,             
  ip              VARCHAR(45) NULL,
  user_agent      VARCHAR(255) NULL,
  request_id      CHAR(36) NULL,
  creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES usuarios_sistema(id),
  INDEX idx_audit_entidad (entidad, entidad_id, creado_en),
  INDEX idx_audit_actor (actor_id, creado_en)
);

-- LOG DE NOTIFICACIONES (emails de asignaciones)
CREATE TABLE notificacion_log (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  tipo           ENUM('EMAIL','PUSH') NOT NULL DEFAULT 'EMAIL',
  asunto         VARCHAR(900) NOT NULL,
  destinatarios  TEXT NOT NULL,                  
  payload        JSON NULL,                     
  resultado      ENUM('OK','ERROR') NOT NULL,
  error_mensaje  TEXT NULL,
  creado_por     INT NOT NULL,               
  creado_en      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (creado_por) REFERENCES usuarios_sistema(id),
  INDEX idx_notif_fecha (creado_en)
);

CREATE TABLE asistencias (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  empleado_id     INT NOT NULL,
  fecha           DATE NOT NULL,
  turno_id        INT NOT NULL,
  entrada_real    DATETIME NULL,
  salida_real     DATETIME NULL,
  estado          ENUM('COMPLETO','INCOMPLETO','FALTA','TARDE','TEMPRANO') NOT NULL,
  minutos_retraso INT DEFAULT 0,
  minutos_extra   INT DEFAULT 0,
  generado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_asistencia_emp FOREIGN KEY (empleado_id) REFERENCES empleados(id) ON DELETE CASCADE,
  CONSTRAINT fk_asistencia_turno FOREIGN KEY (turno_id) REFERENCES turnos(id),
  UNIQUE KEY uk_asistencia_emp_fecha (empleado_id, fecha),
  INDEX idx_asistencia_estado (estado, fecha),
  INDEX idx_asistencia_emp_estado (empleado_id, estado) 
);
