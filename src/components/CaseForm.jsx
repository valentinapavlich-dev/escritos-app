import { useState, useRef } from 'react';
import mammoth from 'mammoth';

const TIPOS_ESCRITO = [
  { value: 'tramite', label: 'Trámite' },
  { value: 'evacua_traslado', label: 'Evacúa traslado de excepciones' },
  { value: 'reposicion', label: 'Reposición' },
  { value: 'apelacion', label: 'Apelación' },
  { value: 'demanda_ejecutiva', label: 'Demanda ejecutiva' },
  { value: 'desposeimiento', label: 'Gestión preparatoria de desposeimiento' },
];

const ABOGADOS = [
  { value: 'jorge', label: 'Jorge Barahona Sotelo' },
  { value: 'valentina', label: 'Valentina Pavlich Mariscal' },
  { value: 'sofia', label: 'Sofía Riva Morales' },
];

const EMPTY_FORM = {
  tribunal: '',
  rol: '',
  caratula: '',
  demandante: 'Banco de Chile',
  demandado: '',
  rut_demandado: '',
  monto: '',
  moneda: 'CLP',
  tipo_procedimiento: 'ejecutivo',
  notas: '',
  instrucciones: '',
};

export default function CaseForm({ initialData, onGenerate, onBack }) {
  const [formData, setFormData] = useState({ ...EMPTY_FORM, ...initialData });
  const [tipoEscrito, setTipoEscrito] = useState('tramite');
  const [abogado, setAbogado] = useState('jorge');
  const [refFiles, setRefFiles] = useState([]);
  const [refTexts, setRefTexts] = useState([]);
  const [loadingRef, setLoadingRef] = useState(false);
  const refInputRef = useRef();

  const set = (field) => (e) => setFormData(prev => ({ ...prev, [field]: e.target.value }));

  const handleRefFiles = async (e) => {
    const files = Array.from(e.target.files);
    setLoadingRef(true);
    const texts = [];
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        if (f.name.endsWith('.docx')) {
          const r = await mammoth.extractRawText({ arrayBuffer: buf });
          texts.push(`[${f.name}]\n${r.value}`);
        } else if (f.name.endsWith('.txt')) {
          texts.push(`[${f.name}]\n${new TextDecoder().decode(buf)}`);
        }
      } catch {}
    }
    setRefTexts(prev => [...prev, ...texts]);
    setRefFiles(prev => [...prev, ...files]);
    setLoadingRef(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onGenerate(formData, tipoEscrito, abogado, refTexts);
  };

  return (
    <form className="page-content form-page" onSubmit={handleSubmit}>
      <div className="page-header">
        <h2>Datos del caso y tipo de escrito</h2>
        <p className="text-muted">Verifica o completa los datos extraídos, luego elige el tipo de escrito a generar.</p>
      </div>

      <div className="form-grid">
        <div className="form-section">
          <h3>Tipo de escrito y abogado</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Tipo de escrito *</label>
              <select value={tipoEscrito} onChange={e => setTipoEscrito(e.target.value)} required>
                {TIPOS_ESCRITO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Abogado compareciente *</label>
              <select value={abogado} onChange={e => setAbogado(e.target.value)} required>
                {ABOGADOS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Datos del tribunal</h3>
          <div className="form-row">
            <div className="form-group flex-2">
              <label>Tribunal *</label>
              <input value={formData.tribunal} onChange={set('tribunal')} placeholder="Ej: 1° Juzgado Civil de Santiago" required />
            </div>
            <div className="form-group">
              <label>Rol</label>
              <input value={formData.rol} onChange={set('rol')} placeholder="C-1234-2024" />
            </div>
          </div>
          <div className="form-group">
            <label>Carátula</label>
            <input value={formData.caratula} onChange={set('caratula')} placeholder="Banco de Chile con Pérez González, Juan" />
          </div>
        </div>

        <div className="form-section">
          <h3>Partes</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Demandante</label>
              <input value={formData.demandante} onChange={set('demandante')} />
            </div>
            <div className="form-group">
              <label>Demandado *</label>
              <input value={formData.demandado} onChange={set('demandado')} placeholder="Nombre completo" required />
            </div>
            <div className="form-group">
              <label>RUT demandado</label>
              <input value={formData.rut_demandado} onChange={set('rut_demandado')} placeholder="12.345.678-9" />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Monto y procedimiento</h3>
          <div className="form-row">
            <div className="form-group flex-2">
              <label>Monto</label>
              <input value={formData.monto} onChange={set('monto')} placeholder="123456789" type="text" />
            </div>
            <div className="form-group">
              <label>Moneda</label>
              <select value={formData.moneda} onChange={set('moneda')}>
                <option value="CLP">Pesos (CLP)</option>
                <option value="UF">UF</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="form-group">
              <label>Tipo procedimiento</label>
              <select value={formData.tipo_procedimiento} onChange={set('tipo_procedimiento')}>
                <option value="ejecutivo">Ejecutivo</option>
                <option value="desposeimiento">Desposeimiento</option>
                <option value="ordinario">Ordinario</option>
                <option value="monitorio">Monitorio</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Contexto e instrucciones adicionales</h3>
          <div className="form-group">
            <label>Notas del caso</label>
            <textarea value={formData.notas} onChange={set('notas')} rows={3} placeholder="Datos relevantes, contexto procesal, hechos importantes..." />
          </div>
          <div className="form-group">
            <label>Instrucciones específicas para este escrito</label>
            <textarea value={formData.instrucciones} onChange={set('instrucciones')} rows={3} placeholder="Ej: Solicitar certificado de deuda actualizado, mencionar que se adjunta liquidación..." />
          </div>
        </div>

        <div className="form-section">
          <h3>Escritos de referencia del estudio (opcional)</h3>
          <p className="text-muted">Sube escritos previos del estudio para que la IA aprenda el estilo específico.</p>
          <input
            ref={refInputRef}
            type="file"
            multiple
            accept=".docx,.txt"
            onChange={handleRefFiles}
            style={{ display: 'none' }}
          />
          <button type="button" className="btn-secondary" onClick={() => refInputRef.current.click()} disabled={loadingRef}>
            {loadingRef ? 'Cargando...' : '+ Agregar escritos de referencia (DOCX/TXT)'}
          </button>
          {refFiles.length > 0 && (
            <div className="ref-files">
              {refFiles.map((f, i) => (
                <span key={i} className="tag">
                  📄 {f.name}
                  <button type="button" onClick={() => { setRefFiles(p => p.filter((_, j) => j !== i)); setRefTexts(p => p.filter((_, j) => j !== i)); }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="actions">
        <button type="button" className="btn-secondary" onClick={onBack}>← Volver</button>
        <button type="submit" className="btn-primary btn-lg">
          Generar escrito con IA →
        </button>
      </div>
    </form>
  );
}
