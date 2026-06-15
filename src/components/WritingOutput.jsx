import { useState } from 'react';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

export default function WritingOutput({ text, isGenerating, onBack, onNew }) {
  const [copied, setCopied] = useState(false);
  const [editableText, setEditableText] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const displayText = isEditing ? editableText : text;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEdit = () => {
    setEditableText(text);
    setIsEditing(true);
  };

  const handleDownload = async () => {
    const content = isEditing ? editableText : text;
    const lines = content.split('\n');

    const paragraphs = lines.map(line => {
      const trimmed = line.trim();
      const isSumilla = trimmed.startsWith('EN LO PRINCIPAL') || trimmed.startsWith('SUMILLA') || (trimmed.toUpperCase() === trimmed && trimmed.length > 5 && trimmed.length < 80);
      const isPorTanto = trimmed === 'Por tanto,';
      const isTribunal = /^(A|AL) (S\.S\.|U\.S\.|SS\. Iltma\.)/i.test(trimmed);

      return new Paragraph({
        alignment: isTribunal ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
        spacing: { after: trimmed === '' ? 0 : 120 },
        children: [
          new TextRun({
            text: line,
            font: 'Times New Roman',
            size: 24,
            bold: isSumilla || isPorTanto,
          }),
        ],
      });
    });

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: paragraphs,
      }],
    });

    const blob = await Packer.toBlob(doc);
    const filename = `escrito_${new Date().toISOString().slice(0, 10)}.docx`;
    saveAs(blob, filename);
  };

  return (
    <div className="page-content output-page">
      <div className="output-header">
        <h2>Escrito generado</h2>
        <div className="output-actions">
          {!isGenerating && (
            <>
              <button className="btn-secondary" onClick={handleCopy}>
                {copied ? '✓ Copiado' : '📋 Copiar texto'}
              </button>
              {!isEditing ? (
                <button className="btn-secondary" onClick={handleEdit}>
                  ✏️ Editar
                </button>
              ) : (
                <button className="btn-secondary" onClick={() => setIsEditing(false)}>
                  ✓ Ver resultado
                </button>
              )}
              <button className="btn-primary" onClick={handleDownload}>
                ⬇ Descargar .docx
              </button>
            </>
          )}
        </div>
      </div>

      {isGenerating && (
        <div className="generating-banner">
          <div className="spinner" /> Generando escrito...
        </div>
      )}

      <div className="output-wrapper">
        {isEditing ? (
          <textarea
            className="output-editor"
            value={editableText}
            onChange={e => setEditableText(e.target.value)}
            spellCheck
          />
        ) : (
          <div className="output-document">
            <div className="document-paper">
              {text ? (
                text.split('\n').map((line, i) => (
                  <p key={i} className={`doc-line ${line.trim() === '' ? 'doc-empty' : ''} ${line.trim() === 'Por tanto,' ? 'doc-portanto' : ''}`}>
                    {line || ' '}
                  </p>
                ))
              ) : (
                !isGenerating && <p className="text-muted">El escrito aparecerá aquí...</p>
              )}
              {isGenerating && <span className="cursor-blink">|</span>}
            </div>
          </div>
        )}
      </div>

      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>← Modificar datos</button>
        <button className="btn-secondary" onClick={onNew}>Nuevo escrito</button>
        {!isGenerating && (
          <button className="btn-primary btn-lg" onClick={handleDownload}>
            ⬇ Descargar .docx
          </button>
        )}
      </div>
    </div>
  );
}
