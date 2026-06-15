import { useState } from 'react';
import ApiKeySetup from './components/ApiKeySetup';
import FileUpload from './components/FileUpload';
import CaseForm from './components/CaseForm';
import WritingOutput from './components/WritingOutput';
import './App.css';

const STEPS = ['config', 'upload', 'form', 'output'];
const STEP_LABELS = ['Configuración', 'Documentos', 'Formulario', 'Escrito'];

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('anthropic_api_key') || '');
  const [step, setStep] = useState(apiKey ? 'upload' : 'config');
  const [extractedData, setExtractedData] = useState(null);
  const [rawExpedienteText, setRawExpedienteText] = useState('');
  const [generatedText, setGeneratedText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleApiKeySave = (key) => {
    localStorage.setItem('anthropic_api_key', key);
    setApiKey(key);
    setStep('upload');
  };

  const handleFilesExtracted = (data, rawText) => {
    setExtractedData(data);
    setRawExpedienteText(rawText);
    setStep('form');
  };

  const handleGenerate = async (formData, tipoEscrito, abogado, referenceTexts) => {
    setIsGenerating(true);
    setGeneratedText('');
    setStep('output');

    try {
      const response = await fetch('http://localhost:3001/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, formData, tipoEscrito, abogado, referenceTexts, rawExpedienteText }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.text) setGeneratedText(prev => prev + parsed.text);
              if (parsed.done) setIsGenerating(false);
              if (parsed.error) { alert('Error: ' + parsed.error); setIsGenerating(false); }
            } catch {}
          }
        }
      }
    } catch (err) {
      alert('Error de conexión con el servidor. Asegúrese de que el servidor esté corriendo en puerto 3001.\n\n' + err.message);
      setIsGenerating(false);
      setStep('form');
    }
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">⚖</span>
            <div>
              <h1>Escritos Judiciales</h1>
              <p>Estudio Jordán Barahona · Banco de Chile</p>
            </div>
          </div>
          <nav className="steps-nav">
            {STEP_LABELS.map((label, i) => (
              <button
                key={label}
                className={`step-btn ${stepIndex === i ? 'active' : ''} ${stepIndex > i ? 'done' : ''}`}
                onClick={() => { if (stepIndex > i) setStep(STEPS[i]); }}
                disabled={stepIndex <= i}
              >
                <span className="step-num">{stepIndex > i ? '✓' : i + 1}</span>
                {label}
              </button>
            ))}
          </nav>
          {apiKey && (
            <button className="btn-secondary btn-sm" onClick={() => { setApiKey(''); localStorage.removeItem('anthropic_api_key'); setStep('config'); }}>
              Cambiar API Key
            </button>
          )}
        </div>
      </header>

      <main className="app-main">
        {step === 'config' && <ApiKeySetup onSave={handleApiKeySave} initialKey={apiKey} />}
        {step === 'upload' && (
          <FileUpload
            apiKey={apiKey}
            onExtracted={handleFilesExtracted}
            onSkip={() => setStep('form')}
          />
        )}
        {step === 'form' && (
          <CaseForm
            initialData={extractedData}
            onGenerate={handleGenerate}
            onBack={() => setStep('upload')}
          />
        )}
        {step === 'output' && (
          <WritingOutput
            text={generatedText}
            isGenerating={isGenerating}
            onBack={() => setStep('form')}
            onNew={() => { setStep('upload'); setExtractedData(null); setGeneratedText(''); setRawExpedienteText(''); }}
          />
        )}
      </main>
    </div>
  );
}
