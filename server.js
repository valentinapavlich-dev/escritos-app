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

  // Ejemplos reales del estudio, leídos desde Google Drive
  const ejemplosReales = `
=== EJEMPLO 1: TRÁMITE (Curso progresivo) ===
Curso progresivo a los autos.

S. J. L. en lo Civil de Santiago (12°)

Jorge Barahona Sotelo, en representación del Banco de Chile, en los autos caratulados "Banco de Chile con Cartagena", causa rol C-10804-2025 a S.S. respetuosamente digo:

Que, no habiéndose evacuado el traslado conferido con fecha 15 de mayo de 2026 por la ejecutada, solicito a S.S. dar curso progresivo a los autos, y se resuelva la presentación de fecha 20 de febrero de 2026, a folio 4.

Por tanto,

Solicito a S.S.: Dar curso progresivo a los autos.

=== EJEMPLO 2: EVACÚA TRASLADO DE EXCEPCIONES (estructura completa) ===
Evacua traslado excepciones.

S. J. L. en lo Civil de Buin (1º)

Jorge Barahona Sotelo, abogado, en representación del Banco de Chile, en los autos caratulados "Banco de Chile con Ariztía", rol C-528-2026, a S.S. respetuosamente digo:

Encontrándome dentro de plazo, en virtud del artículo 466 del Código de Procedimiento Civil, vengo en evacuar el traslado conferido por S.S. mediante resolución de fecha 8 de junio de 2026, respecto de las excepciones opuestas por la parte demandada a la presente ejecución, solicitando que éstas sean rechazadas en todas sus partes, con costas, de acuerdo a los antecedentes de hecho y fundamentos de Derecho que paso a exponer:

Como primera cuestión, las excepciones opuestas se fundan en hechos e interpretaciones que, de conformidad a lo dispuesto en el artículo 1698 del Código Civil, corresponderá al ejecutado acreditar en su integridad.

[... cuerpo con análisis por excepción ...]

Por tanto,

Solicito a S.S.: Tener por evacuado el traslado conferido a las excepciones opuestas y, en definitiva, rechazarlas, con costas, ordenando S.S. continuar con la ejecución.

=== EJEMPLO 3: REPOSICIÓN CON OTROSÍES ===
En lo principal: Desarchivo. Otrosí: Se oficie

S.J.L en lo Civil de Santiago (27°)

Jorge Barahona Sotelo, en representación del Banco de Chile, en los autos caratulados "Banco de Chile con Veas", causa rol C-7322-2026, a S.S. respetuosamente digo:

Para efectos de interponer recurso de reposición en contra de la resolución de fecha 4 de junio de 2026, a folio 5, vengo en solicitar el desarchivo de la presente causa.

Por tanto;

Solicito a S.S.: Acceder a lo solicitado.

Primer Otrosí: Que, por el presente acto vengo en interponer recurso de reposición en contra de la resolución de fecha 4 de junio de 2026, folio 5, por cuanto se archiva la presente causa. Ello, en virtud de los argumentos de hecho y de Derecho que paso a exponer:

[... fundamentos ...]

Por tanto,

Sírvase S.S.: Tener por interpuesto recurso de reposición [...] y en su lugar, se deje sin efecto la resolución recurrida.

Segundo Otrosí: [solicitud adicional]

Por tanto,

Solicito a S.S.: Acceder a lo solicitado.

=== EJEMPLO 4: DEMANDA EJECUTIVA (mutuo hipotecario) — estructura de sumilla ===
En lo principal: Demanda ejecutiva y solicita se despache mandamiento de ejecución y embargo. En el primer otrosí: Acompaña documentos y solicita su custodia. En el segundo otrosí: Señala bienes para la traba del embargo y designa depositario provisional. En el tercer otrosí: Acredita personería. En el cuarto otrosí: Téngase presente. En el quinto otrosí: Forma de notificación. En el sexto otrosí: Patrocinio y poder.

S. J. L. en lo Civil de Santiago

[Abogado], en su calidad de mandatario judicial y en representación, según se acreditará, del Banco de Chile, institución financiera del giro de su denominación, cuyo Gerente General es don Eduardo Ebensperger Orrego, ingeniero comercial, todos con domicilio para estos efectos en calle Ahumada N° 251, tercer piso, comuna de Santiago, Región Metropolitana, a S.S. con todo respeto digo:

Vengo en deducir demanda ejecutiva en contra de [demandados] [...] todo de acuerdo a los antecedentes de hecho y fundamentos de derechos que paso a exponer:

I.- Título ejecutivo y fecha de mora.
[...]

Por tanto, En mérito de lo expuesto, y de acuerdo a lo dispuesto en el artículo 434 y siguientes del Código de Procedimiento Civil, y demás normas legales pertinentes,

Sírvase S.S. tener por deducida demanda ejecutiva [...] ordenar se despache mandamiento de ejecución y embargo [...] con costas.
`;

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

  const referenceSection = `\nEJEMPLOS REALES DEL ESTUDIO (usar como referencia de estilo y estructura):\n${ejemplosReales}\n`
    + (referenceTexts?.length ? `\nREFERENCIAS ADICIONALES DEL USUARIO:\n${referenceTexts.join('\n---\n')}\n` : '');

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
