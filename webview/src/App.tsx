import React, { useState, useEffect, useCallback } from 'react';
import { vscode } from './utilities/vscode';
import {WebviewMessageType} from '../../src/types/messaging'

const userId = (window as any).userId;
const backendUrl = "http://localhost:3001";

const App: React.FC = () => {
  const [activeFile, setActiveFile] = useState<string>('No file open');
  const [activeFolder, setActiveFolder] = useState<string>('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRepo, setActiveRepo] = useState<string>('');
  const [manualRepo, setManualRepo] = useState<string>('');

  const fetchContext = useCallback(async () => {
    setLoading(true);
    try {
      const repoToUse = activeRepo || manualRepo;
        const queryParams = new URLSearchParams({
            userId: userId,
            file: activeFile,
            folder: activeFolder,
            repo: repoToUse 
        });

      const response = await fetch(`${backendUrl}/context?${queryParams.toString()}`);
      if (!response.ok) throw new Error(`Server Error: ${response.status}`);
      
      const json = await response.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Backend unreachable");
    } finally {
      setLoading(false);
    }
  }, [activeFile, activeFolder, activeRepo, manualRepo]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === WebviewMessageType.FileChanged) {
        setActiveFile(message.file || 'Unknown file');
        setActiveFolder(message.folder || '');
        setActiveRepo(message.repo || '');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (activeRepo) {
      fetchContext();
    }
  }, [activeFile, activeFolder, activeRepo, fetchContext]);

  const startAuth = (service: 'jira' | 'github' | 'slack') => {
    vscode.postMessage({ type: `auth-${service}` });
  };

  const AIInsightCard = () => {
    if (!data?.aiSummary && !loading) return null;

    return (
      <div style={aiCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
          <span style={{ fontSize: '10px' }}>✨</span>
          <h3 style={{ ...sectionHeaderStyle, marginTop: 0, marginBottom: 0, color: 'var(--vscode-button-background)' }}>
            AI INSIGHT
          </h3>
        </div>
        <p style={{ fontSize: '12px', margin: 0, lineHeight: '1.4', opacity: loading ? 0.5 : 1 }}>
          {loading ? "Analyzing developer context..." : data?.aiSummary}
        </p>
      </div>
    );
  };

  return (
    <main style={mainStyle}>
      <div style={headerStyle}>
        <div>
          <h2 style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.8, margin: 0 }}>
            {activeFolder || 'contextOS'}
          </h2>
          <p style={{ fontSize: '11px', margin: '2px 0', fontWeight: 'bold', color: 'var(--vscode-textLink-foreground)' }}>
            📄 {activeFile}
          </p>
        </div>
        <button title="Refresh Context" onClick={fetchContext} style={refreshBtnStyle} disabled={loading}>
          {loading ? "..." : "↻"}
        </button>
      </div>

      <section style={{ display: 'flex', gap: '4px', marginBottom: '15px' }}>
        <button style={authBtnStyle} onClick={() => startAuth('github')}>GitHub</button>
        <button style={authBtnStyle} onClick={() => startAuth('jira')}>Jira</button>
        <button style={authBtnStyle} onClick={() => startAuth('slack')}>Slack</button>
      </section>

      {error && <div style={errorStyle}>⚠️ {error}</div>}

      {/* FIXED REPO LINK SECTION: Placed directly in main return to maintain input focus */}
      {activeRepo ? (
        <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '10px' }}>
          ✅ Linked to: <strong>{activeRepo}</strong>
        </div>
      ) : (
        <div style={{ padding: '8px', backgroundColor: 'var(--vscode-badge-background)', borderRadius: '4px', marginBottom: '10px' }}>
          <p style={{ fontSize: '10px', margin: '0 0 5px 0' }}>No Repo Detected. Link manually:</p>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              key="manual-repo-input"
              style={{ 
                flex: 1, 
                minWidth: 0, 
                fontSize: '11px', 
                background: 'var(--vscode-input-background)', 
                color: 'var(--vscode-input-foreground)', 
                border: '1px solid var(--vscode-panel-border)',
                boxSizing: 'border-box' // Fixes the box stretching out
              }}
              placeholder="username/repo"
              value={manualRepo}
              onChange={(e) => setManualRepo(e.target.value)}
            />
            <button style={{ ...authBtnStyle, flex: '0 0 auto' }} onClick={fetchContext}>Link</button>
          </div>
        </div>
      )}

      <AIInsightCard />

      <div className="content-area">
        <h3 style={sectionHeaderStyle}>Related GitHub PRs</h3>
        {data?.github?.length > 0 ? data.github.map((pr: any) => (
          <div key={pr.id} style={itemCardStyle} onClick={()=>{vscode.postMessage({type:'open-external-link',url:pr.url})}}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={titleStyle}>{pr.title}</span>
              <span style={pr.status === 'merged' ? mergedBadgeStyle : openBadgeStyle}>
                {pr.status}
              </span>
            </div>
            <div style={metaStyle}>repo: {pr.repo}</div>
          </div>
        )) : <p style={emptyTextStyle}>No PRs found</p>}

        <h3 style={sectionHeaderStyle}>Related Jira Issues</h3>
        {data?.jira?.length > 0 ? data.jira.map((issue: any) => (
          <div key={issue.id} style={itemCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={titleStyle}>{issue.title}</span>
              <span style={issue.status === 'Done' ? mergedBadgeStyle : openBadgeStyle}>
                {issue.status}
              </span>
            </div>
            <div style={metaStyle}>{issue.id}</div>
          </div>
        )) : <p style={emptyTextStyle}>No tickets found</p>}

        <h3 style={sectionHeaderStyle}>Recent Slack Threads</h3>
        {data?.slack?.length > 0 ? data.slack.map((thread: any, index: number) => (
          <div key={index} style={itemCardStyle}>
            <div style={{ ...titleStyle, whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {thread.text}
            </div>
              <div style={metaStyle}>Channel: {thread.channel}</div>
          </div>
        )) : <p style={emptyTextStyle}>No related discussions</p>}
      </div>
    </main>
  );
};

// --- STYLES ---
const aiCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)',
  padding: '10px',
  borderRadius: '4px',
  borderLeft: '4px solid var(--vscode-button-background)',
  marginBottom: '16px',
};

