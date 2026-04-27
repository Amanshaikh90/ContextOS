import React, { useState, useEffect, useCallback } from 'react';
import { vscode } from './utilities/vscode';

// Define the shape of messages coming from the extension
interface ExtensionMessage {
  type: 'fileChanged' | 'context';
  file?: string;
  payload?: any;
}

const App: React.FC = () => {
  const [activeFile, setActiveFile] = useState<string>('No file open');
  const [error, setError] = useState<string | null>(null);

  /**
   * Memoized message handler to prevent unnecessary re-renders
   */
  const handleMessage = useCallback((event: MessageEvent<ExtensionMessage>) => {
    const message = event.data;

    try {
      switch (message.type) {
        case 'fileChanged':
          setActiveFile(message.file ?? 'Unknown file');
          break;
        case 'context':
          // Handle context payload here
          break;
        default:
          console.warn('Unknown message type received:', message.type);
      }
    } catch (err) {
      setError('Failed to process message from extension');
      console.error(err);
    }
  }, []);

  useEffect(() => {
    // Add the listener
    window.addEventListener('message', handleMessage);

    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
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
        <button 
          style={styles.button}
          onClick={handleTestClick}
        >
          Test Connection
        </button>
      </section>

      {/* Mock data placeholders for the next milestone */}
      <footer style={styles.footer}>
        {/* Render Cards Here */}
      </footer>
    </main>
  );
};

//CSS-in-JS or VS Code CSS variables for theme 
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    color: 'var(--vscode-foreground)',
  },
  fileName: {
    fontSize: '11px',
    opacity: 0.7,
    fontWeight: 'bold',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  content: {
    marginTop: '24px',
    borderTop: '1px solid var(--vscode-widget-border)',
    paddingTop: '12px',
  },
  button: {
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    border: 'none',
    padding: '6px 12px',
    width: '100%',
    cursor: 'pointer',
    borderRadius: '2px',
  },
  error: {
    color: 'var(--vscode-errorForeground)',
    fontSize: '11px',
    marginTop: '10px'
  },
  footer: {
    marginTop: 'auto',
    paddingBottom: '20px'
  }
};

export default App;