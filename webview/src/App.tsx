import React, { useState, useEffect, useCallback } from 'react';
import { vscode } from './utilities/vscode';

// ... (Interfaces stay the same)
interface ExtensionMessage {
  type: 'fileChanged' | 'context';
  file?: string;
  payload?: any;
}

interface BackendData {
  file: string;
  tickets: any[];
  prs: any[];
  slackThreads: never[];
}

const App: React.FC = () => {
  const [activeFile, setActiveFile] = useState<string>('No file open');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BackendData | null>(null);

  // CHANGE 1: Added a helper to render the lists of data
  const renderDataSection = (title: string, items: any[], type: 'tickets' | 'prs') => {
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>{title}</h4>
        {items.map((item, idx) => (
          <div key={idx} style={styles.dataCard}>
             <span style={{ fontWeight: 'bold' }}>{type === 'tickets' ? item.id : `#${item.number}`}</span>: {item.title}
          </div>
        ))}
      </div>
    );
  };

  useEffect(() => {
    if (activeFile === 'No file open' || activeFile === 'Unknown file') {
      return;
    }
    setError(null);
    const controller = new AbortController();

    fetch(`http://127.0.0.1:3001/context?file=${encodeURIComponent(activeFile)}`, { 
      signal: controller.signal 
    })
      .then((res) => res.json())
      .then((json) => {
        setData(json);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError("Could not connect to backend server");
        }
      });
      return () => controller.abort();
  }, [activeFile]);

  const handleMessage = useCallback((event: MessageEvent<ExtensionMessage>) => {
    const message = event.data;
    try {
      switch (message.type) {
        case 'fileChanged':
          setActiveFile(message.file ?? 'Unknown file');
          break;
        default:
          console.warn('Unknown message type received:', message.type);
      }
    } catch (err) {
      setError('Failed to process message from extension');
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const handleTestClick = () => {
    vscode.postMessage({ 
      type: 'onInfo', 
      value: `Connection verified from React for: ${activeFile}` 
    });
  };

  return (
    <main style={styles.container}>
      <header>
        <p style={styles.fileName}>{activeFile}</p>
      </header>

      {error && <div style={styles.error}>{error}</div>}

      <section style={styles.content}>
        <h3>Context Actions</h3>
        <button style={styles.button} onClick={handleTestClick}>
          Test Connection
        </button>
      </section>

      {/* CHANGE 2: Updated the Footer to display actual list items instead of just counts */}
      <footer style={styles.footer}>
        {data && data.file === activeFile ? (
          <div style={{ fontSize: '11px' }}>
            <hr style={{ border: '0', borderTop: '1px solid var(--vscode-widget-border)', margin: '15px 0' }} />
            {renderDataSection("Active Tickets", data.tickets, 'tickets')}
            {renderDataSection("Pull Requests", data.prs, 'prs')}
            
            {data.slackThreads.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '12px' }}>Slack Discussions</h4>
                <p style={{ fontStyle: 'italic', opacity: 0.8 }}>"{data.slackThreads[0].preview}"</p>
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontSize: '11px' }}>
            {activeFile === 'No file open' ? 'Open a file to see context' : `Loading context...`}
          </p>
        )}
      </footer>
    </main>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    color: 'var(--vscode-foreground)',
    backgroundColor: 'var(--vscode-sideBar-background)',
  },
  // ... (Previous styles stay the same)
  fileName: { fontSize: '11px', opacity: 0.7, fontWeight: 'bold', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  content: { marginTop: '24px', borderTop: '1px solid var(--vscode-widget-border)', paddingTop: '12px' },
  button: { background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', padding: '6px 12px', width: '100%', cursor: 'pointer', borderRadius: '2px' },
  error: { color: 'var(--vscode-errorForeground)', fontSize: '11px', marginTop: '10px' },
  footer: { marginTop: '10px', overflowY: 'auto' },
  
  // CHANGE 3: Added a card style for the data items
  dataCard: {
    background: 'var(--vscode-editor-background)',
    padding: '8px',
    marginBottom: '6px',
    borderRadius: '4px',
    border: '1px solid var(--vscode-widget-border)',
  }
};

export default App;