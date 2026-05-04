-- ============================================================
-- LUNA - Asistente de ciclo menstrual
-- Schema PostgreSQL completo
-- ============================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLA: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id               SERIAL PRIMARY KEY,
    username         VARCHAR(50) UNIQUE NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    -- Datos personales opcionales
    birth_date       DATE,
    timezone         VARCHAR(60) DEFAULT 'America/Mexico_City',
    -- Configuración del ciclo
    average_cycle_length  INTEGER DEFAULT 28 CHECK (average_cycle_length BETWEEN 15 AND 60),
    average_period_length INTEGER DEFAULT 5  CHECK (average_period_length BETWEEN 1 AND 15),
    last_period_start     DATE,
    -- Onboarding
    onboarding_completed BOOLEAN DEFAULT FALSE,
    -- Timestamps
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: cycles  (cada ciclo inicia con el primer día de regla)
-- ============================================================
CREATE TABLE IF NOT EXISTS cycles (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date    DATE NOT NULL,
    end_date      DATE,                       -- último día de sangrado
    cycle_length  INTEGER,                    -- días hasta inicio del siguiente ciclo
    period_length INTEGER,                    -- duración del sangrado (días)
    notes         TEXT,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_user_cycle_start UNIQUE (user_id, start_date)
);

-- ============================================================
-- TABLA: period_days  (registro diario de sangrado)
-- ============================================================
CREATE TABLE IF NOT EXISTS period_days (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cycle_id        INTEGER REFERENCES cycles(id) ON DELETE SET NULL,
    date            DATE NOT NULL,
    flow_intensity  VARCHAR(20) NOT NULL DEFAULT 'medium'
        CHECK (flow_intensity IN ('spotting','light','medium','heavy','very_heavy')),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_user_period_day UNIQUE (user_id, date)
);

-- ============================================================
-- TABLA: symptom_catalog  (catálogo maestro de síntomas)
-- ============================================================
CREATE TABLE IF NOT EXISTS symptom_catalog (
    id        SERIAL PRIMARY KEY,
    name      VARCHAR(100) NOT NULL,
    category  VARCHAR(50)  NOT NULL,
    icon      VARCHAR(10)
);

