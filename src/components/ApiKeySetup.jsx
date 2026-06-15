import { useState } from 'react';

export default function ApiKeySetup({ onSave, initialKey }) {
  const [key, setKey] = useState(initialKey || '');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed.startsWith('sk-ant-')) {
      setError('La API key de Anthropic debe comenzar con "sk-ant-"');
      return;
    }
    setError('');
    onSave(trimmed);
  };

  return (
    <div className="card setup-card">
      <div className="card-icon">🔑</div>
      <h2>Configuración inicial</h2>
      <p className="text-muted">
        Ingresa tu API Key de Anthropic para comenzar. Se guardará en el navegador localmente.
      </p>
      <form onSubmit={handleSubmit} className="setup-form">
        <div className="form-group">
          <label htmlFor="apikey">API Key de Anthropic</label>
          <input
            id="apikey"
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="sk-ant-api03-..."
            className="input-lg"
            autoFocus
          />
          {error && <span className="field-error">{error}</span>}
        </div>
        <p className="hint">
          Obtén tu API key en{' '}
          <code>console.anthropic.com</code>
        </p>
        <button type="submit" className="btn-primary btn-lg" disabled={!key.trim()}>
          Guardar y continuar →
        </button>
      </form>
    </div>
  );
}
