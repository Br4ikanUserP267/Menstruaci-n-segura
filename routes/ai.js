/* ============================================================
   routes/ai.js — Análisis con DeepSeek
   ============================================================ */

const express = require('express');
const https   = require('https');
const router  = express.Router();
const db      = require('../db');
const auth    = require('../middleware/auth');

router.use(auth);

// ── POST /api/ai/analyze ────────────────────────────────────
router.post('/analyze', async (req, res) => {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey.startsWith('sk-xxx') || apiKey.startsWith('sk-45f5f73')) {
      return res.status(503).json({ error: 'La clave de DeepSeek no está configurada. Agrega DEEPSEEK_API_KEY válida en las variables de entorno del servidor.' });
    }

  const days  = Math.min(Math.max(parseInt(req.body.days) || 30, 7), 180);
  const end   = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString().split('T')[0];
  const endStr   = end.toISOString().split('T')[0];
  const userId   = req.user.id;

  // ── Recopilar todos los datos del período ─────────────────
  const [
    cyclesRes, periodDaysRes, symptomsRes, moodsRes,
    foodRes, medsRes, ovulationRes, userRes,
  ] = await Promise.all([
    db.query(`SELECT * FROM cycles WHERE user_id=$1 AND start_date >= $2 ORDER BY start_date`, [userId, startStr]),
    db.query(`SELECT * FROM period_days WHERE user_id=$1 AND date BETWEEN $2 AND $3 ORDER BY date`, [userId, startStr, endStr]),
    db.query(`SELECT * FROM symptoms WHERE user_id=$1 AND date BETWEEN $2 AND $3 ORDER BY date`, [userId, startStr, endStr]),
    db.query(`SELECT * FROM moods WHERE user_id=$1 AND date BETWEEN $2 AND $3 ORDER BY date`, [userId, startStr, endStr]),
    db.query(`SELECT * FROM food_logs WHERE user_id=$1 AND date BETWEEN $2 AND $3 ORDER BY date, meal_type`, [userId, startStr, endStr]),
    db.query(`SELECT m.name, m.dose, m.frequency, ml.scheduled_date, ml.status FROM medication_logs ml JOIN medications m ON ml.medication_id=m.id WHERE ml.user_id=$1 AND ml.scheduled_date BETWEEN $2 AND $3 AND ml.status='taken' ORDER BY ml.scheduled_date`, [userId, startStr, endStr]),
    db.query(`SELECT * FROM ovulation_tracking WHERE user_id=$1 AND date BETWEEN $2 AND $3 ORDER BY date`, [userId, startStr, endStr]),
    db.query(`SELECT username, average_cycle_length, average_period_length FROM users WHERE id=$1`, [userId]),
  ]);

  // ── Construir resumen diario organizado ───────────────────
  const dailyMap = {};
  const addToDay = (date, key, value) => {
    const d = date.split('T')[0];
    if (!dailyMap[d]) dailyMap[d] = {};
    if (!dailyMap[d][key]) dailyMap[d][key] = [];
    dailyMap[d][key].push(value);
  };

  periodDaysRes.rows.forEach(r => addToDay(r.date.toISOString(), 'flujo', r.flow_intensity));
  symptomsRes.rows.forEach(r => addToDay(r.date.toISOString(), 'sintomas', `${r.symptom_type}(sev:${r.severity})`));
  moodsRes.rows.forEach(r => addToDay(r.date.toISOString(), 'animo', `${r.mood} energía:${r.energy_level}`));
  foodRes.rows.forEach(r => addToDay(r.date.toISOString(), 'comida', `[${r.meal_type}] ${(r.foods||[]).join(', ')}`));
  medsRes.rows.forEach(r => addToDay(r.scheduled_date.toISOString(), 'meds', `${r.name} ${r.dose||''}`));
  ovulationRes.rows.forEach(r => {
    const parts = [];
    if (r.cervical_mucus) parts.push(`moco:${r.cervical_mucus}`);
    if (r.bbt)            parts.push(`BBT:${r.bbt}°C`);
    if (r.lh_test)        parts.push(`LH:${r.lh_test}`);
    addToDay(r.date.toISOString(), 'ovulacion', parts.join(', '));
  });

  // Identificar cólicos fuertes (síntoma Cólicos con severidad >= 4)
  const crampAlerts = symptomsRes.rows.filter(r =>
    (r.symptom_type === 'Cólicos' || r.symptom_type.toLowerCase().includes('c\u00f3lico')) && r.severity >= 4
  );

  const dailySummary = Object.entries(dailyMap).sort().map(([date, data]) => {
    const lines = [`📅 ${date}:`];
    if (data.flujo)     lines.push(`  🩸 Flujo: ${data.flujo.join(', ')}`);
    if (data.sintomas)  lines.push(`  🤕 Síntomas: ${data.sintomas.join(' | ')}`);
    if (data.animo)     lines.push(`  😊 Ánimo: ${data.animo.join(', ')}`);
    if (data.comida)    lines.push(`  🍽️ Comida: ${data.comida.join(' | ')}`);
    if (data.ovulacion) lines.push(`  🌸 Ovulación: ${data.ovulacion.join(', ')}`);
    if (data.meds)      lines.push(`  💊 Meds: ${data.meds.join(', ')}`);
    return lines.join('\n');
  }).join('\n\n');

  const user       = userRes.rows[0];
  const cycleInfo  = `Ciclo promedio: ${user.average_cycle_length} días | Período promedio: ${user.average_period_length} días | Ciclos en el período: ${cyclesRes.rows.length}`;

  const crampAlertText = crampAlerts.length > 0
    ? `\n⚠️ ALERTAS DE CÓLICOS INTENSOS (severidad ≥4): ${crampAlerts.map(c => `${c.date.toISOString().split('T')[0]} sev:${c.severity}`).join(', ')}`
    : '';

  // ── Construir prompt para DeepSeek ────────────────────────
  const systemPrompt = `Eres una asistente de salud menstrual experta y empática. Analizas datos de ciclo menstrual de manera científica pero comprensible. Respondes siempre en español, con un tono cálido y profesional. Usas emojis para estructurar visualmente tu respuesta. IMPORTANTE: no eres médico y siempre recomiendas consultar un profesional de salud para síntomas graves.`;

  const userPrompt = `Analiza los siguientes datos de ciclo menstrual de los últimos ${days} días y proporciona un análisis detallado.

## DATOS GENERALES DEL CICLO
${cycleInfo}
${crampAlertText}

## REGISTRO DIARIO COMPLETO
${dailySummary || 'Sin datos registrados en este período.'}

---
Por favor proporciona:

### 🍽️ 1. CORRELACIÓN COMIDA-SÍNTOMAS
Identifica qué alimentos se correlacionan (temporalmente) con síntomas más intensos, especialmente cólicos, hinchazón o malestar digestivo. Menciona específicamente los alimentos que aparecen el mismo día o el día anterior a síntomas fuertes.

### 🚨 2. DETECCIÓN DE ANOMALÍAS EN CÓLICOS
Analiza la severidad de los cólicos registrados. ¿Hay días con cólicos inusualmente fuertes (severidad 4-5)? ¿Qué factores (alimentos, hábitos, fase del ciclo) coincidieron esos días? ¿El patrón es regular o hay picos anómalos?

### 📊 3. PATRONES IDENTIFICADOS
- Patrón de síntomas por fase del ciclo
- Correlaciones entre ánimo/energía y otros factores
- Consistencia o irregularidades en el ciclo

### 🌿 4. RECOMENDACIONES PERSONALIZADAS
Basándote SOLO en los datos analizados, da 4-6 recomendaciones concretas y accionables:
- Alimentos a evitar o reducir antes/durante el período
- Alimentos que parecen beneficiosos
- Hábitos sugeridos basados en los patrones

### ⚕️ 5. SEÑALES DE ALERTA MÉDICA
Indica si hay algún patrón que amerite consulta médica (cólicos muy frecuentes o muy severos, síntomas inusuales, irregularidades extremas).

Sé específica con fechas y datos cuando estén disponibles. Si hay pocos datos, indícalo y da recomendaciones generales para mejorar el registro.`;

  // ── Llamar a DeepSeek API ─────────────────────────────────
  const model   = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const payload  = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    max_tokens: 2048,
    temperature: 0.7,
    stream: false,
  });

  const result = await new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.deepseek.com',
      path:     '/chat/completions',
      method:   'POST',
      headers:  {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    let data = '';
    const reqHttp = https.request(opts, (resp) => {
      resp.on('data', chunk => { data += chunk; });
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message || 'Error de DeepSeek'));
          resolve(parsed);
        } catch (e) { reject(new Error('Respuesta inválida de DeepSeek')); }
      });
    });

    reqHttp.on('error', reject);
    reqHttp.setTimeout(60000, () => { reqHttp.destroy(); reject(new Error('Tiempo de espera agotado (60s)')); });
    reqHttp.write(payload);
    reqHttp.end();
  });

  const analysisText = result.choices?.[0]?.message?.content || 'Sin respuesta.';

  // ── Guardar en caché ──────────────────────────────────────
  await db.query(
    'INSERT INTO ai_analysis_cache (user_id, period_days, result) VALUES ($1, $2, $3)',
    [userId, days, analysisText]
  ).catch(() => {});  // no falla si la tabla no existe aún

  res.json({
    analysis: analysisText,
    meta: {
      period: { from: startStr, to: endStr, days },
      dataPoints: {
        symptoms:   symptomsRes.rows.length,
        moods:      moodsRes.rows.length,
        foodLogs:   foodRes.rows.length,
        periodDays: periodDaysRes.rows.length,
        crampAlerts: crampAlerts.length,
      },
      model,
      tokens: result.usage?.total_tokens || null,
    },
  });
  } catch (err) {
    console.error('[AI analyze]', err.message);
    res.status(500).json({ error: err.message || 'Error interno al analizar.' });
  }
});