const mainStyle: React.CSSProperties = {
  padding: '12px',
  color: 'var(--vscode-foreground)',
  fontFamily: 'var(--vscode-font-family)'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '15px',
  borderBottom: '1px solid var(--vscode-panel-border)'
};

const refreshBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--vscode-foreground)', fontSize: '18px', cursor: 'pointer', padding: '4px'
};

const authBtnStyle: React.CSSProperties = {
  flex: 1, fontSize: '10px', padding: '4px', cursor: 'pointer', backgroundColor: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none'
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 'bold', marginTop: '20px', marginBottom: '8px', color: 'var(--vscode-descriptionForeground)'
};

const itemCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--vscode-list-hoverBackground)', padding: '8px', marginBottom: '6px', borderRadius: '4px', cursor: 'pointer', borderLeft: '2px solid var(--vscode-button-background)'
};

const titleStyle: React.CSSProperties = {
  fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%'
};

const metaStyle: React.CSSProperties = { fontSize: '10px', opacity: 0.6, marginTop: '4px' };
const openBadgeStyle: React.CSSProperties = { fontSize: '9px', padding: '2px 6px', backgroundColor: '#28a745', color: 'white', borderRadius: '10px', height: 'fit-content' };
const mergedBadgeStyle: React.CSSProperties = { fontSize: '9px', padding: '2px 6px', backgroundColor: '#6f42c1', color: 'white', borderRadius: '10px', height: 'fit-content' };
const emptyTextStyle: React.CSSProperties = { fontSize: '11px', opacity: 0.5, fontStyle: 'italic' };
const errorStyle: React.CSSProperties = { color: 'var(--vscode-errorForeground)', fontSize: '11px', padding: '8px', background: 'rgba(255,0,0,0.1)' };

export default App;