-- ============================================================
-- TABLA: symptoms  (síntomas registrados por el usuario)
-- ============================================================
CREATE TABLE IF NOT EXISTS symptoms (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          DATE NOT NULL,
    symptom_type  VARCHAR(100) NOT NULL,
    severity      INTEGER NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
    notes         TEXT,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: moods  (estado de ánimo diario)
-- ============================================================
CREATE TABLE IF NOT EXISTS moods (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          DATE NOT NULL,
    mood          VARCHAR(50) NOT NULL
        CHECK (mood IN (
            'muy_bien','bien','neutral','mal','muy_mal',
            'ansiosa','irritable','triste','feliz',
            'energica','cansada','sensible','romantica'
        )),
    energy_level  INTEGER DEFAULT 3 CHECK (energy_level BETWEEN 1 AND 5),
    notes         TEXT,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_user_mood_date UNIQUE (user_id, date)
);

-- ============================================================
-- TABLA: medications  (medicamentos y suplementos)
-- ============================================================
CREATE TABLE IF NOT EXISTS medications (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    dose            VARCHAR(50),
    frequency       VARCHAR(20) NOT NULL DEFAULT 'daily'
        CHECK (frequency IN ('daily','weekly','monthly','as_needed','cycle_only')),
    reminder_times  TEXT[]  DEFAULT '{}',   -- ej: ['08:00','20:00']
    active          BOOLEAN DEFAULT TRUE,
    notes           TEXT,
    color           VARCHAR(7) DEFAULT '#C2185B',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: medication_logs  (historial de toma de medicamentos)
-- ============================================================
CREATE TABLE IF NOT EXISTS medication_logs (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    medication_id    INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    scheduled_date   DATE NOT NULL,
    scheduled_time   TIME,
    taken_at         TIMESTAMP WITH TIME ZONE,
    status           VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending','taken','skipped')),
    notes            TEXT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: notes  (diario / notas libres)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    title       VARCHAR(200),
    content     TEXT NOT NULL,
    tags        TEXT[] DEFAULT '{}',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: ovulation_tracking  (seguimiento de ovulación)
-- ============================================================
CREATE TABLE IF NOT EXISTS ovulation_tracking (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date             DATE NOT NULL,
    cervical_mucus   VARCHAR(20)
        CHECK (cervical_mucus IN ('seco','cremoso','acuoso','elastico','sin_observacion')),
    bbt              DECIMAL(4,2),   -- temperatura basal corporal en °C
    lh_test          VARCHAR(20)
        CHECK (lh_test IN ('negativo','positivo','pico')),
    libido           INTEGER CHECK (libido BETWEEN 1 AND 5),
    notes            TEXT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_user_ovulation_date UNIQUE (user_id, date)
);

-- ============================================================
-- ÍNDICES para rendimiento
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cycles_user        ON cycles(user_id);
CREATE INDEX IF NOT EXISTS idx_cycles_start       ON cycles(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_period_days_user   ON period_days(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_symptoms_user_date ON symptoms(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_moods_user_date    ON moods(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_meds_user          ON medications(user_id);
CREATE INDEX IF NOT EXISTS idx_med_logs_user_date ON medication_logs(user_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_notes_user_date    ON notes(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ovulation_user     ON ovulation_tracking(user_id, date DESC);

-- ============================================================
-- FUNCIÓN y TRIGGERS para updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_cycles_updated_at
    BEFORE UPDATE ON cycles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_moods_updated_at
    BEFORE UPDATE ON moods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_medications_updated_at
    BEFORE UPDATE ON medications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_notes_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DATOS INICIALES: catálogo de síntomas
-- ============================================================
INSERT INTO symptom_catalog (name, category, icon) VALUES
    ('Cólicos',               'dolor',    '🤕'),
    ('Dolor de cabeza',        'dolor',    '🤯'),
    ('Migraña',                'dolor',    '💥'),
    ('Dolor de espalda',       'dolor',    '💪'),
    ('Dolor de senos',         'dolor',    '💫'),
    ('Dolor pélvico',          'dolor',    '⚡'),
    ('Hinchazón',              'digestivo','🫃'),
    ('Náuseas',                'digestivo','🤢'),
    ('Vómito',                 'digestivo','🤮'),
    ('Diarrea',                'digestivo','🚽'),
    ('Estreñimiento',          'digestivo','😣'),
    ('Acné',                   'piel',     '😶'),
    ('Piel sensible',          'piel',     '🌡️'),
    ('Sudoración',             'piel',     '💦'),
    ('Insomnio',               'sueño',    '😴'),
    ('Somnolencia',            'sueño',    '😪'),
    ('Pesadillas',             'sueño',    '😱'),
    ('Fatiga',                 'energia',  '😩'),
    ('Mareos',                 'otros',    '💫'),
    ('Apetito aumentado',      'apetito',  '🍫'),
    ('Apetito reducido',       'apetito',  '🥗'),
    ('Antojo de dulces',       'apetito',  '🍭'),
    ('Antojo de sal',          'apetito',  '🧂'),
    ('Retención de líquidos',  'otros',    '💧'),
    ('Manchado',               'sangrado', '🔴'),
    ('Coágulos',               'sangrado', '🩸'),
    ('Calambres en piernas',   'dolor',    '🦵'),
    ('Sensibilidad a la luz',  'otros',    '👁️'),
    ('Tinnitus',               'otros',    '👂'),
    ('Alergias',               'otros',    '🌸')
ON CONFLICT DO NOTHING;

-- ============================================================
-- TABLA: food_logs  (registro de alimentos por comida)
-- ============================================================
CREATE TABLE IF NOT EXISTS food_logs (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    meal_type   VARCHAR(20) DEFAULT 'other'
        CHECK (meal_type IN ('desayuno','almuerzo','cena','snack','other')),
    foods       TEXT[] DEFAULT '{}',   -- lista de alimentos: ['pizza','refresco']
    notes       TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_food_logs_user_date ON food_logs(user_id, date DESC);

CREATE OR REPLACE TRIGGER trg_food_logs_updated_at
    BEFORE UPDATE ON food_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLA: ai_analysis_cache  (historial de análisis IA)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_analysis_cache (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_days INTEGER NOT NULL DEFAULT 30,
    result      TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_user ON ai_analysis_cache(user_id, created_at DESC);