// ── GET /api/ai/history ─────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, period_days, created_at, LEFT(result, 200) AS preview
       FROM ai_analysis_cache WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.json([]); // return empty array if table doesn't exist yet
  }
});

// ── POST /api/ai/chat  (streaming SSE) ─────────────────────
router.post('/chat', async (req, res) => {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey.startsWith('sk-xxx') || apiKey.startsWith('sk-45f5f73')) {
      return res.status(503).json({ error: 'La clave de DeepSeek no está configurada.' });
    }

    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Mensaje requerido.' });
    }
    if (message.trim().length > 1000) {
      return res.status(400).json({ error: 'El mensaje es demasiado largo (máx. 1000 caracteres).' });
    }

    const userId = req.user.id;
    const since  = new Date();
    since.setDate(since.getDate() - 60);
    const sinceStr = since.toISOString().split('T')[0];

    // Gather a lightweight context summary (last 60 days)
    const [userRes, symRes, moodRes, foodRes, periodRes] = await Promise.all([
      db.query('SELECT username, average_cycle_length, average_period_length FROM users WHERE id=$1', [userId]),
      db.query(`SELECT symptom_type, severity, date FROM symptoms WHERE user_id=$1 AND date >= $2 ORDER BY date DESC LIMIT 30`, [userId, sinceStr]),
      db.query(`SELECT mood, energy_level, date FROM moods WHERE user_id=$1 AND date >= $2 ORDER BY date DESC LIMIT 20`, [userId, sinceStr]),
      db.query(`SELECT meal_type, foods, date FROM food_logs WHERE user_id=$1 AND date >= $2 ORDER BY date DESC LIMIT 20`, [userId, sinceStr]),
      db.query(`SELECT date, flow_intensity FROM period_days WHERE user_id=$1 AND date >= $2 ORDER BY date DESC LIMIT 10`, [userId, sinceStr]),
    ]);

    const user = userRes.rows[0] || {};
    const symSummary    = symRes.rows.map(s => `${s.symptom_type}(${s.severity})`).join(', ')   || 'ninguno';
    const moodSummary   = moodRes.rows.map(m => m.mood).join(', ')                               || 'ninguno';
    const foodSummary   = foodRes.rows.map(f => (f.foods || []).join(', ')).filter(Boolean).slice(0, 10).join(' | ') || 'ninguno';
    const periodSummary = periodRes.rows.map(p => p.date.toISOString().split('T')[0]).join(', ') || 'ninguno';

    const systemPrompt =
