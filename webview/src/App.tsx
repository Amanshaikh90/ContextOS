import React, { useState, useEffect, useCallback, useRef } from 'react';
import { vscode } from './utilities/vscode';
import { WebviewMessageType } from '../../src/types/messaging';

const App: React.FC = () => {
  const [activeFile, setActiveFile] = useState<string>('No file open');
  const [activeFolder, setActiveFolder] = useState<string>('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRepo, setActiveRepo] = useState<string>('');
  
  const [manualRepo, setManualRepo] = useState<string>('');
  const [submittedRepo, setSubmittedRepo] = useState<string>('');

  // Track which items the user has manually removed (local only)
  const [removedPRs, setRemovedPRs] = useState<Set<string>>(new Set());
  const [removedJira, setRemovedJira] = useState<Set<string>>(new Set());
  const [removedSlack, setRemovedSlack] = useState<Set<string>>(new Set());

  const lastRequestedRepoRef = useRef<string>('');

  // ---- helper to send badge counts to extension host ----
  const updateBadge = (prs: any[]) => {
    const openCount = prs.filter((pr: any) => pr.status !== 'merged').length;
    const mergedCount = prs.filter((pr: any) => pr.status === 'merged').length;
    vscode.postMessage({
      type: 'updatePrBadge',
      payload: { openCount, mergedCount }
    });
  };

  const fetchContext = useCallback((force = false, skipAI = false, repoOverride?: string) => {
    if (!skipAI) {
      setLoading(true);
    }
    setError(null);
    
    const repoToUse = repoOverride !== undefined ? repoOverride : (submittedRepo || activeRepo);

    lastRequestedRepoRef.current = repoToUse.toLowerCase();
    setData(null);

    vscode.postMessage({
      type: "request-context-data",
      payload: {
        file: "",
        folder: "",
        repo: repoToUse,
        refresh: force ? 'true' : 'false',
        skipAI: skipAI ? 'true' : 'false'
      }
    });
  }, [activeRepo, submittedRepo]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      switch (message.type) {
        case WebviewMessageType.FileChanged:
          setActiveFile(message.file || 'Unknown file');
          setActiveFolder(message.folder || '');
          
          if (!submittedRepo && message.repo && message.repo !== activeRepo) {
            setActiveRepo(message.repo);
            setManualRepo('');
          }
          break;

        case WebviewMessageType.ContextLoaded: {
          const { _source, ...rest } = message.value || {};
          const incomingRepo = (rest.repo || '').toLowerCase();

          if (!_source && incomingRepo !== lastRequestedRepoRef.current) {
            return;
          }

          // Reset removal sets on fresh data
          setRemovedPRs(new Set());
          setRemovedJira(new Set());
          setRemovedSlack(new Set());

          const freshPRs = rest.github || [];
          setData({
            project: rest.project || "All Workspaces",
            repo: rest.repo || "",
            github: freshPRs,
            jira: rest.jira || [],
            slack: rest.slack || [],
            aiSummary: rest.aiSummary && rest.aiSummary.trim() !== ""
              ? rest.aiSummary
              : (data?.aiSummary || "")
          });
          setError(null);
          setLoading(false);

          // Update badge with fresh (full) data
          updateBadge(freshPRs);
          break;
        }

        case WebviewMessageType.Error:
          setError(message.value || "An error occurred");
          setLoading(false);
          break;
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeRepo, submittedRepo, data?.aiSummary]);

  useEffect(() => {
    fetchContext(false, false);
  }, [activeRepo, submittedRepo]);

  // ✨ ADDED: Silent Background polling mechanism running every 15 minutes
  // Gracefully acts on Case 1 (Global Context) and Case 2 (Linked Repo Context)
  useEffect(() => {
    const REFRESH_INTERVAL = 15 * 60 * 1000; 

    const silentInterval = setInterval(() => {
      const currentRepoContext = submittedRepo || activeRepo || '';
      
      vscode.postMessage({
        type: "request-context-data",
        payload: {
          file: "",
          folder: "",
          repo: currentRepoContext,
          refresh: 'true',
          skipAI: true // Passing true ensures silent operations without full AI re-runs
        }
      });
    }, REFRESH_INTERVAL);

    return () => clearInterval(silentInterval);
  }, [activeRepo, submittedRepo]);

  const startAuth = (service: 'jira' | 'github' | 'slack') => {
    vscode.postMessage({ type: `auth-${service}` });
  };

  const handleManualLink = () => {
    const targetRepo = manualRepo.trim();
    if (targetRepo) {
      setSubmittedRepo(targetRepo);
      fetchContext(false, false, targetRepo); 
    }
  };

  // ---- removal handlers (also update badge immediately) ----
  const removePR = (id: string) => {
    setRemovedPRs(prev => {
      const next = new Set(prev);
      next.add(id);
      // Compute new filtered list and send badge update
      const filtered = (data?.github || []).filter((pr: any) => !next.has(pr.id));
      updateBadge(filtered);
      return next;
    });
  };

  const removeJira = (id: string) => {
    setRemovedJira(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const removeSlack = (id: string) => {
    setRemovedSlack(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const filteredPRs = data?.github?.filter((pr: any) => !removedPRs.has(pr.id)) || [];
  const filteredJira = data?.jira?.filter((issue: any) => !removedJira.has(issue.id)) || [];
  const filteredSlack = data?.slack?.filter((thread: any) => !removedSlack.has(thread.id)) || [];

  const AIInsightCard = () => {
    if (!data?.aiSummary && !loading) return null;

    const formatSummary = (text: string) => {
      if (!text) return "";
      const parts = text.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index} style={{ color: 'var(--vscode-foreground)' }}>{part.slice(2, -2)}</strong>;
        }
        return part; 
      });
    };

    return (
      <div style={aiCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
          <span style={{ fontSize: '10px' }}>#</span>
          <h3 style={{ ...sectionHeaderStyle, marginTop: 0, marginBottom: 0, color: 'var(--vscode-button-background)' }}>
            AI INSIGHT
          </h3>
        </div>
        <div style={{ 
          fontSize: '12px', 
          margin: 0, 
          lineHeight: '1.8', 
          opacity: loading ? 0.5 : 1,
          whiteSpace: 'pre-wrap', 
          wordBreak:'break-word',
          overflowWrap:'anywhere',
          color: 'var(--vscode-descriptionForeground)'
        }}>
          {loading ? "Analyzing developer context..." : formatSummary(data?.aiSummary)}
        </div>
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
            {activeFile}
          </p>
        </div>
        <button title="Refresh Context" onClick={() => fetchContext(true, false)} style={refreshBtnStyle} disabled={loading}>
          {loading ? "..." : "↻"}
        </button>
      </div>

      <section style={{ display: 'flex', gap: '4px', marginBottom: '15px' }}>
        <button style={authBtnStyle} onClick={() => startAuth('github')}>GitHub</button>
        <button style={authBtnStyle} onClick={() => startAuth('jira')}>Jira</button>
        <button style={authBtnStyle} onClick={() => startAuth('slack')}>Slack</button>
      </section>

      {/* ── Reconnect banner: appears when a service token is missing or expired ── */}
      {data?.authStatus && (!data.authStatus.github || !data.authStatus.jira || !data.authStatus.slack) && (
        <div style={{ background: 'rgba(255,200,0,0.12)', border: '1px solid rgba(200,160,0,0.5)', borderRadius: '4px', padding: '7px 10px', marginBottom: '10px', fontSize: '11px', color: 'var(--vscode-foreground)' }}>
          <span style={{ fontWeight: 'bold' }}>⚠ Reconnect needed: </span>
          {!data.authStatus.github && (
            <button onClick={() => startAuth('github')} style={{ background: 'none', border: 'none', color: 'var(--vscode-textLink-foreground)', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', marginRight: '8px', padding: 0 }}>GitHub</button>
          )}
          {!data.authStatus.jira && (
            <button onClick={() => startAuth('jira')} style={{ background: 'none', border: 'none', color: 'var(--vscode-textLink-foreground)', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', marginRight: '8px', padding: 0 }}>Jira</button>
          )}
          {!data.authStatus.slack && (
            <button onClick={() => startAuth('slack')} style={{ background: 'none', border: 'none', color: 'var(--vscode-textLink-foreground)', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}>Slack</button>
          )}
        </div>
      )}

      {error && <div style={errorStyle}>⚠️ {error}</div>}

      {(activeRepo || submittedRepo) ? (
        <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '10px' }}>
          Linked to: <strong>{(submittedRepo || activeRepo).includes('/') ? (submittedRepo || activeRepo).split('/').pop() : (submittedRepo || activeRepo)}</strong>
          <button 
            style={{ marginLeft: '8px', background: 'none', border: 'none', color: 'var(--vscode-errorForeground)', cursor: 'pointer', fontSize: '10px' }}
            onClick={() => { 
              // ✨ CHANGED: Fix asynchronous alignment bugs when shifting back down to Case 1
              setSubmittedRepo(''); 
              setActiveRepo(''); 
              setManualRepo(''); 
              
              lastRequestedRepoRef.current = ''; 
              vscode.postMessage({ type: 'clear-repo-lock' });
              
              vscode.postMessage({
                type: "request-context-data",
                payload: {
                  file: "",
                  folder: "",
                  repo: "",
                  refresh: 'true',
                  skipAI: 'false'
                }
              });
            }}
          >
            [Clear]
          </button>
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
                boxSizing: 'border-box' 
              }}
              placeholder="username/repo"
              value={manualRepo}
              onChange={(e) => setManualRepo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleManualLink(); }}
            />
            <button style={{ ...authBtnStyle, flex: '0 0 auto' }} onClick={handleManualLink}>Link</button>
          </div>
        </div>
      )}

      <AIInsightCard />

      {/* ========== GitHub PRs – independent scroll ========== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', marginBottom: '8px' }}>
        <h3 style={{ ...sectionHeaderStyle, marginTop: 0, marginBottom: 0 }}>Related GitHub PRs</h3>
        <button onClick={() => fetchContext(true, false)} title="Refresh PRs" style={{ background: 'none', border: 'none', color: 'var(--vscode-foreground)', opacity: 0.5, cursor: 'pointer', fontSize: '12px', padding: '0 4px' }}>
          {loading ? "..." : "↻"}
        </button>
      </div>
      <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
        {filteredPRs.length > 0 ? filteredPRs.map((pr: any, idx: number) => {
          const displayRepoName = pr.repo && pr.repo.includes('/') ? pr.repo.split('/').pop() : pr.repo;
          const stableKey = pr.id && !pr.id.includes('undefined')
            ? `${pr.id}-${pr.repo || 'unknown'}`
            : `pr-fallback-${idx}-${pr.title.slice(0,5)}`;
          return (
            <div key={stableKey} style={{...itemCardStyle, borderLeft:`3px solid ${pr.status==='merged' ? '#6f42c1' : '#28a745'}`}}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span 
                  style={{ ...titleStyle, textDecoration: pr.status === 'merged' ? 'line-through' : 'none', opacity: pr.status === 'merged' ? 0.7 : 1, cursor: 'pointer' }}
                  onClick={() => vscode.postMessage({type:'open-external-link', url: pr.url})}
                >
                  {pr.title}
                </span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={pr.status === 'merged' ? mergedBadgeStyle : openBadgeStyle}>{pr.status}</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); removePR(pr.id); }} 
                    style={{ background: 'none', border: 'none', color: 'var(--vscode-errorForeground)', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1 }}
                    title="Remove from list"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div style={itemCardStyle && metaStyle}>repo: {displayRepoName}</div>
            </div>
          );
        }) : <p style={emptyTextStyle}>No PRs found</p>}
      </div>

      {/* ========== Jira Issues – independent scroll ========== */}
      <h3 style={sectionHeaderStyle}>Related Jira Issues</h3>
      <div style={{ maxHeight: '150px', overflowY: 'auto', paddingRight: '4px' }}>
        {filteredJira.length > 0 ? filteredJira.map((issue: any, idx: number) => (
          <div 
            key={issue.id || `jira-${idx}`} 
            style={{ ...itemCardStyle, cursor: 'pointer' }}
            title="Click to open ticket in browser"
            onClick={() => {
              if (issue.url) {
                vscode.postMessage({ type: 'open-external-link', url: issue.url });
              }
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={titleStyle}>{issue.title}</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={issue.status === 'Done' ? mergedBadgeStyle : openBadgeStyle}>{issue.status}</span>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    removeJira(issue.id); 
                  }} 
                  style={{ background: 'none', border: 'none', color: 'var(--vscode-errorForeground)', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1 }}
                  title="Remove from list"
                >
                  ✕
                </button>
              </div>
            </div>
            <div style={metaStyle}>{issue.id}</div>
          </div>
        )) : <p style={emptyTextStyle}>No related tickets found</p>}
      </div>

      {/* ========== Slack Threads – independent scroll ========== */}
      <h3 style={sectionHeaderStyle}>Recent Slack Threads</h3>
      <div style={{ maxHeight: '150px', overflowY: 'auto', paddingRight: '4px' }}>
        {filteredSlack.length > 0 ? filteredSlack.map((thread: any, index: number) => (
          <div key={`slack-${index}`} style={itemCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ ...titleStyle, whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', flex: 1 }}>{thread.text}</span>
              <button 
                onClick={() => removeSlack(thread.id)} 
                style={{ background: 'none', border: 'none', color: 'var(--vscode-errorForeground)', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1, marginLeft: '6px' }}
                title="Remove from list"
              >
                ✕
              </button>
            </div>
            <div style={metaStyle}>Channel: {thread.channel}</div>
          </div>
        )) : <p style={emptyTextStyle}>No related discussions</p>}
      </div>
    </main>
  );
};

const aiCardStyle: React.CSSProperties = { backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)', padding: '12px 15px', borderRadius: '4px', borderLeft: '4px solid var(--vscode-button-background)', marginBottom: '16px' };
const mainStyle: React.CSSProperties = { padding: '12px', color: 'var(--vscode-foreground)', fontFamily: 'var(--vscode-font-family)', width:'100%', boxSizing:'border-box' };
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--vscode-panel-border)' };
const refreshBtnStyle: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--vscode-foreground)', fontSize: '18px', cursor: 'pointer', padding: '4px' };
const authBtnStyle: React.CSSProperties = { flex: 1, fontSize: '10px', padding: '4px', cursor: 'pointer', backgroundColor: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none' };
const sectionHeaderStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 'bold', marginTop: '20px', marginBottom: '8px', color: 'var(--vscode-descriptionForeground)' };
const itemCardStyle: React.CSSProperties = { backgroundColor: 'var(--vscode-list-hoverBackground)', padding: '8px', marginBottom: '6px', borderRadius: '4px', cursor: 'pointer', borderLeft: '2px solid var(--vscode-button-background)' };
const titleStyle: React.CSSProperties = { fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' };
const metaStyle: React.CSSProperties = { fontSize: '10px', opacity: 0.6, marginTop: '4px' };
const openBadgeStyle: React.CSSProperties = { fontSize: '9px', padding: '2px 6px', backgroundColor: '#28a745', color: 'white', borderRadius: '10px', height: 'fit-content' };
const mergedBadgeStyle: React.CSSProperties = { fontSize: '9px', padding: '2px 6px', backgroundColor: '#6f42c1', color: 'white', borderRadius: '10px', height: 'fit-content' };
const emptyTextStyle: React.CSSProperties = { fontSize: '11px', opacity: 0.5, fontStyle: 'italic' };
const errorStyle: React.CSSProperties = { color: 'var(--vscode-errorForeground)', fontSize: '11px', padding: '8px', background: 'rgba(255,0,0,0.1)' };

export default App;