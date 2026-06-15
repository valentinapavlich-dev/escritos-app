import { useState, useRef } from 'react';

export default function FileUpload({ apiKey, onExtracted, onSkip }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(f => isValid(f));
    setFiles(prev => [...prev, ...dropped]);
  };

  const isValid = (f) => /\.(pdf|docx|doc|txt)$/i.test(f.name);

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files).filter(isValid);
    setFiles(prev => [...prev, ...selected]);
  };

  const removeFile = (i) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  const handleExtract = async () => {
    setLoading(true);
    setError('');
    setProgress('Subiendo documentos...');

    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));

      setProgress('Extrayendo texto y datos con IA...');
      const res = await fetch('http://localhost:3001/api/extract', {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: formData,
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error desconocido');

      setProgress('Datos extraídos correctamente');
      onExtracted(data.data, data.rawText);
    } catch (err) {
      setError(err.message);
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>Subir documentos del expediente</h2>
        <p className="text-muted">Carga los documentos del caso: demanda, resoluciones, pagarés, certificados. La IA extraerá los datos automáticamente.</p>
      </div>

      <div
        className={`dropzone ${loading ? 'loading' : ''}`}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !loading && inputRef.current.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>{progress}</p>
          </div>
        ) : (
          <>
            <div className="dropzone-icon">📂</div>
            <p className="dropzone-text">Arrastra archivos aquí o haz clic para seleccionar</p>
            <p className="dropzone-hint">Soporta PDF, DOCX, DOC, TXT · Máx. 50MB por archivo</p>
          </>
        )}
      </div>

      {files.length > 0 && (
        <div className="file-list">
          <h3>Documentos seleccionados ({files.length})</h3>
          {files.map((f, i) => (
            <div key={i} className="file-item">
              <span className="file-icon">{f.name.endsWith('.pdf') ? '📄' : '📝'}</span>
              <span className="file-name">{f.name}</span>
              <span className="file-size">{(f.size / 1024).toFixed(0)} KB</span>
              <button className="btn-icon" onClick={() => removeFile(i)} disabled={loading}>✕</button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="alert alert-error">⚠ {error}</div>}

      <div className="actions">
        <button className="btn-secondary" onClick={onSkip}>
          Ingresar datos manualmente
        </button>
        <button
          className="btn-primary"
          onClick={handleExtract}
          disabled={files.length === 0 || loading}
        >
          {loading ? 'Procesando...' : `Extraer datos de ${files.length} documento${files.length !== 1 ? 's' : ''} →`}
        </button>
      </div>
    </div>
  );
}
