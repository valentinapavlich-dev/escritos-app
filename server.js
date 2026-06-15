import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

async function extractTextFromFile(buffer, mimetype, originalname) {
  const ext = originalname.split('.').pop().toLowerCase();
  if (ext === 'pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  } else if (ext === 'docx' || ext === 'doc') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } else if (ext === 'txt') {
    return buffer.toString('utf-8');
  }
  throw new Error(`Formato no soportado: ${ext}`);
}

app.post('/api/extract', upload.array('files', 20), async (req, res) => {
  try {
    const texts = await Promise.all(
      req.files.map(f => extractTextFromFile(f.buffer, f.mimetype, f.originalname))
    );

    const combined = texts.map((t, i) => `[Documento ${i + 1}: ${req.files[i].originalname}]\n${t}`).join('\n\n---\n\n');

    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: 'API key requerida' });

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Eres un asistente legal chileno especializado. Analiza los siguientes documentos judiciales y extrae los datos relevantes en formato JSON.

Extrae:
- tribunal: nombre completo del tribunal
- rol: número de rol (ej: C-1234-2024)
- caratula: carátula del juicio (ej: "Banco de Chile con Pérez González, Juan")
- demandante: nombre completo del demandante
- demandado: nombre completo del demandado (puede ser más de uno, separar con coma)
- rut_demandado: RUT del demandado si aparece
- monto: monto de la deuda en números (sin puntos ni comas, solo el número)
- moneda: CLP o UF o USD
- fecha_demanda: fecha de la demanda (formato DD/MM/YYYY)
- numero_pagare: número o serie del pagaré si aplica
- tipo_procedimiento: ejecutivo, desposeimiento, ordinario, etc.
- notas: cualquier dato relevante adicional en texto libre

Responde SOLO con el JSON, sin explicaciones, sin markdown.

Documentos:
${combined}`,
      }],
    });

    const text = response.content[0].text.trim();
    let extracted;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      extracted = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      extracted = { notas: text };
    }

    res.json({ success: true, data: extracted, rawText: combined });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate', async (req, res) => {
  const { apiKey, formData, tipoEscrito, abogado, referenceTexts, rawExpedienteText } = req.body;

  if (!apiKey) return res.status(400).json({ error: 'API key requerida' });

  const client = new Anthropic({ apiKey });

  const abogados = {
    'jorge': 'Jorge Barahona Sotelo',
    'valentina': 'Valentina Pavlich Mariscal',
    'sofia': 'Sofía Riva Morales',
  };

  const nombreAbogado = abogados[abogado] || abogado;

  const estiloBase = `
ESTILO Y ESTRUCTURA DEL ESTUDIO JORDÁN BARAHONA (obligatorio):

1. ESTRUCTURA: Sumilla → Tribunal → Compareciente → Cuerpo → "Por tanto," → Petición
2. Domicilio Banco de Chile: calle Ahumada N° 251, tercer piso, comuna de Santiago
3. RUT Banco de Chile: 97.004.000-5
4. Gerente General Banco de Chile: don Eduardo Ebensperger Orrego, ingeniero comercial
5. Fórmulas: "Encontrándome dentro de plazo...", "Por el presente acto vengo en...", "En mérito de lo expuesto..."
6. Tratamiento juzgados civiles 1ª instancia: "U.S." o "S.S."
7. Tratamiento Cortes de Apelaciones: "SS. Iltma."
8. Otrosíes: "Otrosí:" (si uno solo) / "Primer Otrosí:", "Segundo Otrosí:", etc.
9. Cierre: siempre "Por tanto," (en línea aparte, con coma) seguido de la petición concreta
10. Lenguaje jurídico formal chileno, conciso, sin adornos retóricos
11. El compareciente siempre actúa en nombre y representación de BANCO DE CHILE

TIPOS DE ESCRITOS y su estructura típica:
- Trámite: solicitud simple de actuación procesal (certificados, copia expediente, retiro fondos, etc.)
- Evacúa traslado de excepciones: responde punto por punto las excepciones opuestas por el ejecutado
- Reposición: recurso contra resolución del tribunal, fundamentos de hecho y derecho
- Apelación: recurso de apelación subsidiario o principal, con peticiones concretas
- Demanda ejecutiva: basada en título ejecutivo (pagaré), con cláusula de aceleración si aplica
- Gestión preparatoria de desposeimiento: notificación al tercer poseedor de la finca hipotecada
`;

  const referenceSection = referenceTexts?.length
    ? `\nEJEMPLOS DE ESTILO DEL ESTUDIO (escritos anteriores como referencia):\n${referenceTexts.join('\n---\n')}\n`
    : '';

  const expedienteSection = rawExpedienteText
    ? `\nCONTENIDO DEL EXPEDIENTE (para contexto y datos):\n${rawExpedienteText.slice(0, 8000)}\n`
    : '';

  const prompt = `Eres el asistente jurídico del Estudio Jordán Barahona. Debes redactar un escrito judicial en nombre de BANCO DE CHILE para presentar ante los tribunales chilenos.

${estiloBase}
${referenceSection}
${expedienteSection}

DATOS DEL CASO:
- Tribunal: ${formData.tribunal}
- Rol: ${formData.rol}
- Carátula: ${formData.caratula}
- Demandante: ${formData.demandante || 'Banco de Chile'}
- Demandado: ${formData.demandado}
- RUT demandado: ${formData.rut_demandado || 'no indicado'}
- Monto: ${formData.monto ? `${formData.monto} ${formData.moneda || 'pesos'}` : 'según expediente'}
- Tipo de procedimiento: ${formData.tipo_procedimiento || 'ejecutivo'}
- Notas adicionales: ${formData.notas || 'ninguna'}
- Abogado compareciente: ${nombreAbogado}

TIPO DE ESCRITO A REDACTAR: ${tipoEscrito}

Instrucciones adicionales del usuario: ${formData.instrucciones || 'Ninguna'}

Redacta el escrito completo siguiendo estrictamente el estilo del estudio. El escrito debe estar listo para presentar ante el tribunal, incluyendo sumilla, encabezado, comparecencia, cuerpo y petición. No incluyas explicaciones ni comentarios fuera del escrito.`;

  try {
    let escritoCompleto = '';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        escritoCompleto += chunk.delta.text;
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, fullText: escritoCompleto })}\n\n`);
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