`Eres Luna 🌙, una asistente de salud menstrual experta, empática y científica. Respondes siempre en español con tono cálido y profesional. Usas emojis para estructurar. No eres médico; para síntomas graves siempre recomiendas consultar un profesional de salud.

CONTEXTO DE LA USUARIA (últimos 60 días):
• Ciclo promedio: ${user.average_cycle_length || 28} días | Período: ${user.average_period_length || 5} días
• Síntomas recientes: ${symSummary}
• Estado de ánimo reciente: ${moodSummary}
• Alimentos registrados: ${foodSummary}
• Días de período: ${periodSummary}

Responde de forma concisa y útil. Si la pregunta no tiene relación con la salud menstrual/femenina, responde brevemente y redirige al tema.`;

    // ── Setup SSE ─────────────────────────────────────────
    res.setHeader('Content-Type',  'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    const payload = JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: message.trim() },
      ],
      max_tokens:  1024,
      temperature: 0.7,
      stream:      true,
    });

    const opts = {
      hostname: 'api.deepseek.com',
      path:     '/chat/completions',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const deepReq = https.request(opts, (deepRes) => {
      let buf = '';

      deepRes.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop(); // keep partial last line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === 'data: [DONE]') {
            res.write('data: [DONE]\n\n');
            return;
          }
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const token  = parsed.choices?.[0]?.delta?.content;
            if (token) res.write(`data: ${JSON.stringify({ t: token })}\n\n`);
            // Check for API-level errors
            if (parsed.error) {
              res.write(`data: ${JSON.stringify({ error: parsed.error.message })}\n\n`);
            }
          } catch (_) { /* skip malformed chunk */ }
        }
      });

      deepRes.on('end', () => {
        res.write('data: [DONE]\n\n');
        res.end();
      });

      deepRes.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      });
    });

    deepReq.on('error', (err) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    });

    deepReq.setTimeout(60000, () => {
      deepReq.destroy();
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: 'Tiempo de espera agotado (60s)' })}\n\n`);
        res.end();
      }
    });

    // Abort upstream request if client disconnects
    req.on('close', () => { if (!deepReq.destroyed) deepReq.destroy(); });

    deepReq.write(payload);
    deepReq.end();

  } catch (err) {
    console.error('[AI chat]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
